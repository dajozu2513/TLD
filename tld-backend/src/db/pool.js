const { Pool } = require("pg");

// pg lee automáticamente PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// desde process.env (por eso no hace falta pasarlas a mano aquí), siempre
// que se haya llamado require("dotenv").config() antes en server.js.
const pool = new Pool();

pool.on("error", (err) => {
  console.error("Error inesperado en el pool de PostgreSQL:", err);
});

module.exports = pool;
