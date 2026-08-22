const oracledb = require("oracledb");

// Devuelve filas como objetos (no arreglos posicionales).
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// oracledb v6+ usa por defecto el modo "Thin": no requiere instalar
// Oracle Instant Client, solo necesita alcanzar el listener de la BD
// (host:puerto/servicio) definido en ORACLE_CONNECT_STRING.

let pool;

async function getPool() {
  if (!pool) {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1,
    });
  }
  return pool;
}

// Oracle devuelve los nombres de columna en MAYÚSCULA por defecto; el
// resto de la app (y el frontend, vía JSON) espera snake_case en
// minúscula, igual que con pg. Normalizamos aquí.
function lowerKeys(row) {
  const out = {};
  for (const k of Object.keys(row)) out[k.toLowerCase()] = row[k];
  return out;
}
function lowerRows(rows) {
  return (rows || []).map(lowerKeys);
}

// Permite reusar queries escritas con placeholders estilo pg ($1, $2...)
// convirtiéndolos a binds posicionales de Oracle (:1, :2...). Si la query
// ya viene en sintaxis nativa de Oracle (binds nombrados :nombre, MERGE,
// etc.) se deja intacta.
function toOracleSql(text) {
  return /\$\d+/.test(text) ? text.replace(/\$(\d+)/g, ":$1") : text;
}

// Equivalente a pool.query(text, params) de pg: abre conexión, ejecuta
// con autoCommit y cierra. Para SELECT/INSERT/UPDATE sueltos (fuera de
// una transacción explícita).
async function query(text, params = []) {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    const result = await conn.execute(toOracleSql(text), params, { autoCommit: true });
    return { rows: lowerRows(result.rows), outBinds: result.outBinds };
  } finally {
    await conn.close();
  }
}

// Equivalente a pool.connect() de pg: da un "client" con query/release
// para transacciones multi-sentencia. BEGIN es no-op (Oracle no lo
// necesita, el autoCommit ya se maneja en false); COMMIT/ROLLBACK se
// traducen a operaciones reales sobre la conexión.
async function connect() {
  const p = await getPool();
  const conn = await p.getConnection();
  return {
    query: async (text, params = []) => {
      const t = text.trim().toUpperCase();
      if (t === "BEGIN") return { rows: [] };
      if (t === "COMMIT") {
        await conn.commit();
        return { rows: [] };
      }
      if (t === "ROLLBACK") {
        await conn.rollback();
        return { rows: [] };
      }
      const result = await conn.execute(toOracleSql(text), params, { autoCommit: false });
      return { rows: lowerRows(result.rows), outBinds: result.outBinds };
    },
    release: async () => {
      await conn.close();
    },
  };
}

// Da acceso a una conexión "cruda" de oracledb para los pocos casos que
// necesitan bind OUT (equivalente a RETURNING * de Postgres, que Oracle
// no soporta de forma genérica). El caller es responsable de cerrarla.
async function getConnection() {
  const p = await getPool();
  return p.getConnection();
}

module.exports = { query, connect, getConnection, getPool, oracledb, lowerRows, lowerKeys };
