# POS Session and Register Centralization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize POS session and register readiness into one domain-owned flow and replace the shell-mounted opening dialog with a fullscreen `Register Setup` route.

**Architecture:** Add a focused `posSession` domain that owns session recovery, register setup submission, and close-shift lifecycle. `DefaultLayout` becomes the session gate, `/register` becomes the setup surface, and `Pos.vue` stops owning opening-session recovery. Existing cache/bootstrap helpers are reused rather than replaced.

**Tech Stack:** Vue 3, Pinia, Vue Router, TypeScript, Vitest, Vue Test Utils, existing offline bootstrap/cache helpers

---

## File Map

- Create: `frontend/src/posapp/domain/session/posSessionTypes.ts`
  - session stage types and result shapes
- Create: `frontend/src/posapp/domain/session/posSessionStore.ts`
  - single owner for current profile, opening shift, readiness, recovery source
- Create: `frontend/src/posapp/domain/session/recoverPosSession.ts`
  - cache/server/offline recovery adapter
- Create: `frontend/src/posapp/domain/session/registerSetupPage.ts`
  - register setup page state, prefill, submit logic
- Create: `frontend/src/posapp/domain/session/closePosSession.ts`
  - close-shift ownership extracted from current composable
- Create: `frontend/src/posapp/components/pos/session/RegisterSetupPage.vue`
  - fullscreen register setup screen
- Modify: `frontend/src/posapp/router/index.ts`
  - add `/register` route
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
  - gate startup on session readiness and route to `/register`
- Modify: `frontend/src/posapp/composables/pos/shared/usePosShift.ts`
  - remove recovery/opening ownership after migration
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
  - remove `OpeningDialog` ownership
- Modify: `frontend/src/posapp/components/pos/shell/PayView.vue`
  - stop local session recovery ownership
- Modify: `frontend/src/posapp/components/pos/Invoice.vue`
  - consume session-owned profile/opening shift
- Modify: `frontend/src/posapp/stores/uiStore.ts`
  - keep lightweight UI-only state, reduce session ownership
- Test: `frontend/tests/posSessionStore.spec.ts`
  - central session state transitions
- Test: `frontend/tests/recoverPosSession.spec.ts`
  - recovery adapter behavior
- Test: `frontend/tests/registerSetupPage.spec.ts`
  - register page logic and submit flow
- Test: `frontend/tests/defaultLayoutSessionGate.spec.ts`
  - layout routing gate behavior
- Test: `frontend/tests/posShellSessionIndependence.spec.ts`
  - shell no longer owns dialog/recovery

## Chunk 1: Session Core State

### Task 1: Write failing session store tests

**Files:**
- Create: `frontend/tests/posSessionStore.spec.ts`

- [ ] **Step 1: Write a failing test for ready session state**

```ts
it("stores a ready session with profile and opening shift", () => {
  const session = createPosSessionStore();
  session.setReadySession({
    posProfile: { name: "Main POS" },
    posOpeningShift: { name: "POS-OPEN-1" },
    source: "cache",
  });
  expect(session.state.value.stage).toBe("ready");
});
```

- [ ] **Step 2: Write a failing test for missing session state**

```ts
it("moves to needs_register_setup when no session is available", () => {
  const session = createPosSessionStore();
  session.setNeedsRegisterSetup("No opening shift found.");
  expect(session.state.value.stage).toBe("needs_register_setup");
});
```

- [ ] **Step 3: Run the test file to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/posSessionStore.spec.ts`

Expected: FAIL because the session store does not exist yet.

- [ ] **Step 4: Commit the red test**

```bash
git add frontend/tests/posSessionStore.spec.ts
git commit -m "test: cover POS session store states"
```

### Task 2: Implement the session core

**Files:**
- Create: `frontend/src/posapp/domain/session/posSessionTypes.ts`
- Create: `frontend/src/posapp/domain/session/posSessionStore.ts`
- Test: `frontend/tests/posSessionStore.spec.ts`

- [ ] **Step 1: Add session types**

```ts
export type PosSessionStage =
  | "recovering"
  | "ready"
  | "needs_register_setup"
  | "submitting_register_setup"
  | "closing_shift"
  | "blocked";
```

- [ ] **Step 2: Add minimal store creator**

```ts
export function createPosSessionStore() {
  const state = ref(/* initial state */);
  function setReadySession(...) {}
  function setNeedsRegisterSetup(...) {}
  return { state, setReadySession, setNeedsRegisterSetup };
}
```

- [ ] **Step 3: Run the session store tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/posSessionStore.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit the session core**

```bash
git add frontend/src/posapp/domain/session/posSessionTypes.ts frontend/src/posapp/domain/session/posSessionStore.ts frontend/tests/posSessionStore.spec.ts
git commit -m "feat: add POS session store"
```

## Chunk 2: Session Recovery Adapter

### Task 3: Write failing recovery tests

**Files:**
- Create: `frontend/tests/recoverPosSession.spec.ts`

- [ ] **Step 1: Write a failing test for cached opening recovery**

```ts
it("returns a ready session from cached opening data for the current user", async () => {
  const result = await recoverPosSession(/* cache hit */);
  expect(result.status).toBe("ready");
  expect(result.source).toBe("cache");
});
```

- [ ] **Step 2: Write a failing test for missing-session fallback**

```ts
it("returns needs_register_setup when no cached or server session exists", async () => {
  const result = await recoverPosSession(/* cache miss + server miss */);
  expect(result.status).toBe("needs_register_setup");
});
```

- [ ] **Step 3: Run the recovery tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/recoverPosSession.spec.ts`

Expected: FAIL because the recovery adapter does not exist yet.

- [ ] **Step 4: Commit the red recovery tests**

```bash
git add frontend/tests/recoverPosSession.spec.ts
git commit -m "test: cover POS session recovery states"
```

### Task 4: Implement recovery adapter

**Files:**
- Create: `frontend/src/posapp/domain/session/recoverPosSession.ts`
- Modify: `frontend/src/posapp/domain/session/posSessionTypes.ts`
- Test: `frontend/tests/recoverPosSession.spec.ts`

- [ ] **Step 1: Normalize cache and server recovery inputs**

```ts
export async function recoverPosSession({
  getCachedOpening,
  getServerOpening,
  currentUser,
}) {
  // return { status, source, sessionData, message }
}
```

- [ ] **Step 2: Reuse existing helpers**

Reference:
- `frontend/src/posapp/utils/openingCache.ts`
- `frontend/src/offline/bootstrapSnapshot.ts`

Use:

```ts
getValidCachedOpeningForCurrentUser(...)
createBootstrapSnapshotFromRegisterData(...)
```

- [ ] **Step 3: Run the recovery and session tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/recoverPosSession.spec.ts tests/posSessionStore.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit the recovery adapter**

```bash
git add frontend/src/posapp/domain/session/recoverPosSession.ts frontend/src/posapp/domain/session/posSessionTypes.ts frontend/tests/recoverPosSession.spec.ts
git commit -m "feat: add POS session recovery adapter"
```

## Chunk 3: Register Setup Route and Page Logic

### Task 5: Write failing register setup tests

**Files:**
- Create: `frontend/tests/registerSetupPage.spec.ts`

- [ ] **Step 1: Write a failing test for cached prefill**

```ts
it("prefills register setup fields from cached opening dialog data", async () => {
  const page = createRegisterSetupPage(/* cached setup data */);
  await page.load();
  expect(page.state.value.company).toBe("Test Co");
});
```

- [ ] **Step 2: Write a failing test for submit success**

```ts
it("submits the opening shift and returns a ready session result", async () => {
  const page = createRegisterSetupPage(/* fake submit */);
  await page.submit();
  expect(page.state.value.stage).toBe("submitted");
});
```

- [ ] **Step 3: Run the register setup tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/registerSetupPage.spec.ts`

Expected: FAIL because register setup logic does not exist yet.

- [ ] **Step 4: Commit the red register setup tests**

```bash
git add frontend/tests/registerSetupPage.spec.ts
git commit -m "test: cover register setup page logic"
```

### Task 6: Implement register setup logic

**Files:**
- Create: `frontend/src/posapp/domain/session/registerSetupPage.ts`
- Test: `frontend/tests/registerSetupPage.spec.ts`

- [ ] **Step 1: Add setup state and loader**

```ts
export function createRegisterSetupPage({ loadSetupData, submitOpeningShift }) {
  const state = ref(/* company, profile, methods, stage, errors */);
  async function load() {}
  async function submit() {}
  return { state, load, submit };
}
```

- [ ] **Step 2: Preserve existing opening dialog data behavior**

Reference:
- `frontend/src/posapp/components/pos/shift/OpeningDialog.vue`

Reuse:

- cached opening dialog data loading
- opening shift submit shape
- bootstrap snapshot refresh

- [ ] **Step 3: Run the register setup tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/registerSetupPage.spec.ts tests/recoverPosSession.spec.ts tests/posSessionStore.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit the register setup logic**

```bash
git add frontend/src/posapp/domain/session/registerSetupPage.ts frontend/tests/registerSetupPage.spec.ts
git commit -m "feat: add register setup page logic"
```

### Task 7: Add route and fullscreen page

**Files:**
- Create: `frontend/src/posapp/components/pos/session/RegisterSetupPage.vue`
- Modify: `frontend/src/posapp/router/index.ts`
- Test: `frontend/tests/registerSetupPage.spec.ts`

- [ ] **Step 1: Write a failing route-level test for register page rendering**

Add to `frontend/tests/registerSetupPage.spec.ts`:

```ts
it("renders fullscreen register setup actions and summary sections", () => {
  const wrapper = mount(RegisterSetupPage, /* stubs */);
  expect(wrapper.text()).toContain("Register Setup");
});
```

- [ ] **Step 2: Run the register setup tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/registerSetupPage.spec.ts`

Expected: FAIL until the page component and route exist.

- [ ] **Step 3: Build the page and route**

Add route:

```ts
{
  path: "/register",
  component: () => import("../components/pos/session/RegisterSetupPage.vue"),
  meta: { title: "Register Setup", layout: "default" },
}
```

- [ ] **Step 4: Run the register setup tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/registerSetupPage.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the page and route**

```bash
git add frontend/src/posapp/components/pos/session/RegisterSetupPage.vue frontend/src/posapp/router/index.ts frontend/tests/registerSetupPage.spec.ts
git commit -m "feat: add register setup page"
```

## Chunk 4: Layout Session Gate

### Task 8: Write failing layout session-gate tests

**Files:**
- Create: `frontend/tests/defaultLayoutSessionGate.spec.ts`

- [ ] **Step 1: Write a failing test for redirecting to register setup**

```ts
it("routes to /register when the session state needs register setup", async () => {
  const gate = createDefaultLayoutSessionGate(/* missing session */);
  await gate.start();
  expect(pushSpy).toHaveBeenCalledWith("/register");
});
```

- [ ] **Step 2: Write a failing test for continuing startup when session is ready**

```ts
it("continues startup when the session is already ready", async () => {
  const gate = createDefaultLayoutSessionGate(/* ready session */);
  await gate.start();
  expect(startupSpy).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the layout gate tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/defaultLayoutSessionGate.spec.ts`

Expected: FAIL because the layout gate does not exist yet.

- [ ] **Step 4: Commit the red layout gate tests**

```bash
git add frontend/tests/defaultLayoutSessionGate.spec.ts
git commit -m "test: cover layout session gate"
```

### Task 9: Wire layout to session gate

**Files:**
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Modify: `frontend/src/posapp/domain/session/posSessionStore.ts`
- Test: `frontend/tests/defaultLayoutSessionGate.spec.ts`

- [ ] **Step 1: Add session recovery to layout startup**

Reference:
- `frontend/src/posapp/domain/startup/defaultLayoutStartup.ts`
- `frontend/src/posapp/domain/session/recoverPosSession.ts`

- [ ] **Step 2: Route missing sessions to `/register`**

```ts
if (session.state.value.stage === "needs_register_setup") {
  await router.replace("/register");
  return;
}
```

- [ ] **Step 3: Continue normal startup only after session is ready**

```ts
if (session.state.value.stage === "ready") {
  await runPosStartupFlow();
}
```

- [ ] **Step 4: Run layout gate and startup tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/defaultLayoutSessionGate.spec.ts tests/defaultLayoutStartup.spec.ts tests/posSessionStore.spec.ts tests/recoverPosSession.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the layout gate**

```bash
git add frontend/src/posapp/layouts/DefaultLayout.vue frontend/src/posapp/domain/session/posSessionStore.ts frontend/tests/defaultLayoutSessionGate.spec.ts
git commit -m "feat: gate layout startup on POS session readiness"
```

## Chunk 5: Move Recovery and Close-Shift Ownership

### Task 10: Write failing shell-independence tests

**Files:**
- Create: `frontend/tests/posShellSessionIndependence.spec.ts`

- [ ] **Step 1: Write a failing source-level regression for opening dialog ownership**

```ts
it("does not mount OpeningDialog in Pos.vue", () => {
  expect(source).not.toContain("<OpeningDialog");
});
```

- [ ] **Step 2: Write a failing source-level regression for session recovery ownership**

```ts
it("does not call check_opening_entry inside Pos.vue or PayView.vue", () => {
  expect(posSource).not.toContain("check_opening_entry");
  expect(paySource).not.toContain("check_opening_entry");
});
```

- [ ] **Step 3: Run the shell-independence tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/posShellSessionIndependence.spec.ts`

Expected: FAIL until old ownership is removed.

- [ ] **Step 4: Commit the red shell tests**

```bash
git add frontend/tests/posShellSessionIndependence.spec.ts
git commit -m "test: cover POS shell session independence"
```

### Task 11: Move close and recovery logic out of old composable

**Files:**
- Create: `frontend/src/posapp/domain/session/closePosSession.ts`
- Modify: `frontend/src/posapp/composables/pos/shared/usePosShift.ts`
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
- Modify: `frontend/src/posapp/components/pos/shell/PayView.vue`
- Test: `frontend/tests/posShellSessionIndependence.spec.ts`

- [ ] **Step 1: Extract closing ownership**

```ts
export function closePosSession(...) {
  // wraps closing-shift preparation and submission
}
```

- [ ] **Step 2: Remove opening dialog mount from `Pos.vue`**

Delete:

- `OpeningDialog` import
- template mount
- open/close handlers related to that dialog

- [ ] **Step 3: Stop `PayView.vue` from owning its own session recovery path**

Reference:
- `frontend/src/posapp/components/pos/shell/PayView.vue`

Make it consume session-owned data instead of local opening recovery.

- [ ] **Step 4: Run shell-independence and startup tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/posShellSessionIndependence.spec.ts tests/defaultLayoutSessionGate.spec.ts tests/defaultLayoutStartup.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the recovery/close-shift cleanup**

```bash
git add frontend/src/posapp/domain/session/closePosSession.ts frontend/src/posapp/composables/pos/shared/usePosShift.ts frontend/src/posapp/components/pos/shell/Pos.vue frontend/src/posapp/components/pos/shell/PayView.vue frontend/tests/posShellSessionIndependence.spec.ts
git commit -m "refactor: move POS session ownership out of shell components"
```

## Chunk 6: Compatibility Cleanup

### Task 12: Remove remaining session leaks from invoice and UI state

**Files:**
- Modify: `frontend/src/posapp/components/pos/Invoice.vue`
- Modify: `frontend/src/posapp/stores/uiStore.ts`
- Modify: `frontend/src/posapp/domain/session/posSessionStore.ts`
- Test: `frontend/tests/posSessionStore.spec.ts`

- [ ] **Step 1: Write a failing regression for session-derived invoice context**

Add to `frontend/tests/posSessionStore.spec.ts`:

```ts
it("exposes current profile and opening shift for invoice consumers", () => {
  // assert derived session values
});
```

- [ ] **Step 2: Run the session tests to verify red**

Run: `yarn.cmd --cwd frontend test --run tests/posSessionStore.spec.ts`

Expected: FAIL until derived session context is finalized.

- [ ] **Step 3: Keep `uiStore.ts` UI-only and move session reads behind the session store**

Reference:
- `frontend/src/posapp/stores/uiStore.ts`
- `frontend/src/posapp/components/pos/Invoice.vue`

- [ ] **Step 4: Run the session and invoice-adjacent tests to verify green**

Run: `yarn.cmd --cwd frontend test --run tests/posSessionStore.spec.ts tests/posShellSessionIndependence.spec.ts tests/defaultLayoutSessionGate.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the compatibility cleanup**

```bash
git add frontend/src/posapp/components/pos/Invoice.vue frontend/src/posapp/stores/uiStore.ts frontend/src/posapp/domain/session/posSessionStore.ts frontend/tests/posSessionStore.spec.ts
git commit -m "refactor: clean remaining POS session state leaks"
```

## Chunk 7: Final Verification and Cleanup

### Task 13: Run final verification and remove temporary planning docs

**Files:**
- Verify only
- Delete at the end:
  - `docs/superpowers/specs/2026-04-10-pos-session-register-centralization-design.md`
  - `docs/superpowers/plans/2026-04-10-pos-session-register-centralization-implementation-plan.md`

- [ ] **Step 1: Run the full session/register regression suite**

Run: `yarn.cmd --cwd frontend test --run tests/posSessionStore.spec.ts tests/recoverPosSession.spec.ts tests/registerSetupPage.spec.ts tests/defaultLayoutSessionGate.spec.ts tests/posShellSessionIndependence.spec.ts tests/defaultLayoutStartup.spec.ts tests/bootstrapSnapshot.spec.ts`

Expected: PASS

- [ ] **Step 2: Run a production build**

Run: `yarn.cmd --cwd frontend build`

Expected: PASS

- [ ] **Step 3: Remove temporary spec and plan docs after implementation completes**

```bash
git rm docs/superpowers/specs/2026-04-10-pos-session-register-centralization-design.md docs/superpowers/plans/2026-04-10-pos-session-register-centralization-implementation-plan.md
```

- [ ] **Step 4: Commit the doc cleanup**

```bash
git commit -m "chore: remove POS session planning docs"
```

