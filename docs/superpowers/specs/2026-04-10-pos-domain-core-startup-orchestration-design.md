# POS Domain Core Startup Orchestration Design

## Summary

The current POS startup path is split across layout, shell, selector components, and stores. This makes boot readiness implicit and allows intermittent hangs where one part of the UI appears loaded while another required boot path never completes. The first refactor subproject introduces a centralized `POS Domain Core` that owns startup orchestration and readiness state.

This subproject does not attempt a full POS rewrite. It establishes the core boot lifecycle and diagnostics foundation that later domain refactors can build on.

## Goals

- Centralize POS startup orchestration in a dedicated domain module.
- Remove silent boot dependency coupling between layout and feature components.
- Make startup state explicit: `booting`, `ready`, `degraded`, `blocked`.
- Provide diagnostic visibility for the exact stage where boot stops.
- Keep the app runnable after each chunk of the rollout.

## Non-Goals

- Rewriting all POS domains in this phase.
- Replacing existing stores as the source of actual data persistence.
- Changing major screen structure or user-facing route architecture.
- Full shell/settings/offline UX redesign in this subproject.

## Current Problem

Startup is currently spread across:

- [DefaultLayout.vue](C:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/layouts/DefaultLayout.vue)
- [Pos.vue](C:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/shell/Pos.vue)
- [ItemsSelector.vue](C:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/items/ItemsSelector.vue)
- [customersStore.ts](C:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/stores/customersStore.ts)
- [itemsStore.ts](C:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/stores/itemsStore.ts)

Observed failure pattern:

- Loader tracking is centralized in `DefaultLayout`.
- Customer boot can complete and log progress.
- Item readiness still depends on downstream component initialization, especially `ItemsSelector`.
- Result: the app can appear stuck after customer loading because readiness is controlled by scattered side effects rather than one authoritative startup controller.

## Proposed Architecture

### Core idea

Introduce a `POS Domain Core` that owns the boot lifecycle. Components will no longer be responsible for triggering critical startup work as a side effect of mounting. Instead:

- layout starts the domain core
- domain core coordinates register/bootstrap/catalog startup
- components render based on explicit domain readiness state

### Domain boundaries

Create these modules:

- `frontend/src/posapp/domain/core/posDomainTypes.ts`
  - boot stage names
  - runtime status types
  - readiness and blocker metadata
- `frontend/src/posapp/domain/core/posDomainDiagnostics.ts`
  - timeline events
  - last completed stage
  - blocker and degraded mode metadata
- `frontend/src/posapp/domain/core/posDomainCore.ts`
  - central startup orchestrator
  - state machine transitions
  - boot entrypoint and guarded re-entry
- `frontend/src/posapp/domain/register/registerBootstrap.ts`
  - register/opening/bootstrap snapshot handoff into domain core
- `frontend/src/posapp/domain/catalog/catalogBootstrap.ts`
  - items/customers startup coordination and readiness reporting

### State model

The core will expose a normalized runtime state:

- `stage`
  - `idle`
  - `register`
  - `catalog`
  - `ready`
  - `degraded`
  - `blocked`
- `sources`
  - `register`
  - `items`
  - `customers`
- `blocker`
  - machine-readable code
  - human-readable summary
- `timeline`
  - ordered events for diagnostics

### Ownership rules

- Components do not own startup orchestration.
- Stores can still own data fetching and persistence.
- Domain core owns the decision about when startup is considered complete, degraded, or blocked.
- Loader release must follow domain readiness, not indirect component mount success.

## Data Flow

### Startup

1. `DefaultLayout` starts domain core once.
2. `registerBootstrap` resolves current register/opening/bootstrap input.
3. `catalogBootstrap` starts items/customers boot through existing stores/adapters.
4. Domain core tracks progress and final readiness.
5. Layout consumes core state and updates loading UI.

### Failure handling

If any required stage does not complete:

- domain core records the exact blocker stage
- loading overlay must not remain indefinitely silent
- UI can move into `blocked` or `degraded` with visible diagnostics

## Migration Strategy

### Phase 1 principles

- Do not delete old behavior first.
- Add central orchestration alongside current code paths.
- Route startup through domain core.
- Remove duplicate triggers only after equivalent readiness is verified.

### Incremental rollout

1. Add boot diagnostics and stage tracking.
2. Add domain core state machine.
3. Route register/bootstrap readiness through core.
4. Route customers/items readiness through core.
5. Remove duplicate component-driven init triggers.

## UI and UX Constraints

- Loading overlay may stay, but it must be driven by explicit domain state.
- Silent indefinite loading is not allowed.
- If startup is blocked, diagnostics must capture and expose the stage and reason.
- Existing route and screen structure should remain stable during this subproject.

## Testing Strategy

Add tests for:

- domain core state machine transitions
- register success -> catalog success -> ready
- customers complete but items not started -> blocked with explicit stage
- degraded bootstrap path -> degraded state, not silent hang
- layout integration with domain core status

Regression expectations:

- current POS route remains runnable after every chunk
- no component should be required to mount before startup orchestration begins

## Risks

- Existing components may still have hidden startup side effects.
- Duplicate boot triggers may temporarily coexist during migration.
- Some readiness values currently come from component-local assumptions and will need adapter boundaries.

## Mitigation

- introduce diagnostics before deeper rewiring
- preserve existing stores and data APIs initially
- move orchestration first, then cleanup duplicate component triggers
- verify after each chunk with targeted startup tests

## Expected Outcome

After this subproject:

- startup orchestration is centralized
- the intermittent loading hang has an observable stage and likely root cause
- future domain refactors can move catalog, invoice, payments, and shell modules onto the same foundation without another boot-logic rewrite
