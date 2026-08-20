const express = require("express");
const oracledb = require("oracledb");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HISTORY_FILE = path.join(__dirname, "data", "history.json");

const CONFIG = {
  pollInterval: Math.max(5, Number(process.env.POLL_INTERVAL || 30)),
  thresholds: {
    normalMax: Number(process.env.NORMAL_MAX || 69),
    warningMax: Number(process.env.WARNING_MAX || 84),
    highMax: Number(process.env.HIGH_MAX || 94)
  },
  db: {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING || "localhost:1521/XEPDB1"
  }
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;
let monitoringTimer = null;
let monitoringEnabled = false;
let lastSnapshot = null;
let history = loadHistory();

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return [];
  }
}
function saveHistory() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}
function statusFromPercent(value) {
  if (value <= CONFIG.thresholds.normalMax) return "NORMAL";
  if (value <= CONFIG.thresholds.warningMax) return "ADVERTENCIA";
  if (value <= CONFIG.thresholds.highMax) return "ALTO";
  return "CRITICO";
}
function severityRank(s) {
  return ({ NORMAL: 0, ADVERTENCIA: 1, ALTO: 2, CRITICO: 3 })[s] ?? 0;
}
function now() { return new Date().toISOString(); }

async function initPool() {
  if (pool) return;
  if (!CONFIG.db.user || !CONFIG.db.password) {
    throw new Error("Configure ORACLE_USER y ORACLE_PASSWORD en el archivo .env");
  }
  pool = await oracledb.createPool({
    ...CONFIG.db,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1
  });
}

async function q(conn, sql, binds = {}) {
  const r = await conn.execute(sql, binds);
  return r.rows;
}

async function collectSnapshot() {
  await initPool();
  const conn = await pool.getConnection();
  try {
    const [processInfo] = await Promise.all([
      q(conn, `SELECT COUNT(*) AS CURRENT_PROCESSES FROM V$PROCESS`)
    ]);

    const [resourceRows, sessionRows, blockedRows, longOpsRows, waitRows, bgRows] = await Promise.all([
      q(conn, `SELECT RESOURCE_NAME, CURRENT_UTILIZATION, MAX_UTILIZATION, LIMIT_VALUE
               FROM V$RESOURCE_LIMIT
               WHERE RESOURCE_NAME IN ('processes','sessions')`),
      q(conn, `SELECT
                 COUNT(*) AS TOTAL,
                 SUM(CASE WHEN STATUS='ACTIVE' THEN 1 ELSE 0 END) AS ACTIVE,
                 SUM(CASE WHEN STATUS='INACTIVE' THEN 1 ELSE 0 END) AS INACTIVE
               FROM V$SESSION
               WHERE TYPE='USER'`),
      q(conn, `SELECT COUNT(*) AS BLOCKED
               FROM V$SESSION
               WHERE TYPE='USER' AND BLOCKING_SESSION_STATUS='VALID' AND BLOCKING_SESSION IS NOT NULL`),
      q(conn, `SELECT COUNT(*) AS LONG_OPS
               FROM V$SESSION_LONGOPS
               WHERE SOFAR < TOTALWORK AND TOTALWORK > 0 AND TIME_REMAINING > 0`),
      q(conn, `SELECT COUNT(*) AS WAIT_CHAINS FROM V$WAIT_CHAINS`),
      q(conn, `SELECT PNAME, PROGRAM, SPID
               FROM V$PROCESS
               WHERE BACKGROUND IS NOT NULL
                 AND (PNAME LIKE 'DBW%' OR PNAME IN ('LGWR','SMON','PMON','CKPT'))
               ORDER BY PNAME`)
    ]);

    const resources = {};
    for (const r of resourceRows) resources[r.RESOURCE_NAME] = r;

    const proc = resources.processes || {};
    const sess = resources.sessions || {};
    const processCurrent = Number(proc.CURRENT_UTILIZATION ?? processInfo.CURRENT_PROCESSES ?? 0);
    const processMax = Number(proc.MAX_UTILIZATION ?? 0);
    const processLimitRaw = String(proc.LIMIT_VALUE ?? "0");
    const processLimit = /^\d+$/.test(processLimitRaw) ? Number(processLimitRaw) : 0;
    const processPct = processLimit > 0 ? +(processCurrent / processLimit * 100).toFixed(2) : 0;

    const sessionsCurrent = Number(sess.CURRENT_UTILIZATION ?? sessionRows.TOTAL ?? 0);
    const sessionsMax = Number(sess.MAX_UTILIZATION ?? 0);
    const sessionsLimitRaw = String(sess.LIMIT_VALUE ?? "0");
    const sessionsLimit = /^\d+$/.test(sessionsLimitRaw) ? Number(sessionsLimitRaw) : 0;
    const sessionsPct = sessionsLimit > 0 ? +(sessionsCurrent / sessionsLimit * 100).toFixed(2) : 0;

    const blocked = Number(blockedRows[0]?.BLOCKED || 0);
    const longOps = Number(longOpsRows[0]?.LONG_OPS || 0);
    const waitChains = Number(waitRows[0]?.WAIT_CHAINS || 0);

    const expected = ["DBW","LGWR","SMON","PMON","CKPT"];
    const present = {};
    bgRows.forEach(x => {
      const key = x.PNAME.startsWith("DBW") ? "DBW" : x.PNAME;
      if (!present[key]) present[key] = [];
      present[key].push(x);
    });

    const processHealth = statusFromPercent(processPct);
    let worst = processHealth;
    const alerts = [];

    if (blocked > 0) {
      alerts.push({
        component: "PROCESOS",
        variable: "Sesiones bloqueadas",
        value: blocked,
        threshold: 0,
        level: "CRITICO",
        description: "Existen sesiones de usuario bloqueadas por otra sesión."
      });
      worst = "CRITICO";
    }
    if (waitChains > 0) {
      alerts.push({
        component: "PROCESOS",
        variable: "Cadenas de espera",
        value: waitChains,
        threshold: 0,
        level: "ALTO",
        description: "Oracle detectó cadenas de sesiones esperando recursos."
      });
      if (severityRank("ALTO") > severityRank(worst)) worst = "ALTO";
    }
    if (processPct > CONFIG.thresholds.normalMax) {
      alerts.push({
        component: "PROCESOS",
        variable: "Uso de procesos",
        value: processPct,
        threshold: CONFIG.thresholds.normalMax,
        level: processHealth,
        description: "La utilización de procesos supera el umbral configurado."
      });
    }
    if (longOps > 0) {
      alerts.push({
        component: "PROCESOS",
        variable: "Operaciones prolongadas",
        value: longOps,
        threshold: 0,
        level: "ADVERTENCIA",
        description: "Hay operaciones aún en ejecución con tiempo restante."
      });
      if (severityRank("ADVERTENCIA") > severityRank(worst)) worst = "ADVERTENCIA";
    }

    const dbVersionRows = await q(conn, `SELECT BANNER FROM V$VERSION WHERE BANNER LIKE 'Oracle Database%'`);
    const dbVersion = dbVersionRows[0]?.BANNER || "Oracle Database";

    const snapshot = {
      timestamp: now(),
      database: { version: dbVersion, connectString: CONFIG.db.connectString },
      process: {
        current: processCurrent, max: processMax, limit: processLimit, percent: processPct,
        status: worst,
        sessionCurrent: sessionsCurrent, sessionMax: sessionsMax, sessionLimit: sessionsLimit, sessionPercent: sessionsPct,
        active: Number(sessionRows.ACTIVE || 0), inactive: Number(sessionRows.INACTIVE || 0),
        blocked, longOps, waitChains,
        backgrounds: expected.map(k => ({ name: k === "DBW" ? "DBWn" : k, running: !!present[k], count: present[k]?.length || 0, details: present[k] || [] }))
      },
      alerts
    };

    return snapshot;
  } finally {
    await conn.close();
  }
}

function pushHistory(snapshot) {
  const point = {
    timestamp: snapshot.timestamp,
    processPercent: snapshot.process.percent,
    sessions: snapshot.process.sessionCurrent,
    active: snapshot.process.active,
    blocked: snapshot.process.blocked,
    longOps: snapshot.process.longOps,
    waitChains: snapshot.process.waitChains,
    status: snapshot.process.status
  };
  history.push(point);
  if (history.length > 5000) history = history.slice(-5000);
  saveHistory();
}

async function measure() {
  const snap = await collectSnapshot();
  lastSnapshot = snap;
  pushHistory(snap);
  return snap;
}

function startMonitoring() {
  if (monitoringEnabled) return;
  monitoringEnabled = true;
  monitoringTimer = setInterval(() => {
    measure().catch(err => console.error("Error de medición automática:", err.message));
  }, CONFIG.pollInterval * 1000);
}
function stopMonitoring() {
  monitoringEnabled = false;
  if (monitoringTimer) clearInterval(monitoringTimer);
  monitoringTimer = null;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", async (req, res) => {
  try {
    if (!lastSnapshot) lastSnapshot = await measure();
    res.json({ connected: true, monitoringEnabled, pollInterval: CONFIG.pollInterval, thresholds: CONFIG.thresholds, snapshot: lastSnapshot });
  } catch (e) {
    res.status(500).json({ connected: false, error: e.message });
  }
});

app.post("/api/measure", async (req, res) => {
  try { res.json(await measure()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/monitor/start", async (req, res) => {
  try {
    if (!lastSnapshot) await measure();
    startMonitoring();
    res.json({ ok: true, monitoringEnabled, pollInterval: CONFIG.pollInterval });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/monitor/stop", (req, res) => {
  stopMonitoring();
  res.json({ ok: true, monitoringEnabled });
});

app.get("/api/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 120), 5000);
  res.json(history.slice(-limit));
});

app.delete("/api/history", (req, res) => {
  history = [];
  saveHistory();
  res.json({ ok: true });
});

app.get("/api/export", (req, res) => {
  const csv = ["timestamp,processPercent,sessions,active,blocked,longOps,waitChains,status",
    ...history.map(h => [h.timestamp,h.processPercent,h.sessions,h.active,h.blocked,h.longOps,h.waitChains,h.status].join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=historial_oracle.csv");
  res.send(csv);
});

app.listen(PORT, () => console.log(`Monitor local en http://localhost:${PORT}`));

process.on("SIGINT", async () => {
  stopMonitoring();
  if (pool) await pool.close(0);
  process.exit(0);
});