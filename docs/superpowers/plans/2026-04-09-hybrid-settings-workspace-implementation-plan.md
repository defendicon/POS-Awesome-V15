# Hybrid Settings Workspace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current one-column drawer settings sheet with a hybrid settings workspace that has a left category rail and a right detail pane, while keeping drawer discovery and existing navbar action handlers intact.

**Architecture:** Keep `Navbar.vue` as the owner of settings open state and action routing. Refactor `NavbarSettingsPanel.vue` into a larger modal workspace that renders desktop left-rail navigation plus a mobile-friendly category switcher, and continue emitting action ids back to `Navbar.vue` so business logic stays centralized.

**Tech Stack:** Vue 3, Vuetify-compatible component patterns, Pinia, Vitest, Vue Test Utils

---

## File Structure

- Modify: `frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue`
  - Replace the flat action sheet with a two-pane workspace and active-category UI.
- Modify: `frontend/src/posapp/components/Navbar.vue`
  - Reshape settings data for category-driven rendering and preserve action routing.
- Modify: `frontend/tests/navbarSettingsPanel.spec.ts`
  - Cover left-rail category switching and selected-pane content.
- Modify: `frontend/tests/navbar.spec.ts`
  - Keep drawer launcher and panel-open integration coverage valid.

## Chunk 1: Red-Green for Workspace Categories

### Task 1: Panel category switching tests

**Files:**
- Modify: `frontend/tests/navbarSettingsPanel.spec.ts`

- [ ] **Step 1: Write the failing test**

Add tests that verify:
- left category rail renders the expected categories
- the first category is active by default
- clicking another category switches the right-pane content

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/navbarSettingsPanel.spec.ts`
Expected: FAIL because the current panel does not implement category-driven right-pane switching.

- [ ] **Step 3: Write minimal implementation**

Refactor `NavbarSettingsPanel.vue` so it tracks the active category and only renders the selected category’s right-pane content.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/navbarSettingsPanel.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue frontend/tests/navbarSettingsPanel.spec.ts
git commit -m "feat: add category-driven settings workspace"
```

## Chunk 2: Navbar Integration

### Task 2: Navbar data shape and trigger coverage

**Files:**
- Modify: `frontend/src/posapp/components/Navbar.vue`
- Modify: `frontend/tests/navbar.spec.ts`

- [ ] **Step 1: Write/update the failing test**

Extend navbar integration coverage so it still verifies:
- drawer footer settings launcher opens the workspace
- category data is passed into the panel
- panel remains navbar-owned and non-route-destructive

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn.cmd --cwd frontend test --run tests/navbar.spec.ts tests/navbarSettingsPanel.spec.ts`
Expected: FAIL until the navbar data contract matches the new workspace structure.

- [ ] **Step 3: Write minimal implementation**

Update `Navbar.vue` to provide category-oriented data and keep action routing unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn.cmd --cwd frontend test --run tests/navbar.spec.ts tests/navbarSettingsPanel.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/Navbar.vue frontend/tests/navbar.spec.ts frontend/tests/navbarSettingsPanel.spec.ts
git commit -m "feat: wire hybrid settings workspace into navbar"
```

## Chunk 3: Final Verification and Cleanup

### Task 3: Regression checks and temp cleanup

**Files:**
- Modify from prior tasks only
- Remove before final completion:
  - `docs/superpowers/specs/2026-04-09-hybrid-navbar-settings-workspace-design.md`
  - `docs/superpowers/plans/2026-04-09-hybrid-settings-workspace-implementation-plan.md`
  - `__tmp_posnext_settings_inspect/`

- [ ] **Step 1: Run targeted regressions**

Run:
- `yarn.cmd --cwd frontend test --run tests/navbar.spec.ts tests/navbarSettingsPanel.spec.ts tests/navbarMenuActions.spec.ts tests/offlineStatusPanel.spec.ts`

Expected: PASS

- [ ] **Step 2: Run build verification**

Run: `yarn.cmd --cwd frontend build`
Expected: PASS

- [ ] **Step 3: Remove temporary docs and POSNext clone**

Delete:
- `docs/superpowers/specs/2026-04-09-hybrid-navbar-settings-workspace-design.md`
- `docs/superpowers/plans/2026-04-09-hybrid-settings-workspace-implementation-plan.md`
- `__tmp_posnext_settings_inspect/`

- [ ] **Step 4: Re-run final verification**

Run:
- `yarn.cmd --cwd frontend test --run tests/navbar.spec.ts tests/navbarSettingsPanel.spec.ts tests/navbarMenuActions.spec.ts tests/offlineStatusPanel.spec.ts`
- `yarn.cmd --cwd frontend build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/components/Navbar.vue frontend/src/posapp/components/navbar/NavbarSettingsPanel.vue frontend/tests/navbar.spec.ts frontend/tests/navbarSettingsPanel.spec.ts
git add -A docs/superpowers/specs docs/superpowers/plans __tmp_posnext_settings_inspect
git commit -m "feat: add hybrid settings workspace for POS actions"
```
