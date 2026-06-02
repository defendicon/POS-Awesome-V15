# POS Local Customer Engine

## Purpose

The local customer engine makes POS customer search use a compact operational index instead of repeatedly scanning full customer documents. It preserves the existing customer selection business flow: customer details, price list, loyalty and stored-value data are still loaded lazily after selection.

## Before

- `customersStore` kept the current customer page in a reactive `CustomerSummary[]`.
- Interactive search queried Dexie `customers` with `collection.filter()` and `customerMatchesSearchTerm()`.
- Each query lowercased and searched customer name, id, mobile, email and tax id fields row by row.
- Customer load counts were printed with direct `console.log`.
- Customer sync wrote raw customer rows only, so no dedicated operational search layer existed.

Earlier baseline runs measured unstable customer autocomplete p95 values of 83.45 ms and 137.76 ms on 25,000 synthetic customers.

## After

`frontend/src/offline/customerEngine.ts` is the authoritative operational customer search engine.

It owns:

- persisted compact rows in Dexie `operational_customers`
- in-memory exact customer id/name map
- in-memory exact mobile map
- token and prefix maps for autocomplete
- bounded visible search results
- customer delta application
- offline-created customer insertion
- offline sync reconciliation helpers
- privacy-safe diagnostics

The Vue store now keeps only the visible result window reactive. Large customer indexes remain outside Vue deep reactivity.

## Operational Record

Operational customer rows include only fields required for search, selection display and customer-dependent POS rules:

- scope and stable key
- customer id/name
- display customer name
- mobile, email and tax id search keys
- customer group and territory
- customer/default price list
- primary address display projection
- disabled/selectable state
- pending offline sync state
- modified cursor
- compact payload for selector display

The operational index does not include full addresses, ledger history, invoice history, payment history or balance ledger payloads.

## Search Design

Search is implemented by:

- `searchCustomersLocal(query, options)`
- `lookupCustomerExact(customerKey, scope)`
- `lookupCustomerByMobileExact(mobile, scope)`

Ranking order is:

1. exact customer id/name
2. exact normalized mobile
3. prefix matches from customer id/name/mobile/email/tax id
4. token prefix matches

Results are bounded to a maximum of 100 and the production selector requests 50 visible rows.

## Lazy Details

Customer selection still calls the existing selected-customer flow:

- `fetch_customer_details()` first applies a cached raw customer detail if available.
- It then calls `posawesome.posawesome.api.customers.get_customer_info`.
- The response updates customer-specific price list, price list currency, loyalty fields, stored-value snapshot and customer-dependent cart pricing.
- Stale responses are ignored if the selected customer changed while the request was in flight.

No customer details are bulk-loaded during boot or autocomplete.

## Lazy Balance

Customer balance remains selected-customer-only:

- offline mode reads `getCachedCustomerBalance()`
- online mode calls `get_customer_balance`
- balance values are cached with the existing customer balance cache
- missing offline balance is shown as unavailable, not as a fresh zero

Balance values are not written to performance metrics or diagnostics.

## Offline Customer Creation And Reconciliation

Offline-created customers are immediately inserted into `operational_customers` with `pending_sync` and `offline_created` flags. They become searchable before server sync.

When offline customer sync returns a server customer id, `reconcileSyncedOfflineCustomer()` updates the operational index and removes the local temporary key. Existing pending invoice remapping is preserved through `updateOfflineInvoicesCustomer()`.

## Delta Sync

`syncCustomersResource()` now updates both:

- raw Dexie `customers`
- operational Dexie `operational_customers`

Small customer deltas update changed operational rows and in-memory records without intentionally replacing the full visible customer list. Deleted/disabled customer tombstones remove affected operational rows for the active scope.

## Boot Policy

Customer hydration remains non-blocking for general sell-ready. The true sell-ready path continues to require profile, item lookup, payment methods, currency and pricing prerequisites. Customer search warms independently and diagnostics show whether the customer engine is searchable or still warming.

## Telemetry And Diagnostics

New customer metrics are added to the existing central profiler:

- `pos.customers.index_hydrate`
- `pos.customers.index_build`
- `pos.customers.index_commit`
- `pos.customers.query_exact`
- `pos.customers.query_mobile_exact`
- `pos.customers.query_autocomplete`
- `pos.customers.details_cache_hit`
- `pos.customers.details_load`
- `pos.customers.balance_cache_hit`
- `pos.customers.balance_load`
- `pos.customers.balance_stale_display`
- `pos.customers.offline_create`
- `pos.customers.offline_reconcile`
- `pos.customers.delta_apply`
- `pos.customers.full_reload_avoided`

`PerformanceDiagnostics.vue` displays only safe state: buckets, durations, readiness and pending offline counts. It does not expose customer names, phone numbers, emails, tax ids, addresses or balances.

## Benchmark Results

Temporary benchmark file `frontend/tests/.codexCustomerMeasure.spec.ts` was used for repeated measurement and removed before commit.

25,000 synthetic customers:

- autocomplete p95 runs: 11.90, 9.10, 7.72, 7.89, 7.81 ms
- exact lookup p95 runs: 0.009, 0.002, 0.021, 0.002, 0.002 ms
- mobile exact p95 runs: 0.035, 0.009, 0.002, 0.002, 0.006 ms
- local selection lookup p95 runs: 0.026, 0.023, 0.015, 0.008, 0.001 ms
- persisted index hydrate runs: 1998, 1801, 1879, 1747, 1831 ms
- small delta apply runs: 418, 349, 323, 333, 389 ms

100,000 synthetic customers:

- autocomplete p95 runs: 66.13, 74.46, 57.20, 56.12, 74.07 ms
- exact lookup p95 runs: 0.002, 0.003, 0.002, 0.006, 0.002 ms
- mobile exact p95 runs: 0.002, 0.002, 0.002, 0.002, 0.002 ms
- local selection lookup p95 runs: 0.003, 0.005, 0.002, 0.002, 0.001 ms
- persisted index hydrate runs: 8411, 8491, 8328, 8263, 8500 ms
- small delta apply runs: 1379, 1431, 1399, 1374, 1362 ms

## Remaining Bottlenecks

Interactive search, exact lookup, mobile lookup and local selection meet the current targets for 25,000 and 100,000 synthetic customers in this environment.

Persisted index hydration does not meet the 150 ms target because fake IndexedDB row reads plus in-memory prefix index construction are currently synchronous and large. It is non-blocking for sell-ready, but opening customer search before warm hydration can still wait for hydration.

Small delta apply does not meet the target in fake IndexedDB because updating a row in the indexed `operational_customers` table still incurs IndexedDB multi-entry index write cost. The in-memory update path is incremental; the storage write path remains the bottleneck.

Recommended next task: chunk customer index hydration and operational delta commits so large customer index work never blocks the cashier thread, and measure in a real browser/Frappe dataset session.
