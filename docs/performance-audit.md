# POS Awesome — Full Repo Performance Audit

**Date:** 2026-04-29  
**Scope:** Entire repository — Python backend, Vue/TS frontend, offline layer, build config  
**Total Issues Found:** 65  

---

## Severity Legend
- 🔴 **HIGH** — Measurable lag, N+1 queries, blocking operations
- 🟡 **MEDIUM** — Noticeable under load or large data
- 🟢 **LOW** — Minor overhead, code quality improvements

---

## 1. Python Backend Issues (29 total)

### 🔴 HIGH

| # | File | Lines | Function | Issue |
|---|------|-------|----------|-------|
| B1 | `api/bundles.py` | 22–47 | `get_bundle_components()` | **N+1**: Loop calls `frappe.get_doc("Product Bundle", ...)` then inner loop calls `frappe.db.get_value("Item", ...)` per row. 10 bundles × 5 items = 50 extra queries. |
| B2 | `api/sales_orders.py` | 30–40 | `search_orders()` | **N+1 + No Limit**: Fetches `["name"]` only then loops and calls `frappe.get_doc("Sales Order", ...)` per row. Also `limit_page_length=0` so all orders load. |
| B3 | `api/commercial_flow.py` | 122–143 | `_search_delivery_notes()` | **No Limit**: `limit_page_length=0` returns ALL delivery notes. 10,000 notes = massive memory hit. |
| B4 | `api/sales_orders.py` | 30–40 | `search_orders()` | **No Limit**: `limit_page_length=0` before per-doc loop makes it exponentially worse. |
| B5 | `api/offers.py` | 110–149 | `_get_promotional_scheme_offers()` | **N+1**: Queries Promotional Schemes list, then calls `frappe.get_doc("Promotional Scheme", row.name)` in a loop for each row. |

---

### 🟡 MEDIUM

| # | File | Lines | Function | Issue |
|---|------|-------|----------|-------|
| B6 | `api/shifts.py` | 43–54 | `get_opening_dialog_data()` | **N+1 (cached)**: Loops payment methods, calls `frappe.get_cached_value("POS Profile", ...)` per row. |
| B7 | `api/commercial_flow.py` | 80–97 | `get_draft_invoices()` | **No Limit**: Default allows `limit_page_length=0` — unbounded result set. |
| B8 | `api/offers.py` | 66–83 | `get_offers()` | **SELECT \***: Fetches all columns. Only a subset needed. |
| B9 | `api/employees.py` | 17–25 | `_get_terminal_users()` | **Missing Cache**: Called on every request for same POS profile. No `@redis_cache`. |
| B10 | `api/item_processing/details.py` | 81–89 | `get_item_detail()` | **Missing Cache**: `frappe.get_all()` on Serial No per item call, no caching. |
| B11 | `api/dashboard.py` | 67, 120 | Multiple | **Missing Cache**: Uses `frappe.get_doc("POS Profile", ...)` instead of `frappe.get_cached_doc()`. |
| B12 | `api/customers.py` | 168–179 | `_fetch_customer_info()` | **Duplicate Queries**: Two separate `frappe.get_value()` calls for customer group price list and price list currency — could be batched. |
| B13 | `api/payment_processing/data.py` | 15–50 | `_get_open_sales_invoices()` | **Sequential Queries**: Pattern risk of N+1 in consuming code. |
| B14 | `api/offers.py` | 66–83 | `get_offers()` | **Index Risk**: Filters on `disable`, `company`, `pos_profile`, `warehouse`, `valid_from`, `valid_upto` with OR — potential full table scan. |
| B15 | `api/customers.py` | 99–130 | `_get_customer_names()` | **Index Risk**: Filter on `modified` + `name` — needs composite index for `modified_after` queries. |
| B16 | `api/gift_cards.py` | 252–318 | `apply_invoice_gift_card_redemptions()` | **Non-atomic Saves**: `gift_card_doc.save()` in loop without `frappe.db.commit()` — partial redemptions possible on failure. |
| B17 | `api/customers.py` | 93–136 | `get_customer_names()` | **Cache Key Issue**: `pos_profile` JSON string used as cache key — same profile may miss cache if object serialized differently. |
| B18 | `api/bundles.py` | 26 | `get_bundle_components()` | **Over-fetch**: `frappe.get_doc("Product Bundle", ...)` loads entire doc; only `.items` is used. Use `frappe.get_list("Product Bundle Item", ...)` instead. |
| B19 | `api/shifts.py` | 105, 108 | `update_opening_shift_data()` | **Over-fetch**: Loads full `POS Profile` and `Company` docs when only 1–2 fields needed. |
| B20 | `api/invoice_processing/creation.py` | 76–119 | `_process_post_submit_payments()` | **Sync Blocking**: Default path blocks request until all payment entries created. Should always `enqueue()`. |

---

### 🟢 LOW

| # | File | Lines | Function | Issue |
|---|------|-------|----------|-------|
| B21 | `api/shifts.py` | 43–51 | `get_opening_dialog_data()` | **SELECT \***: `fields=["*"]` on payment methods. |
| B22 | `api/shifts.py` | 104–108 | `update_opening_shift_data()` | **Duplicate Lookups**: POS Profile + Company fetched separately, could batch. |
| B23 | `api/purchase_orders.py` | 82–109 | `_resolve_supplier_buying_price_list()` | **Duplicate Lookups**: Two `frappe.db.get_value()` calls that could be one. |
| B24 | `api/invoices.py` | 77–78 | `get_draft_invoices()` | **Index Risk**: Filter on `posa_is_printed` — check index exists. |
| B25 | `api/customers.py` | 390–422 | `set_customer_info()` | **Missing Commit**: No explicit `frappe.db.commit()` between Contact and Customer saves. |
| B26 | `api/commercial_flow.py` | 325–330 | `prepare_document_flow_action()` | **Sync Block**: Document mapping blocks response on large docs. |
| B27 | `api/quotations.py` | 90–112 | `search_quotations()` | **Over-fetch**: Returns all quotation fields; specify needed fields. |
| B28 | `api/pricing_rules.py` | 66–71 | `_get_targets_map()` | **Over-fetch**: `frappe.get_all()` without `fields=` may fetch extra columns. |
| B29 | `api/item_fetchers.py` | 99–110 | `get_item_prices()` | **Cache TTL**: TTL from profile setting; if unset, inconsistent fallback behavior. |

---

## 2. Frontend Vue/TypeScript Issues (20 total)

### 🔴 HIGH

| # | File | Lines | Issue |
|---|------|-------|-------|
| F1 | `stores/invoiceStore.ts` | 581–588 | **Deep Watcher on Map**: `watch(itemsData, ..., { deep: true })` traverses entire `reactive(Map)` on every item field change. Every qty/rate edit triggers full Map traversal. |
| F2 | `composables/pos/invoice/useInvoiceOffers.ts` | 93–102 | **Deep Watcher + Expensive Callback**: `watch([items, posOffers, ...], ..., { deep: true })` triggers `scheduleOfferRefresh()` (O(n) over all offers × items) on every cart change. |
| F3 | `composables/pos/invoice/useInvoiceOffers.ts` | 161+ | **Timer Leak**: `_offerRefreshHandle` scheduled via rAF/setTimeout with no `onUnmounted` cleanup. Multiple Invoice component mounts/unmounts accumulate orphaned timers. |

---

### 🟡 MEDIUM

| # | File | Lines | Issue |
|---|------|-------|-------|
| F4 | `stores/customersStore.ts` | 432–499 | **Sequential Customer Pages**: `while` loop with `await fetchCustomerPage()` — 10,000 customers in pages of 1,000 = 10 sequential calls. Could use `Promise.all()`. |
| F5 | `stores/customersStore.ts` | 369–375 | **No Debounce on Customer Search**: Every keystroke triggers full Dexie query — no debounce/throttle. |
| F6 | `stores/customersStore.ts` | 232–270 | **O(n) Customer Upsert**: `findIndex` (O(n)) + full array spread on every customer update. Use a `Map` for O(1) lookup. |
| F7 | `components/pos/invoice/invoiceWatchers.ts` | 259–268 | **Blocking Loop on Price List Change**: Synchronous `forEach` over all items to reset `_detailSynced`. Jank on 100+ item invoices. |
| F8 | `components/pos/invoice/ItemsTable.vue` | 14 | **Virtual Scroll Key**: `item-value="posa_row_id"` — if IDs collide or reuse, virtual scroll renders wrong rows. |
| F9 | `components/pos/items/ItemCard.vue` | 10–21 | **No Lazy Loading on Images**: All item images load immediately. With 50+ cards visible, causes network/memory spike. |
| F10 | `composables/pos/items/store/useItemsSync.ts` | 297–330 | **Sequential Batch Saves**: `await saveItemsBulk()` and `await updateCachedPaginationFromStorage()` inside loop — each batch waits for the previous to fully persist. |
| F11 | `composables/pos/shared/useCustomerDisplayPublisher.ts` | 97, 144 | **Timer Leak**: `publishTimer` created without `onUnmounted` cleanup — leaks if component unmounts before timeout fires. |
| F12 | `stores/itemsStore.ts` | 289–319 | **Heavy Computed**: `itemStats` iterates ALL items on every access to build group Set + stats. No memoization with change detection. |
| F13 | `composables/pos/items/useItemDetailFetcher.ts` | 169–195 | **AbortController Not Guaranteed Cleaned**: No `onUnmounted` hook ensuring abort fires on component destruction. |
| F14 | `composables/pos/items/useItemSearch.ts` | 39–53 | **Stale Search Cache**: `searchCache` (Map) never invalidated when `items.value` changes — stale results after item updates. |
| F15 | `stores/itemsStore.ts` | 976–1051 | **Map Rebuilt on Every Bulk Update**: `updateItemsInPlace()` creates new `Map` from `items.value` on every call instead of reusing existing index. |

---

### 🟢 LOW

| # | File | Lines | Issue |
|---|------|-------|-------|
| F16 | `composables/pos/items/useItemsSelectorFocus.ts` | 75–106 | **Event Listener Cleanup**: Global focus listeners may accumulate without confirmed removal on unmount. |
| F17 | `composables/pos/invoice/invoiceComputed.ts` | 117–138 | **Discount Fallback Re-iterates**: Falls back to full `items.forEach` when store discount total unavailable — no memo/cache. |
| F18 | `stores/customersStore.ts` | 340–360 | **No Total Load Limit**: Local Dexie pagination works but overall loaded customer count unbounded over time. |
| F19 | `composables/pos/items/useItemSearch.ts` | 28–29 | **No ShallowRef on Lookup Maps**: `searchCache` plain Map could use `shallowRef` to avoid deep reactivity overhead. |
| F20 | `stores/invoiceStore.ts` | 237, 254, 306+ | **Redundant Item Clones**: `cloneItem()` called on every insert; shallow spread would suffice in most cases. |

---

## 3. Offline / Sync / Build Issues (16 total)

### 🔴 HIGH

| # | File | Lines | Issue |
|---|------|-------|-------|
| O1 | `offline/sync/SyncCoordinator.ts` | 128–129 | **Concurrency = 1**: All sync resources run sequentially by default. `items`, `customers`, `stock`, `currency_matrix` are independent — could run 2–3 in parallel. |
| O2 | `offline/cache.ts` | 424–434 | **One-by-one IndexedDB Writes on Fallback**: Bulk write failure falls back to individual `db.table("items").put(row)` in loop — N separate DB transactions for N items. |

---

### 🟡 MEDIUM

| # | File | Lines | Issue |
|---|------|-------|-------|
| O3 | `offline/writeQueue.ts` | 437–459 | **Sequential Queue Entry Claims**: Claims entries one-by-one with `await table.put(nextEntry)` — use `bulkPut()`. |
| O4 | `offline/invoices.ts` | 229–265 | **Sequential Invoice Sync**: `for...of` with `await frappe.call()` per invoice — 10 pending invoices = 10 sequential requests. |
| O5 | `offline/payments.ts` | 85–106 | **Sequential Payment Sync**: Same pattern as invoices — awaits each payment submission in loop. |
| O6 | `offline/cache.ts` | Multiple | **JSON.parse/stringify Everywhere**: Used for deep cloning in tight paths (461, 545, 615, 688, 829, 856, 904, 920, 948, 1026, 1139). Use `structuredClone()` which is faster and native. |
| O7 | `offline/cache.ts` | 198, 540–585 | **No Per-Entry TTL on Large Caches**: `price_list_cache`, `uom_cache` accumulate stale data for full 24h TTL with no proactive cleanup. |
| O8 | `components/pos/invoice/invoiceWatchers.ts` | 221–279 | **Full Cache Clear on Price List Change**: `clearPriceListCache()` + full rate re-application on every currency/price-list switch — could diff and update only changed items. |
| O9 | `offline/stock.ts` | 13–40 | **Sequential Stock Chunk Fetches**: Stock fetched in chunks but each chunk awaited before next starts — use `Promise.all()` on chunk requests. |
| O10 | `posawesome/www/sw.js` | 234–319 | **Service Worker: No API Response Caching**: Only static assets cached. API responses not cached — no stale-while-revalidate for offline fallback. |
| O11 | `frontend/vite.config.js` | 83–94 | **No Code Splitting for Large On-demand Libs**: `html2pdf`, `jsbarcode`, `nunjucks` bundled in single `vendor` chunk loaded eagerly. Should be dynamic imports. |

---

### 🟢 LOW

| # | File | Lines | Issue |
|---|------|-------|-------|
| O12 | `offline/cache.ts` | 1564–1619 | **Cache Usage Estimation Blocks Main Thread**: Iterates ALL localStorage keys + ALL IndexedDB rows synchronously. Should run in worker or be approximate. |
| O13 | `offline/sync/SyncCoordinator.ts` | 166–170 | **JSON Round-trip on `getLastRunSummary()`**: Called multiple times per sync pass — use `Object.assign({}, ...)` shallow copy instead. |
| O14 | `components/pos/invoice/invoiceWatchers.ts` | 210–219 | **No Debounce on `posting_date` Watcher**: Formats date on every keystroke change — should debounce. |
| O15 | `frontend/package.json` | 18–41 | **Oversized Dependencies**: `lodash` (full bundle), `nunjucks`, `html2pdf.js` — use tree-shaking or lighter alternatives. |
| O16 | `offline/db.ts` | 385–390 | **No `requestIdleCallback` on Non-critical Ops**: Only DB init defers to idle time. Cache rebuilds and queue syncing could also defer. |

---

## Priority Roadmap

### Phase 1 — Quick wins (1–2 days each)
1. **O1** — Raise SyncCoordinator concurrency to 2–3
2. **O6** — Replace `JSON.parse/stringify` with `structuredClone()`
3. **O9** — Parallelize stock chunk fetches with `Promise.all()`
4. **O4+O5** — Parallelize invoice/payment queue sync
5. **F1** — Replace deep watcher with version-counter watcher on invoiceStore
6. **F9** — Add `loading="lazy"` to `<v-img>` in ItemCard

### Phase 2 — Backend N+1 fixes (1–3 days each)
7. **B1** — Fix `get_bundle_components()` with batch query
8. **B2+B4** — Fix `search_orders()` N+1 + add pagination
9. **B5** — Fix `_get_promotional_scheme_offers()` batch load
10. **B3** — Add hard limit to `_search_delivery_notes()`
11. **B18** — Replace `get_doc("Product Bundle")` with `get_list("Product Bundle Item")`

### Phase 3 — Frontend state & memory (2–4 days)
12. **F2+F3** — Fix deep watcher in useInvoiceOffers + add cleanup
13. **F4** — Parallelize customer page fetches
14. **F5** — Add debounce to customer search
15. **F6** — Use Map for O(1) customer upsert
16. **F14** — Invalidate searchCache on items change

### Phase 4 — Build & offline (3–5 days)
17. **O11** — Split `html2pdf`, `jsbarcode` to dynamic imports in Vite config
18. **O10** — Add stale-while-revalidate in service worker for key API endpoints
19. **O2** — Fix IndexedDB one-by-one fallback to use `bulkPut()` with per-item error handling
20. **O7** — Add proactive per-entry TTL cleanup on large caches

---

*Generated by full-repo performance scan — 2026-04-29*
