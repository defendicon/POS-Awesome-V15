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

- Sell-ready is now owned by `frontend/src/posapp/stores/bootReadinessStore.ts`. The previous route-ready metric in `posapp.ts` has been removed.
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
- `frontend/tests/inventoryEngine.spec.ts`
- `frontend/tests/customerEngine.spec.ts`
- `frontend/tests/localSnapshotManifest.spec.ts`
- `frontend/tests/bootReadinessStore.spec.ts`

Initial thresholds:

- Local snapshot manifest read and validation p95 <= 50 ms
- Cached sell-ready boot p95 <= 500 ms
- Offline valid-snapshot sell-ready boot p95 <= 500 ms
- Snapshot atomic commit p95 <= 100 ms
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
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\performanceMonitor.spec.ts tests\performanceRegressionBaselines.spec.ts`: performance monitor tests passed; performance regression baseline intentionally failed on customer local autocomplete at p95 83.45 ms versus the 75 ms target in the first baseline run.
- `cmd /c .\node_modules\.bin\vue-tsc.cmd --noEmit`: passed after fixing monitor typing.
- `cmd /c .\node_modules\.bin\vite.cmd build`: passed. Vite reported existing large chunk warnings for `Pos` and `vuetify` bundles.
- `cmd /c .\node_modules\.bin\eslint.cmd .`: passed with warnings only; new and changed performance files were checked separately with no warnings.
- `python -m py_compile ...`: passed for the new backend timing helper and instrumented POS API modules.
- `git diff --check`: passed; Git reported only line-ending normalization warnings.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\localSnapshotManifest.spec.ts tests\bootReadinessStore.spec.ts tests\performanceMonitor.spec.ts`: passed 9 tests. The focused unit path validates true sell-ready gating, missing item snapshot blocking, multi-currency exchange-rate blocking, stale-but-usable policy, and metric emission.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\localSnapshotManifest.spec.ts tests\bootReadinessStore.spec.ts tests\performanceMonitor.spec.ts tests\performanceRegressionBaselines.spec.ts`: new boot/readiness tests passed, and the performance baseline intentionally failed on item autocomplete p95 79.58 ms versus 50 ms and customer autocomplete p95 137.76 ms versus 75 ms.
- `cmd /c .\node_modules\.bin\vue-tsc.cmd --noEmit`: passed after the local inventory engine integration.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\inventoryEngine.spec.ts tests\localSnapshotManifest.spec.ts tests\bootReadinessStore.spec.ts tests\performanceMonitor.spec.ts`: passed 14 focused tests.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\performanceRegressionBaselines.spec.ts`: passed in the latest run after item autocomplete was moved to the operational inventory engine. This validates the 25,000-item autocomplete and barcode thresholds in the current environment. Customer autocomplete also passed in this run, but it was not refactored by this task and remains tracked because earlier runs exceeded target.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\.codexInventoryMeasure.spec.ts --reporter=verbose`: temporary measurement run only, removed before commit. On 25,000 synthetic items, local inventory autocomplete measured p50 5.58 ms, p95 7.90 ms, p99 8.53 ms. Barcode exact lookup measured p50 0.003 ms, p95 0.024 ms, p99 0.172 ms.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\customerEngine.spec.ts tests\customersStore.spec.ts tests\customerSearch.spec.ts tests\performanceRegressionBaselines.spec.ts tests\inventoryEngine.spec.ts tests\bootReadinessStore.spec.ts`: passed 20 focused customer/inventory/boot/performance tests after the local customer engine integration.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\.codexCustomerMeasure.spec.ts --reporter=verbose`: temporary repeated measurement run only, removed before commit. Results are recorded in the customer bottleneck table below.
- `cmd /c .\node_modules\.bin\vue-tsc.cmd --noEmit`: passed after the local customer engine integration.
- `cmd /c .\node_modules\.bin\eslint.cmd <changed customer/performance files>`: passed with no warnings after customer engine cleanup.
- `cmd /c .\node_modules\.bin\eslint.cmd .`: passed with existing repository warnings only.
- `cmd /c .\node_modules\.bin\vite.cmd build`: passed. Vite reported existing Browserslist age and large chunk warnings.
- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\performanceMonitor.spec.ts tests\localSnapshotManifest.spec.ts tests\bootReadinessStore.spec.ts tests\syncCoordinator.spec.ts tests\syncResourceRegistry.spec.ts tests\syncState.spec.ts tests\invoiceOutbox.spec.ts tests\invoiceOfflineFallbacks.spec.ts tests\invoiceCustomerSync.spec.ts tests\invoiceStore.spec.ts tests\pricingEngine.spec.js tests\changePriceListRate.spec.ts`: passed 56 broader boot/sync/offline/invoice/pricing tests. Some existing tests emitted IndexedDB-missing stderr while assertions passed.
- `python -m py_compile posawesome/posawesome/api/customers.py posawesome/posawesome/api/offline_sync/customers.py posawesome/posawesome/api/invoice.py posawesome/posawesome/api/invoices.py`: passed.

## Local Inventory Engine Implementation Map

Current item data representations:

- Raw full cached rows remain in Dexie `items`.
- Compact operational rows now live in Dexie `operational_items`.
- Non-reactive in-memory maps in `frontend/src/offline/inventoryEngine.ts` own exact item-code lookup, exact barcode lookup, token/prefix autocomplete and local rate lookup.
- Vue components receive only bounded visible result payloads from `itemsStore`.

Current search/filter implementation:

- `itemsStore.searchItems()` now uses `searchItemsLocal()` for local cached autocomplete.
- `ItemsSelector.vue` still applies small display filters to the already bounded `filteredItems` window.
- The previous broad Dexie `collection.filter()` path remains as compatibility helper but is no longer the primary production item autocomplete path.

Current rate lookup implementation:

- `getItemRate()` resolves local base rates from operational records.
- UOM conversion uses cached `item_uoms` conversion factors when available.
- Existing server UOM price lookup remains a fallback in `useScanProcessor.ts`.

Current barcode lookup implementation:

- `useScanProcessor.ts` and `itemsStore.addScannedItem()` now try `lookupBarcodeExact()` before legacy visible-row maps or remote lookup.
- Remote-found barcode rows are persisted as single-item deltas instead of rewriting the full item array.

Current local persistence layout:

- Dexie `items`: raw cached item rows scoped by `profile_scope`.
- Dexie `operational_items`: compact search/rate/barcode rows keyed by `scope::item_code`.
- Dexie `settings`: snapshot manifests and readiness metadata.

Current full reload triggers:

- Manual item reload still clears and reloads through `itemsStore.refreshItems()`.
- Normal modified-item sync and barcode remote-found rows now update operational records through deltas.

Root cause of the original item p95 failure:

- The old local autocomplete measured 79.58 ms p95 on 25,000 synthetic items because it repeatedly scanned large item arrays and performed string `includes()` checks until enough matches were found. The operational engine replaces that with exact/token/prefix maps and bounded result windows.

## Local Customer Engine Implementation Map

Current customer data representations:

- Raw cached customer rows remain in Dexie `customers`.
- Compact operational rows now live in Dexie `operational_customers`.
- Non-reactive in-memory maps in `frontend/src/offline/customerEngine.ts` own exact customer id/name lookup, exact mobile lookup and bounded autocomplete.
- Vue components receive only the visible 50-row result window from `customersStore`.

Current search implementation:

- `customersStore.searchCustomers()` now hydrates the customer engine and calls `searchCustomersLocal()`.
- The previous production Dexie `collection.filter(customerMatchesSearchTerm)` path is no longer used by interactive customer search.
- `Customer.vue` enter-selection prefers exact engine lookup and then falls back to the bounded visible result list.

Current lazy detail and balance implementation:

- Search results only use compact identity/display fields.
- `fetch_customer_details()` still loads full customer detail only after selection and preserves stale-response protection.
- `fetch_customer_balance()` still loads balance only after selection and uses the existing offline balance cache.
- Balance values, customer names, phone numbers, emails, tax ids and addresses are not emitted in telemetry.

Current offline and sync implementation:

- Offline-created customers are inserted into the operational customer engine with pending-sync state.
- Offline sync reconciliation updates pending invoice customer references and reconciles the operational customer row when the server assigns a different name.
- Customer delta sync writes raw customer rows and applies operational customer deltas for the active POS Profile scope.

Root cause of the original customer p95 instability:

- The old local autocomplete repeatedly normalized and scanned large customer rows on every query. The new operational engine precomputes searchable keys and uses exact/prefix maps with bounded result windows.

Repeated customer benchmark evidence:

| Dataset | Action | Run p95 values | Median p95 | Worst p95 | Target | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 25,000 customers | Autocomplete | 11.90, 9.10, 7.72, 7.89, 7.81 ms | 7.89 ms | 11.90 ms | 50 ms | Pass |
| 25,000 customers | Exact lookup | 0.009, 0.002, 0.021, 0.002, 0.002 ms | 0.002 ms | 0.021 ms | 15 ms | Pass |
| 25,000 customers | Mobile exact lookup | 0.035, 0.009, 0.002, 0.002, 0.006 ms | 0.006 ms | 0.035 ms | 20 ms | Pass |
| 25,000 customers | Local selection lookup | 0.026, 0.023, 0.015, 0.008, 0.001 ms | 0.015 ms | 0.026 ms | 30 ms | Pass |
| 25,000 customers | Persisted index hydrate | 1998, 1801, 1879, 1747, 1831 ms | 1831 ms | 1998 ms | 150 ms | Fail |
| 25,000 customers | Small delta apply | 418, 349, 323, 333, 389 ms | 349 ms | 418 ms | 100 ms | Fail |
| 100,000 customers | Autocomplete | 66.13, 74.46, 57.20, 56.12, 74.07 ms | 66.13 ms | 74.46 ms | 75 ms | Pass |
| 100,000 customers | Exact lookup | 0.002, 0.003, 0.002, 0.006, 0.002 ms | 0.002 ms | 0.006 ms | 20 ms | Pass |
| 100,000 customers | Mobile exact lookup | 0.002, 0.002, 0.002, 0.002, 0.002 ms | 0.002 ms | 0.002 ms | 25 ms | Pass |
| 100,000 customers | Local selection lookup | 0.003, 0.005, 0.002, 0.002, 0.001 ms | 0.002 ms | 0.005 ms | 40 ms | Pass |
| 100,000 customers | Persisted index hydrate | 8411, 8491, 8328, 8263, 8500 ms | 8411 ms | 8500 ms | Not specified for 100k hydrate | Tracked |
| 100,000 customers | Small delta apply | 1379, 1431, 1399, 1374, 1362 ms | 1379 ms | 1431 ms | 125 ms | Fail |

## True Sell-Ready Definition

`pos.boot.sell_ready` now represents the central readiness store deciding that the cashier can sell. It is no longer emitted by router readiness, page mount, or component presence.

Required resources:

- POS profile
- payment methods
- transaction currency
- exchange-rate readiness when tender currencies differ from transaction currency
- local item lookup data for the active profile/warehouse scope
- cart pricing prerequisite, currently the active selling price list

Tracked but non-blocking resources:

- customer cache
- pricing rules snapshot
- offers/promotions cache

Customers are intentionally non-blocking because the current app can proceed with a walk-in/current invoice customer path, while forcing full customer hydration would make large customer datasets block startup.

## New Boot Sequence

1. `posapp.ts` mounts the shell and emits `pos.boot.shell_visible`.
2. `DefaultLayout.vue` opens IndexedDB, hydrates queues/sync state, and applies cached opening/register data when present.
3. `bootReadinessStore.initialiseBoot()` reads `local_snapshot_manifest`, validates local cache health, builds a runtime manifest, and evaluates sell-ready.
4. If the local manifest is usable, `pos.boot.sell_ready` is completed with source `local_valid_snapshot` or `degraded_cached_snapshot`.
5. If no valid local snapshot exists and the terminal is online with an active profile, `DefaultLayout.vue` runs minimum bootstrap plus warm resources through the existing sync runtime before sell-ready can complete.
6. Remote refresh continues in the background and reconciles by rebuilding and atomically committing the local manifest.

## Snapshot Manifest Design

Implemented in `frontend/src/offline/localSnapshotManifest.ts` and persisted through Dexie `settings` keys:

- `local_snapshot_manifest`
- `local_snapshot_manifest_status`

The manifest contains schema version, compatibility signature, profile/company/warehouse/price list/currency identifiers, tender currencies, generation ID, timestamps, validity state, stale policy, feature flags, and a per-resource readiness matrix.

The atomic commit path writes only the manifest keys and does not clear or replace pending offline invoices, payments, customers, cash movements, invoice outbox rows, or generic write queue rows.

## Offline And Multi-Currency Policy

Offline single-currency sale is allowed only when the local manifest has profile, payment method, currency, item lookup, and pricing prerequisites.

Offline multi-currency sale additionally requires cached exchange-rate readiness when any tender currency differs from the profile currency. If exchange-rate cache is missing, the `exchange_rates` resource blocks sell-ready and diagnostics show the exact blocking resource.

Pricing rules and offers are allowed to be stale/non-blocking during boot, but they are tracked in the manifest and refreshed in the background. Already committed offline transactions are not rewritten by snapshot refresh.

## Diagnostics Update

`PerformanceDiagnostics.vue` now shows the readiness phase, true sell-ready state, sell-ready source, blocking resource, manifest generation/validity, local/fresh ready timestamps, remote refresh state, the boot resource readiness matrix, and offline raw/operational table counts for the active POS Profile scope.

## Runtime Offline Data Lifecycle Regression

Regression reported after PR instrumentation:

- Real POS runtime could enter a state where sync metadata/watermarks existed but IndexedDB raw/operational item and customer tables were empty.
- Local item and customer search then returned no data even though the app believed cache resources were already synced.
- A delta request with an existing watermark can legally return no rows, so the empty table state would not self-heal.

Root cause identified in the sync adapters:

- `syncItemsResource()` and `syncCustomersResource()` trusted the supplied watermark unless POS Profile scope changed.
- They did not verify that raw Dexie rows and operational search rows existed before using the cursor.
- Operational search tables could also be empty while raw rows existed, causing the search engine to remain unready until a full write happened.

Fix implemented:

- Item and customer sync adapters now perform scoped storage integrity checks before fetching.
- If raw rows exist but operational rows are missing, the adapters rebuild the operational index from raw storage and emit `pos.offline.rebuild_operational_from_raw`.
- If a watermark exists but raw or operational storage is empty, the adapters reset the request cursor to `null` and emit `pos.offline.initial_cursor_reset`.
- After sync, adapters verify that non-empty server changes resulted in persisted raw and operational rows. If persistence fails, the sync fails visibly instead of silently reporting fresh state.
- Scope mismatches emit `pos.offline.scope_mismatch_detected`.
- Empty resources after sync emit `pos.offline.resource_empty_after_sync`.
- DB schema open/upgrade/error and bootstrap start/complete/failure metrics are now emitted through the central performance monitor.
- The diagnostics panel shows raw item/customer counts, operational item/customer counts, active scopes, last sync timestamps, and manifest/table mismatch state without additional API traffic.

Regression test evidence:

- `frontend/tests/offlineSyncOperational.spec.ts` now covers empty item table + existing watermark, raw item table + missing operational index, empty customer tables + existing watermark, customer pagination, schema full resync, stale scope clearing, and stock stale scope behavior.
- Focused run on 2026-06-02: `vitest run tests/offlineSyncOperational.spec.ts tests/inventoryEngine.spec.ts tests/customerEngine.spec.ts tests/bootReadinessStore.spec.ts` passed 20 tests.

## Bottleneck Table

| Flow | File/component/API involved | Current measured duration | Dataset used | Root cause | Severity | Recommended optimisation task | Risk of changing it |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| Item local autocomplete | `frontend/src/offline/inventoryEngine.ts`, `frontend/src/posapp/stores/itemsStore.ts`, `frontend/tests/performanceRegressionBaselines.spec.ts` | Previously p95 79.58 ms; latest measured p50 5.58 ms, p95 7.90 ms, p99 8.53 ms | 25,000 synthetic items | Fixed by compact operational index and token/prefix lookup | Resolved for item path | Continue browser-session validation against real Frappe data and 100,000+ item fixtures | Medium: must preserve item selector filtering and price-list behavior |
| Barcode exact lookup | `frontend/src/offline/inventoryEngine.ts`, `frontend/src/posapp/composables/pos/items/useScanProcessor.ts`, `frontend/src/posapp/stores/itemsStore.ts` | Latest measured p50 0.003 ms, p95 0.024 ms, p99 0.172 ms | 25,000 synthetic items with barcodes | Fixed by exact barcode map before visible-row and remote fallback lookup | Resolved for item path | Continue browser-session scan validation with real barcode payloads and UOM-specific prices | Medium: must preserve barcode UOM and server fallback behavior |
| Customer local autocomplete | `frontend/src/offline/customerEngine.ts`, `frontend/src/posapp/stores/customersStore.ts`, `frontend/tests/performanceRegressionBaselines.spec.ts` | Previously p95 83.45-137.76 ms; latest repeated 25k worst p95 11.90 ms and 100k worst p95 74.46 ms | 25,000 and 100,000 synthetic customers | Fixed by compact operational customer index and bounded visible results | Resolved for interactive search path | Browser-session validation against real Frappe customer data | Medium: must preserve customer-specific price list, tax, loyalty and balance behavior |
| Customer index hydrate | `frontend/src/offline/customerEngine.ts` | 25k worst 1998 ms; 100k worst 8500 ms | 25,000 and 100,000 synthetic customers | Synchronous IndexedDB read plus in-memory prefix index construction | High | Chunk/index customer hydration off the cashier-critical path and evaluate worker-backed index build | Medium: must keep search usable and boot non-blocking |
| Customer delta apply | `frontend/src/offline/customerEngine.ts`, `frontend/src/offline/sync/adapters/customers.ts` | 25k worst 418 ms; 100k worst 1431 ms | Small one-customer delta on indexed operational table | IndexedDB multi-entry index write cost dominates even after in-memory update is incremental | High | Batch/idle operational customer commits and separate hot exact maps from heavy prefix persistence | Medium: must preserve offline reconciliation and tombstone safety |
| Empty synced storage state | `frontend/src/offline/sync/adapters/items.ts`, `frontend/src/offline/sync/adapters/customers.ts`, `frontend/src/offline/storageDiagnostics.ts` | Reproduced by unit regression: cursor existed while raw/operational counts were zero | Simulated runtime sync state with empty scoped storage | Fixed by cursor reset, raw-to-operational rebuild, and post-write persistence assertion | Resolved for sync adapter path | Browser/Frappe session validation with real POS Profile data and IndexedDB inspection | Medium: must preserve incremental delta sync and profile scope isolation |
| Sell-ready boot semantics | `frontend/src/posapp/stores/bootReadinessStore.ts`, `frontend/src/offline/localSnapshotManifest.ts`, `frontend/src/posapp/layouts/DefaultLayout.vue` | Unit validated; browser p95 pending | Runtime boot path | Route-ready metric is fixed; browser-run p95 still needs real Frappe app session data | Medium | Run browser perf smoke with `posa_perf=1` against real cached/cold/offline boots | Low: diagnostic/measurement only |
| Item/customer render attribution | `ItemsSelector.vue`, customer components, diagnostics metrics | Not benchmarked in this environment | Browser runtime required | Search timing and backend timing are measured, but component rerender p95 requires browser-run sessions | Medium | Add browser smoke/perf run that enables `posa_perf=1` and records render summaries from diagnostics | Low: diagnostic-only if no behavior changes |
| Offline sync queue visibility | `frontend/src/offline/writeQueue.ts`, `frontend/src/offline/invoiceOutbox.ts`, `SyncCoordinator.ts` | Instrumented, no failing benchmark yet | Requires queued offline invoices/payments | Multiple queue paths make aggregate sync health harder to reason about | Medium | Add a combined queue health store that reads existing queues without extra traffic | Low to medium: must avoid breaking offline replay ordering |
| Remote item/customer SQL | `posawesome/posawesome/api/item_processing/search.py`, `posawesome/posawesome/api/customers.py` | Instrumented, no bench server available in this environment | Frappe database required | Query cost depends on database indexes, profile filters, and serialization | High | Run Frappe-backed benchmark with synthetic data and review indexes/query plans | Medium: index/query changes affect ERPNext compatibility |

## Completion Notes

This foundation now measures the complete critical path categories requested: boot, item search, barcode lookup, cart/pricing, customer search/select, payment, multi-currency, offline queue/sync, realtime invalidation, frontend diagnostics, backend endpoints, synthetic data, and regression thresholds.

The current branch includes local inventory and customer operational engines plus runtime storage-integrity guards. Remaining optimisation work is not a measurement gap: the highest-priority follow-ups are reducing customer operational index hydrate/delta costs and running browser/Frappe-backed validation against a real POS Profile with populated IndexedDB.
