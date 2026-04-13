# Payments Phase 4 Execution Plan

This plan executes the payments phase from [STRUCTURE_MIGRATION_MAP.md](/C:/Users/am102/Downloads/POS-Awesome-V15/STRUCTURE_MIGRATION_MAP.md) without leaving the routed payment workspace and the in-POS invoice payment flow in split or duplicated ownership.

## Phase Goal

Make payments feature-owned with explicit separation between:

- the standalone routed payment workspace
- the in-POS invoice/cart payment flow

That means:

- the standalone `/payments` route stops living under checkout ownership
- payment workspace UI, composables, and helpers become payments-owned
- invoice payment UI gets a clear ownership boundary instead of staying mixed inside `posapp/components/pos`
- checkout and payments interact through explicit boundaries instead of mixed shell imports

## Current Ownership Snapshot

There are currently two different payment surfaces in the frontend:

### Surface A: In-POS Invoice Payment Flow

This is the current-sale payment screen rendered inside the POS shell.

Primary live path:

- `frontend/src/posapp/components/pos/Payments.vue`

Primary live consumer:

- `frontend/src/posapp/components/pos/shell/Pos.vue`

Supporting payment UI subtree:

- `frontend/src/posapp/components/pos/payments/`

Supporting composables:

- `frontend/src/posapp/composables/pos/payments/usePaymentCalculations.ts`
- `frontend/src/posapp/composables/pos/payments/usePaymentMethods.ts`
- `frontend/src/posapp/composables/pos/payments/usePaymentPrinting.ts`
- `frontend/src/posapp/composables/pos/payments/usePaymentSubmission.ts`
- `frontend/src/posapp/composables/pos/payments/usePurchaseOrder.ts`
- `frontend/src/posapp/composables/pos/payments/useRedemptionLogic.ts`

### Surface B: Standalone Payment Workspace

This is the route-driven workspace used for payment entry and reconciliation outside the active cart surface.

Primary live path:

- `frontend/src/features/checkout/components/PayView.vue`

Primary live route and consumer:

- `frontend/src/posapp/router/index.ts`
- `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`

Supporting payment workspace UI subtree:

- `frontend/src/posapp/components/pos_pay/`

Supporting composables:

- `frontend/src/posapp/composables/pos/payments/usePosPayData.ts`
- `frontend/src/posapp/composables/pos/payments/usePosPaySelection.ts`
- `frontend/src/posapp/composables/pos/payments/usePosPaySubmission.ts`

Supporting state:

- `frontend/src/posapp/stores/uiStore.ts`
  - `paymentRouteTarget`

## Architectural Decision

Do not force both surfaces into one file tree in a single move.

Use one payments feature root with two explicit sub-areas:

```text
frontend/src/features/payments/
  components/
    workspace/
    invoice/
  composables/
    workspace/
    invoice/
  domain/
    workspace/
    invoice/
  stores/
  services/
  tests/
```

Reason:

- the routed payment workspace and the in-POS invoice payment flow both belong to payments
- but they do not have the same runtime entrypoint or immediate dependencies
- merging them in one bounded move would increase risk and leave a higher chance of partial migration

## Finish Line

Phase 4 is complete only when all of these are true:

1. The standalone payment workspace is payments-owned.
2. The in-POS invoice payment flow is payments-owned.
3. The `/payments` route no longer points into checkout-owned UI.
4. Payment workspace helpers no longer live under mixed `posapp` paths.
5. Invoice payment helpers no longer live under mixed `posapp` paths.
6. `Pos.vue`, router, and invoice management all consume the new payments feature paths.
7. Old competing payment ownership paths are removed or intentionally isolated with a written removal note.
8. Focused payment verification passes on the live paths.

## Execution Strategy

This phase should be executed in two bounded slices, both under the payments feature root.

### Slice 4A: Standalone Payment Workspace

Move the routed workspace first because it already behaves like a separate feature and is currently misplaced under checkout.

Finish line for Slice 4A:

- `/payments` points to a payments-owned view
- `PayView.vue` or its renamed equivalent lives under `features/payments`
- `pos_pay/*` workspace components move with it
- `usePosPayData`, `usePosPaySelection`, and `usePosPaySubmission` move with it
- `InvoiceManagement.vue` imports and route behavior use the new payments path
- checkout no longer owns the standalone workspace screen

### Slice 4B: In-POS Invoice Payment Flow

Move the current-sale payment screen second because it is more tightly coupled to the POS shell and invoice runtime.

Finish line for Slice 4B:

- `Payments.vue` moves under `features/payments/components/invoice/`
- child payment UI under `components/pos/payments/` moves with it
- invoice payment composables move with it
- `Pos.vue` consumes the new payments-owned invoice screen
- old `posapp/components/pos/Payments.vue` ownership is removed

## Bounded Move Set

### Slice 4A: Standalone Payment Workspace

Move as one set:

- `frontend/src/features/checkout/components/PayView.vue`
- `frontend/src/posapp/components/pos_pay/PayActionButtons.vue`
- `frontend/src/posapp/components/pos_pay/PayInvoicesTable.vue`
- `frontend/src/posapp/components/pos_pay/PayMpesaSection.vue`
- `frontend/src/posapp/components/pos_pay/PayPartySelector.vue`
- `frontend/src/posapp/components/pos_pay/PayTotalsSidebar.vue`
- `frontend/src/posapp/components/pos_pay/PayUnallocatedTable.vue`
- `frontend/src/posapp/components/pos_pay/paymentModes.ts`
- `frontend/src/posapp/composables/pos/payments/usePosPayData.ts`
- `frontend/src/posapp/composables/pos/payments/usePosPaySelection.ts`
- `frontend/src/posapp/composables/pos/payments/usePosPaySubmission.ts`

Target:

- `frontend/src/features/payments/components/workspace/`
- `frontend/src/features/payments/composables/workspace/`
- `frontend/src/features/payments/domain/workspace/` when needed

State decision for this slice:

- keep `paymentRouteTarget` in `uiStore` only if moving it now would expand the slice too much
- if it remains, document it as a temporary cross-feature dependency with a removal follow-up

### Slice 4B: In-POS Invoice Payment Flow

Move as one set:

- `frontend/src/posapp/components/pos/Payments.vue`
- all files under `frontend/src/posapp/components/pos/payments/` that are directly rendered by `Payments.vue`
- `frontend/src/posapp/composables/pos/payments/usePaymentCalculations.ts`
- `frontend/src/posapp/composables/pos/payments/usePaymentMethods.ts`
- `frontend/src/posapp/composables/pos/payments/usePaymentPrinting.ts`
- `frontend/src/posapp/composables/pos/payments/usePaymentSubmission.ts`
- `frontend/src/posapp/composables/pos/payments/usePurchaseOrder.ts`
- `frontend/src/posapp/composables/pos/payments/useRedemptionLogic.ts`

Target:

- `frontend/src/features/payments/components/invoice/`
- `frontend/src/features/payments/composables/invoice/`
- `frontend/src/features/payments/domain/invoice/` when needed

## No Partial State Conditions

Stop the phase and keep working if any of these remain true:

- `/payments` still points to checkout-owned UI after the new payments workspace path exists
- `PayView.vue` moves but its live child workspace components still remain under the old path in a way that keeps split ownership
- `Payments.vue` moves but `Pos.vue` still renders the old payment subtree
- workspace composables move but live imports still point to old `posapp/composables/pos/payments` files
- invoice payment composables move but `Payments.vue` still mixes old and new ownership
- both checkout and payments claim ownership of the routed workspace

## Verification

Minimum verification per slice:

- frontend type-check
- payment-workspace focused tests for Slice 4A
- invoice payment focused tests for Slice 4B
- ownership/regression tests that confirm the live imports changed

Suggested checks for Slice 4A:

- route/import verification for `/payments`
- focused tests around `PayView.vue` and payment workspace helpers
- targeted regression assertions in a file-based ownership test if needed

Suggested checks for Slice 4B:

- payment screen focused tests for `Payments.vue`
- any existing payment method, printing, redemption, or submission tests
- `Pos.vue` consumer verification

## Definition Of Done

Do not mark Phase 4 complete until:

- the routed payment workspace is payments-owned
- the in-POS invoice payment flow is payments-owned
- checkout no longer owns standalone payment workspace behavior
- the old mixed `posapp` payment ownership paths are removed or explicitly isolated
- verification passes on both live paths

If payments are structurally split between checkout, shell, and old `posapp` folders, Phase 4 is not complete.
