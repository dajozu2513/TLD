const express = require("express");
const { query } = require("../db/pool");

const router = express.Router();

// GET /api/controles
// Devuelve el catálogo completo (dominios -> controles -> preguntas + dimensiones CID)
// Antes esto era el arreglo CONTROLES hardcodeado en js/iso-cuestionario.js;
// ahora vive en la base de datos y el frontend lo consulta.
//
// Nota Oracle: Postgres tenía esto resuelto con un solo
// array_agg(...) FILTER (WHERE ...) para juntar las dimensiones C/I/D
// de cada control en una sola query. Oracle no tiene un equivalente
// directo tan simple (habría que usar LISTAGG + parseo de texto), así
// que aquí se trae la relación control-dimensión "plana" y se agrupa
// en JavaScript, igual que ya se hacía con las preguntas.
router.get("/", async (req, res) => {
  try {
    const dominiosRes = await query(
      "SELECT id_dominio, codigo_dominio, nombre_dominio FROM DOMINIO_ISO ORDER BY id_dominio"
    );

    const controlesRes = await query(
      "SELECT id_control, id_dominio, codigo_control, nombre_control, peso FROM CONTROL ORDER BY id_control"
    );

    const dimensionesRes = await query(`
      SELECT cdm.id_control, d.codigo
      FROM CONTROL_DIMENSION cdm
      JOIN DIMENSION_RIESGO d ON d.id_dimension = cdm.id_dimension
      ORDER BY cdm.id_control
    `);

    const preguntasRes = await query(
      "SELECT id_pregunta, id_control, texto_pregunta, orden FROM PREGUNTA ORDER BY id_control, orden"
    );

    const dimensionesPorControl = new Map();
    for (const d of dimensionesRes.rows) {
      if (!dimensionesPorControl.has(d.id_control)) dimensionesPorControl.set(d.id_control, []);
      dimensionesPorControl.get(d.id_control).push(d.codigo);
    }

    const preguntasPorControl = new Map();
    for (const p of preguntasRes.rows) {
      if (!preguntasPorControl.has(p.id_control)) preguntasPorControl.set(p.id_control, []);
      preguntasPorControl.get(p.id_control).push(p);
    }

    const controles = controlesRes.rows.map((c) => ({
      ...c,
      dimensiones: dimensionesPorControl.get(c.id_control) || [],
      preguntas: preguntasPorControl.get(c.id_control) || [],
    }));

    res.json({ dominios: dominiosRes.rows, controles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cargar el catálogo de controles" });
  }
});

module.exports = router;
