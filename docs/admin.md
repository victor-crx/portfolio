# Admin CMS

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

## Admin shell UX

- `/admin` now uses shared utility behavior from `admin.js`:
  - `toast(message, type)` notifications for saves/errors.
  - `confirmModal(title, body, confirmText)` with focus trap + ESC close.
  - `setLoading(el, boolean)` for submit button loading state.
  - `fetchJSON(url, opts)` standardized errors + Access/local token auth.
- All admin tables render explicit loading and empty states.
- Pagination helper is used on the inquiries inbox (`Prev/Next` + page details).
- The left nav shows a current-user badge (`email + role`) from `GET /api/admin/me`, cached in session storage.

## Using `/admin`

1. Open `/admin/login` (local token flow only).
2. Paste the same token value and submit.
3. Token is stored in `sessionStorage` for the browser session.
4. Use these routes:
   - `/admin` dashboard counts
   - `/admin/projects` create/edit/publish projects
   - `/admin/media` upload/edit media metadata
   - `/admin/services` create/edit/publish services
   - `/admin/certifications` create/edit/publish certifications
   - `/admin/labs` create/edit/publish labs
   - `/admin/site` create/edit/publish site blocks
   - `/admin/inquiries` ticketing inbox
   - `/admin/audit` audit trail

## Inquiries workflow (ticketing inbox)

- Inbox table columns: ID, Type, Email, Subject, Status, Created, Assigned.
- Filters: status, type, date range, and debounced free-text search.
- Supports server pagination (`page` + `pageSize`) with response metadata.
- Detail modal supports:
  - full inquiry record including message and metadata JSON
  - status actions: Mark read, Close, Reopen
  - optional assignment (`assigned_to_email`)
  - chronological notes thread with note creation
- Backend audit log captures:
  - status changes
  - assignment changes
  - note creation

## Publish behavior

- Set `status` to `published` in any admin form to publish.
- Public APIs only return published content.
- `/work` updates immediately because it reads from `/api/projects`.
