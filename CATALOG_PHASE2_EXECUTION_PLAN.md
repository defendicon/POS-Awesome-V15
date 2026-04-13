# Catalog Phase 2 Execution Plan

This plan executes the catalog phase from [STRUCTURE_MIGRATION_MAP.md](/C:/Users/am102/Downloads/POS-Awesome-V15/STRUCTURE_MIGRATION_MAP.md) without leaving duplicate ownership between the old `posapp` structure and the new feature root.

## Phase Goal

Make the live catalog selector feature-owned.

That means:

- catalog domain is feature-owned
- the live `ItemsSelector` screen is feature-owned
- selector-specific UI children and selector-specific composables move with it
- all live imports switch to the new feature path together

## Finish Line

Phase 2 is complete only when all of these are true:

1. A catalog feature root exists and owns the live selector path.
2. The live `ItemsSelector.vue` path is under the catalog feature root.
3. Catalog domain files live under the catalog feature root.
4. Selector-owned child components move with `ItemsSelector`.
5. Selector-owned composables move with the selector.
6. All live import sites use the new feature-owned paths.
7. The old competing catalog ownership paths are removed.
8. Focused selector and catalog tests pass on the live path.

## Bounded Move Set

### Domain

Move as one set:

- `frontend/src/posapp/domain/catalog/addCatalogItemToCart.ts`
- `frontend/src/posapp/domain/catalog/catalogDiagnostics.ts`
- `frontend/src/posapp/domain/catalog/catalogSelectorBridge.ts`
- `frontend/src/posapp/domain/catalog/loadCatalogItemDetails.ts`
- `frontend/src/posapp/domain/catalog/loadCatalogItems.ts`
- `frontend/src/posapp/domain/catalog/posCatalogStore.ts`
- `frontend/src/posapp/domain/catalog/posCatalogTypes.ts`
- `frontend/src/posapp/domain/catalog/searchCatalogItems.ts`
- `frontend/src/posapp/domain/catalog/selectCatalogItem.ts`

Target:

- `frontend/src/features/catalog/domain/`

### Live Selector UI

Move as one set:

- `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
- `frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue`
- `frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue`
- `frontend/src/posapp/components/pos/items/ItemHeader.vue`
- `frontend/src/posapp/components/pos/items/ItemActionToolbar.vue`
- `frontend/src/posapp/components/pos/items/ItemSettingsDialog.vue`
- `frontend/src/posapp/components/pos/items/NewItemDialog.vue`
- `frontend/src/posapp/components/pos/items/ScanErrorDialog.vue`
- `frontend/src/posapp/components/pos/items/CameraScanner.vue`
- `frontend/src/posapp/components/pos/items/ItemCard.vue`
- `frontend/src/posapp/components/pos/items/newItemDialogState.ts`

Keep out of this slice unless needed:

- `Variants.vue`

Reason:
- `Variants.vue` is related to catalog behavior, but it also sits in a broader POS interaction flow and may deserve a separate bounded follow-up if it expands the move too much.

Target:

- `frontend/src/features/catalog/components/`

### Selector-Owned Composables

Move only the composables directly owned by the selector runtime:

- `useBarcodeIndexing.ts`
- `useCartValidation.ts`
- `useItemAddition.ts`
- `useItemAvailability.ts`
- `useItemCurrency.ts`
- `useItemDetailFetcher.ts`
- `useItemDisplay.ts`
- `useItemSearch.ts`
- `useItemSelection.ts`
- `useItemSelectorLayout.ts`
- `useItemsIntegration.ts`
- `useItemsLoader.ts`
- `useItemsSelectorFocus.ts`
- `useItemsSelectorSearch.ts`
- `useItemsSelectorSettings.ts`
- `useItemStorageSafety.ts`
- `useItemSync.ts`
- `useLastBuyingRate.ts`
- `useLastInvoiceRate.ts`
- `useScannerInput.ts`
- `useScanProcessor.ts`

Target:

- `frontend/src/features/catalog/composables/`

Leave out for now unless a moved file requires them:

- `addition/`
- `store/`
- table-specific composables not directly owned by the live selector path

## Live Import Sites To Rewire

### Selector Consumers

- `frontend/src/posapp/components/pos/shell/Pos.vue`
- `frontend/src/posapp/components/pos/shell/BarcodePrinting.vue`
- `frontend/src/posapp/components/pos/purchase/PurchaseOrders.vue`

### Tests

- `frontend/tests/addCatalogItemToCart.spec.ts`
- `frontend/tests/catalogDiagnostics.spec.ts`
- `frontend/tests/itemsSelectorAdaptiveHybrid.spec.ts`
- `frontend/tests/itemsSelectorCatalogBridge.spec.ts`
- `frontend/tests/loadCatalogItemDetails.spec.ts`
- `frontend/tests/loadCatalogItems.spec.ts`
- `frontend/tests/posCatalogStore.spec.ts`
- `frontend/tests/searchCatalogItems.spec.ts`
- `frontend/tests/selectCatalogItem.spec.ts`
- `frontend/tests/useItemsSelectorFocus.spec.ts`
- `frontend/tests/useItemsSelectorSearch.spec.ts`

## Execution Order

### Step 1: Create the feature root

Create:

- `frontend/src/features/catalog/components/`
- `frontend/src/features/catalog/composables/`
- `frontend/src/features/catalog/domain/`

### Step 2: Move the catalog domain as one unit

Move the entire bounded domain set together.

Do not leave a split domain where some catalog runtime files stay in old `posapp/domain/catalog` and others move.

### Step 3: Move the selector-specific components as one unit

Move `ItemsSelector` and its directly-owned UI children together.

Do not move only `ItemsSelector.vue` while keeping its live child tree under the old path.

### Step 4: Move the selector-specific composables as one unit

Move selector-owned composables required by the live selector path.

If a composable proves to be cross-feature during the move, stop and reclassify it into `shared/` or keep it in place intentionally with a note.

### Step 5: Rewire the three live selector consumers

Switch:

- `Pos.vue`
- `BarcodePrinting.vue`
- `PurchaseOrders.vue`

to the new `features/catalog/components/ItemsSelector.vue` path.

### Step 6: Rewire tests

Update all catalog-domain and selector tests to reference the new feature paths.

### Step 7: Remove old catalog ownership paths

Only after all live imports point to the new feature root:

- remove old moved files from `frontend/src/posapp/domain/catalog/`
- remove old moved files from `frontend/src/posapp/components/pos/items/`
- remove old moved selector composables from `frontend/src/posapp/composables/pos/items/`

Do not leave duplicate live ownership behind.

## No Partial State Conditions

Stop the phase and keep working if any of these remain true:

- new catalog domain exists but `ItemsSelector` still runs from old path
- `ItemsSelector` moved but live child components still remain under the old path
- `ItemsSelector` moved but selector-owned composables still point into the old structure in a way that preserves duplicate ownership
- tests only validate new helpers while the runtime still uses old files
- `Pos.vue`, `BarcodePrinting.vue`, and `PurchaseOrders.vue` do not all agree on one live selector import path

## Verification

Minimum verification set:

- catalog domain tests
- selector-focused tests
- frontend type-check

Suggested catalog/selector-focused tests:

- `tests/addCatalogItemToCart.spec.ts`
- `tests/catalogDiagnostics.spec.ts`
- `tests/itemsSelectorAdaptiveHybrid.spec.ts`
- `tests/itemsSelectorCatalogBridge.spec.ts`
- `tests/loadCatalogItemDetails.spec.ts`
- `tests/loadCatalogItems.spec.ts`
- `tests/posCatalogStore.spec.ts`
- `tests/searchCatalogItems.spec.ts`
- `tests/selectCatalogItem.spec.ts`
- `tests/useItemsSelectorFocus.spec.ts`
- `tests/useItemsSelectorSearch.spec.ts`

## Definition Of Done

Do not mark Phase 2 complete until:

- the live selector screen and its direct runtime path are feature-owned
- the old catalog domain and selector ownership paths are removed
- verification passes on the live path

If the selector still behaves as a feature but lives structurally under the old `posapp` path, the phase is not complete.
