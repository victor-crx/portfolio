# Cloudflare Setup Guide (Windows 11) — Up to PR3

This guide deploys:
- `apps/web` to **Cloudflare Pages** (Astro static output), and
- `apps/api` to **Cloudflare Workers** with **D1**.

It also includes verification steps so you can confirm API-first + fallback behavior.

---

## 0) Prerequisites (Windows 11)

## Install required tools
1. **Node.js 20+** (includes npm).
2. **Git for Windows**.
3. Cloudflare account with Pages + Workers + D1 enabled.

Recommended shell: **PowerShell**.

Verify tools:

```powershell
node -v
npm -v
git --version
```

Expected:
- Node major version 20+
- npm installed
- git installed

---

## 1) Clone and install dependencies

```powershell
git clone <YOUR_REPO_URL> portfolio
cd portfolio
npm install
```

Optional sanity checks:

```powershell
npm --workspace @portfolio/api run typecheck
npm --workspace portfolio-astro run build
```

---

## 2) Authenticate Wrangler

Run:

```powershell
npx wrangler login
```

A browser opens; complete Cloudflare OAuth.

Verify account access:

```powershell
npx wrangler whoami
```

---

## 3) Create and wire D1 database

## 3.1 Create D1 DB

```powershell
npx wrangler d1 create portfolio-db
```

Copy the returned `database_id`.

## 3.2 Update `apps/api/wrangler.toml`
Set real values in `[[d1_databases]]`:
- `database_name = "portfolio-db"`
- `database_id = "<REAL_DATABASE_ID_FROM_CREATE_COMMAND>"`

(Keep `binding = "DB"` unchanged.)

## 3.3 Apply migrations (remote)

```powershell
npx wrangler d1 migrations apply portfolio-db --config apps/api/wrangler.toml
```

## 3.4 Seed DB from project JSON (remote)

```powershell
npm --workspace @portfolio/db run seed:remote
```

## 3.5 Verify DB has records

```powershell
npx wrangler d1 execute portfolio-db --command "SELECT COUNT(*) AS total_projects FROM projects;" --config apps/api/wrangler.toml
```

Expected: `total_projects > 0`.

---

## 4) Deploy API Worker

```powershell
npm --workspace @portfolio/api run deploy
```

Wrangler prints Worker URL (for example, `https://portfolio-api.<subdomain>.workers.dev`).

Verify endpoints:

```powershell
curl https://<YOUR_WORKER_URL>/api/health
curl "https://<YOUR_WORKER_URL>/api/projects?page=1&pageSize=5"
```

Expected:
- `/api/health` returns JSON with `status: "ok"`
- `/api/projects` returns `data` + `pagination`

---

## 5) Deploy Web app to Cloudflare Pages

You can deploy via dashboard (recommended for first setup).

## 5.1 Create Pages project
In Cloudflare dashboard:
1. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select repo.
3. Configure build:
   - Framework preset: **Astro** (or None with explicit commands)
   - Build command: `npm --workspace portfolio-astro run build`
   - Build output directory: `apps/web/dist`
4. Environment variable (recommended):
   - `NODE_VERSION=20`

Deploy.

## 5.2 Verify static deploy
After deploy, open your Pages URL and check:
- `/`
- `/work/`
- `/systems/`, `/collab/`, `/delivery/`, `/creative/`
- `/about/`, `/contact/`, `/resume/`

All should return 200 and render correctly.

---

## 6) Critical integration step: make `/api/*` reachable from Pages origin

Current frontend requests `'/api/projects'` on the same origin. So one of these is required:

## Option A (preferred): Route same domain path `/api/*` to Worker
Use Cloudflare domain/routing so `https://<pages-domain>/api/*` is served by `portfolio-api` Worker.

## Option B: Use custom API base URL in frontend (requires future code change)
Not available in PR3 as-is; frontend currently hardcodes same-origin `/api/projects`.

If you skip this step, site still works via fallback `/projects.json`, but API-first path is effectively disabled in production.

---

## 7) Verification checklist (post-deploy)

From your browser DevTools on Pages domain:

1. Open `/work/`.
2. Network tab filter by `api/projects`.
3. Confirm requests to:
   - `/api/projects?page=1&pageSize=100`
   - `/api/projects/<id>` (detail calls)
4. Confirm response status is 200.

Fallback verification:
1. Temporarily break API route (or test on branch without routing).
2. Reload `/work/`.
3. Confirm request to `/projects.json` occurs and page still populates cards.

CLI verification:

```powershell
curl https://<PAGES_URL>/api/health
curl https://<PAGES_URL>/projects.json
```

Expected:
- first call succeeds only when `/api/*` routing is correctly configured,
- second call always succeeds for static fallback.

---

## 8) Local dev commands (Windows 11)

API local dev:

```powershell
npm --workspace @portfolio/api run dev
```

Web local dev:

```powershell
npm --workspace portfolio-astro run dev
```

Local D1 migration/seed:

```powershell
npx wrangler d1 migrations apply portfolio-db --local --config apps/api/wrangler.toml
npm --workspace @portfolio/db run seed:local
```

---

## 9) Troubleshooting

- **`/api/projects` 404 on Pages domain**
  - Cause: no `/api/*` route to Worker.
  - Fix: configure same-domain Worker routing.

- **Worker deploy succeeds but DB queries fail**
  - Cause: wrong `database_id` in `apps/api/wrangler.toml`.
  - Fix: paste real D1 id from `wrangler d1 create`.

- **No project data in API**
  - Cause: migrations/seed not applied remotely.
  - Fix: run migrations + `seed:remote`.

- **Pages build fails**
  - Ensure build command is exactly:
  - `npm --workspace portfolio-astro run build`
  - and output directory is `apps/web/dist`.

