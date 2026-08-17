// =========================================================
// Three Little Ducks — Database Consulting
// Autenticación simulada (sin backend todavía)
//
// IMPORTANTE: esto es un mock para prototipar el flujo de login /
// registro / invitado mientras no existe una base de datos real.
// Las "cuentas" y la sesión viven en localStorage del navegador:
// no hay servidor, no hay cifrado real de contraseñas (solo un
// hash SHA-256 sin sal) y cualquiera con acceso al navegador puede
// leer o modificar estos datos. Cuando exista un backend, esta es
// la pieza a reemplazar por llamadas reales a la API — el resto
// del sitio solo depende de las funciones que expone este módulo
// (getSession, login, register, loginAsGuest, logout).
// =========================================================

const TLD_AUTH = (() => {
  const USERS_KEY = "tld_users";
  const SESSION_KEY = "tld_session";

  async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async function register(name, email, password) {
    const users = getUsers();
    const normalizedEmail = email.trim().toLowerCase();

    if (users.some((u) => u.email === normalizedEmail)) {
      throw new Error("EMAIL_TAKEN");
    }

    const passwordHash = await hashPassword(password);
    users.push({ name: name.trim(), email: normalizedEmail, passwordHash });
    saveUsers(users);
    setSession({ type: "user", name: name.trim(), email: normalizedEmail });
  }

  async function login(email, password) {
    const users = getUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find((u) => u.email === normalizedEmail);
    if (!user) throw new Error("INVALID_CREDENTIALS");

    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.passwordHash) throw new Error("INVALID_CREDENTIALS");

    setSession({ type: "user", name: user.name, email: user.email });
  }

  function loginAsGuest() {
    setSession({ type: "guest" });
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getNextParam(fallback) {
    const params = new URLSearchParams(location.search);
    return params.get("next") || fallback;
  }

  return { getSession, register, login, loginAsGuest, logout, getNextParam };
})();
