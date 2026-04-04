# Cashier-First Menu Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the POS actions menu so cashiers see a short quick-actions surface first, while lower-frequency options move into a categorized settings panel and supervisor-only tools stay hidden from non-supervisors.

**Architecture:** Keep the existing `NavbarMenu.vue` event handlers and dialogs, but reorganize the UI into two surfaces: a first-level quick-actions menu and a secondary settings panel. Reuse existing supervisor gating from the employee store and avoid introducing duplicate dialogs or new backend APIs.

**Tech Stack:** Vue 3, Pinia, Vuetify, Vitest, TypeScript via `vue-tsc`

---

## Chunk 1: Menu Information Architecture

### Task 1: Convert the current flat action list into structured quick actions and settings groups

**Files:**
- Modify: `frontend/src/posapp/components/navbar/NavbarMenu.vue`
- Test: `frontend/tests/navbarMenu.spec.ts`

- [ ] **Step 1: Write the failing test**

Add/extend tests to assert:
- the main menu surface exposes quick actions only
- settings actions live behind a settings state/surface
- supervisor tools are hidden for non-supervisors

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts`
Expected: FAIL because the menu still renders the long flat list

- [ ] **Step 3: Write minimal implementation**

In `NavbarMenu.vue`:
- add structured data/computed groups for:
  - `quickActions`
  - `settingsSections`
  - `supervisorSections`
- add a small view state such as `activePanel = "main" | "settings"`
- keep current emit handlers and existing dialogs
- make the first panel show:
  - `Switch Cashier`
  - `Lock Screen`
  - `Print Last Invoice`
  - `Sync Offline Invoices`
  - `Close Shift`
- add a secondary `Settings` entry that opens the settings panel

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/navbar/NavbarMenu.vue frontend/tests/navbarMenu.spec.ts
git commit -m "refactor(pos): convert navbar menu to quick actions and settings"
```

### Task 2: Add categorized settings sections and restricted tools presentation

**Files:**
- Modify: `frontend/src/posapp/components/navbar/NavbarMenu.vue`
- Test: `frontend/tests/navbarMenu.spec.ts`

- [ ] **Step 1: Write the failing test**

Add/extend tests to assert:
- `Settings` contains grouped sections:
  - `Personal`
  - `Terminal`
  - `System`
  - `Session`
- destructive actions are visually grouped/separated
- `Awesome Dashboard` appears only in a restricted supervisor section

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts`
Expected: FAIL because grouped settings/restricted rendering does not exist yet

- [ ] **Step 3: Write minimal implementation**

In `NavbarMenu.vue`:
- render categorized settings cards/sections
- move these actions into settings:
  - `Manage Cashier PIN`
  - `Language`
  - `Theme`
  - `Open Customer Display`
  - `QZ Tray Setup`
  - `Clear Cache`
  - `Check for Updates`
  - `Logout`
- add a supervisor-only section with:
  - `Awesome Dashboard`
- hide restricted section entirely for non-supervisors

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/navbar/NavbarMenu.vue frontend/tests/navbarMenu.spec.ts
git commit -m "feat(pos): add categorized settings and restricted menu sections"
```

## Chunk 2: Layout Polish and Regression Coverage

### Task 3: Apply the 2-column quick actions layout and compact settings presentation

**Files:**
- Modify: `frontend/src/posapp/components/navbar/NavbarMenu.vue`
- Test: `frontend/tests/navbarMenu.spec.ts`

- [ ] **Step 1: Write the failing test**

Add/extend tests to assert:
- the quick actions panel renders distinct quick-action items only
- the settings panel opens/closes without breaking existing dialogs

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts`
Expected: FAIL before final layout/panel behavior is wired

- [ ] **Step 3: Write minimal implementation**

In `NavbarMenu.vue`:
- style quick actions as a `2-column action grid`
- keep settings as grouped stacked sections
- add a back button from settings to main panel
- keep mobile friendly dimensions and avoid deep first-level scrolling
- keep destructive actions visually separated

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/navbar/NavbarMenu.vue frontend/tests/navbarMenu.spec.ts
git commit -m "refactor(pos): polish cashier-first menu layout"
```

### Task 4: Verify cross-component behavior and supervisor access still works

**Files:**
- Modify: `frontend/tests/navbar.spec.ts`
- Modify: `frontend/tests/reportsAccess.spec.ts`
- Modify: `progress.md`

- [ ] **Step 1: Write the failing test**

Extend regression coverage so it confirms:
- dashboard remains hidden from non-supervisors
- supervisor flow still shows restricted dashboard access
- menu refactor does not regress navbar behavior

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/navbar.spec.ts tests/reportsAccess.spec.ts`
Expected: FAIL if menu refactor breaks visibility or access rules

- [ ] **Step 3: Write minimal implementation**

Adjust any affected navbar wiring while preserving:
- supervisor gating
- current menu emits
- existing dialogs and handlers

Update `progress.md` with the delivered menu redesign.

- [ ] **Step 4: Run test to verify it passes**

Run:
- `yarn.cmd --cwd frontend test --run tests/navbarMenu.spec.ts tests/navbar.spec.ts tests/reportsAccess.spec.ts`
- `yarn.cmd --cwd frontend type-check`

Expected:
- all tests PASS
- type-check PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/navbarMenu.spec.ts frontend/tests/navbar.spec.ts frontend/tests/reportsAccess.spec.ts progress.md
git commit -m "test(pos): cover cashier-first menu and supervisor access"
```
