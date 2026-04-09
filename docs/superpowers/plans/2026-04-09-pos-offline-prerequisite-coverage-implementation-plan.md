# POS Offline Prerequisite Coverage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand offline bootstrap prerequisite coverage so the snapshot reflects practical POS readiness across profile, opening, items, customers, pricing, print, offers, coupons, tax, item groups, stock, and related warning-only prerequisites.

**Architecture:** Keep bootstrap validation centralized in the existing snapshot module. Add a central prerequisite collector plus a central snapshot refresh helper, then call that helper from major orchestration points where cache state becomes meaningfully usable. Preserve current startup flow and use the existing warning/limited-mode runtime consumer.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Dexie, existing POS Awesome offline cache utilities

---

## File Map

### Modify

- `frontend/src/offline/bootstrapSnapshot.ts`
- `frontend/tests/bootstrapSnapshot.spec.ts`
- `frontend/src/offline/cache.ts`
- `frontend/src/offline/item_groups.ts`
- `frontend/src/offline/stock.ts`
- `frontend/src/posapp/composables/pos/shared/useOffers.ts`
- `frontend/src/posapp/stores/customersStore.ts`
- `frontend/src/posapp/stores/itemsStore.ts`
- `frontend/src/posapp/composables/pos/items/store/useItemsSync.ts`
- `frontend/src/utils/pos_profile.ts`
- `frontend/src/posapp/layouts/DefaultLayout.vue`

### Existing Tests To Keep Green

- `frontend/tests/openingCache.spec.ts`
- `frontend/tests/offlineKeyMapParity.spec.ts`
- `frontend/tests/chunkLoadRecovery.spec.ts`
- `frontend/tests/bundleVersionActivation.spec.ts`
- `frontend/tests/loaderPathNormalization.spec.ts`

## Chunk 1: Central Prerequisite Collection

### Task 1: Add failing tests for full prerequisite collection

**Files:**
- Modify: `frontend/tests/bootstrapSnapshot.spec.ts`
- Modify: `frontend/src/offline/bootstrapSnapshot.ts`

- [ ] **Step 1: Write the failing tests**

Add tests covering:

- `collectBootstrapPrerequisites()` marks all expected prerequisites correctly
- warning-only prerequisites do not force `canSellOffline` false
- missing `items_cache_ready` and `customers_cache_ready` do force `canSellOffline` false

Example shape:

```ts
const result = collectBootstrapPrerequisites({
	profileName: "POS-1",
	openingShiftName: "SHIFT-1",
	paymentMethods: [{ mode_of_payment: "Cash" }],
	salesPersons: [],
	itemsCount: 25,
	customersCount: 3,
	itemGroups: ["ALL", "Beverages"],
	pricingSnapshotCount: 2,
	pricingContext: { profile_name: "POS-1" },
	taxInclusive: true,
	printTemplate: "<div>Receipt</div>",
	termsAndConditions: "Terms",
	offers: [{ name: "OFFER-1" }],
	coupons: { CUSTOMER1: ["COUPON-1"] },
	stockCacheReady: false,
});

expect(result.sales_persons).toBe("missing");
expect(result.stock_cache_ready).toBe("missing");
expect(
	validateBootstrapSnapshot(
		buildBootstrapSnapshot({ prerequisites: result }),
		currentInput,
	).capabilities.canSellOffline,
).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: FAIL because full prerequisite collector does not exist yet.

- [ ] **Step 3: Implement minimal collector and capability expansion**

In `frontend/src/offline/bootstrapSnapshot.ts`:

- add a central `collectBootstrapPrerequisites(input)` helper
- expand prerequisite names to include:
  - `sales_persons`
  - `items_cache_ready`
  - `customers_cache_ready`
  - `item_groups`
  - `tax_inclusive`
  - `stock_cache_ready`
- update capability derivation rules to:
  - hard-block `canSellOffline` on `items_cache_ready` and `customers_cache_ready`
  - keep `sales_persons`, `item_groups`, and `stock_cache_ready` warning-only

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/bootstrapSnapshot.spec.ts frontend/src/offline/bootstrapSnapshot.ts
git commit -m "feat: expand bootstrap prerequisite collection"
```

### Task 2: Add snapshot refresh helper based on caches

**Files:**
- Modify: `frontend/src/offline/bootstrapSnapshot.ts`
- Modify: `frontend/tests/bootstrapSnapshot.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for:

- `refreshBootstrapSnapshotFromCaches()` merges build/profile/opening metadata
- recomputes prerequisites from cache inputs
- preserves existing snapshot fields when still valid

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: FAIL on missing helper behavior.

- [ ] **Step 3: Implement minimal refresh helper**

Add helper shape similar to:

```ts
refreshBootstrapSnapshotFromCaches({
	currentSnapshot,
	buildVersion,
	registerData,
	cacheState,
})
```

Behavior:

- seed base snapshot from register data
- recompute prerequisites from `cacheState`
- return normalized snapshot

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/bootstrapSnapshot.spec.ts frontend/src/offline/bootstrapSnapshot.ts
git commit -m "feat: add bootstrap cache refresh helper"
```

## Chunk 2: Cache-State Readers And Trigger Points

### Task 3: Wire offers, print, tax, item groups, and stock into bootstrap refresh

**Files:**
- Modify: `frontend/src/offline/cache.ts`
- Modify: `frontend/src/offline/item_groups.ts`
- Modify: `frontend/src/offline/stock.ts`
- Modify: `frontend/src/posapp/composables/pos/shared/useOffers.ts`
- Modify: `frontend/src/utils/pos_profile.ts`
- Modify: `frontend/tests/bootstrapSnapshot.spec.ts`

- [ ] **Step 1: Write the failing test**

Add bootstrap tests that prove:

- cached offers and coupons produce `offers_cache` / `coupons_cache` ready
- tax inclusive and print/terms produce ready states
- empty item groups and stock not-ready produce warning-only missing states

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: FAIL until refresh inputs are wired.

- [ ] **Step 3: Implement minimal orchestration wiring**

Update major write points so bootstrap refresh runs after:

- offers saved
- print template / terms refreshed from profile
- tax inclusive updated
- item groups loaded or cached
- stock cache initialized or marked ready

Keep failures non-fatal to original cache writes.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/offline/cache.ts frontend/src/offline/item_groups.ts frontend/src/offline/stock.ts frontend/src/posapp/composables/pos/shared/useOffers.ts frontend/src/utils/pos_profile.ts frontend/tests/bootstrapSnapshot.spec.ts
git commit -m "feat: refresh bootstrap snapshot from shared cache writers"
```

### Task 4: Wire customer and item readiness into bootstrap refresh

**Files:**
- Modify: `frontend/src/posapp/stores/customersStore.ts`
- Modify: `frontend/src/posapp/stores/itemsStore.ts`
- Modify: `frontend/src/posapp/composables/pos/items/store/useItemsSync.ts`
- Modify: `frontend/tests/bootstrapSnapshot.spec.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:

- customer count / loaded state mapping to `customers_cache_ready`
- scoped item count / loaded state mapping to `items_cache_ready`
- profile-switch recompute making the snapshot reflect the new readiness state

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: FAIL until customer/item orchestration points refresh the snapshot.

- [ ] **Step 3: Implement minimal orchestration wiring**

Refresh bootstrap snapshot after:

- customers finish initial local/server load
- customer scope isolation clears old profile data
- items are loaded from cache/server
- item background sync completes

Use the central helper rather than custom prerequisite writes.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/stores/customersStore.ts frontend/src/posapp/stores/itemsStore.ts frontend/src/posapp/composables/pos/items/store/useItemsSync.ts frontend/tests/bootstrapSnapshot.spec.ts
git commit -m "feat: track item and customer readiness in bootstrap snapshot"
```

## Chunk 3: Startup Consumer Consistency And Verification

### Task 5: Align startup warnings with expanded prerequisites

**Files:**
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Modify: `frontend/tests/bootstrapSnapshot.spec.ts`

- [ ] **Step 1: Write the failing test**

Add tests ensuring:

- expanded warning codes are surfaced correctly
- warning-only prerequisites keep runtime mode `limited` without hard-blocking sell capability

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts tests/chunkLoadRecovery.spec.ts tests/bundleVersionActivation.spec.ts tests/loaderPathNormalization.spec.ts`
Expected: FAIL until the warning mapper covers the new prerequisite names.

- [ ] **Step 3: Implement minimal consumer update**

In `DefaultLayout.vue`:

- extend warning message mapping for new prerequisite codes
- keep current confirmation/limited flow unchanged
- avoid broad feature disablement in this chunk

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts tests/chunkLoadRecovery.spec.ts tests/bundleVersionActivation.spec.ts tests/loaderPathNormalization.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/layouts/DefaultLayout.vue frontend/tests/bootstrapSnapshot.spec.ts
git commit -m "feat: surface expanded offline prerequisite warnings"
```

### Task 6: Run final targeted verification

**Files:**
- No new code unless verification exposes a bug

- [ ] **Step 1: Run targeted frontend verification**

Run:

```bash
yarn.cmd --cwd frontend test --run tests/bootstrapSnapshot.spec.ts tests/openingCache.spec.ts tests/offlineKeyMapParity.spec.ts tests/chunkLoadRecovery.spec.ts tests/bundleVersionActivation.spec.ts tests/loaderPathNormalization.spec.ts
```

Expected: PASS

- [ ] **Step 2: Run build and syntax verification**

Run:

```bash
yarn.cmd --cwd frontend build
node --check posawesome\posawesome\page\pos\pos.js
python -m unittest posawesome.posawesome.page.test_page_aliases
```

Expected: all pass

- [ ] **Step 3: Commit final implementation**

```bash
git add frontend posawesome
git commit -m "feat: expand offline bootstrap prerequisite coverage"
```

## Notes For Execution

- Keep route architecture unchanged: canonical route stays `/app/posapp`.
- Do not broaden this chunk into full UI disablement or queue redesign.
- Treat `sales_persons`, `item_groups`, and `stock_cache_ready` as warning-level prerequisites in this phase.
- Keep all refresh helper calls non-fatal to the original cache write path.
- Prefer pure functions in `bootstrapSnapshot.ts` so expanded prerequisite behavior remains easy to test.
