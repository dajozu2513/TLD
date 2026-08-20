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
      bg: { DBWn: "ACTIVO", LGWR: "ACTIVO", SMON: "ACTIVO", PMON: "ACTIVO", CKPT: "ACTIVO" }
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
      out.bg.SMON = "ADVERTENCIA";
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
    if (score >= 90) return { key: "optimo", label: "Óptimo", cls: "st-optimo" };
    if (score >= 75) return { key: "saludable", label: "Saludable", cls: "st-saludable" };
    if (score >= 60) return { key: "advertencia", label: "Advertencia", cls: "st-advertencia" };
    if (score >= 40) return { key: "degradado", label: "Degradado", cls: "st-degradado" };
    return { key: "critico", label: "Crítico", cls: "st-critico" };
  }

  function buildAlerts(m, ip, im) {
    var alerts = [];
    if (m.sessionsBlocked > 0) alerts.push({ nivel: "critico", componente: "Procesos", variable: "Sesiones bloqueadas", valor: m.sessionsBlocked, umbral: 0, descripcion: "Existen " + m.sessionsBlocked + " sesión(es) bloqueada(s). Revisar V$WAIT_CHAINS." });
    if (ip.utilProc >= 95) alerts.push({ nivel: "critico", componente: "Procesos", variable: "Utilización procesos", valor: ip.utilProc + "%", umbral: "95%", descripcion: "Procesos cerca del límite (PROCESSES)." });
    else if (ip.utilProc >= 85) alerts.push({ nivel: "alto", componente: "Procesos", variable: "Utilización procesos", valor: ip.utilProc + "%", umbral: "85%", descripcion: "Utilización alta de procesos." });
    else if (ip.utilProc >= 70) alerts.push({ nivel: "advertencia", componente: "Procesos", variable: "Utilización procesos", valor: ip.utilProc + "%", umbral: "70%", descripcion: "Utilización en zona de advertencia." });
    if (m.longOps > 0) alerts.push({ nivel: m.longOps >= 3 ? "alto" : "advertencia", componente: "Procesos", variable: "Long ops", valor: m.longOps, umbral: 0, descripcion: m.longOps + " operación(es) prolongada(s) (V$SESSION_LONGOPS)." });
    if (m.pgaOverAlloc > 5) alerts.push({ nivel: m.pgaOverAlloc > 20 ? "critico" : "alto", componente: "Memoria", variable: "PGA over-alloc", valor: m.pgaOverAlloc, umbral: 0, descripcion: "PGA con sobre-asignación." });
    else if (m.pgaOverAlloc > 0) alerts.push({ nivel: "advertencia", componente: "Memoria", variable: "PGA over-alloc", valor: m.pgaOverAlloc, umbral: 0, descripcion: "Se detectaron over-allocations de PGA." });
    if (m.pgaCacheHitPct < 70) alerts.push({ nivel: "critico", componente: "Memoria", variable: "PGA cache hit", valor: m.pgaCacheHitPct.toFixed(1) + "%", umbral: "70%", descripcion: "Cache hit de PGA muy bajo." });
    else if (m.pgaCacheHitPct < 85) alerts.push({ nivel: "advertencia", componente: "Memoria", variable: "PGA cache hit", valor: m.pgaCacheHitPct.toFixed(1) + "%", umbral: "85%", descripcion: "Cache hit de PGA por debajo del deseable." });
    if (im.sgaUsedPct > 95) alerts.push({ nivel: "alto", componente: "Memoria", variable: "Uso SGA", valor: im.sgaUsedPct + "%", umbral: "95%", descripcion: "SGA con muy poco espacio libre." });
    if (m.datafilesOffline > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Datafiles OFFLINE", valor: m.datafilesOffline, umbral: 0, descripcion: m.datafilesOffline + " datafile(s) OFFLINE." });
    if (m.datafilesProblem > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Datafiles problema", valor: m.datafilesProblem, umbral: 0, descripcion: "Datafiles con problemas de acceso." });
    if (m.tablespacesCritical > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "TS críticos", valor: m.tablespacesCritical, umbral: 0, descripcion: m.tablespacesCritical + " tablespace(s) críticos." });
    else if (m.tablespacesWarning > 0) alerts.push({ nivel: "advertencia", componente: "Archivos", variable: "TS advertencia", valor: m.tablespacesWarning, umbral: 0, descripcion: m.tablespacesWarning + " tablespace(s) próximos al límite." });
    if (m.maxTablespaceUsedPct >= 95) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Máx. uso TS", valor: m.maxTablespaceUsedPct.toFixed(0) + "%", umbral: "95%", descripcion: "Tablespace supera 95% de uso." });
    if (m.tempUsedPct >= 90) alerts.push({ nivel: m.tempUsedPct >= 95 ? "critico" : "alto", componente: "Archivos", variable: "Uso TEMP", valor: m.tempUsedPct.toFixed(0) + "%", umbral: "90%", descripcion: "Tablespace temporal elevado." });
    if (m.redoGroupsProblem > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Redo logs", valor: m.redoGroupsProblem, umbral: 0, descripcion: "Problemas en grupos de redo log." });
    var order = { critico: 0, alto: 1, advertencia: 2 };
    alerts.sort(function (a, b) { return (order[a.nivel] || 9) - (order[b.nivel] || 9); });
    return alerts;
  }

  function setBadge(el, st) {
    el.textContent = st.label;
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
    var m = ip.details;
    var stISBD = statusFromScore(isbd);
    var hasCrit = alerts.some(function (a) { return a.nivel === "critico"; });
    if (hasCrit && isbd >= 60) stISBD = { key: "critico", label: "Crítico (alerta activa)", cls: "st-critico" };

    document.getElementById("mon-isbd-value").textContent = isbd.toFixed(2);
    setBadge(document.getElementById("mon-isbd-status"), stISBD);
    document.getElementById("mon-isbd-card").className = "mon-isbd " + stISBD.cls;

    var stIP = statusFromScore(ip.score);
    var stIM = statusFromScore(im.score);
    var stIA = statusFromScore(ia.score);

    document.getElementById("mon-ip-score").textContent = ip.score.toFixed(1);
    document.getElementById("mon-im-score").textContent = im.score.toFixed(1);
    document.getElementById("mon-ia-score").textContent = ia.score.toFixed(1);
    setBadge(document.getElementById("mon-ip-status"), stIP);
    setBadge(document.getElementById("mon-im-status"), stIM);
    setBadge(document.getElementById("mon-ia-status"), stIA);
    setBar("mon-ip-bar", ip.score, stIP.cls);
    setBar("mon-im-bar", im.score, stIM.cls);
    setBar("mon-ia-bar", ia.score, stIA.cls);

    document.getElementById("mon-ip-stats").innerHTML = [
      stat("Procesos actuales", m.processesCurrent),
      stat("Límite procesos", m.processesLimit),
      stat("Utilización", ip.utilProc + "%"),
      stat("Sesiones", m.sessionsCurrent),
      stat("Activas", m.sessionsActive),
      stat("Inactivas", m.sessionsInactive),
      stat("Bloqueadas", m.sessionsBlocked),
      stat("Long ops", m.longOps)
    ].join("");

    var bgHtml = "";
    Object.keys(m.bg).forEach(function (name) {
      var st = m.bg[name];
      var cls = st === "ACTIVO" ? "bg-ok" : "bg-warn";
      bgHtml += '<li class="mon-bg-item"><span class="mon-bg-name">' + name + '</span><span class="mon-bg-pill ' + cls + '">' + st + "</span></li>";
    });
    document.getElementById("mon-bg-processes").innerHTML = bgHtml;

    document.getElementById("mon-im-stats").innerHTML = [
      stat("SGA total", m.sgaTotalMb + " MB"),
      stat("SGA libre", m.sgaFreeMb + " MB"),
      stat("Uso SGA", im.sgaUsedPct + "%"),
      stat("Shared Pool", m.sharedPoolPct.toFixed(0) + "%"),
      stat("Buffer Cache", m.bufferCachePct.toFixed(0) + "%"),
      stat("PGA en uso", m.pgaInuseMb + " MB"),
      stat("PGA over-alloc", m.pgaOverAlloc),
      stat("PGA cache hit", m.pgaCacheHitPct.toFixed(1) + "%")
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
      stat("Datafiles ONLINE", m.datafilesOnline),
      stat("Datafiles OFFLINE", m.datafilesOffline),
      stat("Con problemas", m.datafilesProblem),
      stat("TS normales", m.tablespacesNormal),
      stat("TS advertencia", m.tablespacesWarning),
      stat("TS críticos", m.tablespacesCritical),
      stat("Máx. uso TS", m.maxTablespaceUsedPct.toFixed(0) + "%"),
      stat("Uso TEMP", m.tempUsedPct.toFixed(0) + "%"),
      stat("Redo OK / problema", m.redoGroupsOk + " / " + m.redoGroupsProblem)
    ].join("");

    document.getElementById("mon-ts-summary").innerHTML =
      '<div class="mon-ts-chips">' +
        '<span class="mon-chip st-saludable">' + m.tablespacesNormal + " normales</span>" +
        '<span class="mon-chip st-advertencia">' + m.tablespacesWarning + " advertencia</span>" +
        '<span class="mon-chip st-critico">' + m.tablespacesCritical + " críticos</span>" +
      "</div>";

    // Alertas
    document.getElementById("mon-alert-count").textContent = String(alerts.length);
    var list = document.getElementById("mon-alerts-list");
    if (!alerts.length) {
      list.innerHTML = '<li class="mon-alert-empty">Sin alertas. Todos los componentes en rangos aceptables.</li>';
    } else {
      list.innerHTML = alerts.map(function (a) {
        var cls = a.nivel === "critico" ? "al-critico" : a.nivel === "alto" ? "al-alto" : "al-adv";
        return '<li class="mon-alert-item ' + cls + '">' +
          '<div class="mon-alert-title"><strong>' + a.componente + "</strong> · " + a.variable + "</div>" +
          '<div class="mon-alert-desc">' + a.descripcion + "</div>" +
          '<div class="mon-alert-meta">Valor: ' + a.valor + " · Umbral: " + a.umbral + " · " + a.nivel.toUpperCase() + "</div>" +
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
      ctx.fillText("Se necesitan al menos 2 mediciones para graficar.", 16, h / 2);
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

  function collectAndRender() {
    var scenario = document.getElementById("mon-instance").value;
    var metrics = applyScenario(baseMetrics(), scenario);
    var ip = calcIP(metrics), im = calcIM(metrics), ia = calcIA(metrics);
    var isbd = calcISBD(ip, im, ia);
    var alerts = buildAlerts(metrics, ip, im);
    renderAll(ip, im, ia, isbd, alerts);
    drawHistory(pushHistory(isbd, ip, im, ia));
    var ts = new Date();
    document.getElementById("mon-last-update").textContent =
      "Actualizado: " + ts.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
    collectAndRender();
    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
