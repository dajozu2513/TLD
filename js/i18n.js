// =========================================================
// Three Little Ducks — Database Consulting
// Traducciones (ES / EN) y lógica del selector de idioma
// =========================================================

const TLD_TRANSLATIONS = {
  es: {
    academic_note: "Proyecto académico — Universidad Nacional, Escuela de Informática · Curso: Administración de Bases de Datos",

    nav_services: "Servicios",
    nav_about: "Nosotros",
    nav_process: "Proceso",
    nav_team: "Equipo",
    nav_contact: "Contáctanos",
    footer_nav_contact: "Contacto",
    nav_toggle_aria: "Abrir menú",
    scroll_top_aria: "Volver arriba",
    back_to_home: "Volver al inicio",

    hero_eyebrow: "Consultoría especializada en bases de datos",
    hero_title: "Sus datos, en manos seguras y expertas.",
    hero_lead: "Ayudamos a las empresas a administrar, optimizar y proteger sus bases de datos con soluciones confiables, escalables y adaptadas a cada negocio.",
    hero_cta_primary: "Solicitar una consulta",
    hero_cta_secondary: "Ver servicios",

    hero_highlights_label: "Basado en la tríada de seguridad",
    triad_confidentiality: "Confidencialidad",
    triad_integrity: "Integridad",
    triad_availability: "Disponibilidad",

    stat_availability_label: "Disponibilidad garantizada",
    stat_monitoring_label: "Monitoreo continuo",
    stat_consultants_label: "Consultores especializados",

    trust_1: "Administración",
    trust_2: "Optimización",
    trust_3: "Migración",
    trust_4: "Seguridad",
    trust_5: "Respaldo & Recuperación",
    trust_6: "DevOps de Datos",

    services_eyebrow: "Qué hacemos",
    services_title: "Soluciones integrales para la gestión de sus bases de datos",
    services_lead: "Cubrimos todo el ciclo de vida del dato: desde el diseño y la migración hasta el monitoreo, la seguridad y el cumplimiento normativo.",

    svc1_title: "Administración de bases de datos",
    svc1_desc: "Gestión diaria (DBA), mantenimiento preventivo y soporte especializado para SQL Server, MySQL, PostgreSQL y Oracle.",
    svc2_title: "Optimización de rendimiento",
    svc2_desc: "Análisis de consultas, indexación y ajuste de configuración para reducir tiempos de respuesta y costos de infraestructura.",
    svc3_title: "Migración y modernización",
    svc3_desc: "Migración a la nube o entre motores de bases de datos, con planes de transición sin interrupciones para su operación.",
    svc4_title: "Seguridad y cumplimiento",
    svc4_desc: "Auditorías de seguridad, control de accesos, cifrado de datos y acompañamiento en normativas de protección de datos.",
    svc5_title: "Respaldo y recuperación",
    svc5_desc: "Estrategias de backup automatizado y planes de recuperación ante desastres para minimizar el riesgo de pérdida de información.",
    svc6_title: "Monitoreo continuo",
    svc6_desc: "Supervisión 24/7 con alertas tempranas, reportes de salud y disponibilidad de sus sistemas críticos.",

    svc_iso_title: "Evaluación de riesgo ISO/IEC 27002",
    svc_iso_desc: "Cuestionario interactivo que audita 15 controles de base de datos y calcula en vivo el nivel de madurez y la exposición al riesgo de Confidencialidad, Integridad y Disponibilidad, con reporte ejecutivo y exportación a Excel y PDF.",
    svc_iso_cta: "Iniciar evaluación →",
    svc_monitor_title: "Monitor de Salud Oracle",
    svc_monitor_desc: "Dashboard en tiempo real que evalúa procesos, memoria y archivos, calcula el Índice de Salud de la Base de Datos (ISBD) y genera alertas según umbrales de Normal, Advertencia y Crítico.",
    svc_monitor_cta: "Abrir monitor →",
    
    about_eyebrow: "Quiénes somos",
    about_title: "Un equipo pequeño, con estándares de nivel empresarial",
    about_p1: "<strong>Three Little Ducks Database Consulting</strong> nace de la convicción de que toda organización, sin importar su tamaño, merece una infraestructura de datos confiable, segura y bien administrada.",
    about_p2: "Combinamos experiencia técnica con un trato cercano y formal: entendemos su negocio, diagnosticamos con precisión y entregamos soluciones sostenibles a largo plazo.",
    about_check1: "Metodología clara y documentada en cada proyecto",
    about_check2: "Comunicación directa con los consultores, sin intermediarios",
    about_check3: "Soluciones adaptadas al tamaño y presupuesto de cada cliente",

    process_eyebrow: "Cómo trabajamos",
    process_title: "Un proceso simple, transparente y medible",
    step1_title: "Diagnóstico",
    step1_desc: "Evaluamos el estado actual de sus bases de datos: rendimiento, seguridad y riesgos.",
    step2_title: "Plan de acción",
    step2_desc: "Diseñamos una propuesta clara con alcance, tiempos y resultados esperados.",
    step3_title: "Implementación",
    step3_desc: "Ejecutamos los cambios con mínima interrupción para su operación diaria.",
    step4_title: "Acompañamiento",
    step4_desc: "Damos seguimiento continuo y soporte para garantizar resultados sostenibles.",

    team_eyebrow: "Nuestro equipo",
    team_title: "Los consultores detrás de Three Little Ducks",
    team_role_m: "Desarrollador & Consultor de Bases de Datos",
    team_role_f: "Desarrolladora & Consultora de Bases de Datos",

    cta_title: "¿Listo para fortalecer la infraestructura de sus datos?",
    cta_lead: "Conversemos sobre las necesidades de su base de datos y cómo podemos ayudarle.",
    cta_button: "Agendar una consulta",

    contact_eyebrow: "Contacto",
    contact_title: "Hablemos de su proyecto",
    contact_lead: "Complete el formulario o escríbanos directamente. Responderemos a la brevedad posible para coordinar una primera reunión sin costo.",
    contact_label_email: "Correo",
    contact_label_location: "Ubicación",
    contact_value_location: "Costa Rica — Atención remota e híbrida",
    contact_label_hours: "Horario",
    contact_value_hours: "Lunes a viernes, 8:00 a.m. – 5:00 p.m.",

    form_label_name: "Nombre completo",
    form_placeholder_name: "Su nombre",
    form_label_email: "Correo electrónico",
    form_placeholder_email: "nombre@empresa.com",
    form_label_company: "Empresa",
    form_placeholder_company: "Nombre de su empresa (opcional)",
    form_label_message: "Mensaje",
    form_placeholder_message: "Cuéntenos sobre su proyecto o necesidad",
    form_submit: "Enviar mensaje",
    form_error_required: "Por favor complete los campos obligatorios.",
    form_error_email: "Ingrese un correo electrónico válido.",
    form_success: "Gracias, {name}. Hemos recibido su mensaje y le contactaremos pronto.",

    footer_rights: "Todos los derechos reservados.",

    account_hello: "Hola, {name}",
    account_guest_label: "Invitado",
    account_logout: "Salir",

    auth_login_title: "Iniciar sesión",
    auth_login_subtitle: "Ingrese a su cuenta para continuar.",
    auth_login_email: "Correo electrónico",
    auth_login_password: "Contraseña",
    auth_login_submit: "Iniciar sesión",
    auth_login_no_account: "¿No tiene una cuenta?",
    auth_login_register_link: "Regístrese",
    auth_or: "o",
    auth_guest_button: "Continuar como invitado",

    auth_register_title: "Crear cuenta",
    auth_register_subtitle: "Regístrese para acceder a todas las herramientas.",
    auth_register_name: "Nombre completo",
    auth_register_email: "Correo electrónico",
    auth_register_password: "Contraseña",
    auth_register_confirm: "Confirmar contraseña",
    auth_register_submit: "Crear cuenta",
    auth_register_has_account: "¿Ya tiene una cuenta?",
    auth_register_login_link: "Inicie sesión",

    auth_error_required: "Por favor complete todos los campos.",
    auth_error_email_taken: "Ya existe una cuenta con ese correo.",
    auth_error_password_mismatch: "Las contraseñas no coinciden.",
    auth_error_password_length: "La contraseña debe tener al menos 6 caracteres.",
    auth_error_invalid_credentials: "Correo o contraseña incorrectos.",

    mon_eyebrow: "Herramienta de monitoreo",
    mon_title: "Monitor de Salud Oracle",
    mon_subtitle: "Procesos · Memoria · Archivos → Índice ISBD y alertas en tiempo real",
    mon_opt_healthy: "ORCL — Saludable",
    mon_opt_warning: "ORCL — Con advertencias",
    mon_opt_critical: "ORCL — Crítico",
    mon_opt_random: "ORCL — Aleatorio",
    mon_btn_refresh: "Actualizar ahora",
    mon_auto_label: "Auto 15s",
    mon_isbd_label: "Índice de Salud de la Base de Datos (ISBD)",
    mon_weight_processes: "Procesos",
    mon_weight_memory: "Memoria",
    mon_weight_files: "Archivos",
    mon_kpi_ip: "Indicador de Procesos (IP)",
    mon_kpi_im: "Indicador de Memoria (IM)",
    mon_kpi_ia: "Indicador de Archivos (IA)",
    mon_panel_processes: "Procesos y sesiones",
    mon_panel_bg: "Procesos de fondo Oracle",
    mon_panel_memory: "Memoria (SGA / PGA)",
    mon_panel_visual: "Uso visual",
    mon_panel_files: "Archivos y almacenamiento",
    mon_panel_tablespaces: "Tablespaces",
    mon_panel_alerts: "Alertas activas",
    mon_panel_history: "Evolución del ISBD",
    mon_btn_clear_history: "Limpiar historial",
    mon_history_note: "Últimas 40 mediciones guardadas en este navegador.",
    mon_sim_badge: "🧪 Datos simulados — sin conexión real a Oracle",
    mon_panel_thresholds: "Métricas y umbrales",
    mon_thresholds_note: "Límite inferior y superior de cada variable, y el nivel que dispara cada color. Para espacio libre en archivos se exige un mínimo del 20%.",
    mon_footnote: '<strong>Modo actual:</strong> simulación local con métricas inspiradas en vistas Oracle (<code>V$PROCESS</code>, <code>V$SESSION</code>, <code>V$RESOURCE_LIMIT</code>, <code>V$SGA</code>, <code>V$PGASTAT</code>, <code>V$DATAFILE</code>, <code>V$LOG</code>). Cálculo según propuesta del curso: IP, IM, IA → ISBD.',

    meta_description: "Three Little Ducks Database Consulting — administración, optimización, migración y seguridad de bases de datos para empresas."
  },

  en: {
    academic_note: "Academic project — Universidad Nacional, School of Informatics · Course: Database Administration",

    nav_services: "Services",
    nav_about: "About",
    nav_process: "Process",
    nav_team: "Team",
    nav_contact: "Contact us",
    footer_nav_contact: "Contact",
    nav_toggle_aria: "Open menu",
    scroll_top_aria: "Back to top",
    back_to_home: "Back to home",

    hero_eyebrow: "Specialized database consulting",
    hero_title: "Your data, in safe and expert hands.",
    hero_lead: "We help companies administer, optimize and protect their databases with reliable, scalable solutions tailored to every business.",
    hero_cta_primary: "Request a consultation",
    hero_cta_secondary: "View services",

    hero_highlights_label: "Built on the security triad",
    triad_confidentiality: "Confidentiality",
    triad_integrity: "Integrity",
    triad_availability: "Availability",

    stat_availability_label: "Guaranteed uptime",
    stat_monitoring_label: "Continuous monitoring",
    stat_consultants_label: "Specialized consultants",

    trust_1: "Administration",
    trust_2: "Optimization",
    trust_3: "Migration",
    trust_4: "Security",
    trust_5: "Backup & Recovery",
    trust_6: "Data DevOps",

    services_eyebrow: "What we do",
    services_title: "Comprehensive solutions for managing your databases",
    services_lead: "We cover the entire data lifecycle: from design and migration to monitoring, security and regulatory compliance.",

    svc1_title: "Database administration",
    svc1_desc: "Day-to-day DBA management, preventive maintenance and specialized support for SQL Server, MySQL, PostgreSQL and Oracle.",
    svc2_title: "Performance optimization",
    svc2_desc: "Query analysis, indexing and configuration tuning to reduce response times and infrastructure costs.",
    svc3_title: "Migration and modernization",
    svc3_desc: "Migration to the cloud or between database engines, with transition plans that keep your operation running without interruption.",
    svc4_title: "Security and compliance",
    svc4_desc: "Security audits, access control, data encryption and guidance on data protection regulations.",
    svc5_title: "Backup and recovery",
    svc5_desc: "Automated backup strategies and disaster recovery plans to minimize the risk of data loss.",
    svc6_title: "Continuous monitoring",
    svc6_desc: "24/7 monitoring with early alerts, health reports and availability tracking for your critical systems.",

    svc_iso_title: "ISO/IEC 27002 Risk Assessment",
    svc_iso_desc: "Interactive questionnaire that audits 15 database controls and calculates in real time the maturity level and risk exposure for Confidentiality, Integrity and Availability, with an executive report and Excel/PDF export.",
    svc_iso_cta: "Start assessment →",
    svc_monitor_title: "Oracle Health Monitor",
    svc_monitor_desc: "Real-time dashboard that evaluates processes, memory and files, calculates the Database Health Index (ISBD), and generates alerts based on Normal, Warning and Critical thresholds.",
    svc_monitor_cta: "Open monitor →",

    about_eyebrow: "Who we are",
    about_title: "A small team, with enterprise-level standards",
    about_p1: "<strong>Three Little Ducks Database Consulting</strong> was born from the belief that every organization, regardless of size, deserves a reliable, secure and well-managed data infrastructure.",
    about_p2: "We combine technical expertise with a close, professional approach: we understand your business, diagnose with precision and deliver solutions that last.",
    about_check1: "Clear, documented methodology on every project",
    about_check2: "Direct communication with consultants, no middlemen",
    about_check3: "Solutions tailored to each client's size and budget",

    process_eyebrow: "How we work",
    process_title: "A simple, transparent and measurable process",
    step1_title: "Diagnosis",
    step1_desc: "We assess the current state of your databases: performance, security and risks.",
    step2_title: "Action plan",
    step2_desc: "We design a clear proposal with scope, timeline and expected outcomes.",
    step3_title: "Implementation",
    step3_desc: "We carry out the changes with minimal disruption to your daily operations.",
    step4_title: "Ongoing support",
    step4_desc: "We provide continuous follow-up and support to ensure lasting results.",

    team_eyebrow: "Our team",
    team_title: "The consultants behind Three Little Ducks",
    team_role_m: "Developer & Database Consultant",
    team_role_f: "Developer & Database Consultant",

    cta_title: "Ready to strengthen your data infrastructure?",
    cta_lead: "Let's talk about your database needs and how we can help.",
    cta_button: "Schedule a consultation",

    contact_eyebrow: "Contact",
    contact_title: "Let's talk about your project",
    contact_lead: "Fill out the form or write to us directly. We'll get back to you as soon as possible to set up a free first meeting.",
    contact_label_email: "Email",
    contact_label_location: "Location",
    contact_value_location: "Costa Rica — Remote and hybrid support",
    contact_label_hours: "Hours",
    contact_value_hours: "Monday to Friday, 8:00 a.m. – 5:00 p.m.",

    form_label_name: "Full name",
    form_placeholder_name: "Your name",
    form_label_email: "Email address",
    form_placeholder_email: "name@company.com",
    form_label_company: "Company",
    form_placeholder_company: "Your company name (optional)",
    form_label_message: "Message",
    form_placeholder_message: "Tell us about your project or need",
    form_submit: "Send message",
    form_error_required: "Please fill in the required fields.",
    form_error_email: "Please enter a valid email address.",
    form_success: "Thank you, {name}. We've received your message and will contact you soon.",

    footer_rights: "All rights reserved.",

    account_hello: "Hi, {name}",
    account_guest_label: "Guest",
    account_logout: "Log out",

    auth_login_title: "Log in",
    auth_login_subtitle: "Sign in to your account to continue.",
    auth_login_email: "Email address",
    auth_login_password: "Password",
    auth_login_submit: "Log in",
    auth_login_no_account: "Don't have an account?",
    auth_login_register_link: "Sign up",
    auth_or: "or",
    auth_guest_button: "Continue as guest",

    auth_register_title: "Create account",
    auth_register_subtitle: "Sign up to access every tool.",
    auth_register_name: "Full name",
    auth_register_email: "Email address",
    auth_register_password: "Password",
    auth_register_confirm: "Confirm password",
    auth_register_submit: "Create account",
    auth_register_has_account: "Already have an account?",
    auth_register_login_link: "Log in",

    auth_error_required: "Please fill in all fields.",
    auth_error_email_taken: "An account with that email already exists.",
    auth_error_password_mismatch: "Passwords don't match.",
    auth_error_password_length: "Password must be at least 6 characters.",
    auth_error_invalid_credentials: "Incorrect email or password.",

    mon_eyebrow: "Monitoring tool",
    mon_title: "Oracle Health Monitor",
    mon_subtitle: "Processes · Memory · Files → ISBD index and real-time alerts",
    mon_opt_healthy: "ORCL — Healthy",
    mon_opt_warning: "ORCL — With warnings",
    mon_opt_critical: "ORCL — Critical",
    mon_opt_random: "ORCL — Random",
    mon_btn_refresh: "Refresh now",
    mon_auto_label: "Auto 15s",
    mon_isbd_label: "Database Health Index (ISBD)",
    mon_weight_processes: "Processes",
    mon_weight_memory: "Memory",
    mon_weight_files: "Files",
    mon_kpi_ip: "Process Indicator (IP)",
    mon_kpi_im: "Memory Indicator (IM)",
    mon_kpi_ia: "File Indicator (IA)",
    mon_panel_processes: "Processes and sessions",
    mon_panel_bg: "Oracle background processes",
    mon_panel_memory: "Memory (SGA / PGA)",
    mon_panel_visual: "Visual usage",
    mon_panel_files: "Files and storage",
    mon_panel_tablespaces: "Tablespaces",
    mon_panel_alerts: "Active alerts",
    mon_panel_history: "ISBD evolution",
    mon_btn_clear_history: "Clear history",
    mon_history_note: "Last 40 readings saved in this browser.",
    mon_sim_badge: "🧪 Simulated data — no real connection to Oracle",
    mon_panel_thresholds: "Metrics and thresholds",
    mon_thresholds_note: "Lower and upper limit for each variable, and the level that triggers each color. Free space in files requires a minimum of 20%.",
    mon_footnote: '<strong>Current mode:</strong> local simulation with metrics inspired by Oracle views (<code>V$PROCESS</code>, <code>V$SESSION</code>, <code>V$RESOURCE_LIMIT</code>, <code>V$SGA</code>, <code>V$PGASTAT</code>, <code>V$DATAFILE</code>, <code>V$LOG</code>). Calculated per the course proposal: IP, IM, IA → ISBD.',

    meta_description: "Three Little Ducks Database Consulting — database administration, optimization, migration and security for businesses."
  }
};

const TLD_I18N = (() => {
  const STORAGE_KEY = "tld-lang";
  let currentLang = localStorage.getItem(STORAGE_KEY) || "es";

  function t(key) {
    const dict = TLD_TRANSLATIONS[currentLang] || TLD_TRANSLATIONS.es;
    return dict[key] || TLD_TRANSLATIONS.es[key] || key;
  }

  function applyToDom() {
    document.documentElement.lang = currentLang;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });

    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });

    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });

    const metaDescription = document.getElementById("metaDescription");
    if (metaDescription) {
      metaDescription.setAttribute("content", t("meta_description"));
    }

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-lang") === currentLang);
    });
  }

  function setLang(lang) {
    if (!TLD_TRANSLATIONS[lang] || lang === currentLang) {
      if (!TLD_TRANSLATIONS[lang]) return;
    }
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyToDom();
    document.dispatchEvent(new CustomEvent("tld:langchange", { detail: { lang } }));
  }

  function getLang() {
    return currentLang;
  }

  function init() {
    applyToDom();

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang")));
    });
  }

  init();

  return { t, setLang, getLang };
})();
