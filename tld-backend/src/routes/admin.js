const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

// Toda ruta bajo /api/admin exige el header x-admin-key con el valor
// de la variable de entorno ADMIN_KEY (clave compartida del equipo).
router.use((req, res, next) => {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Clave de administrador inválida" });
  }
  next();
});

// GET /api/admin/auditorias — lista todas las auditorías guardadas
router.get("/auditorias", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id_auditoria, a.area_evaluada, a.fecha_auditoria, a.estado, a.fecha_creacion,
             o.nombre AS organizacion,
             r.indice_general_riesgo
      FROM AUDITORIA a
      JOIN ORGANIZACION o ON o.id_organizacion = a.id_organizacion
      LEFT JOIN RESULTADO_AUDITORIA r ON r.id_auditoria = a.id_auditoria
      ORDER BY a.fecha_creacion DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cargar la lista de auditorías" });
  }
});

// GET /api/admin/auditorias/:id — detalle por dominio y control
router.get("/auditorias/:id", async (req, res) => {
  const idAuditoria = Number(req.params.id);
  try {
    const general = (
      await pool.query("SELECT * FROM RESULTADO_AUDITORIA WHERE id_auditoria = $1", [idAuditoria])
    ).rows[0];
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
    res.status(500).json({ error: "No se pudo obtener el detalle de la auditoría" });
  }
});

module.exports = router;