require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db/pool");

const controlesRouter = require("./routes/controles");
const organizacionesRouter = require("./routes/organizaciones");
const auditoriasRouter = require("./routes/auditorias");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "conectada" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "sin conexión", detalle: err.message });
  }
});

app.use("/api/controles", controlesRouter);
app.use("/api/organizaciones", organizacionesRouter);
app.use("/api/auditorias", auditoriasRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TLD backend escuchando en http://localhost:${PORT}`);
  console.log(`Probar conexión a la base de datos: http://localhost:${PORT}/api/health`);
});
