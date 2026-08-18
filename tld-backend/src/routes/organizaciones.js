const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

// POST /api/organizaciones  { nombre, sector, ubicacion }
router.post("/", async (req, res) => {
  const { nombre, sector, ubicacion } = req.body;
  if (!nombre) return res.status(400).json({ error: "El nombre de la organización es obligatorio" });

  try {
    const result = await pool.query(
      `INSERT INTO ORGANIZACION (nombre, sector, ubicacion)
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre, sector || null, ubicacion || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear la organización" });
  }
});

// GET /api/organizaciones
router.get("/", async (req, res) => {
  const result = await pool.query("SELECT * FROM ORGANIZACION ORDER BY id_organizacion DESC");
  res.json(result.rows);
});

module.exports = router;
