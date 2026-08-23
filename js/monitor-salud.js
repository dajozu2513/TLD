/**
 * Three Little Ducks — Monitor de Salud Oracle
 * Lee métricas reales desde /api/monitor/salud (vistas V$ / DBA_* de
 * Oracle) y aplica el mismo cálculo IP / IM / IA → ISBD del curso.
 */
(function () {
  "use strict";

  var API_BASE = "http://localhost:3000/api";
  var WP = 0.30, WM = 0.35, WA = 0.35;
  var HISTORY_KEY = "tld_monitor_history";
  var MAX_HISTORY = 40;
  var REFRESH_MS = 15000;
  var autoTimer = null;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function formatMb(mb) {
    return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB";
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
    // bufferCachePct es el Buffer Cache Hit Ratio real (V$SYSSTAT): a
    // diferencia de sharedPoolPct/sgaUsedPct, aquí ALTO es BUENO — un
    // hit ratio bajo indica que la base está leyendo demasiado de disco.
    if (m.bufferCachePct < 80) score -= 15; else if (m.bufferCachePct < 90) score -= 8; else if (m.bufferCachePct < 95) score -= 3;
    if (pgaUsedPct > 95) score -= 15; else if (pgaUsedPct > 85) score -= 8; else if (pgaUsedPct > 75) score -= 3;
    if (m.pgaOverAlloc > 20) score -= 20; else if (m.pgaOverAlloc > 5) score -= 12; else if (m.pgaOverAlloc > 0) score -= 5;
    if (m.pgaCacheHitPct < 70) score -= 15; else if (m.pgaCacheHitPct < 85) score -= 8; else if (m.pgaCacheHitPct < 92) score -= 3;
    return { score: clamp(Math.round(score * 10) / 10, 0, 100), sgaUsedPct: Math.round(sgaUsedPct * 10) / 10, pgaUsedPct: Math.round(pgaUsedPct * 10) / 10, details: m };
  }

  function calcIA(m) {
    var score = 98;
    // Más grave que "offline"/"problem": Oracle ni siquiera pudo leer el
    // encabezado del datafile (archivo no encontrado, corrupto o sin
    // permisos) — V$DATAFILE_HEADER.ERROR.
    if (m.datafilesInaccessible > 0) score -= 30 * m.datafilesInaccessible;
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
    if (m.datafilesInaccessible > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Archivos inaccesibles", valor: m.datafilesInaccessible, umbral: 0, descripcion: m.datafilesInaccessible + " datafile(s) con error de encabezado (V$DATAFILE_HEADER.ERROR)." });
    if (m.datafilesOffline > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Datafiles OFFLINE", valor: m.datafilesOffline, umbral: 0, descripcion: m.datafilesOffline + " datafile(s) OFFLINE." });
    if (m.datafilesProblem > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Archivos inválidos", valor: m.datafilesProblem, umbral: 0, descripcion: "Datafiles en estado RECOVER (necesitan recuperación de medios)." });
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

  function stat(label, value, varKey) {
    var attrs = varKey
      ? ' class="mon-stat mon-stat--clickable" data-var="' + varKey + '" tabindex="0" role="button" aria-haspopup="dialog"'
      : ' class="mon-stat"';
    return "<div" + attrs + '><span class="mon-stat-label">' + label + '</span><span class="mon-stat-value">' + value + "</span></div>";
  }

  // Descripción de cada variable de "Procesos y sesiones", mostrada en
  // la ventana emergente al hacer clic sobre la ficha correspondiente.
  var VAR_INFO = {
    processesCurrent: {
      titulo: "Procesos actuales",
      desc: "Número de procesos del sistema operativo que la instancia Oracle está usando en este momento, según la vista V$RESOURCE_LIMIT (recurso “processes”)."
    },
    processesLimit: {
      titulo: "Límite procesos",
      desc: "Cantidad máxima de procesos permitidos simultáneamente, definida por el parámetro de inicialización PROCESSES de la base de datos."
    },
    utilizacion: {
      titulo: "Utilización",
      desc: "Porcentaje de procesos en uso respecto al límite configurado (procesos actuales ÷ límite procesos × 100). Es el principal insumo del Indicador de Procesos (IP)."
    },
    sessionsCurrent: {
      titulo: "Sesiones",
      desc: "Número de sesiones de usuario actualmente conectadas a la base de datos (V$SESSION, type = ‘USER’)."
    },
    sessionsActive: {
      titulo: "Activas",
      desc: "Sesiones de usuario que en este momento están ejecutando trabajo dentro de la base de datos (status = ACTIVE)."
    },
    sessionsInactive: {
      titulo: "Inactivas",
      desc: "Sesiones de usuario conectadas pero sin trabajo en ejecución en este momento (status = INACTIVE)."
    },
    sessionsBlocked: {
      titulo: "Bloqueadas",
      desc: "Sesiones que están esperando liberar un lock que sostiene otra sesión (V$SESSION.blocking_session no nulo). Es una señal directa de contención entre procesos."
    },
    longOps: {
      titulo: "Long ops",
      desc: "Operaciones de larga duración en curso (V$SESSION_LONGOPS con trabajo pendiente y tiempo restante > 0), como reorganizaciones, respaldos o cargas masivas."
    },
    sgaTotalMb: {
      titulo: "Tamaño de SGA",
      desc: "Tamaño total de la System Global Area: la memoria compartida que usa la instancia para el buffer cache, el shared pool, el redo log buffer, etc. (suma de V$SGA)."
    },
    sgaFreeMb: {
      titulo: "Memoria libre de SGA",
      desc: "Memoria dentro de la SGA que todavía no ha sido reservada por ningún componente (V$SGAINFO, “Free SGA Memory Available”)."
    },
    sharedPoolPct: {
      titulo: "Uso de Shared Pool",
      desc: "Porcentaje en uso del shared pool, el área donde Oracle guarda planes de ejecución, cursores compartidos y metadata de diccionario (V$SGASTAT, pool = ‘shared pool’)."
    },
    bufferCachePct: {
      titulo: "Uso de Buffer Cache",
      desc: "Es, en realidad, el Buffer Cache Hit Ratio: el porcentaje de lecturas que Oracle resuelve desde memoria en vez de ir a disco (V$SYSSTAT: 1 − physical reads ÷ logical reads). A diferencia de las demás barras de memoria, aquí un valor ALTO es bueno."
    },
    pgaAllocatedMb: {
      titulo: "PGA asignada",
      desc: "Memoria total del Program Global Area que Oracle ha reservado en este momento para todos los procesos de servidor (V$PGASTAT, “total PGA allocated”)."
    },
    pgaInuseMb: {
      titulo: "PGA utilizada",
      desc: "Memoria del PGA que está efectivamente en uso ahora mismo por los procesos activos (V$PGASTAT, “total PGA inuse”)."
    },
    pgaTargetMb: {
      titulo: "PGA máxima",
      desc: "Meta configurada por el parámetro PGA_AGGREGATE_TARGET: el límite de memoria PGA que Oracle intenta respetar automáticamente."
    },
    pgaOverAlloc: {
      titulo: "Over-allocation",
      desc: "Número de veces que el PGA tuvo que exceder su target configurado porque la memoria no alcanzaba (V$PGASTAT, “over allocation count”). Es una señal directa de presión de memoria, no un porcentaje."
    },
    pgaCacheHitPct: {
      titulo: "Cache hit de PGA",
      desc: "Porcentaje de operaciones de trabajo (ordenamientos, hash joins, etc.) que caben en memoria sin tener que usar espacio temporal en disco (V$PGASTAT, “cache hit percentage”)."
    },
    datafilesOnline: {
      titulo: "Datafiles online",
      desc: "Cantidad de datafiles que están en línea y disponibles para lectura/escritura en este momento (V$DATAFILE, status ONLINE o SYSTEM)."
    },
    datafilesOffline: {
      titulo: "Datafiles offline",
      desc: "Cantidad de datafiles fuera de línea: no están disponibles para la instancia hasta ponerlos online explícitamente (V$DATAFILE, status OFFLINE)."
    },
    datafilesSizeMb: {
      titulo: "Tamaño de datafiles",
      desc: "Tamaño total, sumado, de todos los datafiles de la base de datos (DBA_DATA_FILES). Es el espacio en disco reservado para almacenar datos, sin importar cuánto está realmente ocupado."
    },
    tablespacesUsedPct: {
      titulo: "Espacio de tablespaces",
      desc: "Porcentaje de espacio usado en el conjunto de todos los tablespaces (espacio ocupado ÷ espacio total asignado × 100), a partir de DBA_DATA_FILES y DBA_FREE_SPACE. El detalle por tablespace (normal/advertencia/crítico) se ve en “Tablespaces”, más abajo.",
      formula: "Espacio de tablespaces (%) =\n  (Σ tamaño datafiles − Σ espacio libre) ÷ Σ tamaño datafiles × 100\n\nΣ tamaño datafiles = suma de DBA_DATA_FILES.bytes de todos los tablespaces\nΣ espacio libre     = suma de DBA_FREE_SPACE.bytes de todos los tablespaces"
    },
    tempUsedPct: {
      titulo: "Tempfiles",
      desc: "Porcentaje de espacio en uso del tablespace temporal (TEMP), donde Oracle hace ordenamientos, hash joins y tablas temporales que no caben en memoria (DBA_TEMP_FREE_SPACE).",
      formula: "Tempfiles (%) = promedio, por cada tablespace temporal, de:\n  (espacio asignado − espacio libre) ÷ tamaño del tablespace × 100\n\nDatos de DBA_TEMP_FREE_SPACE: allocated_space, free_space, tablespace_size"
    },
    redoLogs: {
      titulo: "Redo logs",
      desc: "Estado de los grupos de redo log, donde Oracle registra cada cambio antes de aplicarlo a los datafiles (V$LOG). “OK” agrupa los estados normales (CURRENT, ACTIVE, INACTIVE, UNUSED); “con problema” son estados fuera de lo esperado."
    },
    datafilesProblem: {
      titulo: "Archivos inválidos",
      desc: "Datafiles en estado RECOVER: Oracle detectó que necesitan recuperación de medios (media recovery) antes de poder usarse con normalidad (V$DATAFILE)."
    },
    datafilesInaccessible: {
      titulo: "Archivos inaccesibles",
      desc: "Datafiles cuyo encabezado Oracle no pudo leer correctamente: archivo no encontrado, dañado o sin permisos de acceso (V$DATAFILE_HEADER, columna ERROR). Es la señal más grave de las dos: el archivo ni siquiera responde."
    }
  };

  function openVarInfo(key) {
    var info = VAR_INFO[key];
    if (!info) return;
    document.getElementById("mon-varinfo-title").textContent = info.titulo;
    document.getElementById("mon-varinfo-desc").textContent = info.desc;

    var formulaEl = document.getElementById("mon-varinfo-formula");
    if (info.formula) {
      formulaEl.textContent = info.formula;
      formulaEl.hidden = false;
    } else {
      formulaEl.hidden = true;
      formulaEl.textContent = "";
    }

    var backdrop = document.getElementById("mon-varinfo-backdrop");
    backdrop.hidden = false;
    document.getElementById("mon-varinfo-close").focus();
  }

  function closeVarInfo() {
    var backdrop = document.getElementById("mon-varinfo-backdrop");
    if (!backdrop.hidden) backdrop.hidden = true;
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
      stat("Procesos actuales", m.processesCurrent, "processesCurrent"),
      stat("Límite procesos", m.processesLimit, "processesLimit"),
      stat("Utilización", ip.utilProc + "%", "utilizacion"),
      stat("Sesiones", m.sessionsCurrent, "sessionsCurrent"),
      stat("Activas", m.sessionsActive, "sessionsActive"),
      stat("Inactivas", m.sessionsInactive, "sessionsInactive"),
      stat("Bloqueadas", m.sessionsBlocked, "sessionsBlocked"),
      stat("Long ops", m.longOps, "longOps")
    ].join("");

    var bgHtml = "";
    Object.keys(m.bg).forEach(function (name) {
      var st = m.bg[name];
      var cls = st === "ACTIVO" ? "bg-ok" : "bg-warn";
      bgHtml += '<li class="mon-bg-item"><span class="mon-bg-name">' + name + '</span><span class="mon-bg-pill ' + cls + '">' + st + "</span></li>";
    });
    document.getElementById("mon-bg-processes").innerHTML = bgHtml;

    document.getElementById("mon-im-stats").innerHTML = [
      stat("Tamaño de SGA", m.sgaTotalMb + " MB", "sgaTotalMb"),
      stat("Memoria libre de SGA", m.sgaFreeMb + " MB", "sgaFreeMb"),
      stat("Uso de Shared Pool", m.sharedPoolPct.toFixed(0) + "%", "sharedPoolPct"),
      stat("Uso de Buffer Cache", m.bufferCachePct.toFixed(1) + "%", "bufferCachePct"),
      stat("PGA asignada", m.pgaAllocatedMb + " MB", "pgaAllocatedMb"),
      stat("PGA utilizada", m.pgaInuseMb + " MB", "pgaInuseMb"),
      stat("PGA máxima", m.pgaTargetMb + " MB", "pgaTargetMb"),
      stat("Over-allocation", m.pgaOverAlloc, "pgaOverAlloc"),
      stat("Cache hit de PGA", m.pgaCacheHitPct.toFixed(1) + "%", "pgaCacheHitPct")
    ].join("");

    function memBar(label, pct, inverso) {
      var c;
      if (inverso) { // alto = bueno (ej. Buffer Cache Hit %)
        c = pct < 80 ? "st-critico" : pct < 90 ? "st-advertencia" : "st-saludable";
      } else { // alto = malo (uso de memoria)
        c = pct >= 95 ? "st-critico" : pct >= 85 ? "st-advertencia" : "st-saludable";
      }
      return '<div class="mon-mem-row"><span>' + label + '</span><div class="mon-bar"><div class="mon-bar-fill ' + c + '" style="width:' + clamp(pct, 0, 100) + '%"></div></div><strong>' + pct.toFixed(0) + "%</strong></div>";
    }
    // Over-allocation no es un porcentaje sino un conteo de eventos
    // (V$PGASTAT "over allocation count"), así que se muestra como
    // nivel cualitativo (BAJO/MEDIO/ALTO) en vez de "%", siguiendo los
    // mismos cortes que penalizan el IM en calcIM().
    function overAllocRow(count) {
      var level = count <= 0
        ? { label: "BAJO", pct: 15, cls: "st-saludable" }
        : count <= 5
          ? { label: "MEDIO", pct: 55, cls: "st-advertencia" }
          : { label: "ALTO", pct: 90, cls: "st-critico" };
      return '<div class="mon-mem-row"><span>Over-allocation</span><div class="mon-bar"><div class="mon-bar-fill ' + level.cls + '" style="width:' + level.pct + '%"></div></div><strong>' + level.label + "</strong></div>";
    }
    document.getElementById("mon-mem-bars").innerHTML =
      memBar("SGA", im.sgaUsedPct) +
      memBar("Shared Pool", m.sharedPoolPct) +
      memBar("Buffer Cache Hit", m.bufferCachePct, true) +
      memBar("PGA", im.pgaUsedPct) +
      overAllocRow(m.pgaOverAlloc);

    document.getElementById("mon-ia-stats").innerHTML = [
      stat("Datafiles online", m.datafilesOnline, "datafilesOnline"),
      stat("Datafiles offline", m.datafilesOffline, "datafilesOffline"),
      stat("Tamaño de datafiles", formatMb(m.datafilesSizeMb), "datafilesSizeMb"),
      stat("Espacio de tablespaces", m.tablespacesUsedPct.toFixed(0) + "%", "tablespacesUsedPct"),
      stat("Tempfiles", m.tempUsedPct.toFixed(0) + "%", "tempUsedPct"),
      stat("Redo logs", m.redoGroupsOk + " OK / " + m.redoGroupsProblem + " problema", "redoLogs"),
      stat("Archivos inválidos", m.datafilesProblem, "datafilesProblem"),
      stat("Archivos inaccesibles", m.datafilesInaccessible, "datafilesInaccessible")
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

  function showError(msg) {
    var banner = document.getElementById("mon-error-banner");
    if (!banner) return;
    if (!msg) { banner.hidden = true; banner.innerHTML = ""; return; }
    banner.hidden = false;
    banner.innerHTML = "<strong>No se pudo consultar Oracle</strong>" + msg;
  }

  async function collectAndRender() {
    var btn = document.getElementById("mon-btn-refresh");
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(API_BASE + "/monitor/salud");
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        var detalle = body && body.detalle ? body.detalle : (body && body.error) || ("HTTP " + res.status);
        throw new Error(detalle);
      }

      var metrics = body.metrics;
      var ip = calcIP(metrics), im = calcIM(metrics), ia = calcIA(metrics);
      var isbd = calcISBD(ip, im, ia);
      var alerts = buildAlerts(metrics, ip, im);
      renderAll(ip, im, ia, isbd, alerts);
      drawHistory(pushHistory(isbd, ip, im, ia));
      showError(null);

      var ts = new Date();
      document.getElementById("mon-last-update").textContent =
        "Actualizado: " + ts.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (err) {
      console.error("No se pudo consultar el monitor de salud:", err);
      showError(
        "<br>" + (err && err.message ? err.message : "Verifique que el backend esté corriendo (npm run dev) y que Oracle esté disponible.") +
        "<br>Si el error menciona ORA-00942 o falta de privilegios, revise el GRANT SELECT_CATALOG_ROLE en el README del backend."
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function startAuto() {
    if (autoTimer) clearInterval(autoTimer);
    if (document.getElementById("mon-auto-refresh").checked) {
      autoTimer = setInterval(collectAndRender, REFRESH_MS);
    }
  }

  // Delega clic/teclado sobre cualquier contenedor de fichas (.mon-stat
  // con data-var) hacia el modal de descripción de variables. Se usa
  // para "Procesos y sesiones" y "Memoria (SGA / PGA)".
  function wireVarInfoContainer(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.addEventListener("click", function (e) {
      var card = e.target.closest(".mon-stat[data-var]");
      if (card) openVarInfo(card.getAttribute("data-var"));
    });
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest(".mon-stat[data-var]");
      if (!card) return;
      e.preventDefault();
      openVarInfo(card.getAttribute("data-var"));
    });
  }

  function initVarInfoModal() {
    var backdrop = document.getElementById("mon-varinfo-backdrop");
    var closeBtn = document.getElementById("mon-varinfo-close");
    if (!backdrop || !closeBtn) return;

    wireVarInfoContainer("mon-ip-stats");
    wireVarInfoContainer("mon-im-stats");
    wireVarInfoContainer("mon-ia-stats");

    closeBtn.addEventListener("click", closeVarInfo);
    backdrop.addEventListener("click", function (e) {
      if (e.target === e.currentTarget) closeVarInfo();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeVarInfo();
    });
  }

  function init() {
    document.getElementById("mon-btn-refresh").addEventListener("click", collectAndRender);
    document.getElementById("mon-auto-refresh").addEventListener("change", startAuto);
    document.getElementById("mon-btn-clear-history").addEventListener("click", function () {
      localStorage.removeItem(HISTORY_KEY); drawHistory([]);
    });
    window.addEventListener("resize", function () { drawHistory(loadHistory()); });
    initVarInfoModal();
    collectAndRender();
    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
