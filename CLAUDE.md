# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Three Little Ducks Database Consulting — a static marketing site for an academic project (Universidad Nacional, Escuela de Informática, Curso: Administración de Bases de Datos). It also embeds a self-contained ISO/IEC 27002 database-security risk-assessment questionnaire tool.

There is no build system, package manager, or framework — plain HTML/CSS/JS served as-is. No linter, formatter, or test suite is configured.

## Commands

Serve locally (there is no dev server config beyond this):

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`. (`.claude/launch.json` runs this same command for the in-editor preview.)

There is nothing to build, lint, or test — verify changes by loading the page in a browser.

## Deployment

- `render.yaml` defines a Render **static site** (no build command, publishes the repo root). Render auto-deploys on every push to `main`.
- The repo was previously served via GitHub Pages; that has been (or is being) phased out in favor of the Render URL.

## Architecture

The whole site is one page: `index.html`. Sections are identified by id (`#servicios`, `#nosotros`, `#proceso`, `#equipo`, `#evaluacion`, `#contacto`) and linked from the header/footer nav via anchors.

### CSS (`css/styles.css`)

Single stylesheet. Custom properties in `:root` define the palette — deliberately **white/black/gold only** (the variables are still named `--black-900`…`--black-600` from an earlier navy palette; don't reintroduce blue tones). Sections are marked with `/* ---------- Section ---------- */` comments that mirror the HTML section order. Responsive breakpoints: `960px`, `760px`, `480px` for the main site, plus `960px`/`640px` at the end of the file scoped to the ISO questionnaire's report/heatmap layout.

### i18n (`js/i18n.js`)

Site-wide Spanish/English translation system, must load **before** `main.js` and `iso-cuestionario.js`:

- `TLD_TRANSLATIONS` — flat `{ es: {...}, en: {...} }` dictionaries keyed by string id.
- `TLD_I18N` (IIFE, global) — exposes `t(key)`, `setLang(lang)`, `getLang()`. Persists the choice in `localStorage` (`tld-lang`), defaults to `es`, and falls back to the Spanish string if a key is missing in the active language.
- Applies translations by scanning the DOM for `data-i18n` (textContent), `data-i18n-html` (innerHTML — used where a translated string contains inline markup like `<strong>`), `data-i18n-placeholder`, and `data-i18n-aria` attributes.
- Dispatches a `tld:langchange` `CustomEvent` on the document whenever the language changes, so other modules can resync (the ISO questionnaire listens for this).

**When adding new visible text**, add the matching `data-i18n*` attribute in `index.html` and add the key to *both* the `es` and `en` blocks in `js/i18n.js` — there's no separate i18n config or build step.

### Site interactions (`js/main.js`)

Header scroll state, mobile nav toggle, `IntersectionObserver`-driven `[data-reveal]` scroll-in animations, scroll-to-top button, and contact-form validation. The contact form has **no backend** — submission just validates client-side and shows a success message via `TLD_I18N.t()`; nothing is actually sent anywhere.

### ISO/IEC 27002 questionnaire (`js/iso-cuestionario.js`)

A separate, self-contained feature bolted onto the `#evaluacion` section. It no-ops immediately if `#isoq-controls` isn't present on the page, so it's safe to include unconditionally.

- Hardcodes its own control catalog (`CONTROLES`: 15 controls with ISO code, domain, weight, and which CID — Confidentiality/Integrity/Availability — dimensions they affect) and its own `STR` es/en text dictionary. **This is intentionally separate from `TLD_TRANSLATIONS`** — it is not part of the site-wide i18n system, just synced to it via the `tld:langchange` event.
- Builds its questionnaire DOM programmatically on load, then recomputes maturity/compliance/risk-exposure live on every `change`/`input` in the container.
- Can render an on-page executive report or export results to `.xlsx` via SheetJS, loaded from a CDN (`xlsx.full.min.js`) in `index.html`'s `<head>` — the Excel export silently no-ops with an alert if that CDN script failed to load.

### Assets (`pictures/`)

`duck-logo.png` is the actual logo used across the UI (header, footer) — it's a background-removed/defringed version of `Gemini_Generated_Image.png`. `duck.PNG` is an earlier logo iteration. Only `duck-logo.png` is referenced from `index.html`.
