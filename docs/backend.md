# Backend foundations (Cloudflare Worker + D1)

This repository now includes:

- `apps/api`: Cloudflare Worker API using Hono.
- `packages/db`: D1 schema migration and a seed importer.

## Prerequisites

- Node.js 20+
- npm 10+
- Cloudflare account (for remote D1 usage)

## Install dependencies

```bash
npm install --workspace @portfolio/api --workspace @portfolio/db
```

## Apply schema to local D1

From repository root:

```bash
npx wrangler d1 migrations apply portfolio-db --local --config apps/api/wrangler.toml
```

## Seed D1 from `projects.json`

The importer looks for `apps/web/public/projects.json` first, then falls back to root `projects.json`.

```bash
npm --workspace @portfolio/db run seed:local
```

You can also pass an explicit input path:

```bash
node packages/db/src/seed-from-projects.mjs --db portfolio-db --local --input /path/to/projects.json
```

## Run the Worker locally

```bash
npm --workspace @portfolio/api run dev
```

Available read-only endpoints:

- `GET /api/health`
- `GET /api/projects?collection=&type=&q=&page=&pageSize=`
- `GET /api/projects/:id` (also matches slug)
- `GET /api/services`
- `GET /api/certifications`
- `GET /api/labs`
- `GET /api/site-blocks`

## Deploy

```bash
npm --workspace @portfolio/api run deploy
```

Before deploy, apply migrations against remote D1 and seed as needed:

```bash
npx wrangler d1 migrations apply portfolio-db --config apps/api/wrangler.toml
node packages/db/src/seed-from-projects.mjs --db portfolio-db
```
