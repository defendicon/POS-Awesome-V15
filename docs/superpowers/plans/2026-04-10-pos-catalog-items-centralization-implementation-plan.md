# POS Catalog / Items Centralization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize POS item selector runtime under a single catalog domain and convert the selector into an adaptive hybrid cards/table shell without duplicating search, selection, scanner, or add-to-cart logic.

**Architecture:** Add a `posCatalog` domain layer that owns catalog readiness, loading stages, diagnostics, search, selection, item addition, and detail hydration. Keep `itemsStore` as the low-level item data/cache backend, then bridge `ItemsSelector.vue` and its child components to consume catalog state and actions instead of owning orchestration directly.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Vuetify, existing POS item composables, existing offline item cache and diagnostics helpers

---

## File Structure

### New files

- `frontend/src/posapp/domain/catalog/posCatalogTypes.ts`
  - Catalog state types, stage names, view modes, diagnostics payloads.
- `frontend/src/posapp/domain/catalog/catalogDiagnostics.ts`
  - Helpers to create and update stage/blocker payloads.
- `frontend/src/posapp/domain/catalog/posCatalogStore.ts`
  - Pinia store for selector runtime state and view mode ownership.
- `frontend/src/posapp/domain/catalog/loadCatalogItems.ts`
  - Initial load, cached append, stage transitions, stuck-state diagnostics.
- `frontend/src/posapp/domain/catalog/searchCatalogItems.ts`
  - Unified search, group filter, and adaptive view filtering pipeline.
- `frontend/src/posapp/domain/catalog/selectCatalogItem.ts`
  - Shared highlight, keyboard navigation, top-item selection, row/card selection.
- `frontend/src/posapp/domain/catalog/addCatalogItemToCart.ts`
  - Shared add-to-cart orchestration over existing variant/bundle/batch/serial logic.
- `frontend/src/posapp/domain/catalog/loadCatalogItemDetails.ts`
  - Background item detail hydration, quantity fill, and degraded-state fallback.
- `frontend/tests/posCatalogStore.spec.ts`
- `frontend/tests/catalogDiagnostics.spec.ts`
- `frontend/tests/loadCatalogItems.spec.ts`
- `frontend/tests/searchCatalogItems.spec.ts`
- `frontend/tests/selectCatalogItem.spec.ts`
- `frontend/tests/addCatalogItemToCart.spec.ts`
- `frontend/tests/loadCatalogItemDetails.spec.ts`
- `frontend/tests/itemsSelectorCatalogBridge.spec.ts`
- `frontend/tests/itemsSelectorAdaptiveHybrid.spec.ts`

### Files to modify

- `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
  - Replace orchestration-heavy runtime with catalog-domain bridge.
- `frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue`
  - Consume catalog selection/search state without owning alternate runtime paths.
- `frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue`
  - Same as cards view, but table-specific rendering only.
- `frontend/src/posapp/components/pos/items/ItemHeader.vue`
  - Keep search and quick actions UI-only.
- `frontend/src/posapp/components/pos/items/ItemActionToolbar.vue`
  - View mode, group filter, and adaptive hybrid controls.
- `frontend/src/posapp/stores/itemsStore.ts`
  - Reduce selector orchestration leaks; keep data/cache responsibilities.
- `frontend/src/posapp/composables/pos/items/useItemsIntegration.ts`
  - Convert to thin compatibility adapter or retire most of its orchestration.
- `frontend/src/posapp/composables/pos/items/useItemSearch.ts`
  - Keep only low-level helpers that still belong outside the domain.
- `frontend/src/posapp/composables/pos/items/useItemSelection.ts`
  - Bridge to domain selection or reduce to deprecated adapter.
- `frontend/src/posapp/composables/pos/items/useItemsLoader.ts`
  - Bridge to domain load logic or shrink to compatibility wrapper.
- `frontend/src/posapp/composables/pos/items/useItemAddition.ts`
  - Keep business-critical item mutation helpers but move ownership to catalog action.

### Verification targets

- `yarn.cmd --cwd frontend test --run tests/posCatalogStore.spec.ts tests/catalogDiagnostics.spec.ts`
- `yarn.cmd --cwd frontend test --run tests/loadCatalogItems.spec.ts tests/searchCatalogItems.spec.ts tests/selectCatalogItem.spec.ts`
- `yarn.cmd --cwd frontend test --run tests/addCatalogItemToCart.spec.ts tests/loadCatalogItemDetails.spec.ts`
- `yarn.cmd --cwd frontend test --run tests/itemsSelectorCatalogBridge.spec.ts tests/itemsSelectorAdaptiveHybrid.spec.ts tests/useItemAddition.spec.ts tests/useItemDetailFetcher.spec.ts tests/useScanProcessor.spec.ts`
- `yarn.cmd --cwd frontend build`

## Chunk 1: Catalog Core And Diagnostics

### Task 1: Add catalog types, diagnostics, and runtime store

**Files:**
- Create: `frontend/src/posapp/domain/catalog/posCatalogTypes.ts`
- Create: `frontend/src/posapp/domain/catalog/catalogDiagnostics.ts`
- Create: `frontend/src/posapp/domain/catalog/posCatalogStore.ts`
- Test: `frontend/tests/posCatalogStore.spec.ts`
- Test: `frontend/tests/catalogDiagnostics.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { usePosCatalogStore } from "../src/posapp/domain/catalog/posCatalogStore";

describe("usePosCatalogStore", () => {
  it("tracks catalog stage and adaptive view mode", () => {
    setActivePinia(createPinia());
    const store = usePosCatalogStore();

    store.setCatalogStage("loading-items");
    store.setPreferredView("cards");

    expect(store.catalogStage).toBe("loading-items");
    expect(store.preferredView).toBe("cards");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/posCatalogStore.spec.ts tests/catalogDiagnostics.spec.ts`
Expected: FAIL with module resolution errors for the new catalog domain files.

- [ ] **Step 3: Write minimal implementation**

```ts
export const usePosCatalogStore = defineStore("posCatalog", () => {
  const catalogStage = ref<PosCatalogStage>("idle");
  const preferredView = ref<PosCatalogViewMode>("cards");
  const diagnostics = ref(createCatalogDiagnostics());

  const setCatalogStage = (stage: PosCatalogStage) => {
    catalogStage.value = stage;
    diagnostics.value = markCatalogStage(diagnostics.value, stage);
  };

  return { catalogStage, preferredView, diagnostics, setCatalogStage };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/posCatalogStore.spec.ts tests/catalogDiagnostics.spec.ts`
Expected: PASS with green store/diagnostics tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/domain/catalog/posCatalogTypes.ts frontend/src/posapp/domain/catalog/catalogDiagnostics.ts frontend/src/posapp/domain/catalog/posCatalogStore.ts frontend/tests/posCatalogStore.spec.ts frontend/tests/catalogDiagnostics.spec.ts
git commit -m "feat: add POS catalog state core"
```

### Task 2: Add unified load, search, and selection actions

**Files:**
- Create: `frontend/src/posapp/domain/catalog/loadCatalogItems.ts`
- Create: `frontend/src/posapp/domain/catalog/searchCatalogItems.ts`
- Create: `frontend/src/posapp/domain/catalog/selectCatalogItem.ts`
- Modify: `frontend/src/posapp/domain/catalog/posCatalogStore.ts`
- Test: `frontend/tests/loadCatalogItems.spec.ts`
- Test: `frontend/tests/searchCatalogItems.spec.ts`
- Test: `frontend/tests/selectCatalogItem.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("marks catalog degraded when item append fails after startup", async () => {
  const state = createCatalogStateForTest();
  await loadCatalogItems(state, { appendCachedItemsPage: vi.fn().mockRejectedValue(new Error("append failed")) });
  expect(state.status).toBe("degraded");
  expect(state.diagnostics.lastFailureStage).toBe("append-cached-page");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/loadCatalogItems.spec.ts tests/searchCatalogItems.spec.ts tests/selectCatalogItem.spec.ts`
Expected: FAIL because `loadCatalogItems`, `searchCatalogItems`, and `selectCatalogItem` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function loadCatalogItems(context: CatalogLoadContext) {
  context.store.setCatalogStage("loading-items");
  try {
    await context.loadItems();
    await context.appendCachedItemsPage();
    context.store.markReady();
  } catch (error) {
    context.store.markDegraded("append-cached-page", error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/loadCatalogItems.spec.ts tests/searchCatalogItems.spec.ts tests/selectCatalogItem.spec.ts`
Expected: PASS with unified stage and selection tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/domain/catalog/loadCatalogItems.ts frontend/src/posapp/domain/catalog/searchCatalogItems.ts frontend/src/posapp/domain/catalog/selectCatalogItem.ts frontend/src/posapp/domain/catalog/posCatalogStore.ts frontend/tests/loadCatalogItems.spec.ts frontend/tests/searchCatalogItems.spec.ts frontend/tests/selectCatalogItem.spec.ts
git commit -m "feat: add POS catalog load and selection actions"
```

## Chunk 2: Add-To-Cart And Detail Hydration Pipeline

### Task 3: Centralize add-to-cart ownership

**Files:**
- Create: `frontend/src/posapp/domain/catalog/addCatalogItemToCart.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemAddition.ts`
- Test: `frontend/tests/addCatalogItemToCart.spec.ts`
- Test: `frontend/tests/useItemAddition.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("routes card click and scanner adds through the same catalog add action", async () => {
  const prepareItemForCart = vi.fn().mockResolvedValue(undefined);
  const addItem = vi.fn().mockResolvedValue(undefined);

  await addCatalogItemToCart({ item, requestedQty: 1, prepareItemForCart, addItem });

  expect(prepareItemForCart).toHaveBeenCalledWith(item, 1, expect.any(Object));
  expect(addItem).toHaveBeenCalledWith(item, expect.any(Object));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/addCatalogItemToCart.spec.ts tests/useItemAddition.spec.ts`
Expected: FAIL with missing catalog add action and unchanged legacy ownership.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function addCatalogItemToCart(context: AddCatalogItemContext) {
  context.store.setCatalogStage("adding-item");
  await context.prepareItemForCart(context.item, context.requestedQty, context.itemContext);
  await context.addItem(context.item, context.itemContext);
  context.store.markLastAddedItem(context.item.item_code);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/addCatalogItemToCart.spec.ts tests/useItemAddition.spec.ts`
Expected: PASS with shared add pipeline behavior verified.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/domain/catalog/addCatalogItemToCart.ts frontend/src/posapp/composables/pos/items/useItemAddition.ts frontend/tests/addCatalogItemToCart.spec.ts frontend/tests/useItemAddition.spec.ts
git commit -m "feat: centralize POS catalog add-to-cart flow"
```

### Task 4: Centralize item detail hydration and degraded-state handling

**Files:**
- Create: `frontend/src/posapp/domain/catalog/loadCatalogItemDetails.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemDetailFetcher.ts`
- Modify: `frontend/src/posapp/domain/catalog/posCatalogStore.ts`
- Test: `frontend/tests/loadCatalogItemDetails.spec.ts`
- Test: `frontend/tests/useItemDetailFetcher.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("records detail hydration failure without blocking a ready selector", async () => {
  const updateItemsDetails = vi.fn().mockRejectedValue(new Error("detail fetch failed"));
  const store = createCatalogStoreForTest();

  await loadCatalogItemDetails({ store, updateItemsDetails, items: [item] });

  expect(store.status).toBe("degraded");
  expect(store.catalogStage).toBe("ready");
  expect(store.diagnostics.lastFailureStage).toBe("item-details");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/loadCatalogItemDetails.spec.ts tests/useItemDetailFetcher.spec.ts`
Expected: FAIL because there is no domain detail loader or degraded-state bridge yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function loadCatalogItemDetails(context: CatalogItemDetailsContext) {
  try {
    await context.updateItemsDetails(context.items);
  } catch (error) {
    context.store.markDegraded("item-details", error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/loadCatalogItemDetails.spec.ts tests/useItemDetailFetcher.spec.ts`
Expected: PASS with non-blocking detail hydration behavior covered.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/domain/catalog/loadCatalogItemDetails.ts frontend/src/posapp/composables/pos/items/useItemDetailFetcher.ts frontend/src/posapp/domain/catalog/posCatalogStore.ts frontend/tests/loadCatalogItemDetails.spec.ts frontend/tests/useItemDetailFetcher.spec.ts
git commit -m "feat: add POS catalog detail hydration flow"
```

## Chunk 3: Selector Bridge And Adaptive Hybrid UI

### Task 5: Bridge `ItemsSelector.vue` to the catalog domain

**Files:**
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
- Modify: `frontend/src/posapp/composables/pos/items/useItemsIntegration.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemsLoader.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemSelection.ts`
- Test: `frontend/tests/itemsSelectorCatalogBridge.spec.ts`
- Test: `frontend/tests/useItemsSelectorFocus.spec.ts`
- Test: `frontend/tests/useScanProcessor.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("does not bootstrap catalog load from component-local watchers", async () => {
  const wrapper = mount(ItemsSelector, { props: { context: "pos" } });
  expect(wrapper.vm.catalogStage).toBe("loading-items");
  expect(wrapper.vm.legacyItemsIntegrationActive).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/itemsSelectorCatalogBridge.spec.ts tests/useItemsSelectorFocus.spec.ts tests/useScanProcessor.spec.ts`
Expected: FAIL because `ItemsSelector.vue` still owns local runtime orchestration.

- [ ] **Step 3: Write minimal implementation**

```ts
const catalogStore = usePosCatalogStore();
const { displayedItems, catalogStage, preferredView } = storeToRefs(catalogStore);

onMounted(() => {
  startCatalogLoad(catalogBridgeContext);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/itemsSelectorCatalogBridge.spec.ts tests/useItemsSelectorFocus.spec.ts tests/useScanProcessor.spec.ts`
Expected: PASS with selector shell using catalog-domain ownership.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/pos/items/ItemsSelector.vue frontend/src/posapp/composables/pos/items/useItemsIntegration.ts frontend/src/posapp/composables/pos/items/useItemsLoader.ts frontend/src/posapp/composables/pos/items/useItemSelection.ts frontend/tests/itemsSelectorCatalogBridge.spec.ts frontend/tests/useItemsSelectorFocus.spec.ts frontend/tests/useScanProcessor.spec.ts
git commit -m "refactor: bridge item selector to POS catalog domain"
```

### Task 6: Implement adaptive hybrid selector behavior

**Files:**
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue`
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue`
- Modify: `frontend/src/posapp/components/pos/items/ItemActionToolbar.vue`
- Modify: `frontend/src/posapp/components/pos/items/ItemHeader.vue`
- Test: `frontend/tests/itemsSelectorAdaptiveHybrid.spec.ts`
- Test: `frontend/tests/itemSelectorHighlightBindings.spec.ts`
- Test: `frontend/tests/itemSearchFocusClearGuard.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps the same highlighted item when switching between cards and table", async () => {
  const store = createCatalogStoreForTest({ preferredView: "cards", highlightedItemCode: "ITEM-001" });
  store.setPreferredView("table");
  expect(store.highlightedItemCode).toBe("ITEM-001");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/itemsSelectorAdaptiveHybrid.spec.ts tests/itemSelectorHighlightBindings.spec.ts tests/itemSearchFocusClearGuard.spec.ts`
Expected: FAIL with view-mode switching still tied to selector-local behavior.

- [ ] **Step 3: Write minimal implementation**

```ts
const effectiveView = computed(() => {
  if (isNarrowScreen.value) return "cards";
  return catalogStore.preferredView;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/itemsSelectorAdaptiveHybrid.spec.ts tests/itemSelectorHighlightBindings.spec.ts tests/itemSearchFocusClearGuard.spec.ts`
Expected: PASS with adaptive hybrid behavior stable across cards/table modes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/pos/items/ItemsSelector.vue frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue frontend/src/posapp/components/pos/items/ItemActionToolbar.vue frontend/src/posapp/components/pos/items/ItemHeader.vue frontend/tests/itemsSelectorAdaptiveHybrid.spec.ts frontend/tests/itemSelectorHighlightBindings.spec.ts frontend/tests/itemSearchFocusClearGuard.spec.ts
git commit -m "feat: add adaptive hybrid POS item selector"
```

## Chunk 4: Legacy Cleanup And Final Verification

### Task 7: Remove leftover selector orchestration leaks

**Files:**
- Modify: `frontend/src/posapp/stores/itemsStore.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemSearch.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemsIntegration.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemsLoader.ts`
- Modify: `frontend/src/posapp/composables/pos/items/useItemSelection.ts`
- Test: `frontend/tests/itemService.spec.ts`
- Test: `frontend/tests/offlineItemsCache.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps itemsStore focused on data loading without selector-stage ownership", async () => {
  const store = useItemsStore();
  expect("catalogStage" in store).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/itemService.spec.ts tests/offlineItemsCache.spec.ts`
Expected: FAIL only if cleanup introduces regressions; use this as a guard before trimming old ownership paths.

- [ ] **Step 3: Write minimal implementation**

```ts
// remove selector-stage ownership from itemsStore
// leave loadItems/searchItems/getItemByCode/getItemByBarcode/cache helpers intact
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/itemService.spec.ts tests/offlineItemsCache.spec.ts`
Expected: PASS with item data/cache behavior preserved.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/stores/itemsStore.ts frontend/src/posapp/composables/pos/items/useItemSearch.ts frontend/src/posapp/composables/pos/items/useItemsIntegration.ts frontend/src/posapp/composables/pos/items/useItemsLoader.ts frontend/src/posapp/composables/pos/items/useItemSelection.ts frontend/tests/itemService.spec.ts frontend/tests/offlineItemsCache.spec.ts
git commit -m "refactor: trim legacy POS item selector adapters"
```

### Task 8: Run full verification, remove temporary docs, and finalize

**Files:**
- Delete: `docs/superpowers/specs/2026-04-10-pos-catalog-items-centralization-design.md`
- Delete: `docs/superpowers/plans/2026-04-10-pos-catalog-items-centralization-implementation-plan.md`
- Verify: `frontend/tests/posCatalogStore.spec.ts`
- Verify: `frontend/tests/catalogDiagnostics.spec.ts`
- Verify: `frontend/tests/loadCatalogItems.spec.ts`
- Verify: `frontend/tests/searchCatalogItems.spec.ts`
- Verify: `frontend/tests/selectCatalogItem.spec.ts`
- Verify: `frontend/tests/addCatalogItemToCart.spec.ts`
- Verify: `frontend/tests/loadCatalogItemDetails.spec.ts`
- Verify: `frontend/tests/itemsSelectorCatalogBridge.spec.ts`
- Verify: `frontend/tests/itemsSelectorAdaptiveHybrid.spec.ts`
- Verify: `frontend/tests/useItemAddition.spec.ts`
- Verify: `frontend/tests/useItemDetailFetcher.spec.ts`
- Verify: `frontend/tests/useScanProcessor.spec.ts`

- [ ] **Step 1: Run focused regression suite**

Run: `yarn.cmd --cwd frontend test --run tests/posCatalogStore.spec.ts tests/catalogDiagnostics.spec.ts tests/loadCatalogItems.spec.ts tests/searchCatalogItems.spec.ts tests/selectCatalogItem.spec.ts tests/addCatalogItemToCart.spec.ts tests/loadCatalogItemDetails.spec.ts tests/itemsSelectorCatalogBridge.spec.ts tests/itemsSelectorAdaptiveHybrid.spec.ts tests/useItemAddition.spec.ts tests/useItemDetailFetcher.spec.ts tests/useScanProcessor.spec.ts`
Expected: PASS with all catalog-domain and selector regression tests green.

- [ ] **Step 2: Run build verification**

Run: `yarn.cmd --cwd frontend build`
Expected: PASS with production bundle generated and no missing imports from retired selector logic.

- [ ] **Step 3: Remove temporary design/plan docs**

```powershell
Remove-Item -LiteralPath "docs\\superpowers\\specs\\2026-04-10-pos-catalog-items-centralization-design.md" -Force
Remove-Item -LiteralPath "docs\\superpowers\\plans\\2026-04-10-pos-catalog-items-centralization-implementation-plan.md" -Force
```

- [ ] **Step 4: Verify clean status**

Run: `git status --short`
Expected: Only intended code/test changes remain, with no temporary planning docs.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/domain/catalog frontend/src/posapp/components/pos/items frontend/src/posapp/stores/itemsStore.ts frontend/src/posapp/composables/pos/items frontend/tests
git add -u docs/superpowers/specs docs/superpowers/plans
git commit -m "refactor: centralize POS catalog and selector runtime"
```
