# Embedded PIN Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move cashier PIN management into the hybrid settings workspace as an embedded right-pane form, and remove the old menu dialog flow.

**Architecture:** Extend the settings workspace so it can switch between section overview and embedded action detail states. Add a focused `NavbarCashierPinForm` child component for all PIN loading/validation/save behavior, and keep `NavbarSettingsPanel` responsible only for navigation and layout orchestration.

**Tech Stack:** Vue 3 SFCs, Vuetify, Pinia, Vitest, Vue Test Utils, Frappe RPC calls

---

## File Map

- Modify: `frontend/src/posapp/components/Navbar.vue`
  - pass cashier/profile context into the settings workspace
  - update settings action metadata so `Manage Cashier PIN` is surfaced from `Personal`
- Modify: `frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue`
  - add `activeActionId` state
  - render section overview vs embedded detail
  - host reusable detail surface/back navigation
- Create: `frontend/src/posapp/components/navbar/NavbarCashierPinForm.vue`
  - own PIN status loading, validation, save, and inline messaging
- Modify: `frontend/src/posapp/components/navbar/NavbarMenu.vue`
  - remove PIN dialog template, state, and methods
  - keep non-PIN menu behavior unchanged
- Modify: `frontend/tests/navbarSettingsPanel.spec.ts`
  - cover embedded detail switching and back behavior
- Create: `frontend/tests/navbarCashierPinForm.spec.ts`
  - cover no-context, load success, validation, and save flows
- Modify: `frontend/tests/navbarMenuActions.spec.ts`
  - assert menu no longer owns PIN dialog behavior and other actions still work

## Chunk 1: Settings Workspace Detail Mode

### Task 1: Add failing settings-panel detail tests

**Files:**
- Modify: `frontend/tests/navbarSettingsPanel.spec.ts`

- [ ] **Step 1: Add a Personal section action for embedded PIN detail**

```ts
{
  id: "manage-cashier-pin",
  label: "Manage Cashier PIN",
  subtitle: "Create or change your PIN",
  icon: "mdi-form-textbox-password",
  tone: "secondary",
}
```

- [ ] **Step 2: Write failing tests for detail mode and back navigation**

```ts
it("opens embedded detail mode for manage cashier pin", async () => {
  await wrapper.get('[data-test="settings-panel-category-personal"]').trigger("click");
  await wrapper.get('[data-test="settings-panel-action-manage-cashier-pin"]').trigger("click");

  expect(wrapper.get('[data-test="settings-panel-detail-view"]').text()).toContain("Manage Cashier PIN");
});

it("returns to section overview from embedded detail mode", async () => {
  // open detail first
  await wrapper.get('[data-test="settings-panel-detail-back"]').trigger("click");

  expect(wrapper.find('[data-test="settings-panel-detail-view"]').exists()).toBe(false);
  expect(wrapper.find('[data-test="settings-panel-action-manage-cashier-pin"]').exists()).toBe(true);
});
```

- [ ] **Step 3: Run the targeted test and confirm failure**

Run: `yarn.cmd --cwd frontend test --run tests/navbarSettingsPanel.spec.ts`

Expected: FAIL because embedded detail state/back controls do not exist yet.

- [ ] **Step 4: Commit the red test**

```bash
git add frontend/tests/navbarSettingsPanel.spec.ts
git commit -m "test: cover embedded PIN settings detail state"
```

### Task 2: Implement settings-panel detail mode

**Files:**
- Modify: `frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue`

- [ ] **Step 1: Add `activeActionId` state and detail-mode computed helpers**

```ts
const activeActionId = ref("");

const activeAction = computed(() =>
  activeSection.value?.actions?.find((action) => action.id === activeActionId.value) || null,
);
```

- [ ] **Step 2: Add overview/detail rendering boundary**

```vue
<div v-if="activeAction" data-test="settings-panel-detail-view">
  <button data-test="settings-panel-detail-back" @click="clearActiveAction">...</button>
</div>
<div v-else>
  <!-- existing section action cards -->
</div>
```

- [ ] **Step 3: Keep non-embedded actions emitting as before**

```ts
function handleActionSelect(action) {
  if (action.id === "manage-cashier-pin") {
    activeActionId.value = action.id;
    return;
  }
  emit("select-action", action.id);
}
```

- [ ] **Step 4: Run the targeted test and confirm pass**

Run: `yarn.cmd --cwd frontend test --run tests/navbarSettingsPanel.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the workspace detail mode**

```bash
git add frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue frontend/tests/navbarSettingsPanel.spec.ts
git commit -m "feat: add embedded detail mode to settings workspace"
```

## Chunk 2: Embedded Cashier PIN Form

### Task 3: Add failing PIN form tests

**Files:**
- Create: `frontend/tests/navbarCashierPinForm.spec.ts`

- [ ] **Step 1: Write tests for missing context, successful status load, validation, and save**

```ts
it("shows warning when cashier or profile is missing", () => {});
it("loads pin status when context is present", async () => {});
it("shows validation error for invalid pin", async () => {});
it("saves pin and shows success state", async () => {});
```

- [ ] **Step 2: Stub `frappe.call` for status and save RPCs**

```ts
vi.stubGlobal("frappe", {
  call: vi.fn(async ({ method }) => {
    if (method.includes("get_cashier_pin_status")) return { message: { has_pin: true } };
    if (method.includes("save_cashier_pin")) return { message: { has_pin: true } };
  }),
});
```

- [ ] **Step 3: Run the new test file and confirm failure**

Run: `yarn.cmd --cwd frontend test --run tests/navbarCashierPinForm.spec.ts`

Expected: FAIL because component does not exist yet.

- [ ] **Step 4: Commit the red test**

```bash
git add frontend/tests/navbarCashierPinForm.spec.ts
git commit -m "test: cover embedded cashier PIN form behavior"
```

### Task 4: Build `NavbarCashierPinForm`

**Files:**
- Create: `frontend/src/posapp/components/navbar/NavbarCashierPinForm.vue`

- [ ] **Step 1: Implement context-aware empty state**

```vue
<v-alert v-if="!hasRequiredContext" type="warning">
  {{ __("Load a POS profile and cashier first.") }}
</v-alert>
```

- [ ] **Step 2: Port PIN state/methods from `NavbarMenu.vue`**

```ts
const pinStatus = ref({ has_pin: false });
const pinForm = reactive({ current_pin: "", new_pin: "", confirm_pin: "" });
async function loadPinStatus() { /* frappe.call get_cashier_pin_status */ }
async function saveCashierPin() { /* frappe.call save_cashier_pin */ }
```

- [ ] **Step 3: Expose inline back/save UX**

```vue
<v-btn data-test="cashier-pin-back" variant="text" @click="$emit('back')">{{ __("Back") }}</v-btn>
<v-btn data-test="cashier-pin-save" color="primary" @click="saveCashierPin">...</v-btn>
```

- [ ] **Step 4: Run the component tests and confirm pass**

Run: `yarn.cmd --cwd frontend test --run tests/navbarCashierPinForm.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the new component**

```bash
git add frontend/src/posapp/components/navbar/NavbarCashierPinForm.vue frontend/tests/navbarCashierPinForm.spec.ts
git commit -m "feat: add embedded cashier PIN settings form"
```

## Chunk 3: Wire Context and Remove Old Menu Dialog

### Task 5: Pass profile/cashier context into the settings workspace

**Files:**
- Modify: `frontend/src/posapp/components/Navbar.vue`

- [ ] **Step 1: Add `Manage Cashier PIN` to Personal settings actions**

```ts
{
  id: "manage-cashier-pin",
  label: this.__("Manage Cashier PIN"),
  subtitle: this.currentCashierDisplay || this.__("Create or change your PIN"),
  icon: "mdi-form-textbox-password",
  tone: "secondary",
}
```

- [ ] **Step 2: Pass context props to `NavbarSettingsPanel`**

```vue
<NavbarSettingsPanel
  :pos-profile="posProfile"
  :current-cashier="currentCashier"
  :current-cashier-display="currentCashierDisplay"
/>
```

- [ ] **Step 3: Run focused settings tests**

Run: `yarn.cmd --cwd frontend test --run tests/navbarSettingsPanel.spec.ts tests/navbarCashierPinForm.spec.ts`

Expected: PASS

- [ ] **Step 4: Commit the navbar wiring**

```bash
git add frontend/src/posapp/components/Navbar.vue frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue
git commit -m "feat: wire cashier context into settings workspace"
```

### Task 6: Remove PIN dialog ownership from `NavbarMenu`

**Files:**
- Modify: `frontend/src/posapp/components/navbar/NavbarMenu.vue`
- Modify: `frontend/tests/navbarMenuActions.spec.ts`

- [ ] **Step 1: Remove PIN dialog template block and related reactive state**

```vue
<!-- delete v-dialog for cashier PIN -->
```

- [ ] **Step 2: Remove obsolete PIN methods and handlers**

```ts
// delete openPinDialog, loadPinStatus, validatePinForm, saveCashierPin, closePinDialog, togglePinVisibility
```

- [ ] **Step 3: Update regression test to confirm menu still exposes non-PIN actions only**

```ts
expect(actionIds).not.toContain("manage-cashier-pin");
```

- [ ] **Step 4: Run regression tests**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenuActions.spec.ts tests/navbarSettingsPanel.spec.ts tests/navbarCashierPinForm.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit menu cleanup**

```bash
git add frontend/src/posapp/components/navbar/NavbarMenu.vue frontend/tests/navbarMenuActions.spec.ts
git commit -m "refactor: move cashier PIN management out of navbar menu"
```

## Chunk 4: Final Verification and Cleanup

### Task 7: Run full targeted verification and finish

**Files:**
- Verify only

- [ ] **Step 1: Run the full targeted suite**

Run: `yarn.cmd --cwd frontend test --run tests/navbar.spec.ts tests/navbarSettingsPanel.spec.ts tests/navbarCashierPinForm.spec.ts tests/navbarMenuActions.spec.ts tests/offlineStatusPanel.spec.ts`

Expected: PASS

- [ ] **Step 2: Run a production build**

Run: `yarn.cmd --cwd frontend build`

Expected: PASS

- [ ] **Step 3: Remove temporary spec/plan docs after final implementation**

```bash
git rm docs/superpowers/specs/2026-04-09-embedded-pin-settings-design.md docs/superpowers/plans/2026-04-09-embedded-pin-settings-implementation-plan.md
```

- [ ] **Step 4: Commit the cleanup if docs are removed in the same feature batch**

```bash
git commit -m "chore: remove embedded PIN settings planning docs"
```
