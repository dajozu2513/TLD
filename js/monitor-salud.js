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
  // Últimas alertas renderizadas, indexadas igual que la lista en pantalla,
  // para poder abrir el modal de detalle al hacer clic sobre una de ellas.
  var currentAlerts = [];
  // Último detalle por tablespace [{nombre, usedPct, estado}], para el
  // modal que abre cada bolita de color de "Tablespaces".
  var currentTsDetail = [];

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

  function formatFechaHora(d) {
    if (!d) return "—";
    return d.toLocaleString("es-CR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function buildAlerts(m, ip, im, fecha) {
    var alerts = [];
    if (m.sessionsBlocked > 0) alerts.push({ nivel: "critico", componente: "Procesos", variable: "Sesiones bloqueadas", valor: m.sessionsBlocked, umbral: 0, descripcion: "Existen " + m.sessionsBlocked + " sesión(es) bloqueada(s). Revisar V$WAIT_CHAINS.",
      origen: "V$SESSION, columna blocking_session distinta de nulo: sesiones que están esperando liberar un lock que sostiene otra sesión.",
      escalones: "0 → normal. ≥1 → crítico. Cada sesión bloqueada resta 6 puntos al Indicador de Procesos, con un tope de 25.",
      justificacion: "Se penaliza aparte de la utilización general porque es un problema cualitativamente distinto: la base puede tener solo un 20% de procesos en uso y aun así sufrir una transacción crítica paralizada por un solo lock. Si el indicador solo mirara utilización, ese escenario se vería saludable cuando en realidad hay un problema activo. Por eso el umbral es 0: basta una sola sesión bloqueada para considerarlo un problema, sin zona neutral." });
    if (ip.utilProc >= 95) alerts.push({ nivel: "critico", componente: "Procesos", variable: "Utilización procesos", valor: ip.utilProc + "%", umbral: "95%", descripcion: "Procesos cerca del límite (PROCESSES).",
      origen: "máx(procesos actuales ÷ PROCESSES, sesiones actuales ÷ límite de sesiones) × 100, con datos de V$RESOURCE_LIMIT y V$SESSION.",
      escalones: "0–69% normal. 70–84% advertencia. 85–94% alto. ≥95% crítico.",
      justificacion: "Se usaron umbrales tipo semáforo, 70/85/95%, un patrón estándar en monitoreo de sistemas, dejando la zona crítica justo antes del 100%, el punto donde Oracle empieza a rechazar conexiones nuevas con ORA-00020, para darle margen de reacción al DBA." });
    else if (ip.utilProc >= 85) alerts.push({ nivel: "alto", componente: "Procesos", variable: "Utilización procesos", valor: ip.utilProc + "%", umbral: "85%", descripcion: "Utilización alta de procesos.",
      origen: "máx(procesos actuales ÷ PROCESSES, sesiones actuales ÷ límite de sesiones) × 100, con datos de V$RESOURCE_LIMIT y V$SESSION.",
      escalones: "0–69% normal. 70–84% advertencia. 85–94% alto. ≥95% crítico.",
      justificacion: "Se usaron umbrales tipo semáforo, 70/85/95%, un patrón estándar en monitoreo de sistemas, dejando la zona crítica justo antes del 100%, el punto donde Oracle empieza a rechazar conexiones nuevas con ORA-00020, para darle margen de reacción al DBA." });
    else if (ip.utilProc >= 70) alerts.push({ nivel: "advertencia", componente: "Procesos", variable: "Utilización procesos", valor: ip.utilProc + "%", umbral: "70%", descripcion: "Utilización en zona de advertencia.",
      origen: "máx(procesos actuales ÷ PROCESSES, sesiones actuales ÷ límite de sesiones) × 100, con datos de V$RESOURCE_LIMIT y V$SESSION.",
      escalones: "0–69% normal. 70–84% advertencia. 85–94% alto. ≥95% crítico.",
      justificacion: "Se usaron umbrales tipo semáforo, 70/85/95%, un patrón estándar en monitoreo de sistemas, dejando la zona crítica justo antes del 100%, el punto donde Oracle empieza a rechazar conexiones nuevas con ORA-00020, para darle margen de reacción al DBA." });
    if (m.longOps > 0) alerts.push({ nivel: m.longOps >= 3 ? "alto" : "advertencia", componente: "Procesos", variable: "Long ops", valor: m.longOps, umbral: 0, descripcion: m.longOps + " operación(es) prolongada(s) (V$SESSION_LONGOPS).",
      origen: "V$SESSION_LONGOPS: operaciones con trabajo pendiente y tiempo restante mayor a 0.",
      escalones: "0 → normal. 1–2 → advertencia. ≥3 → alto.",
      justificacion: "Pesa la mitad que una sesión bloqueada, penalización máxima −12 contra −25, porque un long op no siempre es un problema: puede ser mantenimiento normal, como crear un índice. Aun así se dispara desde el primer caso para que el DBA lo tenga presente." });
    if (m.pgaOverAlloc > 5) alerts.push({ nivel: m.pgaOverAlloc > 20 ? "critico" : "alto", componente: "Memoria", variable: "PGA over-alloc", valor: m.pgaOverAlloc, umbral: 0, descripcion: "PGA con sobre-asignación.",
      origen: "V$PGASTAT, estadística “over allocation count”: veces que el PGA tuvo que exceder PGA_AGGREGATE_TARGET.",
      escalones: "0 → normal. 1–5 → advertencia. 6–20 → alto. ≥21 → crítico.",
      justificacion: "A diferencia de las demás variables de memoria, no es una proyección de riesgo sino la confirmación de que Oracle ya excedió PGA_AGGREGATE_TARGET al menos una vez. Por eso penaliza desde el primer evento, sin zona neutral, con la penalización más alta de todo el Indicador de Memoria." });
    else if (m.pgaOverAlloc > 0) alerts.push({ nivel: "advertencia", componente: "Memoria", variable: "PGA over-alloc", valor: m.pgaOverAlloc, umbral: 0, descripcion: "Se detectaron over-allocations de PGA.",
      origen: "V$PGASTAT, estadística “over allocation count”: veces que el PGA tuvo que exceder PGA_AGGREGATE_TARGET.",
      escalones: "0 → normal. 1–5 → advertencia. 6–20 → alto. ≥21 → crítico.",
      justificacion: "A diferencia de las demás variables de memoria, no es una proyección de riesgo sino la confirmación de que Oracle ya excedió PGA_AGGREGATE_TARGET al menos una vez. Por eso penaliza desde el primer evento, sin zona neutral, con la penalización más alta de todo el Indicador de Memoria." });
    if (m.pgaCacheHitPct < 70) alerts.push({ nivel: "critico", componente: "Memoria", variable: "PGA cache hit", valor: m.pgaCacheHitPct.toFixed(1) + "%", umbral: "70%", descripcion: "Cache hit de PGA muy bajo.",
      origen: "V$PGASTAT, estadística “cache hit percentage”.",
      escalones: "92–100% normal. 85–91% advertencia. 70–84% alto. 0–69% crítico. Un valor alto es bueno, al contrario que las demás variables.",
      justificacion: "Los cortes son más bajos que los de Buffer Cache Hit, 92/85/70% en vez de 95/90/80%, porque el rendimiento natural de la PGA en estas operaciones, ordenamientos y hash joins, es menor. Un valor alto es bueno, así que el criterio se invierte respecto a las demás variables de memoria." });
    else if (m.pgaCacheHitPct < 85) alerts.push({ nivel: "advertencia", componente: "Memoria", variable: "PGA cache hit", valor: m.pgaCacheHitPct.toFixed(1) + "%", umbral: "85%", descripcion: "Cache hit de PGA por debajo del deseable.",
      origen: "V$PGASTAT, estadística “cache hit percentage”.",
      escalones: "92–100% normal. 85–91% advertencia. 70–84% alto. 0–69% crítico. Un valor alto es bueno, al contrario que las demás variables.",
      justificacion: "Los cortes son más bajos que los de Buffer Cache Hit, 92/85/70% en vez de 95/90/80%, porque el rendimiento natural de la PGA en estas operaciones, ordenamientos y hash joins, es menor. Un valor alto es bueno, así que el criterio se invierte respecto a las demás variables de memoria." });
    if (im.sgaUsedPct > 95) alerts.push({ nivel: "alto", componente: "Memoria", variable: "Uso SGA", valor: im.sgaUsedPct + "%", umbral: "95%", descripcion: "SGA con muy poco espacio libre.",
      origen: "Uso SGA % = (tamaño de SGA − memoria libre de SGA) ÷ tamaño de SGA × 100, con datos de V$SGA y V$SGAINFO.",
      escalones: "0–84% normal. 85–89% advertencia. 90–94% alto. ≥95% crítico.",
      justificacion: "La SGA es memoria compartida: si se agota, afecta a toda la instancia por igual, no solo a una sesión. Por eso su penalización máxima es de las más altas del Indicador de Memoria, con el corte en 95% para dejar margen antes de quedarse sin memoria compartida." });
    if (m.datafilesInaccessible > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Archivos inaccesibles", valor: m.datafilesInaccessible, umbral: 0, descripcion: m.datafilesInaccessible + " datafile(s) con error de encabezado (V$DATAFILE_HEADER.ERROR).",
      origen: "V$DATAFILE_HEADER, columna ERROR: el encabezado del datafile no se pudo leer por archivo no encontrado, dañado o sin permisos.",
      escalones: "0 → normal. ≥1 → crítico. Cada archivo inaccesible resta 30 puntos al Indicador de Archivos.",
      justificacion: "Es la señal más grave del Indicador de Archivos: el archivo ni siquiera responde. No existe un estado intermedio de parcialmente inaccesible, así que penaliza por conteo desde el primer caso, con el peso más alto de toda la fórmula." });
    if (m.datafilesOffline > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Datafiles OFFLINE", valor: m.datafilesOffline, umbral: 0, descripcion: m.datafilesOffline + " datafile(s) OFFLINE.",
      origen: "V$DATAFILE, columna status = OFFLINE.",
      escalones: "0 → normal. ≥1 → crítico. Cada datafile offline resta 25 puntos al Indicador de Archivos.",
      justificacion: "Un datafile offline no está disponible para la instancia hasta ponerlo online explícitamente. Es una falla discreta, no un porcentaje, así que se penaliza por conteo desde el primer caso, igual que las demás fallas de archivo." });
    if (m.datafilesProblem > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Archivos inválidos", valor: m.datafilesProblem, umbral: 0, descripcion: "Datafiles en estado RECOVER (necesitan recuperación de medios).",
      origen: "V$DATAFILE, columna status = RECOVER.",
      escalones: "0 → normal. ≥1 → crítico. Cada archivo inválido resta 18 puntos al Indicador de Archivos.",
      justificacion: "Un datafile en estado RECOVER necesita recuperación de medios antes de poder usarse con normalidad. Como con los demás estados discretos de datafiles, se penaliza por conteo desde el primer caso, sin curva continua." });
    if (m.tablespacesCritical > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "TS críticos", valor: m.tablespacesCritical, umbral: 0, descripcion: m.tablespacesCritical + " tablespace(s) críticos.",
      origen: "% uso por tablespace = (espacio asignado − espacio libre) ÷ espacio asignado × 100, con datos de DBA_DATA_FILES y DBA_FREE_SPACE.",
      escalones: "< 80% normal. 80–94% advertencia. ≥95% crítico, evaluado por cada tablespace.",
      justificacion: "Los tablespaces se evalúan con umbrales escalonados en vez de una curva continua porque el riesgo de quedarse sin espacio crece de forma no lineal a medida que se acerca al límite físico: 80% ya amerita vigilancia y 95% es una emergencia inminente." });
    else if (m.tablespacesWarning > 0) alerts.push({ nivel: "advertencia", componente: "Archivos", variable: "TS advertencia", valor: m.tablespacesWarning, umbral: 0, descripcion: m.tablespacesWarning + " tablespace(s) próximos al límite.",
      origen: "% uso por tablespace = (espacio asignado − espacio libre) ÷ espacio asignado × 100, con datos de DBA_DATA_FILES y DBA_FREE_SPACE.",
      escalones: "< 80% normal. 80–94% advertencia. ≥95% crítico, evaluado por cada tablespace.",
      justificacion: "Los tablespaces se evalúan con umbrales escalonados en vez de una curva continua porque el riesgo de quedarse sin espacio crece de forma no lineal a medida que se acerca al límite físico: 80% ya amerita vigilancia y 95% es una emergencia inminente." });
    if (m.maxTablespaceUsedPct >= 95) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Máx. uso TS", valor: m.maxTablespaceUsedPct.toFixed(0) + "%", umbral: "95%", descripcion: "Tablespace supera 95% de uso.",
      origen: "Mayor % de uso entre todos los tablespaces, calculado con DBA_DATA_FILES y DBA_FREE_SPACE.",
      escalones: "0–74% normal. 75–84% advertencia. 85–94% alto. ≥95% crítico.",
      justificacion: "Se usa el peor tablespace, no un promedio, porque basta con que uno solo se llene para que las operaciones que dependen de él fallen. Los cortes 75/85/95% siguen el mismo criterio de vigilancia creciente que el resto de variables de espacio." });
    if (m.tempUsedPct >= 90) alerts.push({ nivel: m.tempUsedPct >= 95 ? "critico" : "alto", componente: "Archivos", variable: "Uso TEMP", valor: m.tempUsedPct.toFixed(0) + "%", umbral: "90%", descripcion: "Tablespace temporal elevado.",
      origen: "DBA_TEMP_FREE_SPACE: (espacio asignado − espacio libre) ÷ tamaño del tablespace temporal × 100.",
      escalones: "0–84% normal. 85–94% alto. ≥95% crítico.",
      justificacion: "El tablespace temporal se usa para ordenamientos y hash joins que no caben en memoria; si se agota, esas operaciones fallan directamente. Se usan solo dos cortes, 85% y 95%, porque a diferencia de los tablespaces de datos no hace falta una franja intermedia de advertencia tan fina." });
    if (m.redoGroupsProblem > 0) alerts.push({ nivel: "critico", componente: "Archivos", variable: "Redo logs", valor: m.redoGroupsProblem, umbral: 0, descripcion: "Problemas en grupos de redo log.",
      origen: "V$LOG: grupos de redo log fuera de los estados normales CURRENT, ACTIVE, INACTIVE o UNUSED.",
      escalones: "0 → normal. ≥1 → crítico. Cada grupo con problema resta 15 puntos al Indicador de Archivos.",
      justificacion: "Un grupo de redo log en estado anómalo compromete la durabilidad de los COMMIT. Es una falla discreta, no gradual, así que se penaliza por conteo desde el primer caso, con un peso alto por el riesgo de pérdida de datos que implica." });
    var order = { critico: 0, alto: 1, advertencia: 2 };
    alerts.sort(function (a, b) { return (order[a.nivel] || 9) - (order[b.nivel] || 9); });
    // Todas las alertas de una misma pasada comparten el instante en que
    // se leyeron las métricas que las generaron.
    alerts.forEach(function (a) { a.fecha = fecha; });
    return alerts;
  }

  function setBadge(el, st) {
    el.textContent = st.label;
    el.className = "mon-badge " + st.cls;
  }

  // Quita cualquier texto entre paréntesis (usado para limpiar las
  // causas, incluyendo las que vienen de a.descripcion en buildAlerts,
  // que sí puede traer aclaraciones entre paréntesis).
  function stripParens(text) {
    return text.replace(/\s*\([^()]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  }

  // Explica, en texto, por qué el semáforo llegó al estado que muestra:
  // primero la alerta crítica que fuerza el estado (si aplica), luego las
  // alertas activas más severas y, si no hay ninguna, el indicador
  // (IP/IM/IA) que más está arrastrando el índice general hacia abajo.
  function buildCausas(isbd, ip, im, ia, alerts, hasCrit, stOriginal, stFinal) {
    var causas = [];

    if (stFinal.key === "critico" && hasCrit && isbd >= 60) {
      causas.push(
        "Hay al menos una alerta crítica activa, lo que fuerza el estado a Crítico aunque el índice general " +
        isbd.toFixed(2) + " caería en el rango \"" + stOriginal.label + "\" solo por puntaje."
      );
    }

    if (alerts.length) {
      var MAX_CAUSAS = 5;
      var relevantes = alerts.filter(function (a) { return a.nivel === "critico" || a.nivel === "alto"; });
      if (!relevantes.length) relevantes = alerts;
      relevantes.slice(0, MAX_CAUSAS).forEach(function (a) {
        causas.push(a.componente + " · " + a.variable + ": " + a.descripcion +
          " Valor: " + a.valor + ", umbral: " + a.umbral + ".");
      });
      var extra = relevantes.length - MAX_CAUSAS;
      if (extra > 0) {
        causas.push((extra === 1 ? "1 alerta adicional." : extra + " alertas adicionales.") + " Ver «Alertas activas» abajo.");
      }
    } else if (stFinal.key !== "optimo") {
      var indicadores = [
        { nombre: "Procesos (IP)", score: ip.score },
        { nombre: "Memoria (IM)", score: im.score },
        { nombre: "Archivos (IA)", score: ia.score }
      ];
      indicadores.sort(function (a, b) { return a.score - b.score; });
      var peor = indicadores[0];
      causas.push(
        "No hay alertas activas por encima del umbral, pero el indicador " + peor.nombre +
        ", con score " + peor.score.toFixed(1) + " de 100, es el que más reduce el índice general."
      );
    } else {
      causas.push("Todos los indicadores — Procesos, Memoria y Archivos — están en rango óptimo y no hay alertas activas.");
    }

    return causas.map(stripParens);
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

  // Cada bolita de color de "Tablespaces" es seleccionable: abre un
  // modal con el nombre de cada tablespace que está en ese estado.
  function tsChip(estado, cls, count, etiqueta) {
    return '<span class="mon-chip ' + cls + ' mon-chip--clickable" data-ts-estado="' + estado +
      '" tabindex="0" role="button" aria-haspopup="dialog">' + count + " " + etiqueta + "</span>";
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
    },
    semaforoEstados: {
      titulo: "Umbrales del semáforo",
      desc: "El ISBD y cada indicador (IP, IM, IA) son un puntaje de 0 a 100 que se traduce a un estado visual (semáforo) según en qué rango caiga. Es el mismo criterio para los cuatro.",
      tablaHtml: '<div class="mon-table-wrap"><table class="mon-ip-table mon-status-table">' +
        '<thead><tr><th>Rango de score</th><th>Estado</th></tr></thead>' +
        '<tbody>' +
        '<tr><td>90 – 100</td><td><span class="mon-badge st-optimo">Óptimo</span></td></tr>' +
        '<tr><td>75 – 89</td><td><span class="mon-badge st-saludable">Saludable</span></td></tr>' +
        '<tr><td>60 – 74</td><td><span class="mon-badge st-advertencia">Advertencia</span></td></tr>' +
        '<tr><td>40 – 59</td><td><span class="mon-badge st-degradado">Degradado</span></td></tr>' +
        '<tr><td>0 – 39</td><td><span class="mon-badge st-critico">Crítico</span></td></tr>' +
        '</tbody></table></div>' +
        '<p class="mon-varinfo-table-note">Excepción: si hay al menos una alerta crítica activa y el ISBD es ≥ 60, el "Estado real" se fuerza a Crítico aunque el puntaje solo diera Advertencia o Saludable.</p>'
    },
    tablespacesInfo: {
      titulo: "Tablespaces",
      desc: "Un tablespace es el contenedor lógico donde Oracle guarda los datos (tablas, índices, etc.), respaldado por uno o más datafiles físicos. Los chips de abajo (normal/advertencia/crítico) resumen, para cada tablespace por separado, la comparación entre su espacio asignado y su espacio libre.",
      formula: "Estado por tablespace, según % de uso:\n  % uso = (espacio asignado − espacio libre) ÷ espacio asignado × 100\n\n  < 80%        → normal\n  80% – 94.9%  → advertencia\n  ≥ 95%        → crítico\n\nDatos de DBA_DATA_FILES (asignado) y DBA_FREE_SPACE (libre), por tablespace."
    },
    DBWn: {
      titulo: "DBWn (Database Writer)",
      desc: "Escribe a disco los bloques modificados (“sucios”) que están en el buffer cache, hacia los datafiles.",
      formula: "Estado (ACTIVO/INACTIVO): presencia o ausencia en V$PROCESS en el instante de la consulta, no un umbral numérico.\n\nSELECT DISTINCT pname FROM V$PROCESS WHERE pname IS NOT NULL\n\nDBWn → ACTIVO si algún pname empieza con \"DBW\" (puede haber varios: DBW0, DBW1…). Si no aparece → INACTIVO.\n\nEs puramente informativo: no resta puntos al IP."
    },
    LGWR: {
      titulo: "LGWR (Log Writer)",
      desc: "Escribe las entradas de redo desde el buffer de redo log hacia los archivos de redo log online; es lo que hace durable un COMMIT.",
      formula: "Estado (ACTIVO/INACTIVO): presencia o ausencia en V$PROCESS en el instante de la consulta, no un umbral numérico.\n\nSELECT DISTINCT pname FROM V$PROCESS WHERE pname IS NOT NULL\n\nLGWR → ACTIVO si algún pname = \"LGWR\". Si no aparece → INACTIVO.\n\nEs puramente informativo: no resta puntos al IP."
    },
    SMON: {
      titulo: "SMON (System Monitor)",
      desc: "Realiza la recuperación de la instancia al arrancar y limpia segmentos temporales huérfanos.",
      formula: "Estado (ACTIVO/INACTIVO): presencia o ausencia en V$PROCESS en el instante de la consulta, no un umbral numérico.\n\nSELECT DISTINCT pname FROM V$PROCESS WHERE pname IS NOT NULL\n\nSMON → ACTIVO si algún pname = \"SMON\". Si no aparece → INACTIVO.\n\nEs puramente informativo: no resta puntos al IP."
    },
    PMON: {
      titulo: "PMON (Process Monitor)",
      desc: "Limpia lo que deja un proceso que falla: libera locks y hace rollback de sus transacciones pendientes.",
      formula: "Estado (ACTIVO/INACTIVO): presencia o ausencia en V$PROCESS en el instante de la consulta, no un umbral numérico.\n\nSELECT DISTINCT pname FROM V$PROCESS WHERE pname IS NOT NULL\n\nPMON → ACTIVO si algún pname = \"PMON\". Si no aparece → INACTIVO.\n\nEs puramente informativo: no resta puntos al IP."
    },
    CKPT: {
      titulo: "CKPT (Checkpoint)",
      desc: "Coordina los puntos de control: avisa a DBWn cuándo escribir y actualiza los encabezados de los datafiles y el control file.",
      formula: "Estado (ACTIVO/INACTIVO): presencia o ausencia en V$PROCESS en el instante de la consulta, no un umbral numérico.\n\nSELECT DISTINCT pname FROM V$PROCESS WHERE pname IS NOT NULL\n\nCKPT → ACTIVO si algún pname = \"CKPT\". Si no aparece → INACTIVO.\n\nEs puramente informativo: no resta puntos al IP."
    }
  };

  // Alerta detrás del modal actualmente abierto, usada por el botón
  // "Ver justificación de umbral" y por la flecha de volver.
  var currentModalAlert = null;

  // Renderiza el modal genérico de "info de variable" a partir de un
  // objeto {titulo, desc, formula?, tablaHtml?}, sin importar si viene
  // del catálogo VAR_INFO (por clave) o se construyó al vuelo (alertas).
  // showBack controla si se muestra la flecha de volver (solo en la
  // vista de justificación de umbral).
  function renderInfoModal(info, showBack) {
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

    var tablaEl = document.getElementById("mon-varinfo-table");
    if (tablaEl) {
      if (info.tablaHtml) {
        tablaEl.innerHTML = info.tablaHtml;
        tablaEl.hidden = false;
      } else {
        tablaEl.hidden = true;
        tablaEl.innerHTML = "";
      }
    }

    var backBtn = document.getElementById("mon-varinfo-back");
    if (backBtn) backBtn.hidden = !showBack;

    var backdrop = document.getElementById("mon-varinfo-backdrop");
    backdrop.hidden = false;
    document.getElementById(showBack ? "mon-varinfo-back" : "mon-varinfo-close").focus();
  }

  function openVarInfo(key) {
    currentModalAlert = null;
    renderInfoModal(VAR_INFO[key], false);
  }

  function nivelBadgeCls(nivel) {
    return nivel === "critico" ? "st-critico" : nivel === "alto" ? "st-degradado" : "st-advertencia";
  }

  function nivelLabel(nivel) {
    return nivel === "critico" ? "Crítico" : nivel === "alto" ? "Alto" : "Advertencia";
  }

  // Arma el contenido del modal para una alerta específica: la
  // descripción del problema, el valor observado y el umbral que la
  // disparó, cómo se obtuvo ese valor (vista/fórmula de Oracle), la
  // escala completa de umbrales de esa variable, y el botón que lleva a
  // la justificación de por qué se escogió ese umbral.
  function buildAlertModalInfo(a) {
    var tablaHtml =
      '<div class="mon-table-wrap"><table class="mon-ip-table">' +
      '<tbody>' +
      '<tr><td>Valor observado</td><td>' + a.valor + '</td></tr>' +
      '<tr><td>Umbral que disparó la alerta</td><td>' + a.umbral + '</td></tr>' +
      '<tr><td>Nivel</td><td><span class="mon-badge ' + nivelBadgeCls(a.nivel) + '">' + nivelLabel(a.nivel) + '</span></td></tr>' +
      '<tr><td>Detectada</td><td>' + formatFechaHora(a.fecha) + '</td></tr>' +
      '</tbody></table></div>' +
      (a.origen ? '<p class="mon-varinfo-table-note"><strong>Cómo se obtiene el valor:</strong> ' + a.origen + '</p>' : '') +
      (a.escalones ? '<p class="mon-varinfo-table-note"><strong>Umbrales:</strong> ' + a.escalones + '</p>' : '') +
      (a.justificacion ? '<button type="button" class="mon-varinfo-just-btn" data-justificacion-trigger>Ver justificación de umbral →</button>' : '');

    return {
      titulo: a.componente + " · " + a.variable,
      desc: a.descripcion,
      tablaHtml: tablaHtml
    };
  }

  function openAlertInfo(index) {
    var a = currentAlerts[Number(index)];
    if (!a) return;
    currentModalAlert = a;
    renderInfoModal(buildAlertModalInfo(a), false);
  }

  // "Ver justificación de umbral": sustituye el contenido del modal por
  // la justificación, y deja la flecha de volver lista para restaurar el
  // detalle de la alerta que estaba abierto.
  function showJustification() {
    if (!currentModalAlert) return;
    renderInfoModal({
      titulo: "Justificación del umbral — " + currentModalAlert.variable,
      desc: currentModalAlert.justificacion || "No hay justificación registrada para esta variable."
    }, true);
  }

  function closeVarInfo() {
    var backdrop = document.getElementById("mon-varinfo-backdrop");
    if (!backdrop.hidden) backdrop.hidden = true;
    currentModalAlert = null;
  }

  var TS_ESTADO_LABEL = { normal: "Normal", advertencia: "Advertencia", critico: "Crítico" };
  var TS_ESTADO_CLS = { normal: "st-saludable", advertencia: "st-advertencia", critico: "st-critico" };

  // Arma el modal de una bolita de "Tablespaces": lista, con nombre y %
  // de uso, cuáles tablespaces están en ese estado específico.
  function buildTsModalInfo(estado) {
    var items = currentTsDetail.filter(function (t) { return t.estado === estado; });
    var tablaHtml;
    if (!items.length) {
      tablaHtml = '<p class="mon-varinfo-table-note">Ningún tablespace está en este estado en este momento.</p>';
    } else {
      tablaHtml = '<div class="mon-table-wrap"><table class="mon-ip-table"><thead><tr><th>Tablespace</th><th>% de uso</th></tr></thead><tbody>' +
        items.map(function (t) {
          return '<tr><td>' + t.nombre + '</td><td>' + t.usedPct.toFixed(1) + '%</td></tr>';
        }).join("") +
        '</tbody></table></div>';
    }
    return {
      titulo: 'Tablespaces en estado ' + '<span class="mon-badge ' + TS_ESTADO_CLS[estado] + '">' + TS_ESTADO_LABEL[estado] + '</span>',
      desc: "% de uso = (espacio asignado − espacio libre) ÷ espacio asignado × 100, con datos de DBA_DATA_FILES y DBA_FREE_SPACE.",
      tablaHtml: tablaHtml
    };
  }

  function openTsInfo(estado) {
    currentModalAlert = null;
    var info = buildTsModalInfo(estado);
    // El título trae un badge de color, así que se inyecta como HTML en
    // vez de por renderInfoModal (que usa textContent para el título).
    document.getElementById("mon-varinfo-title").innerHTML = info.titulo;
    document.getElementById("mon-varinfo-desc").textContent = info.desc;
    var formulaEl = document.getElementById("mon-varinfo-formula");
    formulaEl.hidden = true;
    formulaEl.textContent = "";
    var tablaEl = document.getElementById("mon-varinfo-table");
    tablaEl.innerHTML = info.tablaHtml;
    tablaEl.hidden = false;
    var backBtn = document.getElementById("mon-varinfo-back");
    if (backBtn) backBtn.hidden = true;
    var backdrop = document.getElementById("mon-varinfo-backdrop");
    backdrop.hidden = false;
    document.getElementById("mon-varinfo-close").focus();
  }

  function renderAll(ip, im, ia, isbd, alerts) {
    var m = ip.details;
    var stOriginal = statusFromScore(isbd);
    var stISBD = stOriginal;
    var hasCrit = alerts.some(function (a) { return a.nivel === "critico"; });
    if (hasCrit && isbd >= 60) stISBD = { key: "critico", label: "Crítico (alerta activa)", cls: "st-critico" };

    // Índice de salud general: color y estado puramente según el puntaje
    // (el semáforo "de libro"), sin considerar alertas activas.
    document.getElementById("mon-isbd-value").textContent = isbd.toFixed(2);
    setBadge(document.getElementById("mon-isbd-status"), stOriginal);
    document.getElementById("mon-isbd-card").className = "mon-isbd " + stOriginal.cls;

    // Estado real: el mismo semáforo, pero ajustado por alertas activas
    // (ej. una alerta crítica fuerza Crítico aunque el puntaje diera más),
    // mostrado aparte junto con sus causas.
    var realStatusEl = document.getElementById("mon-isbd-real-status");
    if (realStatusEl) setBadge(realStatusEl, stISBD);

    // Solo se refresca el contenido; la visibilidad la controla el botón
    // "Ver causas" (wireIsbdCausasToggle), no cada actualización del monitor.
    var causas = buildCausas(isbd, ip, im, ia, alerts, hasCrit, stOriginal, stISBD);
    var causasListEl = document.getElementById("mon-isbd-causas-list");
    if (causasListEl) {
      causasListEl.innerHTML = causas.map(function (c) { return "<li>" + c + "</li>"; }).join("");
    }

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
      bgHtml += '<li class="mon-bg-item" data-var="' + name + '" tabindex="0" role="button" aria-haspopup="dialog">' +
        '<span class="mon-bg-name">' + name + '</span><span class="mon-bg-pill ' + cls + '">' + st + "</span></li>";
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

    // Detalle por tablespace, para el modal de cada bolita de color.
    currentTsDetail = m.tablespacesDetail || [];
    document.getElementById("mon-ts-summary").innerHTML =
      '<div class="mon-ts-chips">' +
        tsChip("normal", "st-saludable", m.tablespacesNormal, "normales") +
        tsChip("advertencia", "st-advertencia", m.tablespacesWarning, "advertencia") +
        tsChip("critico", "st-critico", m.tablespacesCritical, "críticos") +
      "</div>";

    // Alertas
    currentAlerts = alerts;
    document.getElementById("mon-alert-count").textContent = String(alerts.length);
    var list = document.getElementById("mon-alerts-list");
    if (!alerts.length) {
      list.innerHTML = '<li class="mon-alert-empty">Sin alertas. Todos los componentes en rangos aceptables.</li>';
    } else {
      list.innerHTML = alerts.map(function (a, i) {
        var cls = a.nivel === "critico" ? "al-critico" : a.nivel === "alto" ? "al-alto" : "al-adv";
        return '<li class="mon-alert-item mon-alert-item--clickable ' + cls + '" data-alert-index="' + i +
          '" tabindex="0" role="button" aria-haspopup="dialog">' +
          '<div class="mon-alert-title"><strong>' + a.componente + "</strong> · " + a.variable + "</div>" +
          '<div class="mon-alert-desc">' + a.descripcion + "</div>" +
          '<div class="mon-alert-meta">Valor: ' + a.valor + " · Umbral: " + a.umbral + " · " + a.nivel.toUpperCase() + "</div>" +
          '<div class="mon-alert-fecha">' + formatFechaHora(a.fecha) + "</div>" +
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
      // Instante en que se leyeron las métricas: se usa el del backend
      // (measuredAt) cuando viene, para que la fecha/hora de cada alerta
      // sea la del momento real de la lectura en Oracle, no la del
      // navegador tras el viaje de red.
      var ts = body.measuredAt ? new Date(body.measuredAt) : new Date();
      var ip = calcIP(metrics), im = calcIM(metrics), ia = calcIA(metrics);
      var isbd = calcISBD(ip, im, ia);
      var alerts = buildAlerts(metrics, ip, im, ts);
      renderAll(ip, im, ia, isbd, alerts);
      renderThresholdsTable();
      drawHistory(pushHistory(isbd, ip, im, ia));
      showError(null);

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

  // Delega clic/teclado sobre cualquier elemento con [data-var] dentro
  // del contenedor (fichas .mon-stat, filas de la lista de procesos de
  // fondo, etc.) hacia el modal de descripción de variables.
  function wireVarInfoContainer(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.addEventListener("click", function (e) {
      var card = e.target.closest("[data-var]");
      if (card) openVarInfo(card.getAttribute("data-var"));
    });
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest("[data-var]");
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
    wireVarInfoContainer("mon-bg-processes");
    // El cuadro de pesos/fórmula del ISBD (mon-isbd-right) trae su propio
    // data-var="semaforoEstados", así que se delega igual que las fichas.
    wireVarInfoContainer("mon-isbd-right");

    // "Tablespaces" no es una ficha .mon-stat sino un encabezado de
    // subsección, así que se conecta directo en vez de vía
    // wireVarInfoContainer (que delega sobre .mon-stat[data-var]).
    var tsTrigger = document.getElementById("mon-ts-info-trigger");
    if (tsTrigger) {
      tsTrigger.addEventListener("click", function () { openVarInfo("tablespacesInfo"); });
      tsTrigger.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openVarInfo("tablespacesInfo");
      });
    }

    // Cada bolita de color dentro de "Tablespaces" abre su propio detalle
    // por nombre de tablespace; stopPropagation evita que el clic también
    // dispare el trigger general de arriba (mon-ts-info-trigger).
    var tsSummary = document.getElementById("mon-ts-summary");
    if (tsSummary) {
      tsSummary.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-ts-estado]");
        if (!chip) return;
        e.stopPropagation();
        openTsInfo(chip.getAttribute("data-ts-estado"));
      });
      tsSummary.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var chip = e.target.closest("[data-ts-estado]");
        if (!chip) return;
        e.preventDefault();
        e.stopPropagation();
        openTsInfo(chip.getAttribute("data-ts-estado"));
      });
    }

    // Alertas activas: cada <li> trae data-alert-index apuntando a
    // currentAlerts (se recalcula en cada renderAll), así que se resuelve
    // por índice en vez de por clave fija como el resto del catálogo.
    var alertsList = document.getElementById("mon-alerts-list");
    if (alertsList) {
      alertsList.addEventListener("click", function (e) {
        var item = e.target.closest("[data-alert-index]");
        if (item) openAlertInfo(item.getAttribute("data-alert-index"));
      });
      alertsList.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var item = e.target.closest("[data-alert-index]");
        if (!item) return;
        e.preventDefault();
        openAlertInfo(item.getAttribute("data-alert-index"));
      });
    }

    // Botón "Ver justificación de umbral" (inyectado dentro de
    // mon-varinfo-table por buildAlertModalInfo) y flecha de volver.
    var modalEl = document.getElementById("mon-varinfo-modal");
    if (modalEl) {
      modalEl.addEventListener("click", function (e) {
        if (e.target.closest("[data-justificacion-trigger]")) showJustification();
      });
    }
    var backBtn = document.getElementById("mon-varinfo-back");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (currentModalAlert) renderInfoModal(buildAlertModalInfo(currentModalAlert), false);
      });
    }

    closeBtn.addEventListener("click", closeVarInfo);
    backdrop.addEventListener("click", function (e) {
      if (e.target === e.currentTarget) closeVarInfo();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeVarInfo();
    });
  }

  // Botón "Ver causas": muestra/oculta la lista de causas del estado real
  // sin depender de los refrescos del monitor (esos solo actualizan el
  // texto interno, ver renderAll). Dentro, "Ver alertas →" lleva a la
  // sección de alertas activas.
  function wireIsbdCausas() {
    var toggle = document.getElementById("mon-isbd-causas-toggle");
    var causasEl = document.getElementById("mon-isbd-causas");
    var pesosEl = document.getElementById("mon-isbd-right");
    if (toggle && causasEl) {
      toggle.addEventListener("click", function () {
        var abierta = !causasEl.hidden;
        causasEl.hidden = abierta;
        toggle.setAttribute("aria-expanded", String(!abierta));
        toggle.textContent = abierta ? "Ver causas" : "Ocultar causas";
        // Al mostrar las causas se oculta el cuadro de pesos/fórmula del
        // ISBD para dejarle espacio a la explicación; vuelve al cerrar.
        if (pesosEl) pesosEl.hidden = !abierta;
      });
    }

    var verAlertasBtn = document.getElementById("mon-isbd-ver-alertas");
    var alertsPanel = document.getElementById("mon-alerts-panel");
    if (verAlertasBtn && alertsPanel) {
      verAlertasBtn.addEventListener("click", function () {
        alertsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function init() {
    document.getElementById("mon-btn-refresh").addEventListener("click", collectAndRender);
    document.getElementById("mon-auto-refresh").addEventListener("change", startAuto);
    document.getElementById("mon-btn-clear-history").addEventListener("click", function () {
      localStorage.removeItem(HISTORY_KEY); drawHistory([]);
    });
    window.addEventListener("resize", function () { drawHistory(loadHistory()); });
    initVarInfoModal();
    wireIsbdCausas();
    collectAndRender();
    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();


    // Tabla estática de métricas y umbrales (solo visual)
  function renderThresholdsTable() {
    var el = document.getElementById("mon-thresholds-table");
    if (!el) return;

    var rows = [
      ["Utilización procesos", "0–69%", "70–84%", "85–94%", "≥95%"],
      ["Sesiones bloqueadas", "0", "—", "—", "≥1"],
      ["Long ops", "0", "1–2", "≥3", "—"],
      ["Proceso de fondo", "ACTIVO", "—", "—", "cualquier otro estado"],
      ["Uso SGA", "0–84%", "85–89%", "90–94%", "≥95%"],
      ["Shared Pool", "0–84%", "85–89%", "90–94%", "≥95%"],
      ["Buffer Cache Hit", "≥95%", "90–94%", "80–89%", "<80%"],
      ["PGA en uso", "0–84%", "85–89%", "90–94%", "≥95%"],
      ["PGA over-alloc", "0", "1–5", "6–20", "≥21"],
      ["PGA cache hit", "92–100%", "85–91%", "70–84%", "0–69%"],
      ["Espacio libre (TS / TEMP / redo)", "20–100%", "10–19%", "5–9%", "0–4%"],
      ["Datafiles OFFLINE", "0", "—", "—", "≥1"],
      ["Datafiles problema", "0", "—", "—", "≥1"],
      ["Redo logs con problema", "0", "—", "—", "≥1"]
    ];

    var html = '<table class="mon-thresholds-table-el"><thead><tr>' +
      "<th>Variable</th><th>Normal</th><th>Advertencia</th><th>Alto</th><th>Crítico</th>" +
      "</tr></thead><tbody>";

    rows.forEach(function (r) {
      html += "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] +
        "</td><td>" + r[3] + "</td><td>" + r[4] + "</td></tr>";
    });

    html += "</tbody></table>";
    el.innerHTML = html;
  }

})();
