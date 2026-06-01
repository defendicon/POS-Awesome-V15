# POS Performance Baseline Audit

Date: 2026-06-01
Repository: POS-Awesome-V15

This document maps the current POS performance-critical paths and the measurement foundation added before any architecture refactor. The objective is truthful visibility, not optimization.

## Measurement Architecture

Frontend telemetry is centralized in `frontend/src/posapp/utils/perf.ts`.

- Metrics are disabled by default and can be enabled with `posa_perf=1`, `perf=1`, `localStorage.posa_perf_enabled=1`, or `window.__PROF__`.
- Events use a bounded in-memory buffer, safe metadata tags, success/failure status, duration, and percentile-ready shape.
- Debug logging is opt-in only and gated by `posa_perf_debug=1` or `localStorage.posa_perf_debug=1`.
- Sensitive values such as customer names, payment values, invoice identifiers, item names, and raw search terms are not recorded.
- Counts are bucketed with `bucketCount`, not stored as raw customer or item payloads.

Backend telemetry is centralized in `posawesome/posawesome/api/performance.py`.

- API timing uses `pos_perf_endpoint`.
- Query timing uses `pos_perf_query`.
- Backend emission is disabled unless `frappe.conf.posa_perf_log_enabled` is truthy.
- Log context is sanitized and does not include raw invoice, customer, payment, barcode, or search values.

The developer diagnostics view is `frontend/src/posapp/components/performance/PerformanceDiagnostics.vue`, routed at `/performance`. It is hidden unless performance capture is enabled, developer mode is active, or the user has the `System Manager` role.

## Current Boot Sequence

1. `frontend/src/posapp/posapp.ts` initializes long-task observation and profiler helpers.
2. The Vue app, Pinia stores, router, and Vuetify plugins are created.
3. Offline local snapshot state is read from `offline/index`.
4. `frontend/src/offline/db.ts` opens IndexedDB/Dexie and hydrates memory snapshots.
5. Router navigation reaches the POS shell under `frontend/src/posapp/components/pos/shell/Pos.vue`.
6. Boot/profile/payment/currency/offline sync requests flow through POS API wrappers and offline sync endpoints.
7. Current `pos.boot.sell_ready` is measured after router readiness for the POS route. This is an instrumentation anchor, but code inspection shows it is not yet a strict guarantee that item search, cart insertion, payment methods, and currency are all available. The next optimization task should replace this anchor with an explicit readiness aggregator.

Instrumentation added:

- `pos.app.mount`
- `pos.boot.total`
- `pos.boot.local_snapshot_read`
- `pos.boot.profile_load`
- `pos.boot.payment_methods_load`
- `pos.boot.currency_load`
- `pos.boot.item_cache_ready`
- `pos.boot.customer_cache_ready`
- `pos.boot.sell_ready`
- `pos.offline.db_open`
- `pos.offline.snapshot_hydrate`

## Current Item Loading Sequence

1. Cached/offline item data is held in the offline storage layer and read by item search composables.
2. `frontend/src/posapp/composables/pos/items/useItemSearch.ts` performs local filtering and local barcode-style lookups.
3. `frontend/src/posapp/services/api.ts` maps POS item API calls to item metrics.
4. Backend search is implemented in `posawesome/posawesome/api/item_processing/search.py`.
5. Barcode lookup is implemented in `posawesome/posawesome/api/item_processing/barcode.py`.
6. Item details and price refresh are implemented in `posawesome/posawesome/api/item_processing/details.py`.

Instrumentation added:

- `pos.items.initial_load`
- `pos.items.delta_sync`
- `pos.items.local_search`
- `pos.items.remote_search`
- `pos.items.barcode_lookup`
- `pos.items.add_to_cart`
- `pos.items.price_refresh`
- backend query timing for item search

## Current Customer Loading Sequence

1. Customer state is owned by `frontend/src/posapp/stores/customersStore.ts`.
2. Local customer filtering runs before remote fallback.
3. Remote customer lookup and balance retrieval use `posawesome/posawesome/api/customers.py`.
4. Offline customer deltas are served by `posawesome/posawesome/api/offline_sync/customers.py`.

Instrumentation added:

- `pos.customers.initial_load`
- `pos.customers.delta_sync`
- `pos.customers.local_search`
- `pos.customers.remote_search`
- `pos.customers.select`
- backend query timing for customer search

## Current Payment And Multi-Currency Sequence

1. Payment UI is opened through `frontend/src/posapp/components/pos/Payments.vue` and related payment subcomponents.
2. Payment totals and conversion helpers live in `frontend/src/posapp/composables/pos/payments/usePaymentCalculations.ts`.
3. Invoice currency state and exchange-rate refresh are handled by `frontend/src/posapp/composables/pos/invoice/useInvoiceCurrency.ts`.
4. Draft invoice, exchange-rate, and invoice submission endpoints are in `posawesome/posawesome/api/invoices.py`.
5. Payment submission paths also pass through `posawesome/posawesome/api/invoice_processing/creation.py`.

Instrumentation added:

- `pos.currency.bootstrap`
- `pos.currency.exchange_rate_load`
- `pos.currency.change_transaction_currency`
- `pos.currency.payment_conversion`
- `pos.payment.screen_open`
- `pos.payment.recalculate`
- `pos.payment.submit`

## Current Offline Write And Sync Sequence

1. Dexie database setup lives in `frontend/src/offline/db.ts`.
2. Generic queued mutations are enqueued by `frontend/src/offline/writeQueue.ts`.
3. Invoice outbox handling lives in `frontend/src/offline/invoiceOutbox.ts`.
4. Resource synchronization is coordinated by `frontend/src/offline/sync/SyncCoordinator.ts`.
5. Backend sync endpoints live under `posawesome/posawesome/api/offline_sync/`.

Instrumentation added:

- `pos.offline.db_open`
- `pos.offline.snapshot_hydrate`
- `pos.offline.outbox_enqueue`
- `pos.offline.sync_start`
- `pos.offline.sync_mutation`
- `pos.offline.sync_complete`
- `pos.offline.conflict_detected`

## Current Pricing And Promotions Sequence

1. Offer loading is in `frontend/src/posapp/composables/pos/shared/useOffers.ts`.
2. Offer application is in `frontend/src/posapp/composables/pos/invoice/useInvoiceOffers.ts`.
3. Coupon application is in `frontend/src/posapp/components/pos/offers/PosCoupons.vue`.
4. Cart pricing recalculation is driven by `frontend/src/posapp/stores/invoiceStore.ts` and invoice utility modules.
5. Backend pricing endpoints are in `posawesome/posawesome/api/pricing_rules.py`.

Instrumentation added:

- `pos.pricing.rules_load`
- `pos.pricing.calculate_cart`
- `pos.pricing.calculate_line`
- `pos.pricing.promotion_apply`
- `pos.pricing.coupon_apply`
- `pos.pricing.recalculate_after_quantity_change`

## Current Realtime Update Sequence

1. Socket.IO setup and handlers live in `frontend/src/posapp/stores/socketStore.ts`.
2. Realtime notifications invalidate local state or apply deltas depending on resource.
3. Backend stock/offline delta endpoints include `posawesome/posawesome/api/offline_sync/stock.py`.

Instrumentation added:

- `pos.realtime.connect`
- `pos.realtime.reconnect`
- `pos.realtime.invalidation_received`
- `pos.realtime.delta_applied`

## Caching And Storage Layers

- IndexedDB/Dexie: persistent offline storage and snapshot hydration in `frontend/src/offline/db.ts`.
- Offline memory snapshot: fast in-memory access through `frontend/src/offline/index.ts` exports.
- Generic write queue: queued offline mutations in `frontend/src/offline/writeQueue.ts`.
- Invoice outbox: invoice-specific offline write and sync in `frontend/src/offline/invoiceOutbox.ts`.
- Pinia stores: runtime cart, customer, socket, UI, and invoice state.
- Browser Performance API: optional marks/measures for enabled telemetry.
- Backend Frappe cache/config: endpoint logging is gated through Frappe config, not always-on logs.

## Known Expensive Files And Functions

- `frontend/src/posapp/composables/pos/items/useItemSearch.ts`: local item search filters large arrays and can become expensive at 25k+ items.
- `frontend/src/posapp/stores/customersStore.ts`: local customer search over 25k synthetic customers exceeded the 75 ms p95 target in Vitest.
- `frontend/src/posapp/stores/invoiceStore.ts`: cart item mutations trigger pricing, totals, and reactive updates.
- `frontend/src/posapp/components/pos/Payments.vue`: payment open/submit combines UI state, currency conversion, invoice totals, and server submission.
- `frontend/src/offline/invoiceOutbox.ts`: sync loops process queued invoices one by one and now expose per-mutation timing.
- `posawesome/posawesome/api/item_processing/search.py`: item SQL search and serialization are central to remote item performance.
- `posawesome/posawesome/api/customers.py`: customer search and balance retrieval are central to cashier selection latency.
- `posawesome/posawesome/api/pricing_rules.py`: pricing-rule loading and reconciliation can affect cart responsiveness.
- `posawesome/posawesome/api/invoices.py`: draft invoice, exchange-rate, and submit flows affect payment readiness and final checkout.

## Duplication And Reload Risks

- Sell-ready is currently inferred from route readiness, not a composed readiness contract for item cache, customer cache, currency, payment methods, and cart capability.
- Offers can use cached data and then refresh from the server; both paths are now measured separately, but the broader app still needs a clear stale/fresh state model.
- Local customer search scans the full synthetic customer list in the regression benchmark. This is a confirmed bottleneck candidate for indexing or worker-backed search.
- Item and customer search result rendering can still trigger broad reactive updates; render metrics are available but need browser-run samples for exact p95 values.
- Offline sync has multiple queue layers. Metrics distinguish generic enqueue, invoice enqueue, sync start, per-mutation processing, and sync complete, but future work should consolidate queue observability.
- Socket invalidations can trigger UI refreshes through store mutations. The new metrics expose receipt and delta application but do not yet attribute downstream component rerenders.

## Synthetic Performance Data

`scripts/generate_pos_perf_fixture.mjs` generates safe synthetic JSONL fixtures without using production data.

Supported dataset knobs:

- items
- customers
- barcodes
- queued invoices
- multiple price lists
- multiple currencies
- exchange-rate-like fields
- promotion/coupon-like fields on synthetic items

Example:

```bash
node scripts/generate_pos_perf_fixture.mjs --out tmp/pos-perf --items 25000 --customers 25000 --barcodes 50000 --queued-invoices 1000
```

The generator accepts larger values, including 100,000 customers and 500,000 items where local disk and test runtime permit.

## Automated Performance Tests

Central thresholds are defined in `frontend/src/posapp/utils/performanceThresholds.ts`.

Added tests:

- `frontend/tests/performanceMonitor.spec.ts`
- `frontend/tests/performanceRegressionBaselines.spec.ts`

Initial thresholds:

- Cached sell-ready boot p95 <= 500 ms
- Barcode exact lookup p95 <= 20 ms
- Local item autocomplete p95 <= 50 ms
- Local customer autocomplete p95 <= 75 ms
- Add item to cart p95 <= 50 ms
- 20-line cart recalculation p95 <= 40 ms
- 200-line cart recalculation p95 <= 150 ms
- Offline outbox enqueue p95 <= 20 ms
- Payment dialog opening p95 <= 100 ms

## Validation Results

Environment note: `corepack yarn test` and `corepack yarn type-check` did not find project `.bin` shims in this Windows shell, so direct `node_modules/.bin` commands were used after dependency installation.

Observed results:

- `cmd /c corepack.cmd yarn install`: passed.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\performanceMonitor.spec.ts tests\performanceRegressionBaselines.spec.ts`: performance monitor tests passed; performance regression baseline intentionally failed on customer local autocomplete at p95 83.45 ms versus the 75 ms target.
- `cmd /c .\node_modules\.bin\vue-tsc.cmd --noEmit`: passed after fixing monitor typing.
- `cmd /c .\node_modules\.bin\vite.cmd build`: passed. Vite reported existing large chunk warnings for `Pos` and `vuetify` bundles.
- `cmd /c .\node_modules\.bin\eslint.cmd .`: passed with warnings only; new and changed performance files were checked separately with no warnings.
- `python -m py_compile ...`: passed for the new backend timing helper and instrumented POS API modules.
- `git diff --check`: passed; Git reported only line-ending normalization warnings.

## Bottleneck Table

| Flow | File/component/API involved | Current measured duration | Dataset used | Root cause | Severity | Recommended optimisation task | Risk of changing it |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| Customer local autocomplete | `frontend/src/posapp/stores/customersStore.ts`, `frontend/tests/performanceRegressionBaselines.spec.ts` | p95 83.45 ms, target 75 ms | 25,000 synthetic customers | Linear filtering over a large in-memory list during autocomplete | High | Add a normalized customer search index, precomputed lowercase fields, or worker-backed search | Medium: must preserve offline customer selection and balance behavior |
| Sell-ready boot semantics | `frontend/src/posapp/posapp.ts`, POS route/store initialization | Not benchmarked; code inspection finding | Runtime boot path | Current metric is route-ready, not explicit ability to search, add item, access payment methods, and use currency config | Critical | Build a readiness aggregator that combines local snapshot, item cache, customer cache, payment methods, currency, and cart mutation readiness | Medium: readiness state touches boot UX and offline mode |
| Item/customer render attribution | `ItemsSelector.vue`, customer components, diagnostics metrics | Not benchmarked in this environment | Browser runtime required | Search timing and backend timing are measured, but component rerender p95 requires browser-run sessions | Medium | Add browser smoke/perf run that enables `posa_perf=1` and records render summaries from diagnostics | Low: diagnostic-only if no behavior changes |
| Offline sync queue visibility | `frontend/src/offline/writeQueue.ts`, `frontend/src/offline/invoiceOutbox.ts`, `SyncCoordinator.ts` | Instrumented, no failing benchmark yet | Requires queued offline invoices/payments | Multiple queue paths make aggregate sync health harder to reason about | Medium | Add a combined queue health store that reads existing queues without extra traffic | Low to medium: must avoid breaking offline replay ordering |
| Remote item/customer SQL | `posawesome/posawesome/api/item_processing/search.py`, `posawesome/posawesome/api/customers.py` | Instrumented, no bench server available in this environment | Frappe database required | Query cost depends on database indexes, profile filters, and serialization | High | Run Frappe-backed benchmark with synthetic data and review indexes/query plans | Medium: index/query changes affect ERPNext compatibility |

## Completion Notes

This foundation now measures the complete critical path categories requested: boot, item search, barcode lookup, cart/pricing, customer search/select, payment, multi-currency, offline queue/sync, realtime invalidation, frontend diagnostics, backend endpoints, synthetic data, and regression thresholds.

The current baseline contains a real failing performance target for customer local autocomplete. That failure should remain visible until the search architecture is optimized.
