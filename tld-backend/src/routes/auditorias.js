const express = require("express");
const pool = require("../db/pool");
const { calcularReporte } = require("../services/calculoRiesgo");

const router = express.Router();

// POST /api/auditorias  { id_organizacion, area_evaluada, fecha_auditoria, id_auditor }
router.post("/", async (req, res) => {
  const { id_organizacion, area_evaluada, fecha_auditoria, id_auditor } = req.body;
  if (!id_organizacion || !area_evaluada || !fecha_auditoria) {
    return res.status(400).json({ error: "id_organizacion, area_evaluada y fecha_auditoria son obligatorios" });
  }

  try {
    const auditorId = id_auditor || (await obtenerAuditorPorDefecto());
    const result = await pool.query(
      `INSERT INTO AUDITORIA (id_organizacion, id_auditor, area_evaluada, fecha_auditoria)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id_organizacion, auditorId, area_evaluada, fecha_auditoria]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear la auditoría" });
  }
});

// PUT /api/auditorias/:id/respuestas
// body: [{ id_pregunta, valor_respuesta: 'SI'|'NO'|'NA', observaciones }]
// Hace upsert de cada respuesta (guardado incremental, como pide el flujo del PDF: "guardar y continuar después").
router.put("/:id/respuestas", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const respuestas = req.body;

  if (!Array.isArray(respuestas) || !respuestas.length) {
    return res.status(400).json({ error: "Se esperaba un arreglo de respuestas" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of respuestas) {
      await client.query(
        `INSERT INTO RESPUESTA (id_auditoria, id_pregunta, valor_respuesta, observaciones)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_auditoria, id_pregunta)
         DO UPDATE SET valor_respuesta = EXCLUDED.valor_respuesta,
                        observaciones = EXCLUDED.observaciones,
                        fecha_respuesta = CURRENT_TIMESTAMP`,
        [idAuditoria, r.id_pregunta, r.valor_respuesta, r.observaciones || null]
      );
    }
    await client.query("COMMIT");
    res.json({ guardado: true, total: respuestas.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "No se pudieron guardar las respuestas" });
  } finally {
    client.release();
  }
});

// POST /api/auditorias/:id/calcular
// Calcula madurez/cumplimiento/exposición y persiste RESULTADO_CONTROL,
// RESULTADO_DOMINIO y RESULTADO_AUDITORIA. Marca la auditoría como FINALIZADA.
router.post("/:id/calcular", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const client = await pool.connect();

  try {
    const { controles, dominios } = await cargarCatalogo(client);
    const respuestas = (
      await client.query("SELECT id_pregunta, valor_respuesta FROM RESPUESTA WHERE id_auditoria = $1", [idAuditoria])
    ).rows;

    const reporte = calcularReporte(controles, respuestas, dominios);

    await client.query("BEGIN");

    for (const rc of reporte.resultadosControl) {
      if (rc.estado !== "evaluado") continue;
      await client.query(
        `INSERT INTO RESULTADO_CONTROL
           (id_auditoria, id_control, nivel_madurez, porcentaje_cumplimiento,
            exposicion_confidencialidad, exposicion_integridad, exposicion_disponibilidad)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id_auditoria, id_control)
         DO UPDATE SET nivel_madurez = EXCLUDED.nivel_madurez,
                        porcentaje_cumplimiento = EXCLUDED.porcentaje_cumplimiento,
                        exposicion_confidencialidad = EXCLUDED.exposicion_confidencialidad,
                        exposicion_integridad = EXCLUDED.exposicion_integridad,
                        exposicion_disponibilidad = EXCLUDED.exposicion_disponibilidad`,
        [
          idAuditoria,
          rc.id_control,
          rc.madurez,
          rc.cumplimiento,
          rc.dimensiones.includes("C") ? rc.exposicion : 0,
          rc.dimensiones.includes("I") ? rc.exposicion : 0,
          rc.dimensiones.includes("D") ? rc.exposicion : 0,
        ]
      );
    }

    for (const rd of reporte.resultadosDominio) {
      if (rd.evaluados === 0) continue;
      await client.query(
        `INSERT INTO RESULTADO_DOMINIO
           (id_auditoria, id_dominio, porcentaje_cumplimiento, nivel_madurez_promedio,
            exposicion_confidencialidad, exposicion_integridad, exposicion_disponibilidad)
         VALUES ($1, $2, $3, $4, $5, $5, $5)
         ON CONFLICT (id_auditoria, id_dominio)
         DO UPDATE SET porcentaje_cumplimiento = EXCLUDED.porcentaje_cumplimiento,
                        nivel_madurez_promedio = EXCLUDED.nivel_madurez_promedio`,
        [idAuditoria, rd.id_dominio, rd.porcentaje_cumplimiento, rd.nivel_madurez_promedio, 0]
      );
    }

    const s = reporte.resumen;
    await client.query(
      `INSERT INTO RESULTADO_AUDITORIA
         (id_auditoria, exposicion_confidencialidad, exposicion_integridad, exposicion_disponibilidad, indice_general_riesgo)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id_auditoria)
       DO UPDATE SET exposicion_confidencialidad = EXCLUDED.exposicion_confidencialidad,
                      exposicion_integridad = EXCLUDED.exposicion_integridad,
                      exposicion_disponibilidad = EXCLUDED.exposicion_disponibilidad,
                      indice_general_riesgo = EXCLUDED.indice_general_riesgo,
                      fecha_calculo = CURRENT_TIMESTAMP`,
      [idAuditoria, s.exposicion_confidencialidad || 0, s.exposicion_integridad || 0, s.exposicion_disponibilidad || 0, s.indice_general_riesgo || 0]
    );

    await client.query(
      "UPDATE AUDITORIA SET estado = 'FINALIZADA', fecha_finalizacion = CURRENT_TIMESTAMP WHERE id_auditoria = $1",
      [idAuditoria]
    );

    await client.query("COMMIT");
    res.json(reporte);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "No se pudo calcular el reporte" });
  } finally {
    client.release();
  }
});

// GET /api/auditorias/:id/reporte -> vuelve a traer el reporte ya persistido
router.get("/:id/reporte", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  try {
    const general = (await pool.query("SELECT * FROM RESULTADO_AUDITORIA WHERE id_auditoria = $1", [idAuditoria])).rows[0];
    const porDominio = (
      await pool.query(
        `SELECT rd.*, d.nombre_dominio FROM RESULTADO_DOMINIO rd
         JOIN DOMINIO_ISO d ON d.id_dominio = rd.id_dominio
         WHERE rd.id_auditoria = $1`,
        [idAuditoria]
      )
    ).rows;
    const porControl = (
      await pool.query(
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

async function cargarCatalogo(client) {
  const dominios = (await client.query("SELECT id_dominio, nombre_dominio FROM DOMINIO_ISO")).rows;
  const controlesRows = (
    await client.query(`
      SELECT c.id_control, c.id_dominio, c.peso,
             COALESCE(array_agg(DISTINCT cd.codigo) FILTER (WHERE cd.codigo IS NOT NULL), '{}') AS dimensiones
      FROM CONTROL c
      LEFT JOIN CONTROL_DIMENSION cdm ON cdm.id_control = c.id_control
      LEFT JOIN DIMENSION_RIESGO cd ON cd.id_dimension = cdm.id_dimension
      GROUP BY c.id_control
    `)
  ).rows;
  const preguntas = (await client.query("SELECT id_pregunta, id_control FROM PREGUNTA")).rows;

  const preguntasPorControl = new Map();
  for (const p of preguntas) {
    if (!preguntasPorControl.has(p.id_control)) preguntasPorControl.set(p.id_control, []);
    preguntasPorControl.get(p.id_control).push(p);
  }

  const controles = controlesRows.map((c) => ({ ...c, preguntas: preguntasPorControl.get(c.id_control) || [] }));
  return { controles, dominios };
}

async function obtenerAuditorPorDefecto() {
  const login = process.env.DEFAULT_AUDITOR_LOGIN || "auditor.demo";
  const existente = await pool.query("SELECT id_usuario FROM USUARIO WHERE usuario_login = $1", [login]);
  if (existente.rows.length) return existente.rows[0].id_usuario;

  const rol = await pool.query("SELECT id_rol FROM ROL WHERE nombre_rol = 'Auditor'");
  const creado = await pool.query(
    `INSERT INTO USUARIO (id_rol, nombre_completo, correo, usuario_login, contrasena_hash)
     VALUES ($1, 'Auditor Demo', 'auditor.demo@tld.com', $2, 'sin-login-fase-1')
     RETURNING id_usuario`,
    [rol.rows[0].id_rol, login]
  );
  return creado.rows[0].id_usuario;
}

module.exports = router;
