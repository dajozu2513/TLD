# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Three Little Ducks Database Consulting — a marketing site for an academic project (Universidad Nacional, Escuela de Informática, Curso: Administración de Bases de Datos, EIF402). The frontend is plain multi-page HTML/CSS/JS with no build system, package manager, framework, linter, or test suite. It embeds two self-contained tools bolted onto the marketing site:

- An ISO/IEC 27002 database-security risk-assessment questionnaire (`evaluacion.html`).
- A simulated Oracle database health monitor (`monitor.html`).

A separate Node/Express + PostgreSQL backend (`tld-backend/`) implements "Parte 2" of the course project — persisting the ISO questionnaire's data model (migrated from the course's Oracle design) to a real database. It is optionally wired up: the questionnaire's save/report flow calls it over HTTP but degrades to an on-screen-only result with an alert if it isn't running.

## Commands

Frontend — serve locally (no build step):

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`. (`.claude/launch.json` runs this same command for the in-editor preview.) There is nothing to build, lint, or test for the frontend — verify changes by loading pages in a browser.

Backend (`tld-backend/`) — see [tld-backend/README.md](tld-backend/README.md) for full detail:

```bash
cd tld-backend
docker compose up -d          # Postgres 16 (port 5432) + pgAdmin (http://localhost:5050)
cp .env.example .env
npm install
npm run dev                   # http://localhost:3000, auto-restarts on change
```

`docker compose up -d` only runs `db/01_schema.sql` and `db/02_seed.sql` the first time the volume is created; after schema changes, reset with `docker compose down -v` then `docker compose up -d` again.

## Deployment

- `render.yaml` defines a Render **static site** (no build command, publishes the repo root, SPA-style rewrite of `/*` to `/index.html`). Render auto-deploys on every push to `main`.
- Only the frontend deploys this way — `tld-backend/` is not deployed by `render.yaml` and currently only runs locally via Docker.

## Architecture

### Pages

The site is now multiple HTML pages sharing the same header/footer/nav pattern and `css/styles.css`:

- `index.html` — the marketing site. Sections identified by id (`#servicios`, `#nosotros`, `#proceso`, `#equipo`, `#contacto`) linked from the header/footer nav via anchors. The ISO questionnaire is **no longer embedded here**; it lives on its own page.
- `login.html` / `register.html` — auth pages (see below).
- `evaluacion.html` — the ISO/IEC 27002 questionnaire, gated: requires any session (user or guest). No further restriction on guests.
- `monitor.html` — the Oracle health monitor, gated: requires any session (user or guest). No further restriction on guests.

Gated pages enforce the guard with an inline `<script>` in `<head>` that reads `localStorage.tld_session` synchronously and `location.replace`s to `login.html?next=<page>` if absent, before the page paints.

### Authentication (`js/auth.js`)

**Mock auth, no real backend** — the `TLD_AUTH` module stores accounts and the active session directly in `localStorage` (`tld_users`, `tld_session`), with only a client-side unsalted SHA-256 password hash. This is a known-insecure prototype standing in for real authentication until one exists; treat it as a placeholder, not a security boundary. Session `type` is either `"user"` (registered) or `"guest"` (`loginAsGuest()`, no account). The rest of the site depends only on `TLD_AUTH`'s exposed functions (`getSession`, `login`, `register`, `loginAsGuest`, `logout`, `getNextParam`) — swapping in a real backend later means reimplementing this module without touching callers. `getNextParam` / the `?next=` query param is how gated pages return the user to where they were headed after login.

### i18n (`js/i18n.js`)

Site-wide Spanish/English translation system, must load **before** `main.js`, `auth.js`, `iso-cuestionario.js`, or `monitor-salud.js` on any page that uses it:

- `TLD_TRANSLATIONS` — flat `{ es: {...}, en: {...} }` dictionaries keyed by string id.
- `TLD_I18N` (IIFE, global) — exposes `t(key)`, `setLang(lang)`, `getLang()`. Persists the choice in `localStorage` (`tld-lang`), defaults to `es`, and falls back to the Spanish string if a key is missing in the active language.
- Applies translations by scanning the DOM for `data-i18n` (textContent), `data-i18n-html` (innerHTML — used where a translated string contains inline markup like `<strong>`), `data-i18n-placeholder`, and `data-i18n-aria` attributes.
- Dispatches a `tld:langchange` `CustomEvent` on the document whenever the language changes, so other modules can resync (the ISO questionnaire and monitor listen for this).

**When adding new visible text**, add the matching `data-i18n*` attribute in the relevant HTML page and add the key to *both* the `es` and `en` blocks in `js/i18n.js` — there's no separate i18n config or build step.

### Site interactions (`js/main.js`)

Header scroll state, mobile nav toggle, `IntersectionObserver`-driven `[data-reveal]` scroll-in animations, scroll-to-top button, and contact-form validation (on `index.html`). The contact form has **no backend** — submission just validates client-side and shows a success message via `TLD_I18N.t()`; nothing is actually sent anywhere.

### ISO/IEC 27002 questionnaire (`js/iso-cuestionario.js`)

Runs on `evaluacion.html`; no-ops immediately if `#isoq-controls` isn't present on the page. Available to any session, including guests.

- Hardcodes its own control catalog (`CONTROLES`: 15 controls with ISO code, domain, weight, and which CID — Confidentiality/Integrity/Availability — dimensions they affect) and its own `STR` es/en text dictionary. **This is intentionally separate from `TLD_TRANSLATIONS`** — it is not part of the site-wide i18n system, just synced to it via the `tld:langchange` event. This catalog mirrors the same 15 controls seeded into the backend's `db/02_seed.sql`.
- Builds its questionnaire DOM programmatically on load, then recomputes maturity/compliance/risk-exposure live on every `change`/`input` in the container.
- Can render an on-page executive report ("Generar reporte ejecutivo").
- "Guardar progreso" persists the in-progress answers (radio selections, observaciones, and the org/area/auditor/fecha fields) to `localStorage`, under a per-session key (`tld_iso_progreso_<email>` for a registered user, `tld_iso_progreso_invitado` for a guest — mirrors the mock-auth session shape in `js/auth.js`). On load, `cargarProgreso()` restores that saved state before the first `calcular()` run so the questionnaire resumes exactly where the user left off; "Limpiar respuestas" clears both the on-screen answers and this saved progress. This is a `localStorage` convenience only — it isn't the `tld-backend` persistence described below, and doesn't survive a different browser/device.
- `guardarEnBaseDeDatos()` optionally persists a completed audit to `tld-backend` by POSTing to `http://localhost:3000/api` (hardcoded `API_BASE`, no env-based config) — creates an organización, an auditoría, PUTs the answers, then POSTs `/calcular` to persist computed results. If the backend isn't running, the report still renders on-screen but the save fails with a caught error and an alert telling the user the backend may not be running.

### Oracle health monitor (`js/monitor-salud.js`)

Runs on `monitor.html`. **Fully simulated — there is no real Oracle connection**, reinforced with a visible "🧪 Datos simulados" badge in the hero in addition to the footnote. Implements the course's IP (procesos) / IM (memoria) / IA (archivos) → ISBD (índice de salud) weighted-average formula (`WP=0.30, WM=0.35, WA=0.35`) over synthetic metrics. A dropdown selects a scenario (`sim-healthy`, `sim-warning`, `sim-critical`, `sim-random`) that perturbs a `baseMetrics()` object; `sim-random` randomizes within realistic ranges. Auto-refreshes every 15s when enabled and keeps a rolling history (last `MAX_HISTORY=40` readings) in `localStorage` (`tld_monitor_history`) to drive trend/alert display.

- **`THRESHOLDS`** (top of the file) is the single source of truth for every límite inferior/límite superior used anywhere in the monitor — `calcIP`/`calcIM`/`calcIA`, `buildAlerts`, and the on-page "Métricas y umbrales" legend (`renderThresholdsTable()`) all read from it, so there are no more magic numbers scattered through the calculation/alert code. Only Procesos has an official band from the course document (§7: 0-69 Normal / 70-84 Advertencia / 85-94 Alto / 95-100 Crítico, applied to `max(procesos%, sesiones%)`); Memoria's bands are this project's own proposal (no formula given in the source doc) using the same 0-84/85-89/90-94/95-100 "% usado" pattern; Archivos' space-related bands implement the professor's whiteboard rule (mínimo 20% de espacio libre) as `ia_espacio_libre`, applied to three proxies — P1 (100 − tablespace de mayor uso), P2 (100 − uso de TEMP), P3 (% de grupos redo saludables) — combined by simple average since the whiteboard didn't specify weights `W1/W2/W3`.
- Every threshold band maps to a nivel (`normal|advertencia|alto|critico`); `NIVEL_PUNTAJE` converts that qualitative nivel into a 0-100 point value that IP/IM/IA average across their sub-metrics to get their score — anchored loosely to the ISBD scale (§18) so a KPI card's Óptimo/Saludable/Advertencia/Degradado/Crítico badge means the same thing everywhere.
- Any background process (`DBWn`/`LGWR`/`SMON`/`PMON`/`CKPT`) not `"activo"` both drags IP's score down and pushes its own crítico alert (`proceso_fondo_critico`) naming the process — the document doesn't specify this explicitly but it was called out separately as a required behavior.
- **The ISBD badge never hides a critical problem** (§20 of the course doc): if `buildAlerts()` returns any nivel `"critico"` entry, the ISBD card is forced to the Crítico badge regardless of the numeric weighted score, and a "Causas:" list under the score names the offending component/variable pairs — this overrides what the raw 0.30×IP+0.35×IM+0.35×IA average would otherwise show.
- Alert sort order matters here: `order[a.nivel] || 9` is a real footgun if `critico` is ever mapped to `0` — `0 || 9` evaluates to `9` in JS, silently sorting criticals last. The nivel→sort-order map starts at `1` for exactly this reason; don't "simplify" it back to `0`-indexed.
- Static page chrome (headings, panel titles, scenario option labels, the thresholds-panel title/note, the simulation badge) is translated the normal way via `data-i18n`/`TLD_TRANSLATIONS`. All dynamically rendered content (stat labels, status badges, background-process states, the alert message variants, the "Causas:" list, the thresholds legend table) instead goes through its own `STR` es/en dictionary at the top of the file — the same self-contained pattern `iso-cuestionario.js` uses, kept separate from `TLD_TRANSLATIONS` because these are computed/templated strings, not static markup.
- On `tld:langchange`, `rerenderCurrent()` redraws the **last computed** reading from a module-level `lastResult` instead of resimulating — so switching language never jumps the metrics around. It also re-runs `renderThresholdsTable()` since the legend's variable/band labels are language-dependent too.
- `.mon-page` sets its own `padding-top` in `css/styles.css` to clear the fixed header (`calc(var(--header-h) + 40px)`) since the header is `position: fixed` and the default `.section` padding doesn't apply here — if you add other pages with a non-default top section class, make sure it accounts for `--header-h` or content renders invisibly underneath the header.

### Backend (`tld-backend/`)

Node 18+ / Express / `pg`, connecting to a **local-only** PostgreSQL 16 run via Docker Compose (`tld-backend/docker-compose.yml`, container `tld_postgres`, plus a pgAdmin instance at `localhost:5050`). Schema and seed live in `tld-backend/db/` (`01_schema.sql`, `02_seed.sql`) and are a direct migration of the course's Oracle E-R design/data dictionary from Parte 1 (see comments at the top of `01_schema.sql` for the Oracle→Postgres type mapping used). Routes under `src/routes/` (`controles.js`, `organizaciones.js`, `auditorias.js`) back the endpoints listed in `tld-backend/README.md`:

| Método | Ruta | Para qué sirve |
|---|---|---|
| GET | `/api/health` | Verifica conexión a la base de datos |
| GET | `/api/controles` | Catálogo de dominios, controles y preguntas |
| POST | `/api/organizaciones` | Crea la organización auditada |
| POST | `/api/auditorias` | Crea una auditoría |
| PUT | `/api/auditorias/:id/respuestas` | Guarda/actualiza respuestas |
| POST | `/api/auditorias/:id/calcular` | Calcula madurez, cumplimiento y exposición, y persiste el resultado |
| GET | `/api/auditorias/:id/reporte` | Recupera un reporte ya calculado |

Risk/maturity computation lives in `src/services/calculoRiesgo.js`, mirroring the client-side logic in `js/iso-cuestionario.js` so results match whether or not the save round-trips through the API.

### CSS (`css/styles.css`)

Single stylesheet shared by all pages. Custom properties in `:root` define the palette — deliberately **white/black/gold only** (the variables are still named `--black-900`…`--black-600` from an earlier navy palette; don't reintroduce blue tones). Sections are marked with `/* ---------- Section ---------- */` comments. Responsive breakpoints: `960px`, `760px`, `480px` for the main site, plus dedicated blocks scoped to the ISO questionnaire's report/heatmap layout and the monitor page's dashboard layout.

### Assets (`pictures/`)

`duck-logo.png` is the actual logo used across the UI (header, footer, auth pages) — it's a background-removed/defringed version of `Gemini_Generated_Image.png`. `duck.PNG` is an earlier logo iteration. Only `duck-logo.png` is referenced from the HTML pages.
