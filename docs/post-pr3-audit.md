# Post-PR3 Audit (Docs-only)

## Scope
This audit reviews the current state after PR1–PR3 with focus on:
- deploy risk,
- behavior risk,
- API-first + static fallback robustness,
- and generated file tracking hygiene.

## What was checked
- Frontend runtime/data loading: `app.js`.
- Worker API routes and D1 usage: `apps/api/src/index.ts`, `apps/api/wrangler.toml`.
- DB schema + seed path assumptions: `packages/db/migrations/0001_initial.sql`, `packages/db/src/seed-from-projects.mjs`.
- Build/static sync behavior: `apps/web/scripts/sync-static.mjs`, `apps/web/package.json`, `apps/web/astro.config.mjs`.
- Tracked/ignored files: `.gitignore`, `git ls-files`.

---

## Findings

## P0 (must fix before proceeding)

### 1) API-first path assumes same-origin `/api/*` but deployment plan uses separate Pages + Workers projects
- Current frontend requests API at `'/api/projects'` (same origin) in `app.js`.
- If `apps/web` is deployed to Pages and `apps/api` is deployed to a separate Workers domain (e.g. `*.workers.dev`) without routing/proxying, `/api/projects` on Pages will 404.
- The static fallback to `/projects.json` will hide the issue in normal browsing, but the API integration will never be exercised in production.

**Impact:** API-first architecture appears to “work” but is effectively bypassed in production.

**Required fix before PR4+:** choose one and document/enforce it:
1. Route custom domain path (e.g. `https://site.com/api/*`) to the Worker, or
2. Add explicit configurable API base URL in frontend and point to Worker origin.

---

### 2) `wrangler.toml` has placeholder D1 `database_id = "local-dev"`
- `apps/api/wrangler.toml` currently uses a placeholder database id.
- Local commands can still work, but remote deploy/query against D1 requires real database id from Cloudflare.

**Impact:** remote deploy/runtime against D1 can fail or bind incorrectly.

**Required fix before remote production use:** replace placeholder with actual D1 `database_id` (per env).

---

## P1 (should fix soon)

### 3) API-first loader can become fragile/slow as project count grows
- Loader flow in `app.js`:
  1. Fetch paginated summaries from `/api/projects`.
  2. Fetch each item detail from `/api/projects/:id` (N additional requests).
- Request timeout is set to 2000ms per request.
- With larger data volume or transient latency, API load can fail and force fallback to static JSON.

**Impact:** non-deterministic “API-first” behavior under load; users may silently receive fallback data.

**Recommended hardening:**
- Add batched “full-shape” endpoint or include needed fields in list response.
- Increase/adapt timeout and add retry/backoff.
- Log/telemetry when fallback is triggered.

---

### 4) Fallback error message is static-file-specific
- Final catch renders “Unable to load projects.json” even if primary failure is API path/network.

**Impact:** debugging confusion.

**Recommended fix:** report both attempts (`/api/projects` and `/projects.json`) with clearer source.

---

## P2 / informational

### 5) Seed script and local path assumptions are acceptable for current workflow
- `packages/db/src/seed-from-projects.mjs` checks `apps/web/public/projects.json` first, then root `projects.json`, which is good for both Astro and root static flows.
- No immediate blocker found.

---

## API-first + fallback robustness verdict

**Current verdict: functionally robust for local/dev and degraded production behavior, but not fully robust for true API-first production until routing is fixed.**

Why:
- Good:
  - API-first attempt exists and maps API responses to legacy shape.
  - Static fallback exists and keeps UX working if API is unavailable.
- Risk:
  - Without `/api/*` routing to Worker in production, fallback will always be used.

---

## Generated files tracking check

Checks performed:
- `.gitignore` contains `node_modules/`, `.wrangler/`, `package-lock.json`.
- `git ls-files` shows no tracked `apps/web/public/*`, `.wrangler/*`, or build artifacts.

**Verdict:** generated runtime/build files are currently **not tracked**.

Note:
- `package-lock.json` is intentionally ignored right now. That is not a generated artifact, but this choice reduces lockfile reproducibility.

---

## Recommended gate before PR4

Minimum go/no-go checklist:
1. Resolve `/api/*` production routing strategy (or explicit API base URL).
2. Set real D1 `database_id` in deployment config.
3. Add at least one smoke check proving live `/api/projects` is served in production (not only fallback).

If these are not addressed, PR4+ can proceed for UI parity work, but backend confidence will remain low.
