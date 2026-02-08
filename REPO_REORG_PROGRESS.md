# Repo Reorganization Progress

This file tracks batch-wise cleanup/refactor work so progress can resume safely after interruptions.

## Scope

- Repository: `POS-Awesome-V15-1`
- Goal: organize structure first, then optimize confidently
- Strategy: low-risk changes first, no behavior changes in early batches

## Batch Plan

### Batch 1 - Safe hygiene and tracking (low risk)

- [x] Create persistent progress tracker file
- [x] Add ignore rules for runtime/cache noise
- [x] Remove tracked noise files (logs/cache artifacts)
- [x] Verify no functional source file changed

### Batch 2 - Dead generated frontend artifacts (low risk)

- [x] Audit tracked `*.vue.css` sidecar files
- [x] Remove unreferenced generated sidecars
- [x] Re-verify no imports depend on removed files

### Batch 3 - Naming map and compatibility matrix (planning)

- [x] Build old->new module naming matrix
- [x] Mark canonical modules vs compatibility facades
- [x] Create migration checklist for imports

### Batch 4 - Backend API alignment (controlled)

- [x] Keep legacy APIs as thin wrappers
- [x] Move/centralize business logic to `*_processing`
- [x] Add deprecation notes to wrappers

### Batch 5 - Frontend folder rationalization (controlled)

- [x] Resolve ambiguous composable naming collisions
- [x] Migrate imports incrementally to canonical composables
- [x] Remove vestigial tracked frontend artifacts

### Batch 6 - Hook and service worker consolidation (careful)

- [x] Confirm authoritative hooks file
- [x] Remove duplicate/unused hooks module
- [x] Consolidate service worker source-of-truth

## Change Log

### 2026-02-08 - Batch 1 started

- Added ignore coverage for Python cache dirs and log artifacts in `.gitignore`.
- Created this tracker file for resumable, batch-wise execution.
- Removed tracked noise artifacts: `bench.log`, `bench_start.log`, `frontend/build_log_2.txt`, `posawesome/templates/pages/__pycache__/__init__.py`.
- Confirmed Batch 1 only touched hygiene/tracking files (no runtime business logic changes).
- Removed tracked generated frontend sidecar styles (`frontend/src/**/*.vue.css`) that were not referenced by source imports.
- Verified no `.vue.css` references remain in code search.
- Added Batch 3 naming and module-ownership matrix for guided incremental refactors.
- Added module-level ownership/facade notes in `posawesome/posawesome/api/items.py`, `posawesome/posawesome/api/invoices.py`, `posawesome/posawesome/api/payment_entry.py`, and `posawesome/posawesome/api/customer.py`.
- Centralized customer balance logic into `posawesome/posawesome/api/customers.py`; `api/customer.py` now delegates through a wrapper.
- Confirmed canonical hooks entry remains `posawesome/hooks.py`; no repository references found to `posawesome/posawesome/hooks.py`.
- Removed duplicate hooks module `posawesome/posawesome/hooks.py`.
- Consolidated service-worker source-of-truth to `posawesome/www/sw.js` by removing legacy `frontend/src/sw.ts` and its Vite copy pipeline.
- Rationalized composable naming by introducing `frontend/src/posapp/composables/useLastInvoicePrinting.ts` and migrating navbar usage to avoid naming collision with invoice draft-print composable.
- Validation pass complete: ESLint clean, TypeScript type-check clean, frontend production build successful.

## Validation Commands

Executed in `frontend/`:

1. `npx eslint "src/**/*.{js,ts,vue}"`
2. `yarn type-check`
3. `yarn build`

## Current Status

- All planned batches completed in this pass.
- Next workstream should focus on deeper backend logic migration only if needed for feature/performance work.

## Procedure 2 - Performance Pass (In Progress)

### P2 Batch 1 - Frontend request efficiency

- [x] Normalize item-detail request cache keys to avoid order-based cache misses
- [x] Replace repeated O(n^2) item lookups with maps in hot paths
- [x] Validate lint/type-check/build after optimization changes

### P2 Batch 2 - Backend item detail query reduction

- [x] Reduce repeated `Item` lookups inside `get_item_detail`
- [x] Run frontend validation cycle after backend adjustments

### P2 Batch 3 - Backend syntax safety check

- [x] Compile backend API modules to verify syntax integrity

### P2 Batch 4 - Return flow and hot-path micro-optimizations

- [x] Replace `missing.includes(...)` checks with `Set.has(...)` in item-detail fetch paths
- [x] Remove N+1 returned-invoice document fetches in return validation
- [x] Run full validation cycle after P2 Batch 4

### P2 Batch 5 - Store-level computed optimization

- [x] Collapse `itemStats` multi-pass array scans into a single pass reducer pattern
- [x] Run full validation cycle after P2 Batch 5

### P2 Batch 6 - Return search pagination optimization

- [x] Replace `count`-driven has_more with `page_length + 1` pagination detection
- [x] Limit expensive `count` query usage to first page only
- [x] Run full validation cycle after P2 Batch 6

### P2 Batch 7 - Item search N+1 attribute fetch reduction

- [x] Preload template attributes per page instead of per-item lookups
- [x] Preload variant attribute rows per page instead of per-item lookups
- [x] Run full validation cycle after P2 Batch 7

### P2 Batch 8 - Draft invoice fetch path optimization

- [x] Replace draft-list N+1 full-doc loads with lightweight list query
- [x] Add explicit endpoint to fetch a single draft doc on demand
- [x] Update draft-load UI flow to fetch full doc only for selected row
- [x] Run full validation cycle after P2 Batch 8

### P2 Batch 9 - Return search payload slimming

- [x] Replace parent invoice `fields=["*"]` with explicit, UI-required fields
- [x] Slim child item/payment fetches to explicit fields required by return flow
- [x] Run full validation cycle after updated P2 Batch 9 scope

### P2 Batch 10 - Return detail lazy-loading

- [x] Remove heavy item/payment payload from invoice search listing path
- [x] Add on-demand endpoint to fetch one return-ready invoice with remaining qty
- [x] Update returns UI to fetch selected invoice details before constructing return doc
- [x] Run full validation cycle after P2 Batch 10

### P2 Batch 11 - Invoice watcher overhead reduction

- [x] Disable unnecessary deep watching for `invoiceToLoad` and `orderToLoad`
- [x] Run full validation cycle after P2 Batch 11

### P2 Batch 12 - UI flow cleanup (low risk)

- [x] Remove redundant duplicate state assignments in returns dialog init flow
- [x] Run frontend validation cycle after P2 Batch 12

### P2 Batch 13 - Optional performance telemetry hooks

- [x] Add opt-in perf logging helpers in shared API utils
- [x] Instrument bulk item-details API timing and payload size
- [x] Instrument return search/detail APIs timing and row counts
- [x] Run full validation cycle after P2 Batch 13

### P2 Batch 14 - Return search count-query removal

- [x] Remove expensive `frappe.db.count(...)` path from paginated return search
- [x] Keep backward-compatible `total_count` shape via lightweight approximation
- [x] Run full validation cycle after P2 Batch 14

### P2 Batch 15 - Item search telemetry coverage

- [x] Instrument `get_items` with cache-path-aware timing logs
- [x] Include search/group context and row count in telemetry payload
- [x] Run full validation cycle after P2 Batch 15

### P2 Batch 16 - Draft flow telemetry coverage

- [x] Instrument draft list endpoint timings and row counts
- [x] Instrument single draft doc fetch timings and item counts
- [x] Run full validation cycle after P2 Batch 16

### P2 Batch 17 - Return detail micro-optimization

- [x] Use cached invoice doc loading in return-detail endpoint
- [x] Replace qty accumulation map with `defaultdict(float)` for lower overhead
- [x] Run full validation cycle after P2 Batch 17

### P2 Batch 18 - Return detail payload slimming

- [x] Stop returning full `as_dict()` invoice payload for return detail endpoint
- [x] Return targeted top-level fields + child rows needed by return flow
- [x] Run full validation cycle after P2 Batch 18

### P2 Batch 19 - Return flow payload/log cleanup

- [x] Slim child item/payment serialization in `get_invoice_for_return` to explicit fields
- [x] Remove noisy return-flow debug `console.log` calls in frontend handlers
- [x] Run full validation cycle after P2 Batch 19

### P2 Batch 20 - Return pagination/input correctness + watcher overhead

- [x] Fix page normalization in return search API to correctly handle int/string values
- [x] Avoid deep watch in returns dialog profile watcher
- [x] Run full validation cycle after P2 Batch 20

### P2 Batch 21 - Frontend debug-log cleanup in hot paths

- [x] Remove customer watcher debug logging in invoice watcher module
- [x] Remove sales-team watch debug logging in payments flow
- [x] Run full validation cycle after P2 Batch 21

### P2 Change Log

- Optimized `frontend/src/posapp/composables/useItemDetailFetcher.ts` by:
    - adding stable request key generation for `get_items_details` cache dedupe,
    - replacing repeated `find(...)` loops with `Map` lookups in visible-item refresh and details merge paths.
- Reduced duplicate DB calls in `posawesome/posawesome/api/item_processing/details.py:get_item_detail` by fetching `max_discount`, `allow_negative_stock`, and `stock_uom` in one `frappe.db.get_value(..., as_dict=True)` query.
- Executed backend syntax validation: `python -m compileall posawesome/posawesome/api` (successful).
- Replaced repeated missing-code array scans in `frontend/src/posapp/composables/useItemDetailFetcher.ts` with `Set` membership checks.
- Optimized `posawesome/posawesome/api/invoice_processing/returns.py:validate_return_items` to query return item rows in bulk instead of loading each return invoice document.
- Optimized `frontend/src/posapp/stores/itemsStore.ts:itemStats` by reducing multiple scans over `items` to one pass.
- Optimized `posawesome/posawesome/api/invoice_processing/returns.py:search_invoices_for_return` to derive `has_more` via `limit_page_length = page_length + 1` and avoid full `count` on every paginated request.
- Optimized `posawesome/posawesome/api/item_processing/search.py` by replacing per-item attribute queries in `_shape_item_row` with one-page prefetch maps built in `_build_attribute_maps`.
- Optimized draft workflow:
    - `posawesome/posawesome/api/invoices.py:get_draft_invoices` now returns summary rows (no per-row `get_cached_doc` loop),
    - added `get_draft_invoice_doc` for on-demand full document load,
    - updated `frontend/src/posapp/components/pos/Drafts.vue` to fetch full draft only when user clicks Load.
- Slimmed parent payload for return search in `posawesome/posawesome/api/invoice_processing/returns.py:search_invoices_for_return` by selecting only required invoice columns.
- Slimmed child payloads for return search by replacing item/payment `fields=["*"]` with explicit lists used by return construction and UI.
- Added `get_invoice_for_return` in `posawesome/posawesome/api/invoice_processing/returns.py` and exposed via `posawesome/posawesome/api/invoices.py`.
- Updated `frontend/src/posapp/components/pos/Returns.vue` so full invoice details are fetched only for the selected row, reducing search-result payload and request processing costs.
- Reduced reactive overhead in `frontend/src/posapp/components/pos/Invoice.vue` by switching two store watches from deep to shallow where object replacement semantics are already used.
- Added opt-in perf telemetry (`posa_perf_log_enabled`) via `posawesome/posawesome/api/utils.py` and wired timing logs into:
    - `posawesome/posawesome/api/item_processing/details.py:get_items_details`
    - `posawesome/posawesome/api/invoice_processing/returns.py:search_invoices_for_return`
    - `posawesome/posawesome/api/invoice_processing/returns.py:get_invoice_for_return`
- Eliminated count query in `posawesome/posawesome/api/invoice_processing/returns.py:search_invoices_for_return` (frontend does not consume exact totals), reducing DB load per search request.
- Added telemetry instrumentation in `posawesome/posawesome/api/item_processing/search.py:get_items` for better end-to-end performance visibility.
- Added telemetry for draft endpoints in `posawesome/posawesome/api/invoices.py` (`get_draft_invoices`, `get_draft_invoice_doc`).
- Optimized `posawesome/posawesome/api/invoice_processing/returns.py:get_invoice_for_return` to use `frappe.get_cached_doc` and simplified returned-qty aggregation with `defaultdict(float)`.
- Further slimmed `get_invoice_for_return` response to a minimal, return-flow-focused payload instead of full invoice document serialization.
- Reduced return-flow payload noise further by serializing only required item/payment fields and removed non-actionable debug logs in `Returns.vue` and `useInvoiceHandlers.ts`.
- Corrected return search pagination normalization in `search_invoices_for_return` (previous logic could reset non-string page values to page 1) and reduced reactive overhead in `Returns.vue` by switching profile watch to shallow mode.
- Removed additional non-actionable `console.log` calls in frequently triggered frontend watchers (`invoiceWatchers.ts`, `Payments.vue`) to reduce console overhead and noise.

## Perf Logging Usage

- Enable in site config: `bench --site <site> set-config posa_perf_log_enabled 1`
- Disable after analysis: `bench --site <site> set-config posa_perf_log_enabled 0`
- Log signature: `[POSA_PERF] event=<name> elapsed_ms=<ms> ...context`

## Batch 3 Output - Canonical Module Matrix

### Backend API canonicalization

- Canonical item domain: `posawesome/posawesome/api/item_processing/*` + `posawesome/posawesome/api/item_fetchers.py`.
- Canonical invoice domain: `posawesome/posawesome/api/invoice_processing/*`.
- Canonical payment domain: `posawesome/posawesome/api/payment_processing/*`.
- Canonical shared helpers: `posawesome/posawesome/api/utils.py` (avoid adding new helpers to `utilities.py`).

### Legacy-to-canonical mapping (keep wrappers temporarily)

- `posawesome/posawesome/api/items.py` -> keep as API facade, delegate internals to `item_processing/*`.
- `posawesome/posawesome/api/invoice.py` -> delegate to `invoice_processing/*`.
- `posawesome/posawesome/api/payments.py` -> delegate to `payment_processing/*`.
- `posawesome/posawesome/api/payment_entry.py` -> keep wrapper-only module (already near this model).
- `posawesome/posawesome/api/customer.py` and `posawesome/posawesome/api/customers.py` -> pick one canonical owner (`customers.py` preferred), keep one compatibility shim.
- `posawesome/posawesome/api/utils.py` vs `posawesome/posawesome/api/utilities.py` -> freeze `utils.py` as canonical; mark `utilities.py` compatibility-only.

### Frontend naming alignment targets

- Keep feature folders as canonical where present: `frontend/src/posapp/composables/invoice/*`, `frontend/src/posapp/composables/items/*`, `frontend/src/posapp/composables/item_addition/*`.
- Collapse duplicates by choosing feature-folder variant as canonical:
    - `frontend/src/posapp/composables/useInvoicePrinting.ts` -> canonical should be `frontend/src/posapp/composables/invoice/useInvoicePrinting.ts`.
    - `frontend/src/posapp/composables/useItemsLoader.ts` vs `frontend/src/posapp/composables/items/*` family -> move loader logic behind `items/` entrypoints.

### Import migration checklist

1. Add deprecation docstring to each legacy facade module.
2. Update internal imports to canonical modules first.
3. Keep external API paths stable for frontend/Frappe hooks until final batch.
4. Remove compatibility wrappers only after grep confirms zero references.

## Resume Instructions

1. Check current git status.
2. Continue from first unchecked task in active batch.
3. After each action, append a short log entry with date and file paths touched.
