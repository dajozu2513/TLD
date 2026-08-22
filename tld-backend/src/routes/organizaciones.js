const express = require("express");
const { query, getConnection, oracledb } = require("../db/pool");

const router = express.Router();

// POST /api/organizaciones  { nombre, sector, ubicacion }
//
// Nota Oracle: Postgres permite "INSERT ... RETURNING *" para traer la
// fila completa recién insertada en un solo viaje. Oracle solo permite
// "RETURNING columna INTO :bind" (no "*"), así que se pide de vuelta el
// id generado por el IDENTITY y con eso se hace un SELECT completo.
router.post("/", async (req, res) => {
  const { nombre, sector, ubicacion } = req.body;
  if (!nombre) return res.status(400).json({ error: "El nombre de la organización es obligatorio" });

  const conn = await getConnection();
  try {
    const insertResult = await conn.execute(
      `INSERT INTO ORGANIZACION (nombre, sector, ubicacion)
       VALUES (:nombre, :sector, :ubicacion)
       RETURNING id_organizacion INTO :out_id`,
      {
        nombre,
        sector: sector || null,
        ubicacion: ubicacion || null,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    const nuevoId = insertResult.outBinds.out_id[0];

    const row = await query("SELECT * FROM ORGANIZACION WHERE id_organizacion = $1", [nuevoId]);
    res.status(201).json(row.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear la organización" });
  } finally {
    await conn.close();
  }
});

// GET /api/organizaciones
router.get("/", async (req, res) => {
  try {
    const result = await query("SELECT * FROM ORGANIZACION ORDER BY id_organizacion DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudieron obtener las organizaciones" });
  }
});

module.exports = router;
