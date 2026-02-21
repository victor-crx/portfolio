# Code Quality Review

## 1) Quick assessment of `app.js` architecture + obvious bugs

### Architecture snapshot
- `app.js` is a large, all-in-one IIFE that owns multiple concerns: navigation and focus management, animation orchestration, reveal/intersection behavior, data loading, filtering, modal rendering, and custom select widgets.
- Positive: there is clear defensive coding in several places (timeouts for fetches, reduced-motion checks, guarded DOM lookups, and accessibility helpers).
- Main concern: feature breadth in a single file (~1,300 lines) creates tight coupling between unrelated UI systems. This increases regression risk and makes testability difficult.

### Obvious bug and correctness risks
1. **Potential crash while loading project details if summary rows are malformed**  
   `loadProjectsFromApi()` assumes every summary row has a valid `id` and immediately calls `encodeURIComponent(summary.id)`. If one row is missing `id`, this throws synchronously and the whole API path falls back to static JSON. This is fail-safe but can mask partial data/API issues.  
   (Observed in the detail fan-out call path.)
2. **Resize handler does repeated heavy DOM state updates on every resize event**  
   The navigation resize listener performs several class/attribute mutations each event without debouncing/throttling. On mobile orientation change or drag-resize, this can cause avoidable layout work.
3. **Single-file state complexity increases bug surface**  
   Global mutable state (`projects`, `filtered`, modal index, gallery index, lock counters, custom-select instances, hash-sync flags) is spread across many responsibilities, which makes ordering bugs more likely during future changes.

## 2) API endpoint correctness + pagination considerations

### Endpoint correctness review
- `GET /api/projects` correctly supports optional filters (`collection`, `type`, `q`) plus `page` and `pageSize`, with upper bound `pageSize <= 100`.
- SQL query composition uses parameter binding for filters and pagination values, which is good for safety.
- `GET /api/projects/:id` correctly resolves by either id or slug, returns 404 when not found, and parses JSON-ish columns into arrays.

### Pagination considerations
1. **Client currently neutralizes pagination benefits**  
   The frontend requests page 1, then every page up to `totalPages`, then performs one additional detail request per project. This effectively turns paginated listing into full dataset hydration + N additional network calls.
2. **Pagination metadata is minimal**  
   Response includes `total`, `page`, `pageSize`, but not `totalPages`, `hasNext`, or `hasPrev`. Clients can compute `totalPages`, but richer metadata reduces repeated client logic and edge-case mistakes.
3. **No server-side include mode for list+detail shape**  
   Because list endpoint returns summary fields only, the client must call `GET /api/projects/:id` for each item. For larger catalogs this creates significant request amplification.
4. **No explicit behavior documented for out-of-range pages**  
   Current behavior likely returns empty `data` when `page` exceeds bounds (acceptable), but a documented contract (or explicit metadata) would make this deterministic for consumers.

## 3) Potential performance bottlenecks (identification only)

1. **N+1 request pattern on initial project load**  
   `1 + (totalPages - 1) + projectCount` requests in worst case for projects view (all pages + one detail call per summary).
2. **Sequential page fetch loop**  
   Pages are fetched one-by-one in a `for` loop; latency compounds with each page even before detail fan-out begins.
3. **Potential unbounded DOM growth in prefetch links**  
   `initSmartPrefetch()` appends `<link rel="prefetch">` elements to `<head>` and never cleans them up. For this small route set it is minor, but the pattern does not scale well.
4. **Large monolithic runtime path**  
   All UI systems initialize from one script. Even routes without project grid still pay parse/execute cost for shared logic before early return near grid initialization.
5. **Resize and scroll event work**  
   Scroll behavior is rAF-throttled (good), but resize handling for nav state is not, and could produce unnecessary style/layout churn.

## 4) Recommendations ranked by impact

1. **High impact — eliminate N+1 detail loading**  
   Add a server capability to return detail-enriched project rows in paginated responses (or a batched details endpoint), then hydrate UI from that payload directly.
2. **High impact — move to incremental UI pagination (or lazy-load details)**  
   Render page-by-page rather than hydrating the full catalog upfront. Open modal should request detail only when needed if full detail is not preloaded.
3. **Medium impact — split `app.js` into focused modules**  
   Separate nav/a11y primitives, transitions/reveal, data layer, and project-grid/modal controller. This improves maintainability and reduces regression risk.
4. **Medium impact — parallelize or batch page retrieval when full hydration is required**  
   If full hydration remains necessary, fetch remaining pages concurrently with sensible concurrency limits.
5. **Medium impact — strengthen pagination contract**  
   Return `totalPages`, `hasNext`, and `hasPrev`, and explicitly document out-of-range behavior.
6. **Low impact — throttle/debounce resize-driven nav mutations**  
   Reduce repeated DOM writes during continuous resize/orientation changes.
7. **Low impact — add lightweight runtime guards around summary rows**  
   Validate `summary.id` before detail fetch fan-out; skip malformed rows with telemetry/logging to avoid all-or-nothing fallback.
