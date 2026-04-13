# Checkout Phase 1 Execution Plan

This plan executes Phase 1 from [STRUCTURE_MIGRATION_MAP.md](/C:/Users/am102/Downloads/POS-Awesome-V15/STRUCTURE_MIGRATION_MAP.md) without leaving the repository in a partial migration state.

## Phase Goal

Make checkout feature-owned.

That means:

- checkout runtime stays under one feature boundary
- checkout screen ownership is explicit
- checkout startup flow is not half-owned by shell/layout files
- verification covers the live runtime path

## Finish Line

Phase 1 is complete only when all of these are true:

1. A checkout feature root exists and owns the live checkout runtime path.
2. `PayView.vue` is checkout-owned.
3. Checkout domain files live under the checkout feature root.
4. Imports and runtime wiring use the new checkout feature paths.
5. Old shell-owned checkout flow is removed, not left active in parallel.
6. Tests cover the live checkout runtime path after the move.
7. No compatibility wrappers remain unless they have an explicit removal note and date.

## Scope

### In Scope

- move checkout domain structure into a checkout feature root
- move `PayView.vue` into checkout feature ownership
- move checkout-related composables that directly support the payment shell into checkout ownership
- update runtime imports from layout/router/app entry points
- update tests to target the new live path

### Out Of Scope

- payment-method feature cleanup beyond what checkout directly depends on
- catalog changes
- session/startup extraction beyond checkout-specific wiring
- general shared/platform cleanup

## Target Checkout Structure

```text
frontend/src/features/checkout/
  components/
    PayView.vue
  composables/
  domain/
    checkoutDiagnostics.ts
    loadCheckoutCustomerData.ts
    loadCheckoutOffers.ts
    loadCheckoutPayments.ts
    loadCheckoutPricing.ts
    posCheckoutStore.ts
    posCheckoutTypes.ts
    resetCheckout.ts
    startCheckout.ts
  stores/
  services/
  tests/
```

## Current To Target Moves

- `frontend/src/posapp/domain/checkout/*`
  -> `frontend/src/features/checkout/domain/*`

- `frontend/src/posapp/components/pos/shell/PayView.vue`
  -> `frontend/src/features/checkout/components/PayView.vue`

- checkout-specific composables currently used only by `PayView.vue`
  -> `frontend/src/features/checkout/composables/`

## Execution Order

### Step 1: Create the checkout feature root

Create:

- `frontend/src/features/checkout/components/`
- `frontend/src/features/checkout/composables/`
- `frontend/src/features/checkout/domain/`

Do not move unrelated files yet.

### Step 2: Move checkout domain files first

Move the full checkout domain as a set:

- `checkoutDiagnostics.ts`
- `loadCheckoutCustomerData.ts`
- `loadCheckoutOffers.ts`
- `loadCheckoutPayments.ts`
- `loadCheckoutPricing.ts`
- `posCheckoutStore.ts`
- `posCheckoutTypes.ts`
- `resetCheckout.ts`
- `startCheckout.ts`

Reason:
- these files already form a bounded runtime pipeline
- moving them together reduces split ownership

### Step 3: Rewire imports before moving the screen

Update imports in:

- `DefaultLayout.vue`
- `PayView.vue`
- tests
- any other live consumers

Checkpoint:
- checkout runtime still boots from one domain path only

### Step 4: Move `PayView.vue`

Move:

- `frontend/src/posapp/components/pos/shell/PayView.vue`
  to
- `frontend/src/features/checkout/components/PayView.vue`

Then update router and component imports so the live screen uses the new file.

Checkpoint:
- there must not be both an old live `PayView.vue` and a new live `PayView.vue`

### Step 5: Move checkout-only composables

Only move composables that are truly checkout-owned.

Rule:
- if a composable is used only by checkout, move it now
- if it is cross-feature, leave it in place for now and record it for later shared/payments cleanup

### Step 6: Remove old competing paths

After the new checkout feature path is live:

- delete old checkout domain files from `frontend/src/posapp/domain/checkout/`
- delete old shell `PayView.vue`

Do not leave old files behind as silent duplicates.

### Step 7: Verify

Run and confirm:

- checkout domain tests
- checkout runtime tests
- import/type validation for moved files

Minimum evidence:

- tests referencing checkout runtime still pass
- `DefaultLayout.vue` imports the new checkout path
- router/view path resolves to the new `PayView.vue`

## Required File Checks Before Completion

- `frontend/src/posapp/domain/checkout/` no longer owns live runtime behavior
- `frontend/src/posapp/components/pos/shell/PayView.vue` is no longer the live screen path
- `frontend/src/features/checkout/` is the only active checkout feature root

## No Partial State Conditions

Stop the phase and keep working if any of these remain true:

- checkout domain moved, but `PayView.vue` still lives and runs from shell path
- `PayView.vue` moved, but layout/runtime still imports the old domain path
- tests only validate moved helpers while runtime imports still hit old files
- duplicate checkout ownership remains under both `posapp` and `features/checkout`

## Verification Commands

Use the repo's existing TypeScript and test tooling. Minimum target checks:

- checkout-focused Vitest specs
- type-check if impacted imports are broad

Suggested test set:

- `frontend/tests/posCheckoutStore.spec.ts`
- `frontend/tests/startCheckout.spec.ts`
- `frontend/tests/checkoutOfflineFallback.spec.ts`
- any tests that import `PayView.vue` directly or indirectly

## Definition Of Done

Do not mark Phase 1 complete until:

- the live checkout screen and runtime are both feature-owned
- the old shell/domain checkout ownership is removed
- verification passes on the live path

If any part of checkout is still simultaneously owned by both old and new locations, Phase 1 is not done.
