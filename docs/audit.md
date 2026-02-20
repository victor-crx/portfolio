# Repository Audit (PR0, docs-only)

## Scope and guardrails
- This is a **documentation-only** audit.
- Existing UI and behavior are treated as canonical and must be preserved during migration.
- No redesign, no interaction changes, and no content-model reshaping in the Astro parity phase.

## 1) Current route map

This repo is a static multi-page site using folder-based `index.html` routes:

| Folder / file | URL | Notes |
|---|---|---|
| `index.html` | `/` | Home page, default collection `all` |
| `work/index.html` | `/work/` | Full work index, default collection `all` |
| `systems/index.html` | `/systems/` | Work view preset to `systems` |
| `collab/index.html` | `/collab/` | Work view preset to `collab` |
| `delivery/index.html` | `/delivery/` | Work view preset to `delivery` |
| `creative/index.html` | `/creative/` | Work view preset to `creative` |
| `about/index.html` | `/about/` | About page |
| `contact/index.html` | `/contact/` | Contact page |
| `resume/index.html` | `/resume/` | Resume snapshot page |

Shared runtime/data dependencies:
- `app.js` (global interaction/runtime behavior)
- `styles.css` (global styling system)
- `projects.json` (work grid + modal content source)

## 2) How `app.js` works

### Navigation and accessibility shell
- Injects/normalizes skip-link behavior and focus target (`#main-content`) for keyboard users.
- Creates a mobile nav backdrop and handles compact-nav open/close state.
- Uses `inert`, `tabindex` management, and focus trap logic to keep focus in active UI (mobile nav and modal contexts).
- Locks body scroll during nav/modal overlays with scroll position restoration on close.

### Page transitions + prefetch
- Adds `page-enter` and `page-leave` classes for route transition motion.
- Intercepts internal same-origin link clicks for leave animation before navigation (except hash-only jumps, external targets, downloads, etc.).
- Performs smart prefetch for core routes (`/work/`, `/about/`, `/contact/`, `/systems/`, `/collab/`, `/delivery/`, `/creative/`) on nav hover/focus and idle time, with reduced behavior on constrained network conditions.

### Reveal-on-scroll
- Targets `[data-reveal], .reveal` elements.
- Excludes interactive UI containers from reveal gating (nav, filters, custom-select, modal controls).
- Uses `IntersectionObserver` for one-time reveal classes (`visible`, `is-revealed`) and stagger timing via `--reveal-delay` on `[data-reveal-stagger]` containers.
- Falls back to immediate visibility when `prefers-reduced-motion` is enabled.

### Work grid rendering + filtering
- Initializes only when `[data-project-grid]` exists.
- Fetches `/projects.json`, stores `projects`, computes `filtered`, and sorts descending by `date`.
- Filter state: `collection`, `type`, `search`.
- Sources default collection from `body[data-default-collection]` to support lane pages (`systems`, `collab`, `delivery`, `creative`) while sharing one renderer.
- Renders card HTML from filtered items, updates results count, hydrates media placeholders/loading state, and reapplies reveal/no-widow enhancements.

### Modal + hash routing (`#p=...`)
- Builds modal DOM lazily (`ensureModalElements`) and manages open/close lifecycle with focus restore + scroll lock.
- Supports gallery media navigation (buttons, keyboard arrows, touch swipe).
- Uses URL hash format `#p=<projectId>` as modal state:
  - Opening writes hash (`writeModalHash`) so deep-link and back/forward work.
  - Closing may call `history.back()` when hash-driven.
  - `syncModalFromHash` keeps modal state aligned on init, filters, `hashchange`, `pageshow`, `visibilitychange`.
- Includes BFCache/rehydration safeguards (`safeRehydrateUI`, `hardResetUI`) to avoid stale transition/lock states.

## 3) Styling architecture (`styles.css`) and critical dependencies

### Tokens (design primitives)
- `:root` defines color tokens (`--bg`, `--surface`, `--text`, `--accent`), typography families (`--font-sans`, `--font-serif`), spacing/radius/shadow scales, timing tokens (`--dur-*`) and easing curves.
- Many components depend on these variables directly; parity migration should preserve variable names and semantics first, then refactor later if needed.

### Typography and rhythm
- Typography relies on Inter + Playfair Display loaded from Google Fonts in page `<head>`.
- Balanced headings, no-widow helper usage, and shared spacing/rhythm tokens shape the editorial look.
- Core structural classes (`container`, `section`, heading scales, caption/meta styles) are reused across all pages and modal content.

### Motion system
- Transition classes (`body.page-enter`, `body.page-leave`) and keyframes drive page-level animations.
- Reveal system styles (`[data-reveal]`, `.reveal`, `.is-revealed`) tie directly to `app.js` observer behavior.
- Modal/nav/custom-select states rely on class toggles + transition timing variables.
- `@media (prefers-reduced-motion: reduce)` overrides are essential and must remain functionally equivalent.

## 4) Constraints to preserve

Non-negotiable for migration PRs:
1. **No visual changes** (pixel-level parity target).
2. **No behavior changes** (nav/menu/modal/filter/hash/reveal/transition parity).
3. Keep current URL structure and deep-link semantics, especially `#p=<id>` modal links.
4. Keep current data field expectations from `projects.json` in parity phase.
5. Keep accessibility semantics (focus handling, inert usage, keyboard support).

## 5) Lowest-risk migration plan to Astro on Cloudflare Pages

### Strategy
Adopt a **strangler/parity-first** migration: port page-by-page with shared layouts/components while retaining current HTML structure, class names, and JS runtime behavior.

### Phased approach
1. **Introduce Astro shell with static output parity**
   - Create Astro routes matching current URLs exactly.
   - Port existing HTML into Astro pages/layouts with minimal abstraction.
2. **Carry forward unchanged assets/runtime**
   - Keep `styles.css`, `app.js`, `projects.json` intact initially.
   - Wire them as static assets so UI/behavior remains identical.
3. **Incremental componentization (no visual delta)**
   - Extract header/footer/section shells into Astro components after visual snapshots pass.
4. **Cloudflare Pages deploy parity validation**
   - Configure Astro adapter for Cloudflare Pages.
   - Compare generated markup, route behavior, and interaction flows.
5. **Only after parity: add Workers API/D1/CMS features behind isolated routes/APIs.**

## 6) PR-by-PR implementation roadmap

### Track A — Astro port (UI identical)
- **PR1:** Scaffold Astro project + Cloudflare Pages adapter + route stubs mirroring existing URLs.
- **PR2:** Port global layout/head metadata + shared header/footer; keep `styles.css` and `app.js` unchanged.
- **PR3:** Port home/work/about/contact/resume pages with current markup parity.
- **PR4:** Port lane pages (`systems/collab/delivery/creative`) preserving `data-default-collection` behavior.
- **PR5:** Visual/interaction parity hardening (snapshot diffs, hash-modal regression checks, accessibility smoke checks).

### Track B — Workers API + D1
- **PR6:** Add Worker API skeleton (`/api/*`) and D1 schema migration files for projects/content entities.
- **PR7:** Read-only API endpoints + adapter layer that can still emit current `projects.json` shape.
- **PR8:** Switch frontend data source from static JSON to API (feature-flagged, fallback retained).

### Track C — Admin CMS (website-managed updates)
- **PR9:** `/admin` Astro route + authenticated shell UI (read-only content list first).
- **PR10:** CRUD forms for projects and structured content; optimistic validation + draft/publish states.
- **PR11:** Audit log + revision history tables in D1; rollback endpoint.

### Track D — Cloudflare Access SSO gating `/admin`
- **PR12:** Protect `/admin` with Cloudflare Access policy (IdP SSO).
- **PR13:** Worker middleware verification of Access identity headers + role checks.
- **PR14:** Admin UX polish for auth/session edge cases (expired token, unauthorized role).

### Track E — R2 uploads + Turnstile forms
- **PR15:** R2 bucket integration + signed upload workflow for project media assets.
- **PR16:** CMS media picker and attachment model in D1 linking assets to projects.
- **PR17:** Turnstile protection for public forms (`/contact/` submit endpoint).
- **PR18:** Abuse/rate-limit and operational monitoring pass (Workers logs/analytics alerts).

## Recommended acceptance criteria for all future migration PRs
- Route-level screenshot parity on desktop/mobile for affected pages.
- Keyboard/accessibility smoke tests for nav, filters, modal, and form controls.
- Hash-modal deep-link tests (`/work/#p=<id>`) including back/forward behavior.
- No changes to copy/layout/style unless explicitly scoped in a future redesign PR.
