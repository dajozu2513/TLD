/**
 * Three Little Ducks — Monitor de Salud Oracle (UI mejorada)
 * IP / IM / IA → ISBD según documento del curso
 */
(function () {
  "use strict";

  var WP = 0.30, WM = 0.35, WA = 0.35;
  var HISTORY_KEY = "tld_monitor_history";
  var MAX_HISTORY = 40;
  var REFRESH_MS = 15000;
  var autoTimer = null;
  var lastResult = null; // { ip, im, ia, isbd, alerts, ts } — para re-renderizar sin resimular al cambiar idioma

  // ---------- Textos bilingües (separado de TLD_TRANSLATIONS, solo sincronizado vía tld:langchange) ----------
  var STR = {
    es: {
      updated: "Actualizado: ",
      statusLabels: {
        optimo: "Óptimo", saludable: "Saludable", advertencia: "Advertencia",
        degradado: "Degradado", critico: "Crítico", criticoAlerta: "Crítico (alerta activa)"
      },
      bgStatus: { activo: "ACTIVO", advertencia: "ADVERTENCIA" },
      stats: {
        procesosActuales: "Procesos actuales", limiteProcesos: "Límite procesos", utilizacion: "Utilización",
        sesiones: "Sesiones", activas: "Activas", inactivas: "Inactivas", bloqueadas: "Bloqueadas", longOps: "Long ops",
        sgaTotal: "SGA total", sgaLibre: "SGA libre", usoSga: "Uso SGA", sharedPool: "Shared Pool", bufferCache: "Buffer Cache",
        pgaUso: "PGA en uso", pgaOverAlloc: "PGA over-alloc", pgaCacheHit: "PGA cache hit",
        datafilesOnline: "Datafiles ONLINE", datafilesOffline: "Datafiles OFFLINE", conProblemas: "Con problemas",
        tsNormales: "TS normales", tsAdvertencia: "TS advertencia", tsCriticos: "TS críticos",
        maxUsoTs: "Máx. uso TS", usoTemp: "Uso TEMP", redoOkProblema: "Redo OK / problema"
      },
      tsChips: { normales: "normales", advertencia: "advertencia", criticos: "críticos" },
      chartMinData: "Se necesitan al menos 2 mediciones para graficar.",
      alertEmpty: "Sin alertas. Todos los componentes en rangos aceptables.",
      alertValor: "Valor: ",
      alertUmbral: " · Umbral: ",
      alertComponentes: { procesos: "Procesos", memoria: "Memoria", archivos: "Archivos" },
      alertVariables: {
        sesiones_bloqueadas: "Sesiones bloqueadas", util_procesos: "Utilización procesos", long_ops: "Long ops",
        pga_over_alloc: "PGA over-alloc", pga_cache_hit: "PGA cache hit", uso_sga: "Uso SGA",
        datafiles_offline: "Datafiles OFFLINE", datafiles_problema: "Datafiles problema",
        ts_criticos: "TS críticos", ts_advertencia: "TS advertencia", max_uso_ts: "Máx. uso TS",
        uso_temp: "Uso TEMP", redo_logs: "Redo logs"
      },
      alertNivelLabels: { critico: "CRÍTICO", alto: "ALTO", advertencia: "ADVERTENCIA" },
      alertDesc: {
        sesiones_bloqueadas: function (p) { return "Existen " + p.n + " sesión(es) bloqueada(s). Revisar V$WAIT_CHAINS."; },
        util_procesos_95: function () { return "Procesos cerca del límite (PROCESSES)."; },
        util_procesos_85: function () { return "Utilización alta de procesos."; },
        util_procesos_70: function () { return "Utilización en zona de advertencia."; },
        long_ops: function (p) { return p.n + " operación(es) prolongada(s) (V$SESSION_LONGOPS)."; },
        pga_over_alloc_high: function () { return "PGA con sobre-asignación."; },
        pga_over_alloc_some: function () { return "Se detectaron over-allocations de PGA."; },
        pga_cache_hit_crit: function () { return "Cache hit de PGA muy bajo."; },
        pga_cache_hit_warn: function () { return "Cache hit de PGA por debajo del deseable."; },
        uso_sga_high: function () { return "SGA con muy poco espacio libre."; },
        datafiles_offline: function (p) { return p.n + " datafile(s) OFFLINE."; },
        datafiles_problema: function () { return "Datafiles con problemas de acceso."; },
        ts_criticos: function (p) { return p.n + " tablespace(s) críticos."; },
        ts_advertencia: function (p) { return p.n + " tablespace(s) próximos al límite."; },
        max_uso_ts: function () { return "Tablespace supera 95% de uso."; },
        uso_temp: function () { return "Tablespace temporal elevado."; },
        redo_logs: function () { return "Problemas en grupos de redo log."; }
      }
    },
    en: {
      updated: "Updated: ",
      statusLabels: {
        optimo: "Optimal", saludable: "Healthy", advertencia: "Warning",
        degradado: "Degraded", critico: "Critical", criticoAlerta: "Critical (active alert)"
      },
      bgStatus: { activo: "ACTIVE", advertencia: "WARNING" },
      stats: {
        procesosActuales: "Current processes", limiteProcesos: "Process limit", utilizacion: "Utilization",
        sesiones: "Sessions", activas: "Active", inactivas: "Inactive", bloqueadas: "Blocked", longOps: "Long ops",
        sgaTotal: "Total SGA", sgaLibre: "Free SGA", usoSga: "SGA usage", sharedPool: "Shared Pool", bufferCache: "Buffer Cache",
        pgaUso: "PGA in use", pgaOverAlloc: "PGA over-alloc", pgaCacheHit: "PGA cache hit",
        datafilesOnline: "Datafiles ONLINE", datafilesOffline: "Datafiles OFFLINE", conProblemas: "With issues",
        tsNormales: "Normal TS", tsAdvertencia: "Warning TS", tsCriticos: "Critical TS",
        maxUsoTs: "Max TS usage", usoTemp: "TEMP usage", redoOkProblema: "Redo OK / issue"
      },
      tsChips: { normales: "normal", advertencia: "warning", criticos: "critical" },
      chartMinData: "At least 2 readings are needed to plot the chart.",
      alertEmpty: "No alerts. All components within acceptable ranges.",
      alertValor: "Value: ",
      alertUmbral: " · Threshold: ",
      alertComponentes: { procesos: "Processes", memoria: "Memory", archivos: "Files" },
      alertVariables: {
        sesiones_bloqueadas: "Blocked sessions", util_procesos: "Process utilization", long_ops: "Long ops",
        pga_over_alloc: "PGA over-alloc", pga_cache_hit: "PGA cache hit", uso_sga: "SGA usage",
        datafiles_offline: "Datafiles OFFLINE", datafiles_problema: "Datafiles issue",
        ts_criticos: "Critical TS", ts_advertencia: "Warning TS", max_uso_ts: "Max TS usage",
        uso_temp: "TEMP usage", redo_logs: "Redo logs"
      },
      alertNivelLabels: { critico: "CRITICAL", alto: "HIGH", advertencia: "WARNING" },
      alertDesc: {
        sesiones_bloqueadas: function (p) { return "There " + (p.n === 1 ? "is" : "are") + " " + p.n + " blocked session(s). Check V$WAIT_CHAINS."; },
        util_procesos_95: function () { return "Processes near the limit (PROCESSES)."; },
        util_procesos_85: function () { return "High process utilization."; },
        util_procesos_70: function () { return "Utilization in warning range."; },
        long_ops: function (p) { return p.n + " long-running operation(s) (V$SESSION_LONGOPS)."; },
        pga_over_alloc_high: function () { return "PGA over-allocated."; },
        pga_over_alloc_some: function () { return "PGA over-allocations detected."; },
        pga_cache_hit_crit: function () { return "PGA cache hit rate very low."; },
        pga_cache_hit_warn: function () { return "PGA cache hit rate below the desired level."; },
        uso_sga_high: function () { return "SGA has very little free space."; },
        datafiles_offline: function (p) { return p.n + " datafile(s) OFFLINE."; },
        datafiles_problema: function () { return "Datafiles with access issues."; },
        ts_criticos: function (p) { return p.n + " critical tablespace(s)."; },
        ts_advertencia: function (p) { return p.n + " tablespace(s) nearing the limit."; },
        max_uso_ts: function () { return "Tablespace usage exceeds 95%."; },
        uso_temp: function () { return "TEMP tablespace usage is high."; },
        redo_logs: function () { return "Issues in redo log groups."; }
      }
    }
  };

  function curLang() {
    return (typeof TLD_I18N !== "undefined" && TLD_I18N.getLang) ? TLD_I18N.getLang() : "es";
  }
  function tr() {
    return STR[curLang()] || STR.es;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function baseMetrics() {
    return {
      processesCurrent: 48, processesLimit: 300,
      sessionsCurrent: 62, sessionsLimit: 472,
      sessionsActive: 18, sessionsInactive: 44,
      sessionsBlocked: 0, longOps: 0,
      sgaTotalMb: 2048, sgaFreeMb: 420,
      sharedPoolPct: 68, bufferCachePct: 72,
      pgaAllocatedMb: 380, pgaInuseMb: 290, pgaTargetMb: 512,
      pgaOverAlloc: 0, pgaCacheHitPct: 96.5,
      datafilesOnline: 18, datafilesOffline: 0, datafilesProblem: 0,
      tablespacesNormal: 12, tablespacesWarning: 0, tablespacesCritical: 0,
      tempUsedPct: 22, redoGroupsOk: 6, redoGroupsProblem: 0,
      maxTablespaceUsedPct: 58,
      bg: { DBWn: "activo", LGWR: "activo", SMON: "activo", PMON: "activo", CKPT: "activo" }
    };
  }

  function applyScenario(m, scenario) {
    var out = Object.assign({}, m);
    out.bg = Object.assign({}, m.bg);
    if (scenario === "sim-warning") {
      out.processesCurrent = 230; out.sessionsCurrent = 340; out.sessionsActive = 95;
      out.sessionsBlocked = 2; out.longOps = 1;
      out.sgaFreeMb = 90; out.sharedPoolPct = 88; out.bufferCachePct = 91;
      out.pgaAllocatedMb = 480; out.pgaInuseMb = 455; out.pgaOverAlloc = 3; out.pgaCacheHitPct = 82;
      out.tablespacesWarning = 2; out.tempUsedPct = 71; out.maxTablespaceUsedPct = 82;
    } else if (scenario === "sim-critical") {
      out.processesCurrent = 290; out.sessionsCurrent = 450; out.sessionsActive = 180;
      out.sessionsBlocked = 7; out.longOps = 4;
      out.sgaFreeMb = 25; out.sharedPoolPct = 96; out.bufferCachePct = 97;
      out.pgaAllocatedMb = 510; out.pgaInuseMb = 505; out.pgaOverAlloc = 28; out.pgaCacheHitPct = 61;
      out.datafilesOffline = 1; out.datafilesProblem = 1;
      out.tablespacesWarning = 3; out.tablespacesCritical = 1;
      out.tempUsedPct = 94; out.redoGroupsProblem = 1; out.maxTablespaceUsedPct = 97;
      out.bg.SMON = "advertencia";
    } else if (scenario === "sim-random") {
      out.processesCurrent = randInt(40, 295);
      out.sessionsCurrent = randInt(50, 460);
      out.sessionsActive = randInt(10, Math.min(200, out.sessionsCurrent));
      out.sessionsBlocked = randInt(0, 8); out.longOps = randInt(0, 5);
      out.sgaFreeMb = randInt(20, 500);
      out.sharedPoolPct = rand(55, 98); out.bufferCachePct = rand(55, 98);
      out.pgaAllocatedMb = randInt(200, 520);
      out.pgaInuseMb = Math.min(out.pgaAllocatedMb, randInt(180, 510));
      out.pgaOverAlloc = randInt(0, 30); out.pgaCacheHitPct = rand(55, 99);
      out.datafilesOffline = randInt(0, 2); out.datafilesProblem = randInt(0, 2);
      out.tablespacesWarning = randInt(0, 4); out.tablespacesCritical = randInt(0, 2);
      out.tempUsedPct = rand(10, 98); out.redoGroupsProblem = randInt(0, 1);
      out.maxTablespaceUsedPct = rand(40, 99);
    }
    out.processesCurrent = clamp(Math.round(out.processesCurrent + rand(-3, 3)), 1, out.processesLimit);
    out.sessionsCurrent = clamp(Math.round(out.sessionsCurrent + rand(-4, 4)), 1, out.sessionsLimit);
    out.sessionsActive = clamp(out.sessionsActive + randInt(-2, 2), 0, out.sessionsCurrent);
    out.sessionsInactive = out.sessionsCurrent - out.sessionsActive;
    return out;
  }

  function calcIP(m) {
    var utilProc = (m.processesCurrent / m.processesLimit) * 100;
    var utilSess = (m.sessionsCurrent / m.sessionsLimit) * 100;
    var util = Math.max(utilProc, utilSess);
    var score;
    if (util < 50) score = 95 + (50 - util) * 0.1;
    else if (util < 70) score = 80 + (70 - util) * 0.75;
    else if (util < 85) score = 65 + (85 - util) * 1.0;
    else if (util < 95) score = 40 + (95 - util) * 2.5;
    else score = Math.max(5, 40 - (util - 95) * 4);
    if (m.sessionsBlocked > 0) score -= Math.min(25, m.sessionsBlocked * 6);
    if (m.longOps > 0) score -= Math.min(12, m.longOps * 3);
    return { score: clamp(Math.round(score * 10) / 10, 0, 100), utilProc: Math.round(utilProc * 10) / 10, utilSess: Math.round(utilSess * 10) / 10, details: m };
  }

  function calcIM(m) {
    var sgaUsedPct = ((m.sgaTotalMb - m.sgaFreeMb) / m.sgaTotalMb) * 100;
    var pgaUsedPct = (m.pgaInuseMb / m.pgaTargetMb) * 100;
    var score = 92;
    if (sgaUsedPct > 95) score -= 18; else if (sgaUsedPct > 90) score -= 10; else if (sgaUsedPct > 85) score -= 5;
    if (m.sharedPoolPct > 95) score -= 8; else if (m.sharedPoolPct > 90) score -= 4;
    if (m.bufferCachePct > 95) score -= 6;
    if (pgaUsedPct > 95) score -= 15; else if (pgaUsedPct > 85) score -= 8; else if (pgaUsedPct > 75) score -= 3;
    if (m.pgaOverAlloc > 20) score -= 20; else if (m.pgaOverAlloc > 5) score -= 12; else if (m.pgaOverAlloc > 0) score -= 5;
    if (m.pgaCacheHitPct < 70) score -= 15; else if (m.pgaCacheHitPct < 85) score -= 8; else if (m.pgaCacheHitPct < 92) score -= 3;
    return { score: clamp(Math.round(score * 10) / 10, 0, 100), sgaUsedPct: Math.round(sgaUsedPct * 10) / 10, pgaUsedPct: Math.round(pgaUsedPct * 10) / 10, details: m };
  }

  function calcIA(m) {
    var score = 98;
    if (m.datafilesOffline > 0) score -= 25 * m.datafilesOffline;
    if (m.datafilesProblem > 0) score -= 18 * m.datafilesProblem;
    if (m.tablespacesCritical > 0) score -= 20 * m.tablespacesCritical;
    if (m.tablespacesWarning > 0) score -= 8 * m.tablespacesWarning;
    if (m.redoGroupsProblem > 0) score -= 15 * m.redoGroupsProblem;
    if (m.maxTablespaceUsedPct >= 95) score -= 18; else if (m.maxTablespaceUsedPct >= 85) score -= 10; else if (m.maxTablespaceUsedPct >= 75) score -= 5;
    if (m.tempUsedPct >= 95) score -= 12; else if (m.tempUsedPct >= 85) score -= 6;
    return { score: clamp(Math.round(score * 10) / 10, 0, 100), details: m };
  }

  function calcISBD(ip, im, ia) {
    return Math.round((WP * ip.score + WM * im.score + WA * ia.score) * 100) / 100;
  }

  function statusFromScore(score) {
    if (score >= 90) return { key: "optimo", cls: "st-optimo" };
    if (score >= 75) return { key: "saludable", cls: "st-saludable" };
    if (score >= 60) return { key: "advertencia", cls: "st-advertencia" };
    if (score >= 40) return { key: "degradado", cls: "st-degradado" };
    return { key: "critico", cls: "st-critico" };
  }

  function buildAlerts(m, ip, im) {
    var alerts = [];
    if (m.sessionsBlocked > 0) alerts.push({ nivel: "critico", componente: "procesos", variable: "sesiones_bloqueadas", descKey: "sesiones_bloqueadas", params: { n: m.sessionsBlocked }, valor: m.sessionsBlocked, umbral: 0 });
    if (ip.utilProc >= 95) alerts.push({ nivel: "critico", componente: "procesos", variable: "util_procesos", descKey: "util_procesos_95", params: {}, valor: ip.utilProc + "%", umbral: "95%" });
    else if (ip.utilProc >= 85) alerts.push({ nivel: "alto", componente: "procesos", variable: "util_procesos", descKey: "util_procesos_85", params: {}, valor: ip.utilProc + "%", umbral: "85%" });
    else if (ip.utilProc >= 70) alerts.push({ nivel: "advertencia", componente: "procesos", variable: "util_procesos", descKey: "util_procesos_70", params: {}, valor: ip.utilProc + "%", umbral: "70%" });
    if (m.longOps > 0) alerts.push({ nivel: m.longOps >= 3 ? "alto" : "advertencia", componente: "procesos", variable: "long_ops", descKey: "long_ops", params: { n: m.longOps }, valor: m.longOps, umbral: 0 });
    if (m.pgaOverAlloc > 5) alerts.push({ nivel: m.pgaOverAlloc > 20 ? "critico" : "alto", componente: "memoria", variable: "pga_over_alloc", descKey: "pga_over_alloc_high", params: {}, valor: m.pgaOverAlloc, umbral: 0 });
    else if (m.pgaOverAlloc > 0) alerts.push({ nivel: "advertencia", componente: "memoria", variable: "pga_over_alloc", descKey: "pga_over_alloc_some", params: {}, valor: m.pgaOverAlloc, umbral: 0 });
    if (m.pgaCacheHitPct < 70) alerts.push({ nivel: "critico", componente: "memoria", variable: "pga_cache_hit", descKey: "pga_cache_hit_crit", params: {}, valor: m.pgaCacheHitPct.toFixed(1) + "%", umbral: "70%" });
    else if (m.pgaCacheHitPct < 85) alerts.push({ nivel: "advertencia", componente: "memoria", variable: "pga_cache_hit", descKey: "pga_cache_hit_warn", params: {}, valor: m.pgaCacheHitPct.toFixed(1) + "%", umbral: "85%" });
    if (im.sgaUsedPct > 95) alerts.push({ nivel: "alto", componente: "memoria", variable: "uso_sga", descKey: "uso_sga_high", params: {}, valor: im.sgaUsedPct + "%", umbral: "95%" });
    if (m.datafilesOffline > 0) alerts.push({ nivel: "critico", componente: "archivos", variable: "datafiles_offline", descKey: "datafiles_offline", params: { n: m.datafilesOffline }, valor: m.datafilesOffline, umbral: 0 });
    if (m.datafilesProblem > 0) alerts.push({ nivel: "critico", componente: "archivos", variable: "datafiles_problema", descKey: "datafiles_problema", params: {}, valor: m.datafilesProblem, umbral: 0 });
    if (m.tablespacesCritical > 0) alerts.push({ nivel: "critico", componente: "archivos", variable: "ts_criticos", descKey: "ts_criticos", params: { n: m.tablespacesCritical }, valor: m.tablespacesCritical, umbral: 0 });
    else if (m.tablespacesWarning > 0) alerts.push({ nivel: "advertencia", componente: "archivos", variable: "ts_advertencia", descKey: "ts_advertencia", params: { n: m.tablespacesWarning }, valor: m.tablespacesWarning, umbral: 0 });
    if (m.maxTablespaceUsedPct >= 95) alerts.push({ nivel: "critico", componente: "archivos", variable: "max_uso_ts", descKey: "max_uso_ts", params: {}, valor: m.maxTablespaceUsedPct.toFixed(0) + "%", umbral: "95%" });
    if (m.tempUsedPct >= 90) alerts.push({ nivel: m.tempUsedPct >= 95 ? "critico" : "alto", componente: "archivos", variable: "uso_temp", descKey: "uso_temp", params: {}, valor: m.tempUsedPct.toFixed(0) + "%", umbral: "90%" });
    if (m.redoGroupsProblem > 0) alerts.push({ nivel: "critico", componente: "archivos", variable: "redo_logs", descKey: "redo_logs", params: {}, valor: m.redoGroupsProblem, umbral: 0 });
    var order = { critico: 0, alto: 1, advertencia: 2 };
    alerts.sort(function (a, b) { return (order[a.nivel] || 9) - (order[b.nivel] || 9); });
    return alerts;
  }

  function setBadge(el, st, S) {
    el.textContent = S.statusLabels[st.key] || st.key;
    el.className = "mon-badge " + st.cls;
  }

  function setBar(id, score, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.width = clamp(score, 0, 100) + "%";
    el.className = "mon-bar-fill " + cls;
  }

  function stat(label, value) {
    return '<div class="mon-stat"><span class="mon-stat-label">' + label + '</span><span class="mon-stat-value">' + value + "</span></div>";
  }

  function renderAll(ip, im, ia, isbd, alerts) {
    var S = tr();
    var m = ip.details;
    var stISBD = statusFromScore(isbd);
    var hasCrit = alerts.some(function (a) { return a.nivel === "critico"; });
    var isbdLabel = S.statusLabels[stISBD.key];
    if (hasCrit && isbd >= 60) {
      stISBD = { key: "critico", cls: "st-critico" };
      isbdLabel = S.statusLabels.criticoAlerta;
    }

    document.getElementById("mon-isbd-value").textContent = isbd.toFixed(2);
    var isbdStatusEl = document.getElementById("mon-isbd-status");
    isbdStatusEl.textContent = isbdLabel;
    isbdStatusEl.className = "mon-badge " + stISBD.cls;
    document.getElementById("mon-isbd-card").className = "mon-isbd " + stISBD.cls;

    var stIP = statusFromScore(ip.score);
    var stIM = statusFromScore(im.score);
    var stIA = statusFromScore(ia.score);

    document.getElementById("mon-ip-score").textContent = ip.score.toFixed(1);
    document.getElementById("mon-im-score").textContent = im.score.toFixed(1);
    document.getElementById("mon-ia-score").textContent = ia.score.toFixed(1);
    setBadge(document.getElementById("mon-ip-status"), stIP, S);
    setBadge(document.getElementById("mon-im-status"), stIM, S);
    setBadge(document.getElementById("mon-ia-status"), stIA, S);
    setBar("mon-ip-bar", ip.score, stIP.cls);
    setBar("mon-im-bar", im.score, stIM.cls);
    setBar("mon-ia-bar", ia.score, stIA.cls);

    document.getElementById("mon-ip-stats").innerHTML = [
      stat(S.stats.procesosActuales, m.processesCurrent),
      stat(S.stats.limiteProcesos, m.processesLimit),
      stat(S.stats.utilizacion, ip.utilProc + "%"),
      stat(S.stats.sesiones, m.sessionsCurrent),
      stat(S.stats.activas, m.sessionsActive),
      stat(S.stats.inactivas, m.sessionsInactive),
      stat(S.stats.bloqueadas, m.sessionsBlocked),
      stat(S.stats.longOps, m.longOps)
    ].join("");

    var bgHtml = "";
    Object.keys(m.bg).forEach(function (name) {
      var stKey = m.bg[name];
      var cls = stKey === "activo" ? "bg-ok" : "bg-warn";
      var label = S.bgStatus[stKey] || String(stKey).toUpperCase();
      bgHtml += '<li class="mon-bg-item"><span class="mon-bg-name">' + name + '</span><span class="mon-bg-pill ' + cls + '">' + label + "</span></li>";
    });
    document.getElementById("mon-bg-processes").innerHTML = bgHtml;

    document.getElementById("mon-im-stats").innerHTML = [
      stat(S.stats.sgaTotal, m.sgaTotalMb + " MB"),
      stat(S.stats.sgaLibre, m.sgaFreeMb + " MB"),
      stat(S.stats.usoSga, im.sgaUsedPct + "%"),
      stat(S.stats.sharedPool, m.sharedPoolPct.toFixed(0) + "%"),
      stat(S.stats.bufferCache, m.bufferCachePct.toFixed(0) + "%"),
      stat(S.stats.pgaUso, m.pgaInuseMb + " MB"),
      stat(S.stats.pgaOverAlloc, m.pgaOverAlloc),
      stat(S.stats.pgaCacheHit, m.pgaCacheHitPct.toFixed(1) + "%")
    ].join("");

    function memBar(label, pct) {
      var c = pct >= 95 ? "st-critico" : pct >= 85 ? "st-advertencia" : "st-saludable";
      return '<div class="mon-mem-row"><span>' + label + '</span><div class="mon-bar"><div class="mon-bar-fill ' + c + '" style="width:' + clamp(pct, 0, 100) + '%"></div></div><strong>' + pct.toFixed(0) + "%</strong></div>";
    }
    document.getElementById("mon-mem-bars").innerHTML =
      memBar("SGA", im.sgaUsedPct) +
      memBar("Shared Pool", m.sharedPoolPct) +
      memBar("Buffer Cache", m.bufferCachePct) +
      memBar("PGA", im.pgaUsedPct);

    document.getElementById("mon-ia-stats").innerHTML = [
      stat(S.stats.datafilesOnline, m.datafilesOnline),
      stat(S.stats.datafilesOffline, m.datafilesOffline),
      stat(S.stats.conProblemas, m.datafilesProblem),
      stat(S.stats.tsNormales, m.tablespacesNormal),
      stat(S.stats.tsAdvertencia, m.tablespacesWarning),
      stat(S.stats.tsCriticos, m.tablespacesCritical),
      stat(S.stats.maxUsoTs, m.maxTablespaceUsedPct.toFixed(0) + "%"),
      stat(S.stats.usoTemp, m.tempUsedPct.toFixed(0) + "%"),
      stat(S.stats.redoOkProblema, m.redoGroupsOk + " / " + m.redoGroupsProblem)
    ].join("");

    document.getElementById("mon-ts-summary").innerHTML =
      '<div class="mon-ts-chips">' +
        '<span class="mon-chip st-saludable">' + m.tablespacesNormal + " " + S.tsChips.normales + "</span>" +
        '<span class="mon-chip st-advertencia">' + m.tablespacesWarning + " " + S.tsChips.advertencia + "</span>" +
        '<span class="mon-chip st-critico">' + m.tablespacesCritical + " " + S.tsChips.criticos + "</span>" +
      "</div>";

    // Alertas
    document.getElementById("mon-alert-count").textContent = String(alerts.length);
    var list = document.getElementById("mon-alerts-list");
    if (!alerts.length) {
      list.innerHTML = '<li class="mon-alert-empty">' + S.alertEmpty + "</li>";
    } else {
      list.innerHTML = alerts.map(function (a) {
        var cls = a.nivel === "critico" ? "al-critico" : a.nivel === "alto" ? "al-alto" : "al-adv";
        var compLabel = S.alertComponentes[a.componente] || a.componente;
        var varLabel = S.alertVariables[a.variable] || a.variable;
        var descFn = S.alertDesc[a.descKey];
        var desc = descFn ? descFn(a.params || {}) : "";
        var nivelLabel = S.alertNivelLabels[a.nivel] || String(a.nivel).toUpperCase();
        return '<li class="mon-alert-item ' + cls + '">' +
          '<div class="mon-alert-title"><strong>' + compLabel + "</strong> · " + varLabel + "</div>" +
          '<div class="mon-alert-desc">' + desc + "</div>" +
          '<div class="mon-alert-meta">' + S.alertValor + a.valor + S.alertUmbral + a.umbral + " · " + nivelLabel + "</div>" +
          "</li>";
      }).join("");
    }
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch (e) { return []; }
  }
  function saveHistory(arr) { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-MAX_HISTORY))); }
  function pushHistory(isbd, ip, im, ia) {
    var arr = loadHistory();
    arr.push({ t: Date.now(), isbd: isbd, ip: ip.score, im: im.score, ia: ia.score });
    saveHistory(arr);
    return arr;
  }

  function drawHistory(arr) {
    var S = tr();
    var canvas = document.getElementById("mon-canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 640;
    var h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (arr.length < 2) {
      ctx.fillStyle = "#8a8a8a"; ctx.font = "13px Inter,sans-serif";
      ctx.fillText(S.chartMinData, 16, h / 2);
      return;
    }
    var pad = { l: 36, r: 12, t: 16, b: 30 };
    var plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    ctx.strokeStyle = "#e8e8e8"; ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(function (v) {
      var y = pad.t + plotH - (v / 100) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = "#9a9a9a"; ctx.font = "10px Inter,sans-serif"; ctx.fillText(String(v), 4, y + 3);
    });
    function line(key, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
      arr.forEach(function (p, i) {
        var x = pad.l + (i / (arr.length - 1)) * plotW;
        var y = pad.t + plotH - (p[key] / 100) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line("ip", "#6b7280"); line("im", "#3b82f6"); line("ia", "#8b5cf6"); line("isbd", "#d99a1f");
    var legend = [{ c: "#d99a1f", t: "ISBD" }, { c: "#6b7280", t: "IP" }, { c: "#3b82f6", t: "IM" }, { c: "#8b5cf6", t: "IA" }];
    legend.forEach(function (l, i) {
      var x = pad.l + i * 72;
      ctx.fillStyle = l.c; ctx.fillRect(x, h - 14, 10, 10);
      ctx.fillStyle = "#404040"; ctx.font = "11px Inter,sans-serif"; ctx.fillText(l.t, x + 14, h - 5);
    });
  }

  function updateTimestamp(ts) {
    var S = tr();
    var locale = curLang() === "en" ? "en-US" : "es-CR";
    document.getElementById("mon-last-update").textContent =
      S.updated + ts.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function collectAndRender() {
    var scenario = document.getElementById("mon-instance").value;
    var metrics = applyScenario(baseMetrics(), scenario);
    var ip = calcIP(metrics), im = calcIM(metrics), ia = calcIA(metrics);
    var isbd = calcISBD(ip, im, ia);
    var alerts = buildAlerts(metrics, ip, im);
    var ts = new Date();
    lastResult = { ip: ip, im: im, ia: ia, isbd: isbd, alerts: alerts, ts: ts };
    renderAll(ip, im, ia, isbd, alerts);
    drawHistory(pushHistory(isbd, ip, im, ia));
    updateTimestamp(ts);
  }

  // Re-renderiza la última medición ya calculada, sin resimular ni empujar historial nuevo.
  function rerenderCurrent() {
    if (!lastResult) return;
    renderAll(lastResult.ip, lastResult.im, lastResult.ia, lastResult.isbd, lastResult.alerts);
    drawHistory(loadHistory());
    updateTimestamp(lastResult.ts);
  }

  function startAuto() {
    if (autoTimer) clearInterval(autoTimer);
    if (document.getElementById("mon-auto-refresh").checked) {
      autoTimer = setInterval(collectAndRender, REFRESH_MS);
    }
  }

  function init() {
    document.getElementById("mon-btn-refresh").addEventListener("click", collectAndRender);
    document.getElementById("mon-instance").addEventListener("change", collectAndRender);
    document.getElementById("mon-auto-refresh").addEventListener("change", startAuto);
    document.getElementById("mon-btn-clear-history").addEventListener("click", function () {
      localStorage.removeItem(HISTORY_KEY); drawHistory([]);
    });
    window.addEventListener("resize", function () { drawHistory(loadHistory()); });
    document.addEventListener("tld:langchange", rerenderCurrent);
    collectAndRender();
    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
