// =========================================================
// Three Little Ducks — Database Consulting
// Interacciones del sitio
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  initHeaderScroll();
  initMobileNav();
  initScrollReveal();
  initScrollTopButton();
  initContactForm();
  document.getElementById("year").textContent = new Date().getFullYear();
});

/* ---------- Header cambia de estilo al hacer scroll ---------- */
function initHeaderScroll() {
  const header = document.getElementById("header");
  if (!header) return;

  const toggleHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  toggleHeader();
  window.addEventListener("scroll", toggleHeader, { passive: true });
}

/* ---------- Menú de navegación en móvil ---------- */
function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("main-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

/* ---------- Animación de aparición al hacer scroll ---------- */
function initScrollReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
  );

  items.forEach((el) => observer.observe(el));
}

/* ---------- Botón volver arriba ---------- */
function initScrollTopButton() {
  const btn = document.getElementById("scrollTop");
  if (!btn) return;

  window.addEventListener(
    "scroll",
    () => {
      btn.classList.toggle("is-visible", window.scrollY > 480);
    },
    { passive: true }
  );

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ---------- Validación del formulario de contacto ---------- */
function initContactForm() {
  const form = document.getElementById("contactForm");
  const note = document.getElementById("formNote");
  if (!form || !note) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const message = form.message.value.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !message) {
      showNote(TLD_I18N.t("form_error_required"), "is-error");
      return;
    }

    if (!emailPattern.test(email)) {
      showNote(TLD_I18N.t("form_error_email"), "is-error");
      return;
    }

    showNote(
      TLD_I18N.t("form_success").replace("{name}", name.split(" ")[0]),
      "is-success"
    );
    form.reset();
  });

  function showNote(text, className) {
    note.textContent = text;
    note.className = `form-note ${className}`;
  }
}
