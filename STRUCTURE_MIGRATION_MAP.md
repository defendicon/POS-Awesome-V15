# Structure Migration Map

This document defines the target frontend and backend structure for this repository and the exact migration path to get there without leaving partial states behind.

It is intentionally execution-oriented. A phase is not complete until its new path is live, the old competing path is removed or explicitly isolated, and verification is updated.

## Core Rule

Do not run a migration in a way that leaves both the old and new structures owning real behavior at the same time.

If a phase cannot remove the old path safely, the phase is not complete.

## Target Structure

```text
frontend/
  src/
    app/
      main.ts
      router/
      providers/
      boot/
    features/
      catalog/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
      checkout/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
      session/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
      payments/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
      customers/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
      orders/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
      reports/
        components/
        composables/
        domain/
        stores/
        services/
        tests/
    shared/
      components/
      composables/
      utils/
      types/
      constants/
      services/
    platform/
      frappe/
      offline/
      sync/
      printing/
      scanner/
      workers/
    styles/
```

```text
posawesome/
  posawesome/
    api/
      catalog/
      checkout/
      payments/
      session/
      customers/
      orders/
      reports/
    services/
    integrations/
    utils/
    doctype/
```

## Ownership Rules

- `app/`: application boot, router, providers, global runtime wiring
- `features/*/components`: rendering and user interaction only
- `features/*/composables`: UI orchestration for that feature
- `features/*/domain`: business rules and feature workflow
- `features/*/stores`: shared state for that feature
- `features/*/services`: API and feature-scoped external I/O
- `shared/`: generic reusable code with no single feature ownership
- `platform/`: framework glue and infrastructure concerns

## Current To Target Map

### App Shell

- `frontend/src/posapp/posapp.ts`
  Target: `frontend/src/app/main.ts` and `frontend/src/app/boot/`
  Reason: current entrypoint mixes mount, router, SW, sockets, and global setup
  Priority: high
  Risk: medium

- `frontend/src/posapp/router/`
  Target: `frontend/src/app/router/`
  Reason: router is app-level, not feature-level
  Priority: high
  Risk: low

- `frontend/src/sw-updater.ts`
  Target: `frontend/src/platform/offline/` or `frontend/src/app/boot/`
  Reason: cross-cutting boot/runtime concern
  Priority: medium
  Risk: medium

- `frontend/src/loader.ts`, `frontend/src/loader-utils.ts`, `frontend/src/posawesome.bundle.ts`
  Target: `frontend/src/app/boot/` or `frontend/src/platform/frappe/`
  Reason: startup integration and bundle boot should be isolated from feature code
  Priority: medium
  Risk: medium

### Catalog

- `frontend/src/posapp/domain/catalog/`
  Target: `frontend/src/features/catalog/domain/`
  Priority: high
  Risk: low

- `frontend/src/posapp/components/pos/items/`
  Target: `frontend/src/features/catalog/components/`
  Priority: high
  Risk: high

- `frontend/src/posapp/composables/pos/items/`
  Target: `frontend/src/features/catalog/composables/`
  Priority: high
  Risk: high

- feature-scoped item services and helpers now under mixed locations
  Target: `frontend/src/features/catalog/services/`
  Priority: medium
  Risk: medium

### Checkout

- `frontend/src/posapp/domain/checkout/`
  Target: `frontend/src/features/checkout/domain/`
  Priority: high
  Risk: low

- `frontend/src/posapp/components/pos/shell/PayView.vue`
  Target: `frontend/src/features/checkout/components/PayView.vue`
  Reason: shell payment screen belongs to checkout feature, not generic shell
  Priority: high
  Risk: high

- checkout-related composables currently spread near payment flows
  Target: `frontend/src/features/checkout/composables/`
  Priority: high
  Risk: medium

### Session And Startup

- startup/session logic inside `frontend/src/posapp/layouts/DefaultLayout.vue`
  Target: split across:
  `frontend/src/features/session/domain/`
  `frontend/src/features/session/composables/`
  `frontend/src/app/boot/`
  Priority: high
  Risk: high

- `frontend/src/posapp/layouts/`
  Target: layout-only rendering remains near `app/` or `shared/components/layout`
  Reason: layout should not own feature workflow
  Priority: high
  Risk: high

### Payments

- payment-specific UI and orchestration under `frontend/src/posapp/components/pos/payments/`
  Target: `frontend/src/features/payments/components/`
  Priority: medium
  Risk: medium

- payment-specific composables and services
  Target: `frontend/src/features/payments/composables/` and `services/`
  Priority: medium
  Risk: medium

### Customers

- customer selector/state pieces under mixed `components`, `stores`, and payment flows
  Target: `frontend/src/features/customers/`
  Priority: medium
  Risk: medium

### Orders

- order history, returns, parked/draft flows under mixed POS shell paths
  Target: `frontend/src/features/orders/`
  Priority: medium
  Risk: medium

### Reports

- `frontend/src/posapp/components/reports/`
  Target: `frontend/src/features/reports/components/`
  Priority: low
  Risk: low

### Shared

- generic helpers in `frontend/src/posapp/utils/`
  Target: either `frontend/src/shared/utils/` or feature-local utility folders
  Rule: if a util is only used by one feature, keep it in that feature
  Priority: medium
  Risk: low

- generic types in `frontend/src/posapp/types/`
  Target: `frontend/src/shared/types/` or feature-local `types/`
  Priority: medium
  Risk: low

### Platform

- `frontend/src/offline/`
  Target: `frontend/src/platform/offline/`
  Priority: high
  Risk: medium

- scanner, printing, workers, sync, and framework bridge concerns in mixed folders
  Target:
  `frontend/src/platform/scanner/`
  `frontend/src/platform/printing/`
  `frontend/src/platform/workers/`
  `frontend/src/platform/sync/`
  `frontend/src/platform/frappe/`
  Priority: high
  Risk: medium

### Backend

- `posawesome/posawesome/api/` currently domain-split in part
  Target: continue splitting by feature:
  `catalog/`, `checkout/`, `payments/`, `session/`, `customers/`, `orders/`, `reports/`
  Priority: medium
  Risk: medium

## Migration Order

This order is chosen to minimize partial states and reduce the number of simultaneous architecture paths.

### Phase 1: Checkout

Goal:
- make checkout feature-owned
- move checkout runtime, screen, and orchestration into one feature boundary

Finish line:
- checkout domain remains under one feature root
- `PayView.vue` becomes checkout-owned
- checkout startup path is feature-owned and live
- old shell-owned checkout flow is removed
- tests cover live checkout runtime path

### Phase 2: Catalog

Goal:
- move item selector and catalog logic into a single catalog feature boundary

Finish line:
- item selector UI, composables, and domain logic live under `features/catalog`
- shared catalog store is the runtime source of truth where intended
- duplicated component-local catalog paths are removed
- tests cover the live selector flow, not only helpers

### Phase 3: Session And Startup

Goal:
- strip workflow ownership out of `DefaultLayout.vue`

Finish line:
- startup/session recovery logic moves to `features/session` and `app/boot`
- layout becomes mostly rendering and view composition
- no session workflow remains hidden inside layout-only files

### Phase 4: Payments

Goal:
- isolate payment submission, reconciliation, and payment method flows

Finish line:
- payments logic is feature-owned
- checkout uses payments feature through explicit boundaries
- old mixed shell/payment ownership is removed

### Phase 5: Customers And Orders

Goal:
- group customer and order flows into clean feature roots

Finish line:
- customer-specific selectors, info panels, and order history/returns flows live under their own features
- cross-feature dependencies are explicit

### Phase 6: Platform Cleanup

Goal:
- isolate non-feature runtime concerns

Finish line:
- offline, sync, scanner, workers, printing, and Frappe boot/integration live under `platform`
- features depend on platform APIs, not raw platform implementation details

### Phase 7: Backend Alignment

Goal:
- mirror the frontend feature boundaries in the backend API layout where practical

Finish line:
- backend APIs are grouped by functional area
- new frontend feature structure maps cleanly to backend API ownership

## No Partial State Rules Per Phase

For every phase, all of the following must be true before moving to the next one:

1. The target folder exists and owns the live runtime path.
2. Imports are updated to the new structure.
3. Old competing files or folders are removed, or reduced to simple compatibility wrappers with a written removal deadline.
4. Tests run against the live path, not just the new helpers.
5. The phase has a written finish line and an explicit verification pass.

## Anti-Patterns To Avoid

- creating a new `domain/` path while the old component still owns behavior
- moving files without changing ownership boundaries
- leaving giant shell/layout files in control after feature modules are introduced
- adding stores that mirror local state but do not actually drive runtime behavior
- writing tests only for helper functions while the screen still uses the old flow

## Practical Start Point

Start with checkout, not catalog.

Reason:
- checkout centralization is already conceptually cleaner
- its boundary is easier to define
- it is lower-risk than trying to untangle the full item selector first

After checkout is fully landed, use the same migration discipline on catalog.
