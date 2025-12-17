# Bolt's Journal

A log of critical learnings about performance in this codebase.

## 2024-05-24 - Synchronous Remarks Generation
**Learning:** The `submit_invoice` and `submit_in_background_job` functions in `posawesome/posawesome/api/invoices.py` were synchronously generating a detailed `remarks` string by iterating over every item in the invoice. This operation was not critical to the core functionality of submitting an invoice and added unnecessary processing time, especially for carts with a large number of items.
**Action:** Removed the `remarks` generation logic from both functions to reduce the latency of the invoice submission process.
## 2024-05-22 - [Initial Setup]
**Learning:** Initialized Bolt's journal.
**Action:** Record only critical learnings that affect future performance decisions.

## 2024-05-22 - [Vue Reactivity Anti-Pattern]
**Learning:** Initializing large caching objects (like `Map` or `Set`) in Vue's `data()` method makes them deeply reactive. This causes significant performance overhead for every read/write operation, especially when these caches are large (e.g., item indexes, formatting caches).
**Action:** Move such caches to the `created()` lifecycle hook (Vue 2) or `setup()` (Vue 3) to keep them non-reactive while still being accessible via `this`. This avoids the reactivity system entirely for data that doesn't need to trigger UI updates directly.

## 2024-05-24 - [N+1 Stock Validation]
**Learning:** The `validate_cart_items` and `submit_invoice` functions perform N+1 database queries to check stock for each item in the cart. This effectively doubles the validation overhead since it happens on both pre-submit and submit.
**Action:** Implement bulk stock fetching to reduce DB round-trips.
