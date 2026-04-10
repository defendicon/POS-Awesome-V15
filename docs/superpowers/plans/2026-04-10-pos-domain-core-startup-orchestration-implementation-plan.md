# POS Domain Core Startup Orchestration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize POS startup orchestration into a domain core that explicitly tracks readiness, degraded mode, and blocked startup states without depending on component mount side effects.

**Architecture:** Add a focused `posapp/domain` startup layer that owns register bootstrap, catalog bootstrap, and diagnostics timeline state. `DefaultLayout` will become the single startup entrypoint, while `Pos.vue` and `ItemsSelector.vue` will stop owning critical boot sequencing and instead consume the domain-driven state.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Vue Test Utils, existing POSAwesome stores and offline bootstrap helpers

---

## File Map

- Create: `frontend/src/posapp/domain/core/posDomainTypes.ts`
  - runtime status and stage types for POS startup
- Create: `frontend/src/posapp/domain/core/posDomainDiagnostics.ts`
  - timeline event helpers and blocker summary utilities
- Create: `frontend/src/posapp/domain/core/posDomainCore.ts`
  - central startup state machine and orchestrator
- Create: `frontend/src/posapp/domain/register/registerBootstrap.ts`
  - adapter for current register/bootstrap snapshot handoff
- Create: `frontend/src/posapp/domain/catalog/catalogBootstrap.ts`
  - adapter for customer/item boot coordination
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
  - start the domain core and drive loading UI from it
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
  - stop owning customer boot and reduce startup watchers
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
  - stop being a critical startup trigger and rely on domain-owned readiness
- Test: `frontend/tests/posDomainCore.spec.ts`
  - core stage transitions, degraded/blocked states
- Test: `frontend/tests/registerBootstrap.spec.ts`
  - register adapter behavior
- Test: `frontend/tests/catalogBootstrap.spec.ts`
  - items/customers boot coordination behavior
- Test: `frontend/tests/defaultLayoutStartup.spec.ts`
  - layout integration with domain core state

## Chunk 1: Diagnostics and Domain Core Skeleton

### Task 1: Write failing core state tests

**Files:**
- Create: `frontend/tests/posDomainCore.spec.ts`

- [ ] **Step 1: Write a failing test for successful startup progression**

```ts
it("moves from idle to ready when register and catalog both succeed", async () => {
  const core = createPosDomainCore(/* fake adapters */);
  await core.start();
  expect(core.state.value.stage).toBe("ready");
});
```

- [ ] **Step 2: Write a failing test for blocked startup when catalog never starts**

```ts
it("captures a blocked state with a blocker code when catalog bootstrap is skipped", async () => {
  const core = createPosDomainCore(/* register ok, catalog missing */);
  await core.start();
  expect(core.state.value.stage).toBe("blocked");
  expect(core.state.value.blocker?.code).toBe("catalog_not_started");
});
```

- [ ] **Step 3: Run the new test file to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/posDomainCore.spec.ts`

Expected: FAIL because domain core files do not exist yet.

- [ ] **Step 4: Commit the red test**

```bash
git add frontend/tests/posDomainCore.spec.ts
git commit -m "test: cover POS domain core startup states"
```

### Task 2: Implement the core types and state machine

**Files:**
- Create: `frontend/src/posapp/domain/core/posDomainTypes.ts`
- Create: `frontend/src/posapp/domain/core/posDomainDiagnostics.ts`
- Create: `frontend/src/posapp/domain/core/posDomainCore.ts`
- Test: `frontend/tests/posDomainCore.spec.ts`

- [ ] **Step 1: Add startup types**

```ts
export type PosDomainStage =
  | "idle"
  | "register"
  | "catalog"
  | "ready"
  | "degraded"
  | "blocked";
```

- [ ] **Step 2: Add diagnostics helpers**

```ts
export function pushTimelineEvent(/* ... */) {}
export function createBlocker(code: string, summary: string) {}
```

- [ ] **Step 3: Add the minimal core orchestrator**

```ts
export function createPosDomainCore({ runRegisterBootstrap, runCatalogBootstrap }) {
  const state = ref(/* initial state */);
  async function start() { /* explicit stage transitions */ }
  return { state, start };
}
```

- [ ] **Step 4: Run the core tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/posDomainCore.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the core skeleton**

```bash
git add frontend/src/posapp/domain/core/posDomainTypes.ts frontend/src/posapp/domain/core/posDomainDiagnostics.ts frontend/src/posapp/domain/core/posDomainCore.ts frontend/tests/posDomainCore.spec.ts
git commit -m "feat: add POS domain core startup state machine"
```

## Chunk 2: Register Bootstrap Adapter

### Task 3: Write failing register adapter tests

**Files:**
- Create: `frontend/tests/registerBootstrap.spec.ts`

- [ ] **Step 1: Write a failing test for normalized register readiness**

```ts
it("returns a ready register result when profile and opening data are available", () => {
  const result = runRegisterBootstrap(/* cached opening + profile */);
  expect(result.status).toBe("ready");
});
```

- [ ] **Step 2: Write a failing test for degraded bootstrap validation**

```ts
it("returns degraded when bootstrap validation requires warning mode", () => {
  const result = runRegisterBootstrap(/* mismatch input */);
  expect(result.status).toBe("degraded");
});
```

- [ ] **Step 3: Run the register test to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/registerBootstrap.spec.ts`

Expected: FAIL because adapter file does not exist yet.

- [ ] **Step 4: Commit the red register test**

```bash
git add frontend/tests/registerBootstrap.spec.ts
git commit -m "test: cover register bootstrap adapter states"
```

### Task 4: Implement register bootstrap adapter

**Files:**
- Create: `frontend/src/posapp/domain/register/registerBootstrap.ts`
- Test: `frontend/tests/registerBootstrap.spec.ts`

- [ ] **Step 1: Move bootstrap validation normalization into the adapter**

```ts
export function runRegisterBootstrap({ snapshot, validationInput, registerData }) {
  // return { status, data, warningCodes, blocker }
}
```

- [ ] **Step 2: Preserve current bootstrap helper usage**

```ts
const validation = validateBootstrapSnapshot(snapshot, validationInput);
const runtime = resolveBootstrapRuntimeState(validation, options);
```

- [ ] **Step 3: Run the register adapter tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/registerBootstrap.spec.ts tests/posDomainCore.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit the register adapter**

```bash
git add frontend/src/posapp/domain/register/registerBootstrap.ts frontend/tests/registerBootstrap.spec.ts
git commit -m "feat: add register bootstrap domain adapter"
```

## Chunk 3: Catalog Bootstrap Adapter

### Task 5: Write failing catalog adapter tests

**Files:**
- Create: `frontend/tests/catalogBootstrap.spec.ts`

- [ ] **Step 1: Write a failing test for items and customers ready**

```ts
it("returns ready when both catalog sources report ready", async () => {
  const result = await runCatalogBootstrap(/* items ready, customers ready */);
  expect(result.status).toBe("ready");
});
```

- [ ] **Step 2: Write a failing test for customer-only progress**

```ts
it("returns blocked with items_pending when customers complete first", async () => {
  const result = await runCatalogBootstrap(/* customers complete, items pending */);
  expect(result.status).toBe("blocked");
  expect(result.blocker?.code).toBe("items_pending");
});
```

- [ ] **Step 3: Run the catalog test to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/catalogBootstrap.spec.ts`

Expected: FAIL because adapter file does not exist yet.

- [ ] **Step 4: Commit the red catalog test**

```bash
git add frontend/tests/catalogBootstrap.spec.ts
git commit -m "test: cover catalog bootstrap readiness states"
```

### Task 6: Implement catalog bootstrap adapter

**Files:**
- Create: `frontend/src/posapp/domain/catalog/catalogBootstrap.ts`
- Test: `frontend/tests/catalogBootstrap.spec.ts`

- [ ] **Step 1: Wrap customer/item store startup into explicit adapter functions**

```ts
export async function runCatalogBootstrap({ startCustomers, startItems }) {
  // return { status, sources, blocker }
}
```

- [ ] **Step 2: Make “not started” and “still pending” explicit**

```ts
if (!items.started) return blocked("items_not_started");
if (!items.ready) return blocked("items_pending");
```

- [ ] **Step 3: Run catalog + core tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/catalogBootstrap.spec.ts tests/posDomainCore.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit the catalog adapter**

```bash
git add frontend/src/posapp/domain/catalog/catalogBootstrap.ts frontend/tests/catalogBootstrap.spec.ts
git commit -m "feat: add catalog bootstrap domain adapter"
```

## Chunk 4: Layout Integration and Startup Ownership

### Task 7: Write failing layout integration tests

**Files:**
- Create: `frontend/tests/defaultLayoutStartup.spec.ts`

- [ ] **Step 1: Write a failing test for loader release from domain ready state**

```ts
it("marks startup ready when domain core reaches ready state", async () => {
  // mount DefaultLayout with mocked core
  expect(wrapper.text()).toContain("Ready");
});
```

- [ ] **Step 2: Write a failing test for blocked startup surfacing**

```ts
it("surfaces blocked startup metadata when domain core reports a blocker", async () => {
  expect(wrapper.text()).toContain("items_pending");
});
```

- [ ] **Step 3: Run the layout integration test to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/defaultLayoutStartup.spec.ts`

Expected: FAIL because layout is not wired to domain core yet.

- [ ] **Step 4: Commit the red layout test**

```bash
git add frontend/tests/defaultLayoutStartup.spec.ts
git commit -m "test: cover layout startup integration with domain core"
```

### Task 8: Wire `DefaultLayout` to the domain core

**Files:**
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Modify: `frontend/src/posapp/domain/core/posDomainCore.ts`
- Test: `frontend/tests/defaultLayoutStartup.spec.ts`

- [ ] **Step 1: Instantiate the domain core in layout**

```ts
const posDomainCore = createPosDomainCore({ runRegisterBootstrap, runCatalogBootstrap });
```

- [ ] **Step 2: Replace implicit startup completion assumptions with core state reads**

```ts
const startupStage = computed(() => posDomainCore.state.value.stage);
const startupBlocker = computed(() => posDomainCore.state.value.blocker);
```

- [ ] **Step 3: Start the domain core from `initializeData()`**

```ts
await posDomainCore.start();
```

- [ ] **Step 4: Run layout and core tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/defaultLayoutStartup.spec.ts tests/posDomainCore.spec.ts tests/registerBootstrap.spec.ts tests/catalogBootstrap.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the layout integration**

```bash
git add frontend/src/posapp/layouts/DefaultLayout.vue frontend/src/posapp/domain/core/posDomainCore.ts frontend/tests/defaultLayoutStartup.spec.ts
git commit -m "feat: drive layout startup from POS domain core"
```

## Chunk 5: Remove Duplicate Component-Driven Boot Paths

### Task 9: Write failing regression coverage for duplicate startup triggers

**Files:**
- Modify: `frontend/tests/posShellDrafts.spec.ts`
- Modify: `frontend/tests/defaultLayoutStartup.spec.ts`

- [ ] **Step 1: Add a regression test that startup does not depend on `ItemsSelector` mounting first**

```ts
it("does not require ItemsSelector to start catalog orchestration", async () => {
  // simulate delayed selector mount
  expect(domainCoreStartSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run targeted tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/defaultLayoutStartup.spec.ts tests/posShellDrafts.spec.ts`

Expected: FAIL until component-owned triggers are removed.

- [ ] **Step 3: Commit the red regression**

```bash
git add frontend/tests/defaultLayoutStartup.spec.ts frontend/tests/posShellDrafts.spec.ts
git commit -m "test: cover startup independence from selector mount"
```

### Task 10: Remove duplicate customer/item boot triggers from shell components

**Files:**
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Test: `frontend/tests/defaultLayoutStartup.spec.ts`

- [ ] **Step 1: Remove customer boot ownership from `Pos.vue`**

```ts
// delete the watcher that directly calls customersStore.get_customer_names()
```

- [ ] **Step 2: Stop treating `ItemsSelector` initialization as the only path to item readiness**

```ts
// keep selector-local setup, but remove critical startup ownership assumptions
```

- [ ] **Step 3: Keep selector-specific setup only**

```ts
await itemsIntegration.initializeStore(/* only local selector concerns remain */);
```

- [ ] **Step 4: Run the startup regression suite**

Run: `yarn.cmd --cwd frontend test --run tests/defaultLayoutStartup.spec.ts tests/posDomainCore.spec.ts tests/registerBootstrap.spec.ts tests/catalogBootstrap.spec.ts tests/posShellDrafts.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the duplicate-trigger cleanup**

```bash
git add frontend/src/posapp/components/pos/shell/Pos.vue frontend/src/posapp/components/pos/items/ItemsSelector.vue frontend/src/posapp/layouts/DefaultLayout.vue frontend/tests/defaultLayoutStartup.spec.ts frontend/tests/posShellDrafts.spec.ts
git commit -m "refactor: remove component-driven POS startup dependencies"
```

## Chunk 6: Final Verification and Cleanup

### Task 11: Run full targeted verification and finish the subproject

**Files:**
- Verify only

- [ ] **Step 1: Run the startup/domain regression suite**

Run: `yarn.cmd --cwd frontend test --run tests/posDomainCore.spec.ts tests/registerBootstrap.spec.ts tests/catalogBootstrap.spec.ts tests/defaultLayoutStartup.spec.ts tests/posShellDrafts.spec.ts tests/bootstrapSnapshot.spec.ts`

Expected: PASS

- [ ] **Step 2: Run a production build**

Run: `yarn.cmd --cwd frontend build`

Expected: PASS

- [ ] **Step 3: Remove temporary spec/plan docs after implementation completes**

```bash
git rm docs/superpowers/specs/2026-04-10-pos-domain-core-startup-orchestration-design.md docs/superpowers/plans/2026-04-10-pos-domain-core-startup-orchestration-implementation-plan.md
```

- [ ] **Step 4: Commit cleanup if docs are removed in the final batch**

```bash
git commit -m "chore: remove POS domain core planning docs"
```
