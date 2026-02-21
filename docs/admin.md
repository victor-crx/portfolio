# Admin CMS (PR4)

## Configure `ADMIN_TOKEN`

### Local dev
1. In `apps/api`, set a Wrangler secret:
   ```bash
   cd apps/api
   npx wrangler secret put ADMIN_TOKEN
   ```
2. Enter a strong token value when prompted.
3. Run the API locally (`npm run api:dev` from repo root).

### Production
1. In `apps/api`, set the production secret:
   ```bash
   cd apps/api
   npx wrangler secret put ADMIN_TOKEN --env production
   ```
2. Deploy Worker: `npm --workspace @portfolio/api run deploy`.

## Using `/admin`

1. Open `/admin/login`.
2. Paste the same token value and submit.
3. Token is stored in `sessionStorage` for the browser session.
4. Use these routes:
   - `/admin` dashboard counts
   - `/admin/projects` create/edit/publish projects
   - `/admin/services` create/edit/publish services
   - `/admin/certifications` create/edit/publish certifications
   - `/admin/labs` create/edit/publish labs
   - `/admin/site` create/edit/publish site blocks
   - `/admin/inquiries` read-only inquiries
   - `/admin/audit` read-only audit log

## Publish behavior

- Set `status` to `published` in any admin form to publish.
- Public APIs only return published content.
- `/work` updates immediately because it reads from `/api/projects`.
