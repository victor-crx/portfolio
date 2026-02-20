# Editorial Portfolio v1 (Static)

A static, brochure-inspired portfolio with a luxury/editorial layout language and a strict black/off-white/red palette.

## Structure

- `/index.html` homepage (hero, featured highlight, testimonial band, collection preview)
- `/work/index.html` master portfolio with full filtering + modal details
- `/systems/`, `/collab/`, `/delivery/`, `/creative/` thin wrapper views (same app, different default collection)
- `/about/`, `/resume/`, `/contact/` supporting pages
- `/projects.json` single source of portfolio item content
- `/styles.css` global design system
- `/app.js` shared interactions (filters, modal, nav, reveal)
- `/assets/` placeholder visuals + placeholder PDFs

## Editing `projects.json`

All project content is driven from one file:

```json
{
  "projects": [
    {
      "id": "unique-id",
      "title": "Project title",
      "summary": "Card summary",
      "type": "case_study",
      "collections": ["systems", "delivery"],
      "tags": ["vendor", "risk"],
      "tools": ["Power BI", "Excel"],
      "date": "2025-02",
      "sections": {
        "problem": "...",
        "constraints": "...",
        "actions": ["..."],
        "results": ["..."],
        "next_steps": ["..."]
      },
      "artifacts": [
        { "label": "Optional label", "path": "./assets/example.svg" }
      ]
    }
  ]
}
```

### Required fields

- `id`, `title`, `summary`, `type`, `collections`, `tags`, `tools`, `date`, `sections`
- Supported `type`: `case_study`, `lab`, `template`, `gallery`, `writing`
- Supported `collections`: `systems`, `collab`, `delivery`, `creative`

## How to add a new item

1. Open `projects.json`.
2. Duplicate an existing object inside `projects`.
3. Update `id` to a unique slug.
4. Set `type`, `collections`, `tags`, and `tools`.
5. Add your narrative in `sections`.
6. Add artifact paths to files in `/assets`.
7. Save and refresh `work/` (or a collection page).

## Local usage

No framework or build step is required.

- Open `index.html` directly in a browser.
- Navigate to `work/` for filtering and modal details.

If your browser blocks `fetch()` from `file://`, run a lightweight local static server for development only.

## Deploy via GitHub → Cloudflare Pages (no build step)

1. Push the repository to GitHub.
2. In Cloudflare Pages, create a project from the repo.
3. Framework preset: **None**.
4. Build command: `exit 0`.
5. Build output directory: `/`.
6. Deploy.

Because this is static HTML/CSS/JS, Cloudflare can serve files directly without compilation.

## SEO basics

At minimum, set per page:

- `<title>`
- `<meta name="description">`
- Open Graph tags:
  - `og:title`
  - `og:description`
  - `og:type`
  - optional `og:image`

Also keep heading hierarchy semantic (`h1` then `h2` etc.) and ensure image `alt` text is meaningful.

## Replace first

1. Name/brand text (`Victor Lane`) across all pages.
2. Homepage hero tagline and supporting copy.
3. Contact links and social URLs.
4. Resume placeholder PDF (`/assets/resume-placeholder.pdf`).
5. Project sample entries in `projects.json` with your own portfolio items.

## Privacy / sanitization note

Current sample content avoids real organization names, domains, private network details, and sensitive implementation specifics.

## Backend foundations

See `docs/backend.md` for Cloudflare Worker + D1 local development and migration/seed instructions.
