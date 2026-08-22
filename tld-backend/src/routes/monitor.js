const express = require("express");
const { query } = require("../db/pool");

const router = express.Router();

// GET /api/monitor/salud
//
// Reemplaza la simulación local del frontend (js/monitor-salud.js) por
// datos reales, leídos en vivo de las vistas dinámicas de Oracle:
//   V$RESOURCE_LIMIT, V$SESSION, V$SESSION_LONGOPS, V$PROCESS,
//   V$SGA, V$SGAINFO, V$SGASTAT, V$SYSSTAT, V$PGASTAT,
//   V$DATAFILE, V$LOG, DBA_DATA_FILES, DBA_FREE_SPACE, DBA_TEMP_FREE_SPACE.
//
// El objeto que devuelve tiene EXACTAMENTE la misma forma que antes
// producía `applyScenario(baseMetrics(), escenario)` en el frontend, así
// que toda la lógica de cálculo de IP/IM/IA/ISBD y de alertas
// (js/monitor-salud.js) no tuvo que tocarse — solo cambió de dónde
// vienen los números.
//
// Requisito de privilegios: el usuario de Oracle configurado en .env
// necesita poder leer estas vistas. La forma más simple es:
//   GRANT SELECT_CATALOG_ROLE TO tld_user;
// (ver README para el detalle y una alternativa con GRANTs puntuales).
router.get("/salud", async (req, res) => {
  try {
    const [
      instanceRes,
      resourceLimitRes,
      sessionStatusRes,
      blockedRes,
      longOpsRes,
      bgProcessRes,
      sgaTotalRes,
      sgaInfoRes,
      sharedPoolRes,
      bufferHitRes,
      pgaRes,
      datafileRes,
      logRes,
      tablespaceRes,
      tempRes,
    ] = await Promise.all([
      query("SELECT instance_name, host_name, status FROM V$INSTANCE"),
      query(
        "SELECT resource_name, current_utilization, limit_value FROM V$RESOURCE_LIMIT WHERE resource_name IN ('processes','sessions')"
      ),
      query("SELECT status, COUNT(*) AS c FROM V$SESSION WHERE type = 'USER' GROUP BY status"),
      query("SELECT COUNT(*) AS c FROM V$SESSION WHERE blocking_session IS NOT NULL"),
      query(
        "SELECT COUNT(*) AS c FROM V$SESSION_LONGOPS WHERE totalwork > 0 AND sofar < totalwork AND time_remaining > 0"
      ),
      query("SELECT DISTINCT pname FROM V$PROCESS WHERE pname IS NOT NULL"),
      query("SELECT SUM(value) AS bytes FROM V$SGA"),
      query("SELECT bytes FROM V$SGAINFO WHERE name = 'Free SGA Memory Available'"),
      query(
        "SELECT SUM(bytes) AS total, SUM(CASE WHEN name = 'free memory' THEN bytes ELSE 0 END) AS free FROM V$SGASTAT WHERE pool = 'shared pool'"
      ),
      query("SELECT name, value FROM V$SYSSTAT WHERE name IN ('physical reads', 'db block gets', 'consistent gets')"),
      query(
        `SELECT name, value FROM V$PGASTAT WHERE name IN (
           'total PGA allocated', 'total PGA inuse', 'aggregate PGA target parameter',
           'over allocation count', 'cache hit percentage'
         )`
      ),
      query("SELECT status, COUNT(*) AS c FROM V$DATAFILE GROUP BY status"),
      query("SELECT status, COUNT(*) AS c FROM V$LOG GROUP BY status"),
      query(`
        SELECT d.tablespace_name AS tablespace_name,
               SUM(d.bytes) AS alloc_bytes,
               NVL(MAX(f.free_bytes), 0) AS free_bytes
        FROM (SELECT tablespace_name, bytes FROM DBA_DATA_FILES) d
        LEFT JOIN (SELECT tablespace_name, SUM(bytes) AS free_bytes FROM DBA_FREE_SPACE GROUP BY tablespace_name) f
          ON f.tablespace_name = d.tablespace_name
        GROUP BY d.tablespace_name
      `),
      query("SELECT tablespace_name, tablespace_size, allocated_space, free_space FROM DBA_TEMP_FREE_SPACE"),
    ]);

    const metrics = buildMetrics({
      resourceLimitRes,
      sessionStatusRes,
      blockedRes,
      longOpsRes,
      bgProcessRes,
      sgaTotalRes,
      sgaInfoRes,
      sharedPoolRes,
      bufferHitRes,
      pgaRes,
      datafileRes,
      logRes,
      tablespaceRes,
      tempRes,
    });

    res.json({
      instance: instanceRes.rows[0] || null,
      metrics,
      measuredAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    // El mensaje de Oracle (err.message) suele decir exactamente qué
    // vista faltó ("ORA-00942: table or view does not exist"), lo cual
    // normalmente significa que falta el GRANT SELECT_CATALOG_ROLE.
    res.status(500).json({
      error: "No se pudo leer el estado de la base de datos Oracle",
      detalle: err.message,
    });
  }
});

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pgaValue(rows, name) {
  const row = rows.find((r) => r.name === name);
  return row ? num(row.value) : 0;
}

function buildMetrics(d) {
  // ---- Procesos ----
  const limitRows = d.resourceLimitRes.rows;
  const procRow = limitRows.find((r) => r.resource_name === "processes");
  const sessRow = limitRows.find((r) => r.resource_name === "sessions");

  const processesCurrent = procRow ? num(procRow.current_utilization) : 0;
  let processesLimit = procRow ? parseLimitValue(procRow.limit_value) : null;
  if (!processesLimit) processesLimit = 300; // fallback conservador si viniera "UNLIMITED"

  const sessionsCurrent = sessRow ? num(sessRow.current_utilization) : 0;
  let sessionsLimit = sessRow ? parseLimitValue(sessRow.limit_value) : null;
  if (!sessionsLimit) sessionsLimit = Math.round(processesLimit * 1.1 + 5); // fórmula por defecto de Oracle

  const statusMap = {};
  d.sessionStatusRes.rows.forEach((r) => (statusMap[r.status] = num(r.c)));
  const sessionsActive = statusMap["ACTIVE"] || 0;
  const sessionsInactive = statusMap["INACTIVE"] || 0;
  const sessionsBlocked = num(d.blockedRes.rows[0]?.c, 0);
  const longOps = num(d.longOpsRes.rows[0]?.c, 0);

  const bgNames = new Set(d.bgProcessRes.rows.map((r) => r.pname));
  const bgStatus = (present) => (present ? "ACTIVO" : "INACTIVO");
  const bg = {
    DBWn: bgStatus([...bgNames].some((n) => n && n.startsWith("DBW"))),
    LGWR: bgStatus(bgNames.has("LGWR")),
    SMON: bgStatus(bgNames.has("SMON")),
    PMON: bgStatus(bgNames.has("PMON")),
    CKPT: bgStatus(bgNames.has("CKPT")),
  };

  // ---- Memoria ----
  const sgaTotalMb = Math.round(num(d.sgaTotalRes.rows[0]?.bytes) / 1024 / 1024);
  const sgaFreeMb = Math.round(num(d.sgaInfoRes.rows[0]?.bytes) / 1024 / 1024);

  const spTotal = num(d.sharedPoolRes.rows[0]?.total);
  const spFree = num(d.sharedPoolRes.rows[0]?.free);
  const sharedPoolPct = spTotal > 0 ? Math.round(((spTotal - spFree) / spTotal) * 1000) / 10 : 0;

  // Nota: "bufferCachePct" aquí es el Buffer Cache Hit Ratio real
  // (V$SYSSTAT), no un "% de llenado" — el buffer cache de Oracle
  // normalmente está siempre lleno tras el arranque (LRU), así que un
  // "% de uso" no sería una señal de salud útil. El hit ratio sí lo es:
  // más alto = mejor (justo al revés que las otras barras de esta
  // sección). El cálculo de IM y el color de esta barra están ajustados
  // para reflejarlo.
  const physReads = pgaValue(d.bufferHitRes.rows, "physical reads");
  const blockGets = pgaValue(d.bufferHitRes.rows, "db block gets");
  const consGets = pgaValue(d.bufferHitRes.rows, "consistent gets");
  const logicalReads = blockGets + consGets;
  const bufferCachePct = logicalReads > 0 ? Math.round((1 - physReads / logicalReads) * 1000) / 10 : 100;

  const pgaAllocatedMb = Math.round(pgaValue(d.pgaRes.rows, "total PGA allocated") / 1024 / 1024);
  const pgaInuseMb = Math.round(pgaValue(d.pgaRes.rows, "total PGA inuse") / 1024 / 1024);
  let pgaTargetMb = Math.round(pgaValue(d.pgaRes.rows, "aggregate PGA target parameter") / 1024 / 1024);
  if (!pgaTargetMb) pgaTargetMb = Math.max(pgaAllocatedMb, 1); // evita división entre 0 si no hay PGA_AGGREGATE_TARGET
  const pgaOverAlloc = pgaValue(d.pgaRes.rows, "over allocation count");
  const pgaCacheHitPct = pgaValue(d.pgaRes.rows, "cache hit percentage");

  // ---- Archivos ----
  const dfMap = {};
  d.datafileRes.rows.forEach((r) => (dfMap[r.status] = num(r.c)));
  const datafilesOnline = (dfMap["ONLINE"] || 0) + (dfMap["SYSTEM"] || 0);
  const datafilesOffline = dfMap["OFFLINE"] || 0;
  const datafilesProblem = dfMap["RECOVER"] || 0;

  const logMap = {};
  d.logRes.rows.forEach((r) => (logMap[r.status] = num(r.c)));
  const knownOkStatuses = ["CURRENT", "ACTIVE", "INACTIVE", "UNUSED"];
  let redoGroupsOk = 0;
  let redoGroupsProblem = 0;
  Object.keys(logMap).forEach((status) => {
    if (knownOkStatuses.includes(status)) redoGroupsOk += logMap[status];
    else redoGroupsProblem += logMap[status];
  });

  let tablespacesNormal = 0;
  let tablespacesWarning = 0;
  let tablespacesCritical = 0;
  let maxTablespaceUsedPct = 0;
  d.tablespaceRes.rows.forEach((ts) => {
    const alloc = num(ts.alloc_bytes);
    const free = num(ts.free_bytes);
    if (alloc <= 0) return;
    const usedPct = ((alloc - free) / alloc) * 100;
    if (usedPct > maxTablespaceUsedPct) maxTablespaceUsedPct = usedPct;
    if (usedPct >= 95) tablespacesCritical++;
    else if (usedPct >= 80) tablespacesWarning++;
    else tablespacesNormal++;
  });
  maxTablespaceUsedPct = Math.round(maxTablespaceUsedPct * 10) / 10;

  let tempUsedPct = 0;
  if (d.tempRes.rows.length) {
    const pcts = d.tempRes.rows
      .filter((t) => num(t.tablespace_size) > 0)
      .map((t) => ((num(t.allocated_space) - num(t.free_space)) / num(t.tablespace_size)) * 100);
    tempUsedPct = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0;
  }

  return {
    processesCurrent,
    processesLimit,
    sessionsCurrent,
    sessionsLimit,
    sessionsActive,
    sessionsInactive,
    sessionsBlocked,
    longOps,
    sgaTotalMb,
    sgaFreeMb,
    sharedPoolPct,
    bufferCachePct,
    pgaAllocatedMb,
    pgaInuseMb,
    pgaTargetMb,
    pgaOverAlloc,
    pgaCacheHitPct,
    datafilesOnline,
    datafilesOffline,
    datafilesProblem,
    tablespacesNormal,
    tablespacesWarning,
    tablespacesCritical,
    tempUsedPct,
    redoGroupsOk,
    redoGroupsProblem,
    maxTablespaceUsedPct,
    bg,
  };
}

// V$RESOURCE_LIMIT.LIMIT_VALUE es VARCHAR2: puede venir 'UNLIMITED' o un número como texto.
function parseLimitValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (String(raw).trim().toUpperCase() === "UNLIMITED") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = router;
