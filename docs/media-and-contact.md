# Media + Contact setup

## R2 bucket binding
1. Create bucket:
   - `wrangler r2 bucket create portfolio-media`
2. Confirm `apps/api/wrangler.toml` includes:
   - `[[r2_buckets]]`
   - `binding = "R2_BUCKET"`
3. Set Worker env var for public URL base:
   - `R2_PUBLIC_BASE_URL` (example: `https://pub-<id>.r2.dev`)
4. In Cloudflare R2, enable public access for the portfolio media bucket.

## Turnstile keys
1. Create a Turnstile widget in Cloudflare dashboard.
2. Set Cloudflare Pages **Production** environment variable:
   - `TURNSTILE_SITE_KEY`
3. Set Worker secret env var:
   - `TURNSTILE_SECRET_KEY`

## End-to-end test
1. Open `/admin/media` and upload `.jpg`, `.png`, `.webp`, or `.pdf` (<= 10MB).
2. Copy media asset ID and attach it in `/admin/projects` via the attach form.
3. Publish/update the project and verify it renders in `/work` project modal.
4. Open `/contact`, complete Turnstile, submit form.
5. Verify entry appears in `/admin/inquiries`.
6. Submit repeatedly from same IP to verify rate limit protection.
