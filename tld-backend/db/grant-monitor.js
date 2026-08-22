/**
 * Alternativa a 03_grant_monitor.sql para cuando no tienes sqlplus ni
 * SQL Developer a mano: usa el mismo driver `oracledb` (modo Thin, ya
 * instalado en node_modules) para conectarse como SYSTEM y otorgar el
 * privilegio que necesita el Monitor de Salud.
 *
 * Uso (desde tld-backend/):
 *   node db/grant-monitor.js
 *
 * Te pedirá la contraseña de SYSTEM de forma interactiva (no queda en
 * el historial de la terminal ni se envía a ningún lado más que a tu
 * Oracle local). Usa el mismo ORACLE_CONNECT_STRING y el mismo usuario
 * de la app definidos en tu .env.
 */
require("dotenv").config();
const oracledb = require("oracledb");
const readline = require("readline");

const TLD_USER = process.env.ORACLE_USER || "tld_user";
const CONNECT_STRING = process.env.ORACLE_CONNECT_STRING;

function ask(question, hide) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hide) {
      // Oculta lo que se escribe (aproximado; no es un prompt de contraseña real de SO).
      rl._writeToOutput = () => rl.output.write("*");
    }
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (!CONNECT_STRING) {
    console.error("Falta ORACLE_CONNECT_STRING en tld-backend/.env");
    process.exit(1);
  }
  console.log(`Conectando a ${CONNECT_STRING} como SYSTEM...`);
  const systemPassword = await ask("Contraseña de SYSTEM: ", true);

  const conn = await oracledb.getConnection({
    user: "SYSTEM",
    password: systemPassword,
    connectString: CONNECT_STRING,
  });

  try {
    await conn.execute(`GRANT SELECT_CATALOG_ROLE TO ${TLD_USER}`);
    await conn.commit();
    console.log(`Listo: SELECT_CATALOG_ROLE otorgado a ${TLD_USER}.`);
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error("No se pudo otorgar el privilegio:", err.message);
  process.exit(1);
});
