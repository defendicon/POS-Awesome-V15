# POS Checkout / Invoice Centralization Design

Date: 2026-04-10
Branch: `centralization-of-pos-app`
Status: Approved for planning

## Goal

Centralize the checkout and invoice runtime so POS no longer depends on scattered invoice boot logic spread across composables, shell components, and utility files. The target outcome is a single checkout domain that owns invoice readiness, customer-to-payment flow, and the post-customer loading pipeline that is currently hard to debug.

## Why This Is Next

Startup and register/session ownership have already been centralized. The next most fragmented runtime area is checkout:

- invoice state and side effects are split across `useInvoiceCurrency`, `useInvoiceDetails`, `useInvoiceItems`, `useInvoiceOffers`, `useInvoiceStock`, `useInvoicePrinting`, `useInvoiceUI`, and `invoice_utils/*`
- shell components such as `PayView.vue`, `Payments.vue`, and `Pos.vue` still coordinate parts of checkout behavior
- the reported browser issue often stops after customer-loading logs, which points at the invoice/bootstrap pipeline after customer selection

This makes checkout the best next centralization target before a larger catalog/items cleanup.

## Non-Goals

- Do not rewrite catalog/items in this phase
- Do not redesign the full POS visual layout
- Do not change business rules unless required to preserve current behavior
- Do not remove offline-first behavior

## Recommended Approach

Create a new checkout domain that becomes the single owner of the invoice lifecycle, then adapt existing components to consume domain state instead of orchestrating invoice behavior themselves.

This is an incremental migration, not a big-bang rewrite.

## New Domain Boundary

New module: `posCheckout`

Purpose:
- own invoice readiness and checkout orchestration
- coordinate customer, currency, offers, item pricing, delivery charges, stock checks, totals, and submit readiness
- expose developer-friendly diagnostics for where checkout stalled

Does own:
- checkout boot sequence after session is ready
- current invoice runtime state
- checkout loading stages
- invoice warnings/errors relevant to checkout readiness
- transition into payment flow

Does not own:
- session/register readiness
- global offline sync coordinator
- full catalog bootstrap ownership
- close-shift workflow

## Proposed File Naming

Human-friendly and developer-friendly naming will be used consistently:

- `frontend/src/posapp/domain/checkout/posCheckoutTypes.ts`
- `frontend/src/posapp/domain/checkout/posCheckoutStore.ts`
- `frontend/src/posapp/domain/checkout/startCheckout.ts`
- `frontend/src/posapp/domain/checkout/loadCheckoutCustomerData.ts`
- `frontend/src/posapp/domain/checkout/loadCheckoutPricing.ts`
- `frontend/src/posapp/domain/checkout/loadCheckoutOffers.ts`
- `frontend/src/posapp/domain/checkout/loadCheckoutPayments.ts`
- `frontend/src/posapp/domain/checkout/checkoutDiagnostics.ts`
- `frontend/src/posapp/domain/checkout/resetCheckout.ts`

UI-facing entry components stay readable:

- `frontend/src/posapp/components/pos/checkout/CheckoutWorkspace.vue`
- `frontend/src/posapp/components/pos/checkout/CheckoutSummary.vue`
- `frontend/src/posapp/components/pos/checkout/CheckoutPaymentsPanel.vue`

## Runtime Ownership

### `posCheckoutStore`

Primary state owner for:
- checkout stage
- active invoice identity
- customer readiness
- pricing readiness
- offers readiness
- payment readiness
- blocking error
- recovery suggestion

The store should make it obvious whether checkout is:
- `idle`
- `starting`
- `loading-customer`
- `loading-pricing`
- `loading-offers`
- `loading-payments`
- `ready`
- `blocked`

### `startCheckout`

Single orchestrator for post-session checkout boot:
- create or restore invoice shell
- load customer-dependent state
- load pricing/currency/delivery data
- load offers/coupons context
- prepare payment-facing data
- mark checkout ready only after the pipeline completes

### `checkoutDiagnostics`

Developer-facing helper for:
- last completed stage
- current blocker
- last recoverable error
- stage timing markers for console/debug use

This is specifically intended to make "customer loaded, then stuck" failures traceable.

## UI Ownership After Migration

### `DefaultLayout.vue`

Should only decide whether:
- session is ready
- checkout route can proceed

It should not own invoice boot orchestration.

### `Pos.vue`

Should become a thin shell that consumes checkout/session readiness and renders the workspace. It should not trigger checkout boot on its own.

### `PayView.vue` and `Payments.vue`

Should consume checkout state and payment-ready data from the checkout domain instead of coordinating invoice preparation themselves.

### Invoice and payment helpers

Existing composables can survive temporarily, but only as internal adapters behind the new checkout domain. They should stop acting as peer orchestrators.

## User Flow

After session is ready:

1. POS enters checkout start
2. Checkout domain logs `starting`
3. Customer-related state loads
4. Pricing, currency, delivery, and totals dependencies load
5. Offers and coupon dependencies load
6. Payment dependencies load
7. POS becomes `ready`

If a blocking step fails:

- checkout state moves to `blocked`
- UI shows a readable recovery state instead of endless loading
- diagnostics identify the exact failed stage

## Offline Expectations

This phase must preserve current offline behavior:

- cached prerequisites continue to work
- offline delivery/pricing/currency fallbacks remain supported
- checkout can use cached data where current code already allows it

No new online-only dependency should be introduced.

## Migration Strategy

1. Add checkout domain types, store, and diagnostics
2. Introduce a single `startCheckout` entry point
3. Route existing invoice boot logic through domain adapters
4. Move shell/payment components to consume domain state
5. Remove duplicate orchestration paths from `PayView.vue`, `Payments.vue`, and related helpers
6. Retire obsolete invoice boot glue after parity is verified

## Risks

- Invoice behavior is intertwined with payment and item logic, so careless extraction could break totals or submission readiness
- Some current helpers mix data loading with UI updates
- The migration can accidentally create duplicate watchers if old paths are not retired cleanly

## Risk Controls

- Keep existing business rules, only move ownership
- Centralize orchestration before deleting adapters
- Add stage-based diagnostics first so regressions are visible
- Verify checkout readiness and offline fallback paths before removing old boot flows

## Testing Plan

New tests should cover:

- `posCheckoutStore.spec.ts`
  - stage transitions
  - blocked vs ready states
- `startCheckout.spec.ts`
  - happy path
  - customer-stage failure
  - pricing-stage failure
  - payment-stage failure
- `checkoutDiagnostics.spec.ts`
  - last completed stage
  - blocker reporting
- `posShellCheckoutIndependence.spec.ts`
  - shell no longer owns checkout boot
- `checkoutOfflineFallback.spec.ts`
  - cached pricing/currency/delivery data still works offline

## Success Criteria

- checkout has one primary owner
- post-customer loading no longer disappears into scattered code paths
- POS shows either a ready checkout state or a clear blocked state
- shell components stop coordinating checkout boot directly
- developer debugging becomes stage-based instead of guess-based
