# Phase 2 UOM Pricing and Refresh UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve exact or converted UOM prices deterministically from complete offline Item Price data and show a non-blocking `Refreshing...` state during startup offline-data refresh.

**Architecture:** Add a pure item-price selection service on top of `ItemPriceRepository`, then make the existing UOM mutation composable consume it before using the online compatibility fallback. Derive navbar refresh presentation from the existing sync coordinator/store lifecycle, with a small explicit startup-refresh flag for the interval before resource state events arrive.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Dexie/IndexedDB, existing Frappe API compatibility paths.

---

## Chunk 1: Deterministic UOM Price Resolution

### Task 1: Add Pure Item Price Resolver Tests

**Files:**
- Create: `frontend/tests/itemPriceResolver.spec.ts`
- Create: `frontend/src/posapp/services/itemPriceResolver.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- customer-specific exact UOM before generic exact UOM
- exact UOM price is not multiplied by conversion factor
- stock-UOM fallback is multiplied by selected-UOM conversion factor
- expired and future records are ignored
- deterministic tie-break by `valid_from`, `modified`, and name
- mismatched declared currency is ignored

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
yarn vitest run frontend/tests/itemPriceResolver.spec.ts
```

Expected: failure because `itemPriceResolver` does not exist.

- [ ] **Step 3: Implement minimal pure resolver**

Create typed request/result contracts. Keep candidate filtering and ranking pure;
inject repository records or a repository query function so unit tests do not
require IndexedDB.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
yarn vitest run frontend/tests/itemPriceResolver.spec.ts
```

Expected: all resolver tests pass.

### Task 2: Integrate Resolver with UOM Changes

**Files:**
- Modify: `frontend/src/posapp/composables/pos/shared/useStockUtils.ts`
- Modify: `frontend/tests/useStockUtils.spec.ts`
- Modify: `frontend/src/offline/repositories/ItemPriceRepository.ts`

- [ ] **Step 1: Write failing integration tests**

Add tests proving:

- offline exact-UOM repository price is used without a Frappe call
- customer-specific exact-UOM price wins
- absent exact-UOM price uses repository stock-UOM price times conversion factor
- online API remains a final compatibility fallback
- line amount, base amount, stock quantity, and invoice totals update

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
yarn vitest run frontend/tests/useStockUtils.spec.ts
```

Expected: repository-backed cases fail because `calcUom` does not call the
normalized repository/resolver.

- [ ] **Step 3: Implement repository-backed resolution**

Add a repository query that returns item candidates once, then call the shared
resolver with POS Profile price list, selected customer, posting date, price-list
currency, stock UOM, conversion factor, and stable stock-unit baseline.

Retain `_uom_calc_token`, offers, discounts, currency conversions, totals, stock
quantity, and online API compatibility fallback.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
yarn vitest run frontend/tests/itemPriceResolver.spec.ts frontend/tests/useStockUtils.spec.ts
```

Expected: all resolver and UOM integration tests pass.

## Chunk 2: Non-Blocking Refresh Status UX

### Task 3: Add Refresh Presentation Tests

**Files:**
- Modify: `frontend/src/posapp/stores/offlineSyncStore.ts`
- Modify: `frontend/src/posapp/components/navbar/StatusIndicator.vue`
- Modify: `frontend/src/posapp/components/Navbar.vue`
- Modify: `frontend/tests/offlineStatusPanel.spec.ts`
- Modify: `frontend/tests/statusIndicator.spec.ts`
- Modify: `frontend/tests/navbar.spec.ts`

- [ ] **Step 1: Write failing store/component tests**

Cover:

- explicit startup refresh state produces `Refreshing`
- syncing resource state also produces `Refreshing`
- refresh presentation takes precedence over temporary `Limited`
- status icon is `mdi-refresh` with a spinning indicator
- refresh subtitle describes offline-data refresh
- state returns to `Online` after refresh completes

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
yarn vitest run frontend/tests/offlineStatusPanel.spec.ts frontend/tests/statusIndicator.spec.ts frontend/tests/navbar.spec.ts
```

Expected: tests fail because refresh lifecycle is not passed into the navbar
status indicator.

- [ ] **Step 3: Implement presentation state**

Add `startupRefreshActive` and a computed `refreshActive` to the offline sync
store. Pass `refreshActive` into `StatusIndicator`. Render refresh icon, spinner,
label, tooltip, and subtitle before limited connectivity presentation.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same focused component tests and expect all to pass.

### Task 4: Wire Startup and Manual Refresh Lifecycle

**Files:**
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Modify: `frontend/src/posapp/composables/runtime/useBootSync.ts`
- Modify: `frontend/tests/offlineSyncBootCritical.spec.ts`
- Modify or create focused runtime tests under `frontend/tests/`

- [ ] **Step 1: Write failing lifecycle tests**

Cover:

- confirmed online startup schedules complete refresh without blocking caller
- refresh flag is set before awaiting sync
- refresh flag clears after success
- refresh flag clears after failure
- bootstrap warning reevaluation happens after refresh settles

- [ ] **Step 2: Run tests and verify RED**

Run the focused runtime tests. Expected: lifecycle state is not currently
exposed.

- [ ] **Step 3: Implement minimal lifecycle wiring**

Set startup refresh active immediately before the full background user-action
refresh and clear it in `finally`. Reuse the same wrapper for manual refresh.
Do not await the background call from POS mount or customer readiness paths.

- [ ] **Step 4: Run tests and verify GREEN**

Run focused runtime and UI tests and expect all to pass.

## Chunk 3: Contracts and Verification

### Task 5: Update Architecture Contracts

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/FEATURE_CONTRACTS.md`

- [ ] Document exact-UOM versus conversion fallback ownership.
- [ ] Document non-blocking startup refresh and `Refreshing` status semantics.

### Task 6: Full Verification

- [ ] Run focused pricing and sync tests.
- [ ] Run full frontend unit tests.
- [ ] Run targeted ESLint for changed frontend files.
- [ ] Run frontend type-check.
- [ ] Run production frontend build.
- [ ] Run `git diff --check`.
- [ ] Review final diff for unrelated changes and generated artifacts.

Commands:

```powershell
yarn test:unit
yarn eslint <changed TypeScript and Vue files>
yarn type-check
yarn build
git diff --check
```

Expected: all commands pass; only existing non-failing warnings may remain.

