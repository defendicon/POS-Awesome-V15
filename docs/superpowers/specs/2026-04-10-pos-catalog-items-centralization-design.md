# POS Catalog / Items Centralization Design

Date: 2026-04-10
Branch: `centralization-of-pos-app`

## Summary

POS item runtime is currently split across `itemsStore`, `useItemsIntegration`, many item composables, and a large `ItemsSelector.vue` shell. This makes selector behavior hard to reason about and leaves stuck-loading failures difficult to trace. The next subproject centralizes item browsing, search, selection, detail hydration, and add-to-cart orchestration under a single catalog domain while also cleaning up the selector UI into an adaptive hybrid cards/table experience.

## Goals

- Create one primary owner for item runtime state and loading stages.
- Keep `itemsStore` focused on item data, caching, and persistence instead of selector orchestration.
- Make `ItemsSelector.vue` a thin consumer of catalog state and actions.
- Preserve existing item business logic for stock, variants, bundles, and batch/serial handling while moving ownership behind clearer boundaries.
- Support an adaptive hybrid selector UI where cards and table are presentation modes over the same catalog state.
- Improve diagnostics for stuck-loading paths, especially cases where customer/session are ready but item selector never completes.

## Non-Goals

- Rebuild the entire item data backend or offline cache model in this phase.
- Redesign checkout, payments, or session/register flows.
- Replace all existing presentational item components.
- Introduce a standalone visual redesign unrelated to selector usability and clarity.

## Proposed Architecture

### New Catalog Domain

Add a `posCatalog` domain that becomes the runtime owner for item selector behavior.

Planned files:

- `frontend/src/posapp/domain/catalog/posCatalogStore.ts`
- `frontend/src/posapp/domain/catalog/loadCatalogItems.ts`
- `frontend/src/posapp/domain/catalog/searchCatalogItems.ts`
- `frontend/src/posapp/domain/catalog/selectCatalogItem.ts`
- `frontend/src/posapp/domain/catalog/addCatalogItemToCart.ts`
- `frontend/src/posapp/domain/catalog/loadCatalogItemDetails.ts`
- `frontend/src/posapp/domain/catalog/catalogDiagnostics.ts`

### Ownership Split

`posCatalog` owns:

- catalog readiness and loading stage
- selector presentation mode
- search term, active group, highlighted item, selected item
- initial catalog load and cached page append
- item selection and keyboard navigation
- scanner and click/enter routing into the add pipeline
- background detail hydration state
- diagnostics for partial or stuck loading

`itemsStore` remains responsible for:

- item data fetching
- item cache persistence
- offline item storage integration
- search indexes and low-level item lookup helpers where reuse makes sense

`ItemsSelector.vue` and child components become responsible for:

- rendering
- emitting UI intents
- consuming domain state
- avoiding orchestration side effects

## Adaptive Hybrid Selector UX

The selector remains a single shell with shared state for cards and table modes.

Behavior:

- wide screens default to cards for browsing
- table remains available for dense scanning workflows
- narrower screens stay cards-first
- user preference is remembered, but cards/table are only view modes and never separate data pipelines

Interaction rules:

- search uses one catalog search pipeline
- keyboard highlight logic is shared across views
- scanner input uses the same add-to-cart path as click or enter
- detail hydration runs in the background where possible
- selector state distinguishes between `loading`, `empty`, `degraded`, and `ready`

This keeps cards/table switching from resetting logic or creating split runtime ownership.

## Migration Strategy

1. Add the catalog domain state and diagnostics first.
2. Move load, search, select, add, and detail orchestration into domain actions.
3. Bridge `ItemsSelector.vue` to the new catalog domain while keeping current presentational child components.
4. Reduce `useItemsIntegration`, `useItemAddition`, `useItemSelection`, `useItemsLoader`, and `useItemSearch` to adapters or retire them where possible.
5. Limit `itemsStore` to data/cache concerns and remove selector-side orchestration leaks.
6. Finish adaptive hybrid UI cleanup and delete dead selector logic.

## Error Handling And Diagnostics

The catalog domain should explicitly track:

- current loading stage
- last completed stage
- last failure stage
- whether the selector is blocked, degraded, or ready
- a short diagnostics payload usable in logs and tests

This is intended to make failures like “customer loaded but items never progressed” directly visible instead of requiring console guesswork from scattered components.

## Testing Strategy

Planned test files:

- `frontend/tests/posCatalogStore.spec.ts`
- `frontend/tests/loadCatalogItems.spec.ts`
- `frontend/tests/searchCatalogItems.spec.ts`
- `frontend/tests/selectCatalogItem.spec.ts`
- `frontend/tests/addCatalogItemToCart.spec.ts`
- `frontend/tests/catalogDiagnostics.spec.ts`
- `frontend/tests/itemsSelectorCatalogBridge.spec.ts`

Coverage focus:

- stage transitions and readiness states
- cache hit and offline fallback behavior
- shared search/group/view logic
- keyboard selection consistency
- add-to-cart paths for merge, variant, bundle, and batch/serial cases
- diagnostics for partial progress and stuck states
- cards/table switching without duplicate runtime paths

## Risks And Controls

Risks:

- item runtime is spread across many files and composables
- add-to-cart behavior contains business-critical edge cases
- selector UI changes can easily regress keyboard or scanner workflows

Controls:

- do not rewrite `itemsStore` from scratch
- reuse existing batch/serial/bundle logic behind the new domain action
- keep presentational children mostly intact during the first migration pass
- add diagnostics before large cleanup so regressions are easier to localize

## Success Criteria

- item selector runtime has one primary owner
- `ItemsSelector.vue` no longer owns catalog orchestration
- cards, table, search, and scanner flows share the same catalog actions
- stuck-loading behavior can be diagnosed through explicit catalog stages
- selector UX is cleaner without splitting business logic across views
