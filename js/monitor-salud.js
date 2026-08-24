/**
 * Three Little Ducks — Monitor de Salud Oracle (UI mejorada)
 * IP / IM / IA → ISBD según documento del curso
 *
 * Fuente de umbrales: THRESHOLDS es la única tabla de límites (inferior/
 * superior) del monitor. Cada variable que alimenta una alerta o una
 * puntuación se clasifica leyendo esta tabla — nada de números mágicos
 * sueltos en el resto del archivo. El único umbral oficial que trae el
 * documento del curso es el de Procesos (§7: 0-69 Normal / 70-84
 * Advertencia / 85-94 Alto / 95-100 Crítico); el resto (Memoria, Archivos)
 * no trae cifras en el documento, así que se documentan aquí como
 * propuesta propia, fácil de recalibrar si el profesor da otros valores.
 */
(function () {
  "use strict";

  var WP = 0.30, WM = 0.35, WA = 0.35;
  var HISTORY_KEY = "tld_monitor_history";
  var MAX_HISTORY = 40;
  var REFRESH_MS = 15000;
  var autoTimer = null;
  var lastResult = null; // { ip, im, ia, isbd, alerts, ts } — para re-renderizar sin resimular al cambiar idioma

  // ---------- Tabla única de umbrales (límite inferior / límite superior por variable) ----------
  // esPorcentaje controla si el valor se muestra con "%" en la leyenda de umbrales.
  var PCT_BANDS_USO = [
    { limiteInferior: 0, limiteSuperior: 84, nivel: "normal" },
    { limiteInferior: 85, limiteSuperior: 89, nivel: "advertencia" },
    { limiteInferior: 90, limiteSuperior: 94, nivel: "alto" },
    { limiteInferior: 95, limiteSuperior: Infinity, nivel: "critico" }
  ];

  var THRESHOLDS = {
    // Procesos — fórmula y bandas oficiales del documento (§7):
    // IP = procesos_actuales / límite_procesos × 100 (se toma el peor entre procesos y sesiones)
    ip_utilizacion: {
      esPorcentaje: true,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 69, nivel: "normal" },
        { limiteInferior: 70, limiteSuperior: 84, nivel: "advertencia" },
        { limiteInferior: 85, limiteSuperior: 94, nivel: "alto" },
        { limiteInferior: 95, limiteSuperior: Infinity, nivel: "critico" }
      ]
    },
    ip_sesiones_bloqueadas: {
      esPorcentaje: false,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 0, nivel: "normal" },
        { limiteInferior: 1, limiteSuperior: Infinity, nivel: "critico" }
      ]
    },
    ip_long_ops: {
      esPorcentaje: false,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 0, nivel: "normal" },
        { limiteInferior: 1, limiteSuperior: 2, nivel: "advertencia" },
        { limiteInferior: 3, limiteSuperior: Infinity, nivel: "alto" }
      ]
    },
    // Procesos de fondo (DBWn/LGWR/SMON/PMON/CKPT): cualquiera fuera de ACTIVO es crítico.
    bg_proceso: { esPorcentaje: false, bandas: [] },

    // Memoria — el documento no trae fórmula ni cifras (§8-§12); se propone
    // el mismo patrón 0-84/85-89/90-94/95-100 usado para "% de uso" en general.
    im_sga_usado: { esPorcentaje: true, bandas: PCT_BANDS_USO },
    im_shared_pool: { esPorcentaje: true, bandas: PCT_BANDS_USO },
    im_buffer_cache: { esPorcentaje: true, bandas: PCT_BANDS_USO },
    im_pga_usado: { esPorcentaje: true, bandas: PCT_BANDS_USO },
    im_pga_over_alloc: {
      esPorcentaje: false,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 0, nivel: "normal" },
        { limiteInferior: 1, limiteSuperior: 5, nivel: "advertencia" },
        { limiteInferior: 6, limiteSuperior: 20, nivel: "alto" },
        { limiteInferior: 21, limiteSuperior: Infinity, nivel: "critico" }
      ]
    },
    im_pga_cache_hit: {
      esPorcentaje: true,
      bandas: [
        { limiteInferior: 92, limiteSuperior: 100, nivel: "normal" },
        { limiteInferior: 85, limiteSuperior: 91, nivel: "advertencia" },
        { limiteInferior: 70, limiteSuperior: 84, nivel: "alto" },
        { limiteInferior: 0, limiteSuperior: 69, nivel: "critico" }
      ]
    },

    // Archivos — regla de espacio libre propuesta en pizarra: mínimo 20% libre.
    // Se aplica a P1 (tablespace con mayor uso), P2 (TEMP) y P3 (salud de redo logs).
    ia_espacio_libre: {
      esPorcentaje: true,
      bandas: [
        { limiteInferior: 20, limiteSuperior: 100, nivel: "normal" },
        { limiteInferior: 10, limiteSuperior: 19, nivel: "advertencia" },
        { limiteInferior: 5, limiteSuperior: 9, nivel: "alto" },
        { limiteInferior: 0, limiteSuperior: 4, nivel: "critico" }
      ]
    },
    ia_datafiles_offline: {
      esPorcentaje: false,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 0, nivel: "normal" },
        { limiteInferior: 1, limiteSuperior: Infinity, nivel: "critico" }
      ]
    },
    ia_datafiles_problema: {
      esPorcentaje: false,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 0, nivel: "normal" },
        { limiteInferior: 1, limiteSuperior: Infinity, nivel: "critico" }
      ]
    },
    ia_redo_problema: {
      esPorcentaje: false,
      bandas: [
        { limiteInferior: 0, limiteSuperior: 0, nivel: "normal" },
        { limiteInferior: 1, limiteSuperior: Infinity, nivel: "critico" }
      ]
    }
  };

  // Filas mostradas en la leyenda "Métricas y umbrales" (orden de despliegue).
  var LEGEND_ROWS = [
    { thresholdKey: "ip_utilizacion", varKey: "util_procesos" },
    { thresholdKey: "ip_sesiones_bloqueadas", varKey: "sesiones_bloqueadas" },
    { thresholdKey: "ip_long_ops", varKey: "long_ops" },
    { thresholdKey: "bg_proceso", varKey: "proceso_fondo", especial: "bg" },
    { thresholdKey: "im_sga_usado", varKey: "uso_sga" },
    { thresholdKey: "im_shared_pool", varKey: "shared_pool" },
    { thresholdKey: "im_buffer_cache", varKey: "buffer_cache" },
    { thresholdKey: "im_pga_usado", varKey: "pga_usado" },
    { thresholdKey: "im_pga_over_alloc", varKey: "pga_over_alloc" },
    { thresholdKey: "im_pga_cache_hit", varKey: "pga_cache_hit" },
    { thresholdKey: "ia_espacio_libre", varKey: "espacio_libre_general" },
    { thresholdKey: "ia_datafiles_offline", varKey: "datafiles_offline" },
    { thresholdKey: "ia_datafiles_problema", varKey: "datafiles_problema" },
    { thresholdKey: "ia_redo_problema", varKey: "redo_logs" }
  ];

  // Puntaje 0-100 asignado a cada nivel cualitativo, anclado a la escala del
  // ISBD (§18): normal ~ Óptimo/Saludable, advertencia ~ Advertencia,
  // alto ~ Degradado, critico ~ Crítico. IP/IM/IA promedian el puntaje de
  // sus variables (todas con el mismo peso dentro del indicador; el
  // documento solo pondera IP/IM/IA entre sí, no las variables internas).
  var NIVEL_PUNTAJE = { normal: 100, advertencia: 70, alto: 45, critico: 15 };

  // ---------- Textos bilingües (separado de TLD_TRANSLATIONS, solo sincronizado vía tld:langchange) ----------
  var STR = {
    es: {
      updated: "Actualizado: ",
      otherState: "cualquier otro estado",
      causasLabel: "Causas: ",
      statusLabels: {
        optimo: "Óptimo", saludable: "Saludable", advertencia: "Advertencia",
        degradado: "Degradado", critico: "Crítico", criticoAlerta: "Crítico (alerta activa)"
      },
      bgStatus: { activo: "ACTIVO", advertencia: "ADVERTENCIA" },
      stats: {
        procesosActuales: "Procesos actuales", limiteProcesos: "Límite procesos", utilizacion: "Utilización",
        nivelUtilizacion: "Nivel utilización",
        sesiones: "Sesiones", activas: "Activas", inactivas: "Inactivas", bloqueadas: "Bloqueadas", longOps: "Long ops",
        sgaTotal: "SGA total", sgaLibre: "SGA libre", usoSga: "Uso SGA", sharedPool: "Shared Pool", bufferCache: "Buffer Cache",
        pgaUso: "PGA en uso", pgaOverAlloc: "PGA over-alloc", pgaCacheHit: "PGA cache hit",
        datafilesOnline: "Datafiles ONLINE", datafilesOffline: "Datafiles OFFLINE", conProblemas: "Con problemas",
        tsNormales: "TS normales", tsAdvertencia: "TS advertencia", tsCriticos: "TS críticos",
        maxUsoTs: "Máx. uso TS", usoTemp: "Uso TEMP", redoOkProblema: "Redo OK / problema",
        espacioP1: "Espacio libre P1 (tablespace)", espacioP2: "Espacio libre P2 (TEMP)", espacioP3: "Espacio libre P3 (redo)"
      },
      tsChips: { normales: "normales", advertencia: "advertencia", criticos: "críticos" },
      chartMinData: "Se necesitan al menos 2 mediciones para graficar.",
      alertEmpty: "Sin alertas. Todos los componentes en rangos aceptables.",
      alertValor: "Valor: ",
      alertUmbral: " · Umbral: ",
      thresholdsHeaders: { variable: "Variable", normal: "Normal", advertencia: "Advertencia", alto: "Alto", critico: "Crítico" },
      alertComponentes: { procesos: "Procesos", memoria: "Memoria", archivos: "Archivos" },
      alertVariables: {
        sesiones_bloqueadas: "Sesiones bloqueadas", util_procesos: "Utilización procesos", long_ops: "Long ops",
        proceso_fondo: "Proceso de fondo",
        uso_sga: "Uso SGA", shared_pool: "Shared Pool", buffer_cache: "Buffer Cache", pga_usado: "PGA en uso",
        pga_over_alloc: "PGA over-alloc", pga_cache_hit: "PGA cache hit",
        datafiles_offline: "Datafiles OFFLINE", datafiles_problema: "Datafiles problema", redo_logs: "Redo logs",
        espacio_p1: "Espacio libre — tablespace principal", espacio_p2: "Espacio libre — TEMP", espacio_p3: "Salud de redo logs",
        espacio_libre_general: "Espacio libre (tablespace / TEMP / redo)"
      },
      alertNivelLabels: { normal: "NORMAL", critico: "CRÍTICO", alto: "ALTO", advertencia: "ADVERTENCIA" },
      alertDesc: {
        sesiones_bloqueadas_critico: function (p) { return "Existen " + p.n + " sesión(es) bloqueada(s). Revisar V$WAIT_CHAINS."; },
        util_procesos_advertencia: function () { return "Utilización de procesos/sesiones en zona de advertencia (70–84%)."; },
        util_procesos_alto: function () { return "Utilización de procesos/sesiones alta (85–94%)."; },
        util_procesos_critico: function () { return "Procesos/sesiones cerca del límite (≥95%). Revisar PROCESSES."; },
        long_ops_advertencia: function (p) { return p.n + " operación(es) prolongada(s) (V$SESSION_LONGOPS)."; },
        long_ops_alto: function (p) { return p.n + " operaciones prolongadas simultáneas — posible cuello de botella."; },
        proceso_fondo_critico: function (p) { return p.proceso + " no está en estado ACTIVO. Revisar procesos en segundo plano."; },
        uso_sga_advertencia: function () { return "Uso de SGA en zona de advertencia."; },
        uso_sga_alto: function () { return "Uso de SGA alto, poco espacio libre."; },
        uso_sga_critico: function () { return "SGA con espacio libre crítico."; },
        shared_pool_advertencia: function () { return "Shared Pool en zona de advertencia."; },
        shared_pool_alto: function () { return "Shared Pool con uso alto."; },
        shared_pool_critico: function () { return "Shared Pool prácticamente lleno."; },
        buffer_cache_advertencia: function () { return "Buffer Cache en zona de advertencia."; },
        buffer_cache_alto: function () { return "Buffer Cache con uso alto."; },
        buffer_cache_critico: function () { return "Buffer Cache prácticamente lleno."; },
        pga_usado_advertencia: function () { return "PGA en zona de advertencia respecto al target."; },
        pga_usado_alto: function () { return "PGA con uso alto respecto al target."; },
        pga_usado_critico: function () { return "PGA prácticamente en el límite del target."; },
        pga_over_alloc_advertencia: function () { return "Se detectaron over-allocations de PGA."; },
        pga_over_alloc_alto: function () { return "PGA con sobre-asignación relevante."; },
        pga_over_alloc_critico: function () { return "PGA con sobre-asignación severa."; },
        pga_cache_hit_advertencia: function () { return "Cache hit de PGA por debajo del deseable."; },
        pga_cache_hit_alto: function () { return "Cache hit de PGA bajo."; },
        pga_cache_hit_critico: function () { return "Cache hit de PGA muy bajo."; },
        datafiles_offline_critico: function (p) { return p.n + " datafile(s) OFFLINE."; },
        datafiles_problema_critico: function () { return "Datafiles con problemas de acceso."; },
        redo_logs_critico: function () { return "Problemas en grupos de redo log."; },
        espacio_libre_advertencia: function (p) { return "Espacio libre: " + p.libre + "% (mínimo requerido: 20%)."; },
        espacio_libre_alto: function (p) { return "Espacio libre bajo: " + p.libre + "% (mínimo requerido: 20%)."; },
        espacio_libre_critico: function (p) { return "Espacio libre crítico: " + p.libre + "% (mínimo requerido: 20%)."; }
      }
    },
    en: {
      updated: "Updated: ",
      otherState: "any other state",
      causasLabel: "Causes: ",
      statusLabels: {
        optimo: "Optimal", saludable: "Healthy", advertencia: "Warning",
        degradado: "Degraded", critico: "Critical", criticoAlerta: "Critical (active alert)"
      },
      bgStatus: { activo: "ACTIVE", advertencia: "WARNING" },
      stats: {
        procesosActuales: "Current processes", limiteProcesos: "Process limit", utilizacion: "Utilization",
        nivelUtilizacion: "Utilization level",
        sesiones: "Sessions", activas: "Active", inactivas: "Inactive", bloqueadas: "Blocked", longOps: "Long ops",
        sgaTotal: "Total SGA", sgaLibre: "Free SGA", usoSga: "SGA usage", sharedPool: "Shared Pool", bufferCache: "Buffer Cache",
        pgaUso: "PGA in use", pgaOverAlloc: "PGA over-alloc", pgaCacheHit: "PGA cache hit",
        datafilesOnline: "Datafiles ONLINE", datafilesOffline: "Datafiles OFFLINE", conProblemas: "With issues",
        tsNormales: "Normal TS", tsAdvertencia: "Warning TS", tsCriticos: "Critical TS",
        maxUsoTs: "Max TS usage", usoTemp: "TEMP usage", redoOkProblema: "Redo OK / issue",
        espacioP1: "Free space P1 (tablespace)", espacioP2: "Free space P2 (TEMP)", espacioP3: "Free space P3 (redo)"
      },
      tsChips: { normales: "normal", advertencia: "warning", criticos: "critical" },
      chartMinData: "At least 2 readings are needed to plot the chart.",
      alertEmpty: "No alerts. All components within acceptable ranges.",
      alertValor: "Value: ",
      alertUmbral: " · Threshold: ",
      thresholdsHeaders: { variable: "Variable", normal: "Normal", advertencia: "Warning", alto: "High", critico: "Critical" },
      alertComponentes: { procesos: "Processes", memoria: "Memory", archivos: "Files" },
      alertVariables: {
        sesiones_bloqueadas: "Blocked sessions", util_procesos: "Process utilization", long_ops: "Long ops",
        proceso_fondo: "Background process",
        uso_sga: "SGA usage", shared_pool: "Shared Pool", buffer_cache: "Buffer Cache", pga_usado: "PGA in use",
        pga_over_alloc: "PGA over-alloc", pga_cache_hit: "PGA cache hit",
        datafiles_offline: "Datafiles OFFLINE", datafiles_problema: "Datafiles issue", redo_logs: "Redo logs",
        espacio_p1: "Free space — main tablespace", espacio_p2: "Free space — TEMP", espacio_p3: "Redo log health",
        espacio_libre_general: "Free space (tablespace / TEMP / redo)"
      },
      alertNivelLabels: { normal: "NORMAL", critico: "CRITICAL", alto: "HIGH", advertencia: "WARNING" },
      alertDesc: {
        sesiones_bloqueadas_critico: function (p) { return "There " + (p.n === 1 ? "is" : "are") + " " + p.n + " blocked session(s). Check V$WAIT_CHAINS."; },
        util_procesos_advertencia: function () { return "Process/session utilization in warning range (70–84%)."; },
        util_procesos_alto: function () { return "High process/session utilization (85–94%)."; },
        util_procesos_critico: function () { return "Processes/sessions near the limit (≥95%). Check PROCESSES."; },
        long_ops_advertencia: function (p) { return p.n + " long-running operation(s) (V$SESSION_LONGOPS)."; },
        long_ops_alto: function (p) { return p.n + " simultaneous long-running operations — possible bottleneck."; },
        proceso_fondo_critico: function (p) { return p.proceso + " is not ACTIVE. Check background processes."; },
        uso_sga_advertencia: function () { return "SGA usage in warning range."; },
        uso_sga_alto: function () { return "SGA usage high, little free space."; },
        uso_sga_critico: function () { return "SGA free space is critical."; },
        shared_pool_advertencia: function () { return "Shared Pool in warning range."; },
        shared_pool_alto: function () { return "Shared Pool usage high."; },
        shared_pool_critico: function () { return "Shared Pool nearly full."; },
        buffer_cache_advertencia: function () { return "Buffer Cache in warning range."; },
        buffer_cache_alto: function () { return "Buffer Cache usage high."; },
        buffer_cache_critico: function () { return "Buffer Cache nearly full."; },
        pga_usado_advertencia: function () { return "PGA in warning range relative to target."; },
        pga_usado_alto: function () { return "PGA usage high relative to target."; },
        pga_usado_critico: function () { return "PGA nearly at the target limit."; },
        pga_over_alloc_advertencia: function () { return "PGA over-allocations detected."; },
        pga_over_alloc_alto: function () { return "Significant PGA over-allocation."; },
        pga_over_alloc_critico: function () { return "Severe PGA over-allocation."; },
        pga_cache_hit_advertencia: function () { return "PGA cache hit rate below the desired level."; },
        pga_cache_hit_alto: function () { return "PGA cache hit rate low."; },
        pga_cache_hit_critico: function () { return "PGA cache hit rate very low."; },
        datafiles_offline_critico: function (p) { return p.n + " datafile(s) OFFLINE."; },
        datafiles_problema_critico: function () { return "Datafiles with access issues."; },
        redo_logs_critico: function () { return "Issues in redo log groups."; },
        espacio_libre_advertencia: function (p) { return "Free space: " + p.libre + "% (required minimum: 20%)."; },
        espacio_libre_alto: function (p) { return "Low free space: " + p.libre + "% (required minimum: 20%)."; },
        espacio_libre_critico: function (p) { return "Critical free space: " + p.libre + "% (required minimum: 20%)."; }
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
  function round1(v) { return Math.round(v * 10) / 10; }
  function promedio(arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; }

  // Busca la banda (límite inferior/superior) donde cae `valor` dentro de una tabla de THRESHOLDS.
  function bandaPara(tabla, valor) {
    var bandas = tabla.bandas;
    for (var i = 0; i < bandas.length; i++) {
      var b = bandas[i];
      if (valor >= b.limiteInferior && valor <= b.limiteSuperior) return b;
    }
    return bandas[bandas.length - 1];
  }

  // Convierte una banda en texto de rango legible para la leyenda de umbrales ("70–84%", "≥95%", "0").
  function rangoTexto(tabla, banda) {
    var suf = tabla.esPorcentaje ? "%" : "";
    if (banda.limiteSuperior === Infinity) return "≥" + banda.limiteInferior + suf;
    if (banda.limiteInferior === banda.limiteSuperior) return banda.limiteInferior + suf;
    return banda.limiteInferior + "–" + banda.limiteSuperior + suf;
  }

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

  // IP = max(procesos/límite, sesiones/límite) × 100 (§7) + sesiones bloqueadas + long ops + procesos de fondo.
  function calcIP(m) {
    var utilProc = (m.processesCurrent / m.processesLimit) * 100;
    var utilSess = (m.sessionsCurrent / m.sessionsLimit) * 100;
    var util = Math.max(utilProc, utilSess);
    var bUtil = bandaPara(THRESHOLDS.ip_utilizacion, util);
    var bBloq = bandaPara(THRESHOLDS.ip_sesiones_bloqueadas, m.sessionsBlocked);
    var bLong = bandaPara(THRESHOLDS.ip_long_ops, m.longOps);
    var bgProblema = Object.keys(m.bg).some(function (name) { return m.bg[name] !== "activo"; });
    var score = clamp(round1(promedio([
      NIVEL_PUNTAJE[bUtil.nivel],
      NIVEL_PUNTAJE[bBloq.nivel],
      NIVEL_PUNTAJE[bLong.nivel],
      bgProblema ? NIVEL_PUNTAJE.critico : NIVEL_PUNTAJE.normal
    ])), 0, 100);
    return {
      score: score,
      util: round1(util), utilProc: round1(utilProc), utilSess: round1(utilSess),
      nivelUtilizacion: bUtil.nivel,
      details: m
    };
  }

  // IM: promedio de nivel de SGA, Shared Pool, Buffer Cache, PGA usada, over-allocation y cache hit.
  function calcIM(m) {
    var sgaUsedPct = ((m.sgaTotalMb - m.sgaFreeMb) / m.sgaTotalMb) * 100;
    var pgaUsedPct = (m.pgaInuseMb / m.pgaTargetMb) * 100;
    var bSga = bandaPara(THRESHOLDS.im_sga_usado, sgaUsedPct);
    var bShared = bandaPara(THRESHOLDS.im_shared_pool, m.sharedPoolPct);
    var bBuffer = bandaPara(THRESHOLDS.im_buffer_cache, m.bufferCachePct);
    var bPga = bandaPara(THRESHOLDS.im_pga_usado, pgaUsedPct);
    var bOverAlloc = bandaPara(THRESHOLDS.im_pga_over_alloc, m.pgaOverAlloc);
    var bCacheHit = bandaPara(THRESHOLDS.im_pga_cache_hit, m.pgaCacheHitPct);
    var score = clamp(round1(promedio([
      NIVEL_PUNTAJE[bSga.nivel], NIVEL_PUNTAJE[bShared.nivel], NIVEL_PUNTAJE[bBuffer.nivel],
      NIVEL_PUNTAJE[bPga.nivel], NIVEL_PUNTAJE[bOverAlloc.nivel], NIVEL_PUNTAJE[bCacheHit.nivel]
    ])), 0, 100);
    return { score: score, sgaUsedPct: round1(sgaUsedPct), pgaUsedPct: round1(pgaUsedPct), details: m };
  }

  // IA: espacio libre ponderado (propuesta de pizarra) + disponibilidad de datafiles/redo.
  // P1 = % libre en el tablespace de mayor uso · P2 = % libre en TEMP · P3 = % de grupos redo saludables.
  // Regla: se exige un mínimo de 20% de espacio libre (si Pi < 20% dispara alerta).
  function calcIA(m) {
    var p1 = clamp(100 - m.maxTablespaceUsedPct, 0, 100);
    var p2 = clamp(100 - m.tempUsedPct, 0, 100);
    var totalRedo = m.redoGroupsOk + m.redoGroupsProblem;
    var p3 = totalRedo > 0 ? (m.redoGroupsOk / totalRedo) * 100 : 100;
    var bP1 = bandaPara(THRESHOLDS.ia_espacio_libre, p1);
    var bP2 = bandaPara(THRESHOLDS.ia_espacio_libre, p2);
    var bP3 = bandaPara(THRESHOLDS.ia_espacio_libre, p3);
    var bOffline = bandaPara(THRESHOLDS.ia_datafiles_offline, m.datafilesOffline);
    var bProblema = bandaPara(THRESHOLDS.ia_datafiles_problema, m.datafilesProblem);
    var bRedoProblema = bandaPara(THRESHOLDS.ia_redo_problema, m.redoGroupsProblem);
    var score = clamp(round1(promedio([
      NIVEL_PUNTAJE[bP1.nivel], NIVEL_PUNTAJE[bP2.nivel], NIVEL_PUNTAJE[bP3.nivel],
      NIVEL_PUNTAJE[bOffline.nivel], NIVEL_PUNTAJE[bProblema.nivel], NIVEL_PUNTAJE[bRedoProblema.nivel]
    ])), 0, 100);
    return {
      score: score,
      p1: round1(p1), p2: round1(p2), p3: round1(p3),
      details: m
    };
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

  function alerta(nivel, componente, variable, descKey, params, valor, umbral) {
    return { nivel: nivel, componente: componente, variable: variable, descKey: descKey, params: params, valor: valor, umbral: umbral };
  }

  function buildAlerts(m, ip, im, ia) {
    var alerts = [];

    if (m.sessionsBlocked > 0) {
      alerts.push(alerta("critico", "procesos", "sesiones_bloqueadas", "sesiones_bloqueadas_critico", { n: m.sessionsBlocked }, m.sessionsBlocked, "0"));
    }
    var bUtil = bandaPara(THRESHOLDS.ip_utilizacion, ip.util);
    if (bUtil.nivel !== "normal") {
      alerts.push(alerta(bUtil.nivel, "procesos", "util_procesos", "util_procesos_" + bUtil.nivel, {}, ip.util + "%", rangoTexto(THRESHOLDS.ip_utilizacion, bUtil)));
    }
    var bLong = bandaPara(THRESHOLDS.ip_long_ops, m.longOps);
    if (bLong.nivel !== "normal") {
      alerts.push(alerta(bLong.nivel, "procesos", "long_ops", "long_ops_" + bLong.nivel, { n: m.longOps }, m.longOps, "0"));
    }
    // Procesos de fondo: cualquier proceso importante (DBWn/LGWR/SMON/PMON/CKPT) fuera de ACTIVO es crítico.
    Object.keys(m.bg).forEach(function (name) {
      if (m.bg[name] !== "activo") {
        alerts.push(alerta("critico", "procesos", "proceso_fondo", "proceso_fondo_critico", { proceso: name }, name, "activo"));
      }
    });

    var bSga = bandaPara(THRESHOLDS.im_sga_usado, im.sgaUsedPct);
    if (bSga.nivel !== "normal") alerts.push(alerta(bSga.nivel, "memoria", "uso_sga", "uso_sga_" + bSga.nivel, {}, im.sgaUsedPct + "%", rangoTexto(THRESHOLDS.im_sga_usado, bSga)));
    var bShared = bandaPara(THRESHOLDS.im_shared_pool, m.sharedPoolPct);
    if (bShared.nivel !== "normal") alerts.push(alerta(bShared.nivel, "memoria", "shared_pool", "shared_pool_" + bShared.nivel, {}, m.sharedPoolPct.toFixed(0) + "%", rangoTexto(THRESHOLDS.im_shared_pool, bShared)));
    var bBuffer = bandaPara(THRESHOLDS.im_buffer_cache, m.bufferCachePct);
    if (bBuffer.nivel !== "normal") alerts.push(alerta(bBuffer.nivel, "memoria", "buffer_cache", "buffer_cache_" + bBuffer.nivel, {}, m.bufferCachePct.toFixed(0) + "%", rangoTexto(THRESHOLDS.im_buffer_cache, bBuffer)));
    var bPgaUsado = bandaPara(THRESHOLDS.im_pga_usado, im.pgaUsedPct);
    if (bPgaUsado.nivel !== "normal") alerts.push(alerta(bPgaUsado.nivel, "memoria", "pga_usado", "pga_usado_" + bPgaUsado.nivel, {}, im.pgaUsedPct + "%", rangoTexto(THRESHOLDS.im_pga_usado, bPgaUsado)));
    var bOverAlloc = bandaPara(THRESHOLDS.im_pga_over_alloc, m.pgaOverAlloc);
    if (bOverAlloc.nivel !== "normal") alerts.push(alerta(bOverAlloc.nivel, "memoria", "pga_over_alloc", "pga_over_alloc_" + bOverAlloc.nivel, { n: m.pgaOverAlloc }, m.pgaOverAlloc, "0"));
    var bCacheHit = bandaPara(THRESHOLDS.im_pga_cache_hit, m.pgaCacheHitPct);
    if (bCacheHit.nivel !== "normal") alerts.push(alerta(bCacheHit.nivel, "memoria", "pga_cache_hit", "pga_cache_hit_" + bCacheHit.nivel, {}, m.pgaCacheHitPct.toFixed(1) + "%", rangoTexto(THRESHOLDS.im_pga_cache_hit, bCacheHit)));

    var bOffline = bandaPara(THRESHOLDS.ia_datafiles_offline, m.datafilesOffline);
    if (bOffline.nivel !== "normal") alerts.push(alerta(bOffline.nivel, "archivos", "datafiles_offline", "datafiles_offline_critico", { n: m.datafilesOffline }, m.datafilesOffline, "0"));
    var bProblema = bandaPara(THRESHOLDS.ia_datafiles_problema, m.datafilesProblem);
    if (bProblema.nivel !== "normal") alerts.push(alerta(bProblema.nivel, "archivos", "datafiles_problema", "datafiles_problema_critico", {}, m.datafilesProblem, "0"));
    var bRedo = bandaPara(THRESHOLDS.ia_redo_problema, m.redoGroupsProblem);
    if (bRedo.nivel !== "normal") alerts.push(alerta(bRedo.nivel, "archivos", "redo_logs", "redo_logs_critico", {}, m.redoGroupsProblem, "0"));

    var bP1 = bandaPara(THRESHOLDS.ia_espacio_libre, ia.p1);
    if (bP1.nivel !== "normal") alerts.push(alerta(bP1.nivel, "archivos", "espacio_p1", "espacio_libre_" + bP1.nivel, { libre: ia.p1.toFixed(0) }, ia.p1.toFixed(0) + "%", "≥20%"));
    var bP2 = bandaPara(THRESHOLDS.ia_espacio_libre, ia.p2);
    if (bP2.nivel !== "normal") alerts.push(alerta(bP2.nivel, "archivos", "espacio_p2", "espacio_libre_" + bP2.nivel, { libre: ia.p2.toFixed(0) }, ia.p2.toFixed(0) + "%", "≥20%"));
    var bP3 = bandaPara(THRESHOLDS.ia_espacio_libre, ia.p3);
    if (bP3.nivel !== "normal") alerts.push(alerta(bP3.nivel, "archivos", "espacio_p3", "espacio_libre_" + bP3.nivel, { libre: ia.p3.toFixed(0) }, ia.p3.toFixed(0) + "%", "≥20%"));

    var order = { critico: 1, alto: 2, advertencia: 3 };
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

  // Renderiza la leyenda "Métricas y umbrales" a partir de THRESHOLDS — nunca se escribe a mano,
  // así que no puede desincronizarse de los umbrales que realmente usan calcIP/calcIM/calcIA/buildAlerts.
  function renderThresholdsTable() {
    var S = tr();
    var el = document.getElementById("mon-thresholds-table");
    if (!el) return;
    var rows = LEGEND_ROWS.map(function (row) {
      var tabla = THRESHOLDS[row.thresholdKey];
      var varLabel = S.alertVariables[row.varKey] || row.varKey;
      var cells = { normal: "—", advertencia: "—", alto: "—", critico: "—" };
      if (row.especial === "bg") {
        cells.normal = S.bgStatus.activo;
        cells.critico = S.otherState;
      } else {
        tabla.bandas.forEach(function (b) { cells[b.nivel] = rangoTexto(tabla, b); });
      }
      return "<tr><td>" + varLabel + "</td><td>" + cells.normal + "</td><td>" + cells.advertencia +
        "</td><td>" + cells.alto + "</td><td>" + cells.critico + "</td></tr>";
    }).join("");
    el.innerHTML =
      '<table class="mon-thresholds-table-el"><thead><tr>' +
      "<th>" + S.thresholdsHeaders.variable + "</th>" +
      "<th>" + S.thresholdsHeaders.normal + "</th>" +
      "<th>" + S.thresholdsHeaders.advertencia + "</th>" +
      "<th>" + S.thresholdsHeaders.alto + "</th>" +
      "<th>" + S.thresholdsHeaders.critico + "</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table>";
  }

  function renderAll(ip, im, ia, isbd, alerts) {
    var S = tr();
    var m = ip.details;
    var stISBD = statusFromScore(isbd);
    // El índice general no debe esconder un problema crítico (documento §20):
    // si existe al menos una alerta crítica, el badge del ISBD siempre lo refleja,
    // sin importar qué tan alto sea el puntaje ponderado.
    var criticos = alerts.filter(function (a) { return a.nivel === "critico"; });
    var isbdLabel = S.statusLabels[stISBD.key];
    if (criticos.length) {
      stISBD = { key: "critico", cls: "st-critico" };
      isbdLabel = S.statusLabels.criticoAlerta;
    }

    document.getElementById("mon-isbd-value").textContent = isbd.toFixed(2);
    var isbdStatusEl = document.getElementById("mon-isbd-status");
    isbdStatusEl.textContent = isbdLabel;
    isbdStatusEl.className = "mon-badge " + stISBD.cls;
    document.getElementById("mon-isbd-card").className = "mon-isbd " + stISBD.cls;

    var causasEl = document.getElementById("mon-isbd-causas");
    if (causasEl) {
      if (criticos.length) {
        document.getElementById("mon-isbd-causas-label").textContent = S.causasLabel;
        document.getElementById("mon-isbd-causas-list").innerHTML = criticos.slice(0, 4).map(function (a) {
          var compLabel = S.alertComponentes[a.componente] || a.componente;
          var varLabel = S.alertVariables[a.variable] || a.variable;
          return "<li>" + compLabel + " · " + varLabel + "</li>";
        }).join("");
        causasEl.hidden = false;
      } else {
        causasEl.hidden = true;
      }
    }

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
      stat(S.stats.nivelUtilizacion, S.alertNivelLabels[ip.nivelUtilizacion]),
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
      stat(S.stats.redoOkProblema, m.redoGroupsOk + " / " + m.redoGroupsProblem),
      stat(S.stats.espacioP1, ia.p1 + "%"),
      stat(S.stats.espacioP2, ia.p2 + "%"),
      stat(S.stats.espacioP3, ia.p3 + "%")
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
        var umbral = a.variable === "proceso_fondo" ? S.bgStatus.activo : a.umbral;
        return '<li class="mon-alert-item ' + cls + '">' +
          '<div class="mon-alert-title"><strong>' + compLabel + "</strong> · " + varLabel + "</div>" +
          '<div class="mon-alert-desc">' + desc + "</div>" +
          '<div class="mon-alert-meta">' + S.alertValor + a.valor + S.alertUmbral + umbral + " · " + nivelLabel + "</div>" +
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
    var alerts = buildAlerts(metrics, ip, im, ia);
    var ts = new Date();
    lastResult = { ip: ip, im: im, ia: ia, isbd: isbd, alerts: alerts, ts: ts };
    renderAll(ip, im, ia, isbd, alerts);
    drawHistory(pushHistory(isbd, ip, im, ia));
    updateTimestamp(ts);
  }

  // Re-renderiza la última medición ya calculada, sin resimular ni empujar historial nuevo.
  function rerenderCurrent() {
    renderThresholdsTable();
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
    renderThresholdsTable();
    collectAndRender();
    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
