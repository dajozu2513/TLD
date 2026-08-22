const express = require("express");
const { query, connect, getConnection, oracledb } = require("../db/pool");
const { calcularReporte } = require("../services/calculoRiesgo");

const router = express.Router();

// POST /api/auditorias  { id_organizacion, area_evaluada, fecha_auditoria, id_auditor }
router.post("/", async (req, res) => {
  const { id_organizacion, area_evaluada, fecha_auditoria, id_auditor } = req.body;
  if (!id_organizacion || !area_evaluada || !fecha_auditoria) {
    return res.status(400).json({ error: "id_organizacion, area_evaluada y fecha_auditoria son obligatorios" });
  }

  const conn = await getConnection();
  try {
    const auditorId = id_auditor || (await obtenerAuditorPorDefecto());

    const insertResult = await conn.execute(
      `INSERT INTO AUDITORIA (id_organizacion, id_auditor, area_evaluada, fecha_auditoria)
       VALUES (:id_organizacion, :id_auditor, :area_evaluada, TO_DATE(:fecha_auditoria, 'YYYY-MM-DD'))
       RETURNING id_auditoria INTO :out_id`,
      {
        id_organizacion,
        id_auditor: auditorId,
        area_evaluada,
        fecha_auditoria,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    const nuevoId = insertResult.outBinds.out_id[0];

    const row = await query("SELECT * FROM AUDITORIA WHERE id_auditoria = $1", [nuevoId]);
    res.status(201).json(row.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear la auditoría" });
  } finally {
    await conn.close();
  }
});

// PUT /api/auditorias/:id/respuestas
// body: [{ id_pregunta, valor_respuesta: 'SI'|'NO'|'NA', observaciones }]
// Hace upsert de cada respuesta (guardado incremental, como pide el flujo del PDF: "guardar y continuar después").
//
// Nota Oracle: Postgres resolvía el upsert con "INSERT ... ON CONFLICT
// (...) DO UPDATE SET ... EXCLUDED.col". Oracle no tiene ON CONFLICT;
// el equivalente estándar es MERGE.
router.put("/:id/respuestas", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const respuestas = req.body;

  if (!Array.isArray(respuestas) || !respuestas.length) {
    return res.status(400).json({ error: "Se esperaba un arreglo de respuestas" });
  }

  const client = await connect();
  try {
    await client.query("BEGIN");
    for (const r of respuestas) {
      await client.query(
        `MERGE INTO RESPUESTA r
         USING (SELECT :id_auditoria AS id_auditoria, :id_pregunta AS id_pregunta FROM DUAL) src
         ON (r.id_auditoria = src.id_auditoria AND r.id_pregunta = src.id_pregunta)
         WHEN MATCHED THEN UPDATE SET
           r.valor_respuesta = :valor_respuesta,
           r.observaciones = :observaciones,
           r.fecha_respuesta = CURRENT_TIMESTAMP
         WHEN NOT MATCHED THEN INSERT (id_auditoria, id_pregunta, valor_respuesta, observaciones)
           VALUES (:id_auditoria, :id_pregunta, :valor_respuesta, :observaciones)`,
        {
          id_auditoria: idAuditoria,
          id_pregunta: r.id_pregunta,
          valor_respuesta: r.valor_respuesta,
          observaciones: r.observaciones || null,
        }
      );
    }
    await client.query("COMMIT");
    res.json({ guardado: true, total: respuestas.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "No se pudieron guardar las respuestas" });
  } finally {
    await client.release();
  }
});

// POST /api/auditorias/:id/calcular
// Calcula madurez/cumplimiento/exposición y persiste RESULTADO_CONTROL,
// RESULTADO_DOMINIO y RESULTADO_AUDITORIA. Marca la auditoría como FINALIZADA.
router.post("/:id/calcular", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const client = await connect();

  try {
    const { controles, dominios } = await cargarCatalogo();
    const respuestas = (
      await client.query("SELECT id_pregunta, valor_respuesta FROM RESPUESTA WHERE id_auditoria = :1", [idAuditoria])
    ).rows;

    const reporte = calcularReporte(controles, respuestas, dominios);

    await client.query("BEGIN");

    for (const rc of reporte.resultadosControl) {
      if (rc.estado !== "evaluado") continue;
      await client.query(
        `MERGE INTO RESULTADO_CONTROL rc
         USING (SELECT :id_auditoria AS id_auditoria, :id_control AS id_control FROM DUAL) src
         ON (rc.id_auditoria = src.id_auditoria AND rc.id_control = src.id_control)
         WHEN MATCHED THEN UPDATE SET
           rc.nivel_madurez = :nivel_madurez,
           rc.porcentaje_cumplimiento = :porcentaje_cumplimiento,
           rc.exposicion_confidencialidad = :exp_c,
           rc.exposicion_integridad = :exp_i,
           rc.exposicion_disponibilidad = :exp_d
         WHEN NOT MATCHED THEN INSERT
           (id_auditoria, id_control, nivel_madurez, porcentaje_cumplimiento,
            exposicion_confidencialidad, exposicion_integridad, exposicion_disponibilidad)
           VALUES (:id_auditoria, :id_control, :nivel_madurez, :porcentaje_cumplimiento,
                   :exp_c, :exp_i, :exp_d)`,
        {
          id_auditoria: idAuditoria,
          id_control: rc.id_control,
          nivel_madurez: rc.madurez,
          porcentaje_cumplimiento: rc.cumplimiento,
          exp_c: rc.dimensiones.includes("C") ? rc.exposicion : 0,
          exp_i: rc.dimensiones.includes("I") ? rc.exposicion : 0,
          exp_d: rc.dimensiones.includes("D") ? rc.exposicion : 0,
        }
      );
    }

    for (const rd of reporte.resultadosDominio) {
      if (rd.evaluados === 0) continue;
      await client.query(
        `MERGE INTO RESULTADO_DOMINIO rd
         USING (SELECT :id_auditoria AS id_auditoria, :id_dominio AS id_dominio FROM DUAL) src
         ON (rd.id_auditoria = src.id_auditoria AND rd.id_dominio = src.id_dominio)
         WHEN MATCHED THEN UPDATE SET
           rd.porcentaje_cumplimiento = :porcentaje_cumplimiento,
           rd.nivel_madurez_promedio = :nivel_madurez_promedio
         WHEN NOT MATCHED THEN INSERT
           (id_auditoria, id_dominio, porcentaje_cumplimiento, nivel_madurez_promedio,
            exposicion_confidencialidad, exposicion_integridad, exposicion_disponibilidad)
           VALUES (:id_auditoria, :id_dominio, :porcentaje_cumplimiento, :nivel_madurez_promedio, 0, 0, 0)`,
        {
          id_auditoria: idAuditoria,
          id_dominio: rd.id_dominio,
          porcentaje_cumplimiento: rd.porcentaje_cumplimiento,
          nivel_madurez_promedio: rd.nivel_madurez_promedio,
        }
      );
    }

    const s = reporte.resumen;
    await client.query(
      `MERGE INTO RESULTADO_AUDITORIA ra
       USING (SELECT :id_auditoria AS id_auditoria FROM DUAL) src
       ON (ra.id_auditoria = src.id_auditoria)
       WHEN MATCHED THEN UPDATE SET
         ra.exposicion_confidencialidad = :exp_c,
         ra.exposicion_integridad = :exp_i,
         ra.exposicion_disponibilidad = :exp_d,
         ra.indice_general_riesgo = :indice,
         ra.fecha_calculo = CURRENT_TIMESTAMP
       WHEN NOT MATCHED THEN INSERT
         (id_auditoria, exposicion_confidencialidad, exposicion_integridad, exposicion_disponibilidad, indice_general_riesgo)
         VALUES (:id_auditoria, :exp_c, :exp_i, :exp_d, :indice)`,
      {
        id_auditoria: idAuditoria,
        exp_c: s.exposicion_confidencialidad || 0,
        exp_i: s.exposicion_integridad || 0,
        exp_d: s.exposicion_disponibilidad || 0,
        indice: s.indice_general_riesgo || 0,
      }
    );

    await client.query(
      "UPDATE AUDITORIA SET estado = 'FINALIZADA', fecha_finalizacion = CURRENT_TIMESTAMP WHERE id_auditoria = :1",
      [idAuditoria]
    );

    await client.query("COMMIT");
    res.json(reporte);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "No se pudo calcular el reporte" });
  } finally {
    await client.release();
  }
});

// GET /api/auditorias/:id/reporte -> vuelve a traer el reporte ya persistido
router.get("/:id/reporte", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  try {
    const general = (await query("SELECT * FROM RESULTADO_AUDITORIA WHERE id_auditoria = $1", [idAuditoria])).rows[0];
    const porDominio = (
      await query(
        `SELECT rd.*, d.nombre_dominio FROM RESULTADO_DOMINIO rd
         JOIN DOMINIO_ISO d ON d.id_dominio = rd.id_dominio
         WHERE rd.id_auditoria = $1`,
        [idAuditoria]
      )
    ).rows;
    const porControl = (
      await query(
        `SELECT rc.*, c.codigo_control, c.nombre_control FROM RESULTADO_CONTROL rc
         JOIN CONTROL c ON c.id_control = rc.id_control
         WHERE rc.id_auditoria = $1
         ORDER BY rc.exposicion_confidencialidad DESC`,
        [idAuditoria]
      )
    ).rows;

    if (!general) return res.status(404).json({ error: "Esta auditoría todavía no tiene un cálculo generado" });
    res.json({ general, porDominio, porControl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo obtener el reporte" });
  }
});

// ---------- helpers ----------

// Nota Oracle: igual que en controles.js, sin array_agg — se trae la
// relación control-dimensión plana y se agrupa en JavaScript.
async function cargarCatalogo() {
  const dominios = (await query("SELECT id_dominio, nombre_dominio FROM DOMINIO_ISO")).rows;
  const controlesBase = (await query("SELECT id_control, id_dominio, peso FROM CONTROL")).rows;
  const dimensionesRows = (
    await query(`
      SELECT cdm.id_control, d.codigo
      FROM CONTROL_DIMENSION cdm
      JOIN DIMENSION_RIESGO d ON d.id_dimension = cdm.id_dimension
    `)
  ).rows;
  const preguntas = (await query("SELECT id_pregunta, id_control FROM PREGUNTA")).rows;

  const dimensionesPorControl = new Map();
  for (const d of dimensionesRows) {
    if (!dimensionesPorControl.has(d.id_control)) dimensionesPorControl.set(d.id_control, []);
    dimensionesPorControl.get(d.id_control).push(d.codigo);
  }

  const preguntasPorControl = new Map();
  for (const p of preguntas) {
    if (!preguntasPorControl.has(p.id_control)) preguntasPorControl.set(p.id_control, []);
    preguntasPorControl.get(p.id_control).push(p);
  }

  const controles = controlesBase.map((c) => ({
    ...c,
    dimensiones: dimensionesPorControl.get(c.id_control) || [],
    preguntas: preguntasPorControl.get(c.id_control) || [],
  }));
  return { controles, dominios };
}

// Nota Oracle: igual que en organizaciones.js, RETURNING ... INTO en vez
// de RETURNING * para obtener el id recién creado.
async function obtenerAuditorPorDefecto() {
  const login = process.env.DEFAULT_AUDITOR_LOGIN || "auditor.demo";
  const existente = await query("SELECT id_usuario FROM USUARIO WHERE usuario_login = $1", [login]);
  if (existente.rows.length) return existente.rows[0].id_usuario;

  const rol = await query("SELECT id_rol FROM ROL WHERE nombre_rol = 'Auditor'");

  const conn = await getConnection();
  try {
    const insertResult = await conn.execute(
      `INSERT INTO USUARIO (id_rol, nombre_completo, correo, usuario_login, contrasena_hash)
       VALUES (:id_rol, 'Auditor Demo', 'auditor.demo@tld.com', :login, 'sin-login-fase-1')
       RETURNING id_usuario INTO :out_id`,
      {
        id_rol: rol.rows[0].id_rol,
        login,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    return insertResult.outBinds.out_id[0];
  } finally {
    await conn.close();
  }
}

// GET /api/auditorias/:id/respuestas
// Devuelve las respuestas guardadas hasta ahora (aunque la auditoría
// siga EN_PROGRESO) — lo usa el botón "Guardar progreso" / "Continuar
// donde quedé" del frontend para restaurar el cuestionario.
router.get("/:id/respuestas", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  try {
    const result = await query(
      "SELECT id_pregunta, valor_respuesta, observaciones FROM RESPUESTA WHERE id_auditoria = $1 ORDER BY id_pregunta",
      [idAuditoria]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudieron obtener las respuestas guardadas" });
  }
});

module.exports = router;
