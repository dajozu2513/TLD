const { Pool } = require("pg");

// En local (Docker) seguimos leyendo PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
// desde .env, como hasta ahora. En producción (Render + Neon) usamos DATABASE_URL.
// rejectUnauthorized:false evita que Node rechace el certificado de Neon por no
// poder validar la cadena completa — la conexión sigue viajando cifrada por TLS.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool();

pool.on("error", (err) => {
  console.error("Error inesperado en el pool de PostgreSQL:", err);
});

module.exports = pool;










//******************************************************************************************** */
//const { Pool } = require("pg");

// pg lee automáticamente PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// desde process.env (por eso no hace falta pasarlas a mano aquí), siempre
// que se haya llamado require("dotenv").config() antes en server.js.
//const pool = new Pool();

//pool.on("error", (err) => {
//  console.error("Error inesperado en el pool de PostgreSQL:", err);
//});

//module.exports = pool;
