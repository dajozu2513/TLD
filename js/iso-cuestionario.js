document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("isoq-controls")) return; // la sección no está en esta página

  // La sesión en sí (usuario o invitado) ya se exige antes, vía el
  // guard de la página evaluacion.html.
  initIsoCuestionario();
});

function initIsoCuestionario() {

    const API_BASE = "http://localhost:3000/api";
  let auditoriaActual = null;

  // Progreso guardado localmente, para que el usuario pueda retomar el
  // cuestionario más tarde sin perder lo ya respondido. Se guarda por
  // sesión (correo si es usuario registrado, clave compartida si es
  // invitado) ya que la "autenticación" del sitio vive en localStorage
  // (ver js/auth.js).
  function progresoStorageKey() {
    let session = null;
    try {
      session = (typeof TLD_AUTH !== "undefined" && typeof TLD_AUTH.getSession === "function")
        ? TLD_AUTH.getSession() : null;
    } catch (err) { /* ignore */ }
    const id = (session && session.type === "user" && session.email) ? session.email : "invitado";
    return `tld_iso_progreso_${id}`;
  }

  async function guardarEnBaseDeDatos(resultados) {
    try {
      const orgNombre = document.getElementById("isoq-f-org")?.value?.trim() || "Organización demo";
      const area = document.getElementById("isoq-f-area")?.value?.trim() || "Área demo";
      const fecha = document.getElementById("isoq-f-fecha")?.value || new Date().toISOString().slice(0, 10);

      // 1) Crear organización
      const orgRes = await fetch(`${API_BASE}/organizaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: orgNombre }),
      });
      if (!orgRes.ok) throw new Error("organizacion");
      const org = await orgRes.json();

      // 2) Crear auditoría
      const audRes = await fetch(`${API_BASE}/auditorias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_organizacion: org.id_organizacion,
          area_evaluada: area,
          fecha_auditoria: fecha,
        }),
      });
      if (!audRes.ok) throw new Error("auditoria");
      const aud = await audRes.json();
      auditoriaActual = aud;

      // 3) Armar respuestas (id_pregunta = (id_control-1)*3 + número de pregunta)
      const payload = [];
      resultados.forEach((r) => {
        r.respuestas.forEach((val, idx) => {
          if (!val || val === null) return;
          payload.push({
            id_pregunta: (r.id - 1) * 3 + (idx + 1),
            valor_respuesta: val.toUpperCase(), // si/no/na → SI/NO/NA
            observaciones: r.observaciones || null,
          });
        });
      });

      if (payload.length) {
        await fetch(`${API_BASE}/auditorias/${aud.id_auditoria}/respuestas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      // 4) Calcular y persistir en RESULTADO_*
      const calcRes = await fetch(`${API_BASE}/auditorias/${aud.id_auditoria}/calcular`, {
        method: "POST",
      });
      if (!calcRes.ok) throw new Error("calcular");

      console.log(" Auditoría guardada en la base. id_auditoria =", aud.id_auditoria);
      alert("Reporte generado y guardado en la base de datos (id " + aud.id_auditoria + ")");
    } catch (err) {
      console.error("No se pudo guardar en la base:", err);
      alert("El reporte se generó en pantalla, pero no se pudo guardar en la base. ¿Está corriendo el backend?");
    }
  }
 
  // ---------- Catálogo de controles (bilingüe) ----------
  const CONTROLES = [
    { id:1,  codigo:"5.9",       dominio:"Organizacional", peso:3, cid:{C:1,I:1,D:0},
      nombre:{es:"Inventario de activos", en:"Asset inventory"},
      sujeto:{es:"el inventario de activos de información", en:"the inventory of information assets"} },
    { id:2,  codigo:"5.12",      dominio:"Organizacional", peso:3, cid:{C:1,I:0,D:0},
      nombre:{es:"Clasificación de la información", en:"Information classification"},
      sujeto:{es:"la clasificación de la información", en:"the classification of information"} },
    { id:3,  codigo:"5.16",      dominio:"Organizacional", peso:4, cid:{C:1,I:1,D:0},
      nombre:{es:"Gestión de identidades", en:"Identity management"},
      sujeto:{es:"la gestión de identidades de usuario", en:"the management of user identities"} },
    { id:4,  codigo:"5.15",      dominio:"Organizacional", peso:5, cid:{C:1,I:1,D:0},
      nombre:{es:"Control de acceso", en:"Access control"},
      sujeto:{es:"el control de acceso a la base de datos", en:"access control to the database"} },
    { id:5,  codigo:"8.5",       dominio:"Tecnológico", peso:5, cid:{C:1,I:0,D:0},
      nombre:{es:"Autenticación", en:"Authentication"},
      sujeto:{es:"la autenticación de usuarios", en:"user authentication"} },
    { id:6,  codigo:"8.15/8.16", dominio:"Tecnológico", peso:4, cid:{C:1,I:1,D:0},
      nombre:{es:"Registro y monitoreo", en:"Logging and monitoring"},
      sujeto:{es:"el registro y monitoreo de eventos", en:"the logging and monitoring of events"} },
    { id:7,  codigo:"8.9",       dominio:"Tecnológico", peso:4, cid:{C:1,I:1,D:1},
      nombre:{es:"Gestión de configuraciones", en:"Configuration management"},
      sujeto:{es:"la gestión segura de configuraciones del motor de base de datos", en:"secure configuration management of the database engine"} },
    { id:8,  codigo:"8.13",      dominio:"Tecnológico", peso:5, cid:{C:1,I:1,D:1},
      nombre:{es:"Copias de seguridad", en:"Backup"},
      sujeto:{es:"el respaldo (copias de seguridad) de la información", en:"the backup of information"} },
    { id:9,  codigo:"5.30",      dominio:"Organizacional", peso:4, cid:{C:0,I:0,D:1},
      nombre:{es:"Recuperación ante desastres", en:"Disaster recovery"},
      sujeto:{es:"el plan de recuperación ante desastres", en:"the disaster recovery plan"} },
    { id:10, codigo:"8.24",      dominio:"Tecnológico", peso:5, cid:{C:1,I:1,D:0},
      nombre:{es:"Cifrado de la información", en:"Information encryption"},
      sujeto:{es:"el cifrado de la información", en:"the encryption of information"} },
    { id:11, codigo:"8.10",      dominio:"Tecnológico", peso:3, cid:{C:1,I:0,D:0},
      nombre:{es:"Eliminación segura de la información", en:"Secure data disposal"},
      sujeto:{es:"la eliminación segura de la información", en:"the secure disposal of information"} },
    { id:12, codigo:"8.12",      dominio:"Tecnológico", peso:4, cid:{C:1,I:0,D:0},
      nombre:{es:"Prevención de fuga de datos", en:"Data leak prevention"},
      sujeto:{es:"la prevención de fuga de datos (DLP)", en:"data leakage prevention (DLP)"} },
    { id:13, codigo:"7.1",       dominio:"Físico", peso:3, cid:{C:0,I:0,D:1},
      nombre:{es:"Seguridad física", en:"Physical security"},
      sujeto:{es:"la seguridad física de los servidores de base de datos", en:"the physical security of database servers"} },
    { id:14, codigo:"5.19",      dominio:"Organizacional", peso:3, cid:{C:1,I:1,D:1},
      nombre:{es:"Seguridad con proveedores", en:"Vendor security"},
      sujeto:{es:"la seguridad con proveedores externos", en:"security with external providers"} },
    { id:15, codigo:"5.29",      dominio:"Organizacional", peso:4, cid:{C:1,I:1,D:1},
      nombre:{es:"Continuidad del negocio", en:"Business continuity"},
      sujeto:{es:"la continuidad del negocio", en:"business continuity"} },
  ];
 
  const DOMINIOS = {
    es: ["Organizacional", "Tecnológico", "Físico"],
    en: { "Organizacional": "Organizational", "Tecnológico": "Technological", "Físico": "Physical" }
  };
 
  function dominioLabel(dom, lang) {
    return lang === "en" ? DOMINIOS.en[dom] : dom;
  }
 
  // ---------- Textos de interfaz (bilingüe) ----------
  const STR = {
    es: {
      navLink: "Evaluación ISO",
      eyebrow: "Herramienta de auditoría",
      title: "Cuestionario de evaluación ISO/IEC 27002",
      lead: "Evalúe los 15 controles de seguridad seleccionados para la administración de bases de datos. El sistema calcula en vivo el nivel de madurez, el porcentaje de cumplimiento y la exposición al riesgo de Confidencialidad, Integridad y Disponibilidad.",
      methodNote: "¿Cómo se calcula? Por cada control: Madurez = redondeo((Sí / preguntas aplicables) × 5). Cumplimiento % = (Madurez/5) × 100. Exposición al riesgo % = 100 − Cumplimiento. La exposición de Confidencialidad, Integridad y Disponibilidad es el promedio de los controles que afectan cada dimensión, y el índice general es el promedio de esas tres.",
      legendRiskLabels: { muybajo:"Muy bajo", bajo:"Bajo", medio:"Medio", alto:"Alto", critico:"Crítico" },
      introTitle: "Datos de la auditoría",
      introLead: "Organización, área y responsables de esta evaluación.",
      fieldOrg: "Organización", fieldOrgPh: "Nombre de la organización",
      fieldArea: "Área evaluada", fieldAreaPh: "Ej. Producción SQL Server",
      fieldAuditor: "Auditor", fieldAuditorPh: "Nombre del auditor",
      fieldFecha: "Fecha",
      kpiIndice: "Índice general de riesgo",
      kpiExpC: "Exposición Confidencialidad",
      kpiExpI: "Exposición Integridad",
      kpiExpD: "Exposición Disponibilidad",
      kpiEvaluados: "Controles evaluados",
      controlesLabel: n => n === 1 ? "control" : "controles",
      peso: "Peso",
      q1: s => `¿Existe evidencia de que ${s} se aplica, aunque sea de forma informal?`,
      q2: s => `¿${s.charAt(0).toUpperCase()+s.slice(1)} está documentado(a) y aplicado(a) de forma consistente en la organización?`,
      q3: s => `¿${s.charAt(0).toUpperCase()+s.slice(1)} se supervisa, mide y mejora continuamente?`,
      optSi: "Sí", optNo: "No", optNa: "No aplica",
      obsLabel: "Observaciones / evidencia encontrada",
      obsPh: "Comentarios del auditor, referencia de evidencia adjunta, etc.",
      statusSinResponder: "Sin responder", statusIncompleto: "Incompleto", statusNoAplica: "No aplica",
      subSinResponder: "Madurez — · Cumplimiento —",
      subIncompleto: n => `${n}/3 preguntas respondidas`,
      subNoAplica: "Excluido del cálculo de madurez y riesgo",
      subEvaluado: (m,c) => `Madurez ${m}/5 · Cumplimiento ${c.toFixed(0)}%`,
      btnReset: "Limpiar respuestas",
      btnReporte: "Generar reporte ejecutivo",
      btnGuardarProgreso: "Guardar progreso",
      progresoGuardadoMsg: "Progreso guardado. Puede continuar el cuestionario más tarde desde este mismo equipo.",
      reportEmpty: "Responda al menos un control para generar el reporte ejecutivo.",
      reportTitle: "Reporte ejecutivo de auditoría",
      reportArea: "Área", reportAuditor: "Auditor", reportFecha: "Fecha",
      reportOrgDefault: "Organización no especificada",
      sectionDominio: "Resultados por dominio",
      thDominio: "Dominio", thEvaluados: "Controles evaluados", thMadurezProm: "Madurez promedio ponderada",
      sinDatos: "Sin datos",
      sectionTopRiesgo: "Controles con mayor exposición al riesgo",
      sectionTopMadurez: "Controles con menor nivel de madurez",
      madurezWord: "Madurez",
      sectionHeat: "Mapa de calor por control",
    },
    en: {
      navLink: "ISO Assessment",
      eyebrow: "Audit tool",
      title: "ISO/IEC 27002 Assessment Questionnaire",
      lead: "Assess the 15 security controls selected for database administration. The system calculates in real time the maturity level, compliance percentage and risk exposure for Confidentiality, Integrity and Availability.",
      methodNote: "How is it calculated? For each control: Maturity = round((Yes / applicable questions) × 5). Compliance % = (Maturity/5) × 100. Risk exposure % = 100 − Compliance. Confidentiality, Integrity and Availability exposure is the average of the controls affecting each dimension, and the overall index is the average of those three.",
      legendRiskLabels: { muybajo:"Very low", bajo:"Low", medio:"Medium", alto:"High", critico:"Critical" },
      introTitle: "Audit information",
      introLead: "Organization, area and people responsible for this assessment.",
      fieldOrg: "Organization", fieldOrgPh: "Organization name",
      fieldArea: "Area assessed", fieldAreaPh: "E.g. SQL Server production",
      fieldAuditor: "Auditor", fieldAuditorPh: "Auditor's name",
      fieldFecha: "Date",
      kpiIndice: "Overall risk index",
      kpiExpC: "Confidentiality exposure",
      kpiExpI: "Integrity exposure",
      kpiExpD: "Availability exposure",
      kpiEvaluados: "Controls assessed",
      controlesLabel: n => n === 1 ? "control" : "controls",
      peso: "Weight",
      q1: s => `Is there evidence that ${s} is applied, even informally?`,
      q2: s => `Is ${s} documented and applied consistently across the organization?`,
      q3: s => `Is ${s} monitored, measured and continuously improved?`,
      optSi: "Yes", optNo: "No", optNa: "N/A",
      obsLabel: "Observations / evidence found",
      obsPh: "Auditor's comments, reference to attached evidence, etc.",
      statusSinResponder: "Not answered", statusIncompleto: "Incomplete", statusNoAplica: "N/A",
      subSinResponder: "Maturity — · Compliance —",
      subIncompleto: n => `${n}/3 questions answered`,
      subNoAplica: "Excluded from the maturity and risk calculation",
      subEvaluado: (m,c) => `Maturity ${m}/5 · Compliance ${c.toFixed(0)}%`,
      btnReset: "Clear answers",
      btnReporte: "Generate executive report",
      btnGuardarProgreso: "Save progress",
      progresoGuardadoMsg: "Progress saved. You can continue the questionnaire later from this same device.",
      reportEmpty: "Answer at least one control to generate the executive report.",
      reportTitle: "Executive audit report",
      reportArea: "Area", reportAuditor: "Auditor", reportFecha: "Date",
      reportOrgDefault: "Organization not specified",
      sectionDominio: "Results by domain",
      thDominio: "Domain", thEvaluados: "Controls assessed", thMadurezProm: "Weighted average maturity",
      sinDatos: "No data",
      sectionTopRiesgo: "Controls with highest risk exposure",
      sectionTopMadurez: "Controls with lowest maturity level",
      madurezWord: "Maturity",
      sectionHeat: "Risk heat map by control",
    }
  };
 
  function currentLang() {
    return (typeof TLD_I18N !== "undefined" && typeof TLD_I18N.getLang === "function") ? TLD_I18N.getLang() : "es";
  }
 
  function riesgoDe(exposicion, lang) {
    const L = STR[lang].legendRiskLabels;
    if (exposicion <= 20) return { label: L.muybajo, cls: "isoq-verde" };
    if (exposicion <= 40) return { label: L.bajo, cls: "isoq-verde" };
    if (exposicion <= 60) return { label: L.medio, cls: "isoq-amarillo" };
    if (exposicion <= 80) return { label: L.alto, cls: "isoq-naranja" };
    return { label: L.critico, cls: "isoq-rojo" };
  }
 
  const container = document.getElementById("isoq-controls");
  let lang = currentLang();
 
  // ---------- Construcción inicial del DOM (una sola vez) ----------
  DOMINIOS.es.forEach(dom => {
    const items = CONTROLES.filter(c => c.dominio === dom);
    if (!items.length) return;
 
    const block = document.createElement("div");
    block.className = "isoq-domain-block";
    block.dataset.dominio = dom;
    block.innerHTML = `<div class="isoq-domain-title"><h3 data-role="domain-name"></h3><span data-role="domain-count"></span></div>`;
 
    items.forEach(c => {
      const card = document.createElement("div");
      card.className = "isoq-control-card";
      card.dataset.controlId = c.id;
      card.innerHTML = `
        <div class="isoq-control-head">
          <div>
            <h4 data-role="control-name"></h4>
            <div class="isoq-control-meta">
              <code>ISO ${c.codigo}</code> &nbsp;·&nbsp;
              <span data-role="peso-label"></span> ${c.peso}/5
              <span class="isoq-cid-tags">
                <span class="${c.cid.C ? "is-active" : ""}">C</span>
                <span class="${c.cid.I ? "is-active" : ""}">I</span>
                <span class="${c.cid.D ? "is-active" : ""}">D</span>
              </span>
            </div>
          </div>
          <div class="isoq-control-status">
            <span class="isoq-status-pill" data-status></span>
            <div class="isoq-status-sub" data-status-sub></div>
          </div>
        </div>
 
        ${[1, 2, 3].map(i => `
          <div class="isoq-q-row">
            <p><span data-role="q-index">${i}</span>. <span data-role="q${i}-text"></span></p>
            <div class="isoq-q-options">
              <label><input type="radio" name="c${c.id}_q${i}" value="si"> <span data-role="opt-si"></span></label>
              <label><input type="radio" name="c${c.id}_q${i}" value="no"> <span data-role="opt-no"></span></label>
              <label><input type="radio" name="c${c.id}_q${i}" value="na"> <span data-role="opt-na"></span></label>
            </div>
          </div>
        `).join("")}
 
        <div class="isoq-obs-row">
          <label data-role="obs-label"></label>
          <textarea data-obs data-role="obs-placeholder"></textarea>
        </div>
      `;
      block.appendChild(card);
    });
 
    container.appendChild(block);
  });
 
  // ---------- Traducción de todo lo estático (inicial + en cada cambio de idioma) ----------
  function applyTexts() {
    const S = STR[lang];
 
    const navLink = document.getElementById("isoq-nav-link");
    if (navLink) navLink.textContent = S.navLink;
 
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText("isoq-eyebrow", S.eyebrow);
    setText("isoq-h2", S.title);
    setText("isoq-lead", S.lead);
    setText("isoq-method-note", S.methodNote);
    setText("isoq-intro-title", S.introTitle);
    setText("isoq-intro-lead", S.introLead);
 
    const setLabelPh = (labelId, phId, labelTxt, phTxt) => {
      setText(labelId, labelTxt);
      const ph = document.getElementById(phId);
      if (ph) ph.setAttribute("placeholder", phTxt);
    };
    setLabelPh("isoq-label-org", null, S.fieldOrg, null);
    document.getElementById("isoq-f-org")?.setAttribute("placeholder", S.fieldOrgPh);
    setText("isoq-label-area", S.fieldArea);
    document.getElementById("isoq-f-area")?.setAttribute("placeholder", S.fieldAreaPh);
    setText("isoq-label-auditor", S.fieldAuditor);
    document.getElementById("isoq-f-auditor")?.setAttribute("placeholder", S.fieldAuditorPh);
    setText("isoq-label-fecha", S.fieldFecha);
 
    // Leyenda
    const legendEl = document.getElementById("isoq-legend");
    if (legendEl) {
      const rangos = [
        { r: "0 - 20%", label: S.legendRiskLabels.muybajo, cls: "isoq-verde" },
        { r: "21 - 40%", label: S.legendRiskLabels.bajo, cls: "isoq-verde" },
        { r: "41 - 60%", label: S.legendRiskLabels.medio, cls: "isoq-amarillo" },
        { r: "61 - 80%", label: S.legendRiskLabels.alto, cls: "isoq-naranja" },
        { r: "81 - 100%", label: S.legendRiskLabels.critico, cls: "isoq-rojo" },
      ];
      const expWord = lang === "en" ? "exposure" : "de exposición";
      legendEl.innerHTML = rangos.map(r => `
        <div class="isoq-legend-item">
          <span class="isoq-legend-dot ${r.cls}"></span>
          ${r.label} <span style="color:var(--gray-600);font-weight:500">(${r.r} ${expWord})</span>
        </div>
      `).join("");
    }
 
    // Dominios y controles
    DOMINIOS.es.forEach(dom => {
      const block = container.querySelector(`.isoq-domain-block[data-dominio="${dom}"]`);
      if (!block) return;
      const items = CONTROLES.filter(c => c.dominio === dom);
      block.querySelector('[data-role="domain-name"]').textContent = dominioLabel(dom, lang);
      block.querySelector('[data-role="domain-count"]').textContent = `${items.length} ${S.controlesLabel(items.length)}`;
    });
 
    CONTROLES.forEach(c => {
      const card = container.querySelector(`.isoq-control-card[data-control-id="${c.id}"]`);
      if (!card) return;
      const s = c.sujeto[lang];
      card.querySelector('[data-role="control-name"]').textContent = c.nombre[lang];
      card.querySelector('[data-role="peso-label"]').textContent = S.peso;
      card.querySelector('[data-role="q1-text"]').textContent = S.q1(s);
      card.querySelector('[data-role="q2-text"]').textContent = S.q2(s);
      card.querySelector('[data-role="q3-text"]').textContent = S.q3(s);
      card.querySelectorAll('[data-role="opt-si"]').forEach(el => el.textContent = S.optSi);
      card.querySelectorAll('[data-role="opt-no"]').forEach(el => el.textContent = S.optNo);
      card.querySelectorAll('[data-role="opt-na"]').forEach(el => el.textContent = S.optNa);
      card.querySelector('[data-role="obs-label"]').textContent = S.obsLabel;
      card.querySelector('[data-role="obs-placeholder"]').setAttribute("placeholder", S.obsPh);
    });
 
    // Botones
    setText("isoq-btn-reset", S.btnReset);
    setText("isoq-btn-reporte", S.btnReporte);
    setText("isoq-btn-guardar", S.btnGuardarProgreso);
  }
 
  applyTexts();

  // ---------- Progreso guardado (restaurar respuestas previas) ----------
  function guardarProgreso() {
    const respuestas = {};
    CONTROLES.forEach(c => {
      const card = container.querySelector(`.isoq-control-card[data-control-id="${c.id}"]`);
      respuestas[c.id] = {
        q: [1, 2, 3].map(i => {
          const checked = card.querySelector(`input[name="c${c.id}_q${i}"]:checked`);
          return checked ? checked.value : null;
        }),
        obs: card.querySelector("[data-obs]").value,
      };
    });

    const datos = {
      org: document.getElementById("isoq-f-org")?.value || "",
      area: document.getElementById("isoq-f-area")?.value || "",
      auditor: document.getElementById("isoq-f-auditor")?.value || "",
      fecha: document.getElementById("isoq-f-fecha")?.value || "",
      respuestas,
      guardadoEn: new Date().toISOString(),
    };

    try {
      localStorage.setItem(progresoStorageKey(), JSON.stringify(datos));
      alert(STR[lang].progresoGuardadoMsg);
    } catch (err) {
      console.error("No se pudo guardar el progreso:", err);
    }
  }

  function cargarProgreso() {
    let datos = null;
    try {
      const raw = localStorage.getItem(progresoStorageKey());
      if (raw) datos = JSON.parse(raw);
    } catch (err) {
      console.error("No se pudo leer el progreso guardado:", err);
    }
    if (!datos) return;

    if (datos.org) document.getElementById("isoq-f-org").value = datos.org;
    if (datos.area) document.getElementById("isoq-f-area").value = datos.area;
    if (datos.auditor) document.getElementById("isoq-f-auditor").value = datos.auditor;
    if (datos.fecha) document.getElementById("isoq-f-fecha").value = datos.fecha;

    CONTROLES.forEach(c => {
      const guardado = datos.respuestas && datos.respuestas[c.id];
      if (!guardado) return;
      const card = container.querySelector(`.isoq-control-card[data-control-id="${c.id}"]`);
      (guardado.q || []).forEach((val, idx) => {
        if (!val) return;
        const input = card.querySelector(`input[name="c${c.id}_q${idx + 1}"][value="${val}"]`);
        if (input) input.checked = true;
      });
      if (guardado.obs) card.querySelector("[data-obs]").value = guardado.obs;
    });
  }

  cargarProgreso();

  // ---------- Cálculo en vivo ----------
  function calcular() {
    const S = STR[lang];
    const resultados = [];
 
    CONTROLES.forEach(c => {
      const card = container.querySelector(`.isoq-control-card[data-control-id="${c.id}"]`);
      const respuestas = [1, 2, 3].map(i => {
        const checked = card.querySelector(`input[name="c${c.id}_q${i}"]:checked`);
        return checked ? checked.value : null;
      });
 
      const respondidas = respuestas.filter(r => r !== null).length;
      const aplicables = respuestas.filter(r => r === "si" || r === "no").length;
      const siCount = respuestas.filter(r => r === "si").length;
      const naCount = respuestas.filter(r => r === "na").length;
 
      let madurez = null, cumplimiento = null, exposicion = null, riesgo = null;
      let estado = "sin_responder";
 
      if (respondidas < 3) {
        estado = "incompleto";
      } else if (naCount === 3) {
        estado = "no_aplica";
      } else {
        madurez = Math.round((siCount / aplicables) * 5);
        cumplimiento = (madurez / 5) * 100;
        exposicion = 100 - cumplimiento;
        riesgo = riesgoDe(exposicion, lang);
        estado = "evaluado";
      }
 
      const pill = card.querySelector("[data-status]");
      const sub = card.querySelector("[data-status-sub]");
      pill.className = "isoq-status-pill";
      if (estado === "evaluado") {
        pill.textContent = riesgo.label;
        pill.classList.add(riesgo.cls);
        sub.textContent = S.subEvaluado(madurez, cumplimiento);
      } else if (estado === "no_aplica") {
        pill.textContent = S.statusNoAplica;
        pill.classList.add("isoq-gris");
        sub.textContent = S.subNoAplica;
      } else if (estado === "incompleto") {
        pill.textContent = S.statusIncompleto;
        pill.classList.add("isoq-gris");
        sub.textContent = S.subIncompleto(respondidas);
      } else {
        pill.textContent = S.statusSinResponder;
        pill.classList.add("isoq-gris");
        sub.textContent = S.subSinResponder;
      }
 
      resultados.push({
        ...c, respuestas, estado, madurez, cumplimiento, exposicion,
        observaciones: card.querySelector("[data-obs]").value.trim()
      });
    });
 
    renderDashboard(resultados);
    return resultados;
  }
 
  function exposicionCID(evaluados, dim) {
    const ctrls = evaluados.filter(r => r.cid[dim]);
    if (!ctrls.length) return null;
    return ctrls.reduce((a, c) => a + c.exposicion, 0) / ctrls.length;
  }
 
  function madurezPorDominio(evaluados) {
    const out = {};
    DOMINIOS.es.forEach(dom => {
      const ctrls = evaluados.filter(r => r.dominio === dom);
      if (!ctrls.length) { out[dom] = null; return; }
      const sumPeso = ctrls.reduce((a, c) => a + c.peso, 0);
      const sumPonderada = ctrls.reduce((a, c) => a + c.madurez * c.peso, 0);
      out[dom] = sumPonderada / sumPeso;
    });
    return out;
  }
 
  function renderDashboard(resultados) {
    const S = STR[lang];
    const dash = document.getElementById("isoq-dashboard");
    if (!dash) return;
    const evaluados = resultados.filter(r => r.estado === "evaluado");
 
    const expC = exposicionCID(evaluados, "C");
    const expI = exposicionCID(evaluados, "I");
    const expD = exposicionCID(evaluados, "D");
    const validas = [expC, expI, expD].filter(v => v !== null);
    const indiceGeneral = validas.length ? validas.reduce((a, b) => a + b, 0) / validas.length : null;
 
    const kpi = (label, value, riesgo, suffix = "%") => `
      <div class="isoq-kpi">
        <div class="isoq-label">${label}</div>
        <div class="isoq-value">${value === null ? "—" : value.toFixed(0) + suffix}</div>
        ${riesgo ? `<span class="isoq-risk ${riesgo.cls}">${riesgo.label}</span>` : ""}
      </div>`;
 
    dash.innerHTML =
      kpi(S.kpiIndice, indiceGeneral, indiceGeneral !== null ? riesgoDe(indiceGeneral, lang) : null) +
      kpi(S.kpiExpC, expC, expC !== null ? riesgoDe(expC, lang) : null) +
      kpi(S.kpiExpI, expI, expI !== null ? riesgoDe(expI, lang) : null) +
      kpi(S.kpiExpD, expD, expD !== null ? riesgoDe(expD, lang) : null) +
      kpi(S.kpiEvaluados, evaluados.length, null, ` / ${CONTROLES.length}`);
  }
 
  container.addEventListener("change", calcular);
  container.addEventListener("input", e => { if (e.target.matches("[data-obs]")) calcular(); });
  calcular();
 
  // ---------- Botones ----------
  document.getElementById("isoq-btn-reset")?.addEventListener("click", () => {
    container.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
    container.querySelectorAll("textarea").forEach(t => t.value = "");
    document.getElementById("isoq-reporte")?.setAttribute("hidden", "");
    try { localStorage.removeItem(progresoStorageKey()); } catch (err) { /* ignore */ }
    calcular();
  });
 
  document.getElementById("isoq-btn-reporte")?.addEventListener("click", () => generarReporte());
 
  function generarReporte() {
    const S = STR[lang];
    const resultados = calcular();
    guardarEnBaseDeDatos(resultados);
    const evaluados = resultados.filter(r => r.estado === "evaluado");
    const reportEl = document.getElementById("isoq-reporte");
    if (!reportEl) return;
 
    if (!evaluados.length) {
      reportEl.hidden = false;
      reportEl.innerHTML = `<p style="margin:0">${S.reportEmpty}</p>`;
      reportEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
 
    const expC = exposicionCID(evaluados, "C");
    const expI = exposicionCID(evaluados, "I");
    const expD = exposicionCID(evaluados, "D");
    const validas = [expC, expI, expD].filter(v => v !== null);
    const indiceGeneral = validas.length ? validas.reduce((a, b) => a + b, 0) / validas.length : null;
    const riesgoGeneral = indiceGeneral !== null ? riesgoDe(indiceGeneral, lang) : null;
 
    const dominioStats = madurezPorDominio(evaluados);
    const ordenPorRiesgo = [...evaluados].sort((a, b) => b.exposicion - a.exposicion);
    const top3Riesgo = ordenPorRiesgo.slice(0, 3);
    const ordenPorMadurez = [...evaluados].sort((a, b) => a.madurez - b.madurez);
    const bottom3Madurez = ordenPorMadurez.slice(0, 3);
 
    const org = document.getElementById("isoq-f-org")?.value || S.reportOrgDefault;
    const area = document.getElementById("isoq-f-area")?.value || "—";
    const auditor = document.getElementById("isoq-f-auditor")?.value || "—";
    const fecha = document.getElementById("isoq-f-fecha")?.value || "—";
 
    reportEl.hidden = false;
    reportEl.innerHTML = `
      <div class="isoq-report-header">
        <div>
          <h3>${S.reportTitle}</h3>
          <div class="isoq-report-meta">
            <strong>${org}</strong> · ${S.reportArea}: ${area}<br>
            ${S.reportAuditor}: ${auditor} · ${S.reportFecha}: ${fecha}
          </div>
        </div>
        <div class="isoq-report-index ${riesgoGeneral.cls}">
          <div class="isoq-value">${indiceGeneral.toFixed(0)}%</div>
          <div class="isoq-label">${riesgoGeneral.label}</div>
        </div>
      </div>
 
      <div class="isoq-report-section">
        <h4>${S.sectionDominio}</h4>
        <table class="isoq-report-table">
          <thead><tr><th>${S.thDominio}</th><th>${S.thEvaluados}</th><th>${S.thMadurezProm}</th></tr></thead>
          <tbody>
            ${DOMINIOS.es.map(dom => {
              const n = evaluados.filter(r => r.dominio === dom).length;
              const m = dominioStats[dom];
              return `<tr><td>${dominioLabel(dom, lang)}</td><td>${n}</td><td>${m !== null ? m.toFixed(1) + " / 5" : S.sinDatos}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
 
      <div class="isoq-report-section">
        <h4>${S.sectionTopRiesgo}</h4>
        <div class="isoq-top-list">
          ${top3Riesgo.map(c => `
            <div class="isoq-top-item">
              <div><strong>${c.nombre[lang]}</strong><br><span class="meta">ISO ${c.codigo} · ${dominioLabel(c.dominio, lang)}</span></div>
              <span class="isoq-badge ${riesgoDe(c.exposicion, lang).cls}">${c.exposicion.toFixed(0)}% · ${riesgoDe(c.exposicion, lang).label}</span>
            </div>`).join("")}
        </div>
      </div>
 
      <div class="isoq-report-section">
        <h4>${S.sectionTopMadurez}</h4>
        <div class="isoq-top-list">
          ${bottom3Madurez.map(c => `
            <div class="isoq-top-item">
              <div><strong>${c.nombre[lang]}</strong><br><span class="meta">ISO ${c.codigo} · ${dominioLabel(c.dominio, lang)}</span></div>
              <span class="isoq-badge ${riesgoDe(c.exposicion, lang).cls}">${S.madurezWord} ${c.madurez}/5</span>
            </div>`).join("")}
        </div>
      </div>
 
      <div class="isoq-report-section" style="margin-bottom:0">
        <h4>${S.sectionHeat}</h4>
        <div class="isoq-heatmap">
          ${evaluados.map(c => `
            <div class="isoq-heat-cell ${riesgoDe(c.exposicion, lang).cls}" title="${c.nombre[lang]} — ${c.exposicion.toFixed(0)}%">
              ${c.codigo}
            </div>`).join("")}
        </div>
      </div>
    `;
    reportEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
 
  // ---------- Guardar progreso ----------
  document.getElementById("isoq-btn-guardar")?.addEventListener("click", () => guardarProgreso());
 
  // ---------- Sincronización con el selector de idioma del sitio ----------
  document.addEventListener("tld:langchange", (e) => {
    lang = e.detail.lang;
    applyTexts();
    calcular();
    const reportEl = document.getElementById("isoq-reporte");
    if (reportEl && !reportEl.hasAttribute("hidden")) generarReporte();
  });
}
