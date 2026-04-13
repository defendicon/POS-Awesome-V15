# Session Phase 3 Execution Plan

This plan executes the session/startup extraction phase from [STRUCTURE_MIGRATION_MAP.md](/C:/Users/am102/Downloads/POS-Awesome-V15/STRUCTURE_MIGRATION_MAP.md) without leaving `DefaultLayout.vue` and the new session/startup modules in split ownership.

## Phase Goal

Strip workflow ownership out of `DefaultLayout.vue`.

That means:

- session recovery logic is feature-owned
- startup orchestration logic is feature-owned
- `DefaultLayout.vue` stops owning business workflow helpers
- the live runtime path uses the extracted modules directly

## Current Ownership Snapshot

The repo already contains session/startup domain modules:

- `frontend/src/posapp/domain/session/defaultLayoutSessionGate.ts`
- `frontend/src/posapp/domain/session/recoverPosSession.ts`
- `frontend/src/posapp/domain/startup/defaultLayoutStartup.ts`
- `frontend/src/posapp/domain/startup/registerStartup.ts`

But `frontend/src/posapp/layouts/DefaultLayout.vue` still owns:

- bootstrap profile/opening-shift snapshot helpers
- startup-side customer/item boot helpers
- startup promise orchestration
- session recovery wiring helpers
- checkout startup trigger wiring

## Finish Line

Phase 3 is complete only when all of these are true:

1. `DefaultLayout.vue` no longer owns startup/session workflow helpers.
2. Session recovery wiring lives under a session feature/domain boundary.
3. Startup flow wiring lives under a startup or session feature/domain boundary.
4. `DefaultLayout.vue` becomes mostly rendering, UI glue, and event binding.
5. The live runtime path uses the extracted orchestration modules.
6. Old in-layout helper paths are removed after the extraction.
7. Focused session/startup verification passes.

## Bounded Extraction Slice

Extract these groups together:

### Bootstrap And Snapshot Helpers

- `getCurrentBootstrapProfile`
- `getCurrentBootstrapOpeningShift`
- `buildCurrentBootstrapValidationInput`
- `ensureBootstrapSnapshotIsCurrent`
- `persistBootstrapRuntime`
- `buildRegisterStartupOptions`
- `evaluateRegisterStartup`

### Startup Resource Boot

- `startCustomersForStartup`
- `startItemsForStartup`
- creation and ownership of `defaultLayoutStartup`
- `runPosStartupFlow`

### Session Recovery Wiring

- `fetchServerOpeningForSession`
- `recoverCurrentPosSession`
- `applyRecoveredPosSession`
- creation and ownership of `defaultLayoutSessionGate`

### Checkout Startup Trigger

- `runCheckoutFlow`
- startup promise ownership that coordinates checkout readiness

## Proposed Target Structure

```text
frontend/src/features/session/
  domain/
    defaultLayoutSessionRuntime.ts
  composables/
  services/
```

This phase does not require moving every existing session/startup file yet. It requires creating one explicit runtime boundary that owns the orchestration currently trapped in `DefaultLayout.vue`.

## Execution Order

### Step 1: Create a session runtime module

Create a single orchestration module responsible for:

- bootstrap snapshot evaluation
- startup boot wiring
- session recovery wiring
- checkout startup trigger wiring

### Step 2: Move helper groups together

Do not extract one helper at a time. Move helper groups together by responsibility so `DefaultLayout.vue` does not end up half-owning the workflow.

### Step 3: Rewire `DefaultLayout.vue`

After the runtime module exists:

- replace in-layout helper implementations with calls into the extracted module
- keep layout-specific UI state and event binding only

### Step 4: Remove old in-layout workflow helpers

After the new runtime module is live:

- delete the old helper implementations from `DefaultLayout.vue`
- do not leave duplicate helper logic behind

## No Partial State Conditions

Stop the phase and keep working if any of these remain true:

- startup flow helpers still exist in `DefaultLayout.vue` while the new runtime also owns them
- session recovery wiring is duplicated between the layout and a new module
- checkout startup still depends on old in-layout orchestration after the extraction
- the layout still owns the same business workflow the new runtime was meant to absorb

## Verification

Minimum verification:

- frontend type-check
- session/startup focused tests if present
- any file-based tests that assert startup/session ownership

Existing relevant tests and files to watch:

- `frontend/tests/posShellSessionIndependence.spec.ts`
- `frontend/src/posapp/domain/session/defaultLayoutSessionGate.ts`
- `frontend/src/posapp/domain/startup/defaultLayoutStartup.ts`

## Definition Of Done

Do not mark Phase 3 complete until:

- the live session/startup orchestration path is outside `DefaultLayout.vue`
- `DefaultLayout.vue` no longer contains the extracted workflow helper logic
- verification passes on the live path

If `DefaultLayout.vue` still meaningfully owns startup/session workflow, the phase is not complete.
