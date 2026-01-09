## 2024-05-22 - [Initial Setup]
**Learning:** Initialized Bolt's journal.
**Action:** Record only critical learnings that affect future performance decisions.

## 2024-05-22 - [Vue Reactivity Anti-Pattern]
**Learning:** Initializing large caching objects (like `Map` or `Set`) in Vue's `data()` method makes them deeply reactive. This causes significant performance overhead for every read/write operation, especially when these caches are large (e.g., item indexes, formatting caches).
**Action:** Move such caches to the `created()` lifecycle hook (Vue 2) or `setup()` (Vue 3) to keep them non-reactive while still being accessible via `this`. This avoids the reactivity system entirely for data that doesn't need to trigger UI updates directly.

## 2025-12-19 - [Throttle cache cleanup in search flows]
**Learning:** The item search cache cleanup sorted and iterated the full Map on every write, creating noticeable main-thread spikes during rapid typing. Per-call cleanup is overkill when the cache is already under its size cap.
**Action:** Gate cleanup by time and size; prefer periodic sweeps or size-triggered cleanup to prevent blocking user input during fast search sequences.

## 2025-12-19 - [Cart merge scans don't scale]
**Learning:** Both the POS item addition flow and the ItemsTable component used repeated `Array.find` scans to merge incoming items with existing lines. With 100+ rows, burst additions became O(n²) and measured ~6ms per 500 merges versus ~1ms when using a keyed Map.
**Action:** Prefer non-reactive merge maps keyed by item_code/uom/rate (plus batch when needed) and refresh them incrementally so burst additions stay O(1) per item.

## 2025-12-19 - [Refine local search results]
**Learning:** Filtering the entire item catalog (potentially thousands of items) on every keystroke (O(N)) is wasteful when the user is simply appending characters to refine a search.
**Action:** When a search term is an extension of the previous term (e.g., "app" -> "appl") and the result set was not empty, filter the *previous* result set instead of the full list. This reduces the search space from O(N) to O(K) where K << N.

## 2025-05-23 - [N+1 in Search API]
**Learning:** The `search_invoices_for_return` API was performing an O(N) `frappe.get_doc` for every invoice in the results page (100 items), plus nested O(M) `frappe.get_doc` for every return linked to those invoices. This made the Returns search extremely slow (seconds latency).
**Action:** Replaced `frappe.get_doc` loops with bulk `frappe.get_all` queries and manual Python-side assembly (Eager Loading). This reduced DB queries from ~200+ per request to ~5 constant queries, regardless of page size.
