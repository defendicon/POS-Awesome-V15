# POS Local Inventory Engine

## Purpose

The local inventory engine is the authoritative frontend service for operational POS item lookup. It sits between the offline Dexie cache and the item selector/cart flows so large catalog search and barcode scans do not repeatedly filter full reactive item payloads.

Implemented module:

- `frontend/src/offline/inventoryEngine.ts`

Primary production integrations:

- `frontend/src/offline/cache.ts`
- `frontend/src/posapp/stores/itemsStore.ts`
- `frontend/src/posapp/stores/bootReadinessStore.ts`
- `frontend/src/posapp/composables/pos/items/useScanProcessor.ts`
- `frontend/src/posapp/components/performance/PerformanceDiagnostics.vue`

## Before

The item selector had several overlapping lookup paths:

- `useItemSearch.filterAndPaginate()` scanned item arrays and checked `_search_index` strings.
- `useItemsSearch.performLocalSearch()` filtered full reactive `Item` objects.
- `offline/cache.searchStoredItems()` used Dexie collection filters that still ran JavaScript predicates over cached rows.
- Barcode scans first consulted a selector-local barcode map and could rebuild it from visible/full item arrays.
- Remote-found barcode items were persisted by writing the whole visible item list.

The measured 25,000-item autocomplete p95 failure was caused by repeated broad scans and string matching over large item arrays before enough matching rows were found.

## After

The engine stores compact operational records in Dexie table `operational_items`:

- key: `scope::item_code`
- POS profile/warehouse scope
- item code/name/group/brand
- stock UOM/default UOM
- barcode list
- normalized search tokens
- selectable flags such as disabled, stock item, batch/serial, variant
- local rate fields
- minimal payload required by the item selector and cart insertion

Large descriptions, unrelated accounting metadata and full stock history are not part of the search index.

## Search Index

At hydration, the engine builds non-reactive in-memory maps:

- exact item-code map
- exact barcode map
- token map
- token-prefix map
- ordered visible keys

Autocomplete normalizes the query once, intersects the smallest candidate lists, applies item group/rate/variant/barcode filters, and stops at a bounded result window. The UI receives compact item payloads only for the visible result set.

## Barcode Lookup

Barcode scan now tries the operational exact barcode index first:

1. Hydrate the operational index for the active profile/warehouse scope.
2. Resolve barcode or item-code exact match locally.
3. Fall back to the selector-local legacy index only for already-visible rows.
4. Fall back to remote lookup only when the local index misses.
5. Persist only the remote-found item as an item delta.

This avoids full autocomplete and full inventory reload during normal scans.

## Rate Lookup

`getItemRate()` reads rate fields from the operational record. When a UOM is provided and cached UOM conversion data exists, the engine derives the UOM rate locally. The existing server UOM-price call remains as fallback when local rate context is missing.

Cart pricing rules, offers, taxes, manual-rate permissions and submitted/offline invoice values remain handled by the existing cart/pricing modules.

## Delta Sync

Existing backend item sync already returns changed rows and deleted item tombstones through:

- `posawesome/posawesome/api/offline_sync/items.py`
- `posawesome/posawesome/api/items.py#get_delta_items`

Frontend sync writes raw rows to `items` and now also updates `operational_items`. Modified-item refresh calls `applyInventoryDeltas()` so changed item/rate/stock fields update the operational index without a full reload. Deleted item codes remove operational rows for the active scope.

## Snapshot Boot Integration

`bootReadinessStore.ts` now treats the `items` boot-critical resource as ready only when `hydrateOperationalIndexFromSnapshot()` returns a usable operational index for the active POS profile/warehouse scope. Raw item row presence is not enough to mark sell-ready.

If the operational index is missing but raw cached items exist, the engine can rebuild compact records from the scoped `items` table. If the rebuild fails, sell-ready remains blocked on `items`.

## Reactivity Strategy

Index maps live outside Vue deep reactivity. `itemsStore` exposes reactive arrays only for visible search results and cart-selected items. Diagnostics read engine state without triggering API traffic or index rebuilds.

## Metrics

Added inventory metrics:

- `pos.inventory.index_hydrate`
- `pos.inventory.index_build`
- `pos.inventory.index_commit`
- `pos.inventory.query_exact_item_code`
- `pos.inventory.query_barcode_exact`
- `pos.inventory.query_autocomplete`
- `pos.inventory.rate_lookup_local`
- `pos.inventory.delta_items_apply`
- `pos.inventory.delta_rates_apply`
- `pos.inventory.delta_stock_apply`
- `pos.inventory.full_reload_avoided`

Existing item metrics are also emitted where relevant:

- `pos.items.local_search`
- `pos.items.barcode_lookup`
- `pos.items.add_to_cart`

## Validation

Added tests:

- `frontend/tests/inventoryEngine.spec.ts`
- updated `frontend/tests/performanceRegressionBaselines.spec.ts`
- updated `frontend/tests/bootReadinessStore.spec.ts`

Validated behavior:

- persisted operational index hydration
- exact item-code lookup
- exact barcode lookup
- bounded autocomplete
- disabled item exclusion
- local UOM-aware rate lookup
- item update delta application
- tombstone deletion
- full-reload avoidance metric
- boot readiness requiring operational index readiness

Latest run:

- `cmd /c .\node_modules\.bin\vitest.cmd --run tests\performanceRegressionBaselines.spec.ts` passed for 25,000-item autocomplete, barcode lookup and customer autocomplete in this environment.
- Customer search was not refactored by this task; it remains the next dedicated optimization target because earlier baseline runs showed p95 above the 75 ms threshold.
