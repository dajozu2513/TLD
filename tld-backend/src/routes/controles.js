const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

// GET /api/controles
// Devuelve el catálogo completo (dominios -> controles -> preguntas + dimensiones CID)
// Antes esto era el arreglo CONTROLES hardcodeado en js/iso-cuestionario.js;
// ahora vive en la base de datos y el frontend lo consulta.
router.get("/", async (req, res) => {
  try {
    const dominiosRes = await pool.query(
      "SELECT id_dominio, codigo_dominio, nombre_dominio FROM DOMINIO_ISO ORDER BY id_dominio"
    );

    const controlesRes = await pool.query(`
      SELECT c.id_control, c.id_dominio, c.codigo_control, c.nombre_control, c.peso,
             COALESCE(array_agg(DISTINCT cd.codigo) FILTER (WHERE cd.codigo IS NOT NULL), '{}') AS dimensiones
      FROM CONTROL c
      LEFT JOIN CONTROL_DIMENSION cdm ON cdm.id_control = c.id_control
      LEFT JOIN DIMENSION_RIESGO cd ON cd.id_dimension = cdm.id_dimension
      GROUP BY c.id_control
      ORDER BY c.id_control
    `);

    const preguntasRes = await pool.query(
      "SELECT id_pregunta, id_control, texto_pregunta, orden FROM PREGUNTA ORDER BY id_control, orden"
    );

    const preguntasPorControl = new Map();
    for (const p of preguntasRes.rows) {
      if (!preguntasPorControl.has(p.id_control)) preguntasPorControl.set(p.id_control, []);
      preguntasPorControl.get(p.id_control).push(p);
    }

    const controles = controlesRes.rows.map((c) => ({
      ...c,
      preguntas: preguntasPorControl.get(c.id_control) || [],
    }));

    res.json({ dominios: dominiosRes.rows, controles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cargar el catálogo de controles" });
  }
});

module.exports = router;
