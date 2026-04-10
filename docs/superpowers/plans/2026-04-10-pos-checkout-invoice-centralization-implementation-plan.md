# POS Checkout / Invoice Centralization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the checkout and invoice runtime behind a single checkout domain so the POS shell stops coordinating post-customer invoice boot directly.

**Architecture:** Introduce a new `domain/checkout` module that owns checkout stage state, diagnostics, and the customer-to-payment boot pipeline. Existing invoice composables and payment helpers stay temporarily as adapters, but all orchestration moves behind `startCheckout`, then shell components are rewired to consume domain state instead of running their own invoice boot logic.

**Tech Stack:** Vue 3, Pinia-style reactive stores, Vitest, existing POS invoice composables, existing offline cache/bootstrap helpers

---

## File Structure

### New files

- `frontend/src/posapp/domain/checkout/posCheckoutTypes.ts`
  - checkout stage types, blockers, diagnostics entry shape
- `frontend/src/posapp/domain/checkout/posCheckoutStore.ts`
  - single reactive store for checkout stage/readiness/blockers
- `frontend/src/posapp/domain/checkout/checkoutDiagnostics.ts`
  - timeline helpers for stage markers and blocker capture
- `frontend/src/posapp/domain/checkout/loadCheckoutCustomerData.ts`
  - customer-stage adapter over existing invoice details/customer hooks
- `frontend/src/posapp/domain/checkout/loadCheckoutPricing.ts`
  - pricing/currency/delivery stage adapter
- `frontend/src/posapp/domain/checkout/loadCheckoutOffers.ts`
  - offers/coupons stage adapter
- `frontend/src/posapp/domain/checkout/loadCheckoutPayments.ts`
  - payment-readiness stage adapter
- `frontend/src/posapp/domain/checkout/startCheckout.ts`
  - orchestrator for the full checkout boot sequence
- `frontend/src/posapp/domain/checkout/resetCheckout.ts`
  - cleanup/reset helper for route changes and session shifts
- `frontend/tests/posCheckoutStore.spec.ts`
- `frontend/tests/checkoutDiagnostics.spec.ts`
- `frontend/tests/startCheckout.spec.ts`
- `frontend/tests/posShellCheckoutIndependence.spec.ts`
- `frontend/tests/checkoutOfflineFallback.spec.ts`

### Existing files to modify

- `frontend/src/posapp/components/pos/Invoice.vue`
  - stop being the top-level checkout orchestrator
- `frontend/src/posapp/components/pos/shell/Pos.vue`
  - consume checkout readiness instead of triggering invoice boot
- `frontend/src/posapp/components/pos/shell/PayView.vue`
  - consume payment-ready checkout state
- `frontend/src/posapp/components/pos/Payments.vue`
  - stop preparing checkout dependencies independently
- `frontend/src/posapp/layouts/DefaultLayout.vue`
  - gate shell rendering on session + checkout readiness only
- `frontend/src/posapp/stores/invoiceStore.ts`
  - remain invoice data owner, but not checkout stage owner
- `frontend/src/posapp/composables/pos/invoice/useInvoiceCurrency.ts`
- `frontend/src/posapp/composables/pos/invoice/useInvoiceDetails.ts`
- `frontend/src/posapp/composables/pos/invoice/useInvoiceItems.ts`
- `frontend/src/posapp/composables/pos/invoice/useInvoiceOffers.ts`
- `frontend/src/posapp/composables/pos/invoice/useInvoiceStock.ts`
- `frontend/src/posapp/composables/pos/invoice/useInvoiceUI.ts`
- `frontend/src/posapp/composables/pos/invoice/useInvoicePrinting.ts`
  - these stay as adapters first, then lose orchestration responsibilities

## Chunk 1: Checkout State Core

### Task 1: Add checkout types, store, and diagnostics

**Files:**
- Create: `frontend/src/posapp/domain/checkout/posCheckoutTypes.ts`
- Create: `frontend/src/posapp/domain/checkout/posCheckoutStore.ts`
- Create: `frontend/src/posapp/domain/checkout/checkoutDiagnostics.ts`
- Test: `frontend/tests/posCheckoutStore.spec.ts`
- Test: `frontend/tests/checkoutDiagnostics.spec.ts`

- [ ] **Step 1: Write the failing checkout state tests**

```ts
it("tracks the customer -> pricing -> offers -> payments -> ready pipeline", () => {
	const checkout = createPosCheckoutStore();
	checkout.markStage("loading-customer");
	checkout.markStage("loading-pricing");
	checkout.markStage("loading-offers");
	checkout.markStage("loading-payments");
	checkout.markReady();
	expect(checkout.state.value.stage).toBe("ready");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn.cmd --cwd frontend test --run tests/posCheckoutStore.spec.ts tests/checkoutDiagnostics.spec.ts`  
Expected: FAIL because checkout domain files do not exist yet

- [ ] **Step 3: Implement minimal checkout state core**

```ts
export type PosCheckoutStage =
	| "idle"
	| "starting"
	| "loading-customer"
	| "loading-pricing"
	| "loading-offers"
	| "loading-payments"
	| "ready"
	| "blocked";
```

- [ ] **Step 4: Re-run tests**

Run: `yarn.cmd --cwd frontend test --run tests/posCheckoutStore.spec.ts tests/checkoutDiagnostics.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/domain/checkout frontend/tests/posCheckoutStore.spec.ts frontend/tests/checkoutDiagnostics.spec.ts
git commit -m "feat: add checkout state core"
```

## Chunk 2: Checkout Boot Orchestrator

### Task 2: Add stage adapters and `startCheckout`

**Files:**
- Create: `frontend/src/posapp/domain/checkout/loadCheckoutCustomerData.ts`
- Create: `frontend/src/posapp/domain/checkout/loadCheckoutPricing.ts`
- Create: `frontend/src/posapp/domain/checkout/loadCheckoutOffers.ts`
- Create: `frontend/src/posapp/domain/checkout/loadCheckoutPayments.ts`
- Create: `frontend/src/posapp/domain/checkout/startCheckout.ts`
- Create: `frontend/src/posapp/domain/checkout/resetCheckout.ts`
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoiceDetails.ts`
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoiceCurrency.ts`
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoiceItems.ts`
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoiceOffers.ts`
- Test: `frontend/tests/startCheckout.spec.ts`
- Test: `frontend/tests/checkoutOfflineFallback.spec.ts`

- [ ] **Step 1: Write failing orchestrator tests**

```ts
it("blocks checkout when pricing load fails after customer stage", async () => {
	const result = await startCheckout({ loadPricing: async () => { throw new Error("pricing failed"); } });
	expect(result.stage).toBe("blocked");
	expect(result.blocker?.code).toBe("pricing_failed");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `yarn.cmd --cwd frontend test --run tests/startCheckout.spec.ts tests/checkoutOfflineFallback.spec.ts`  
Expected: FAIL because `startCheckout` and stage adapters do not exist

- [ ] **Step 3: Implement adapters over existing invoice logic**

```ts
await loadCheckoutCustomerData(context);
await loadCheckoutPricing(context);
await loadCheckoutOffers(context);
await loadCheckoutPayments(context);
checkout.markReady();
```

- [ ] **Step 4: Preserve offline fallback behavior**

Run adapters against cached delivery/currency/customer data when the current invoice code already supports it. Do not add new online-only dependencies.

- [ ] **Step 5: Re-run tests**

Run: `yarn.cmd --cwd frontend test --run tests/startCheckout.spec.ts tests/checkoutOfflineFallback.spec.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/posapp/domain/checkout frontend/src/posapp/composables/pos/invoice frontend/tests/startCheckout.spec.ts frontend/tests/checkoutOfflineFallback.spec.ts
git commit -m "feat: add checkout boot orchestrator"
```

## Chunk 3: Shell and Payment Adoption

### Task 3: Move shell ownership to checkout domain

**Files:**
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
- Modify: `frontend/src/posapp/components/pos/Invoice.vue`
- Modify: `frontend/src/posapp/components/pos/shell/PayView.vue`
- Modify: `frontend/src/posapp/components/pos/Payments.vue`
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Test: `frontend/tests/posShellCheckoutIndependence.spec.ts`
- Test: `frontend/tests/paymentRouteReadiness.spec.ts`
- Test: `frontend/tests/paymentInitialization.spec.ts`

- [ ] **Step 1: Write failing shell-independence tests**

```ts
it("does not let Pos.vue trigger checkout boot directly", async () => {
	expect(renderPosShell().bootCheckoutLocally).toBe(false);
});
```

- [ ] **Step 2: Run targeted tests**

Run: `yarn.cmd --cwd frontend test --run tests/posShellCheckoutIndependence.spec.ts tests/paymentRouteReadiness.spec.ts tests/paymentInitialization.spec.ts`  
Expected: FAIL because shell components still own parts of checkout boot

- [ ] **Step 3: Rewire shell components to consume checkout state**

```ts
const checkout = usePosCheckoutStore();
watch(() => session.state.value.stage, async (stage) => {
	if (stage === "ready") await startCheckout(...);
});
```

- [ ] **Step 4: Remove duplicate payment preparation paths**

Shift payment-readiness responsibility behind `loadCheckoutPayments` so `PayView.vue` and `Payments.vue` stop preparing invoice prerequisites independently.

- [ ] **Step 5: Re-run tests**

Run: `yarn.cmd --cwd frontend test --run tests/posShellCheckoutIndependence.spec.ts tests/paymentRouteReadiness.spec.ts tests/paymentInitialization.spec.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/posapp/components/pos/shell/Pos.vue frontend/src/posapp/components/pos/Invoice.vue frontend/src/posapp/components/pos/shell/PayView.vue frontend/src/posapp/components/pos/Payments.vue frontend/src/posapp/layouts/DefaultLayout.vue frontend/tests/posShellCheckoutIndependence.spec.ts frontend/tests/paymentRouteReadiness.spec.ts frontend/tests/paymentInitialization.spec.ts
git commit -m "refactor: move checkout ownership into domain core"
```

## Chunk 4: Adapter Cleanup and Regression Coverage

### Task 4: Retire duplicate invoice boot glue and stabilize regressions

**Files:**
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoiceStock.ts`
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoiceUI.ts`
- Modify: `frontend/src/posapp/composables/pos/invoice/useInvoicePrinting.ts`
- Modify: `frontend/src/posapp/stores/invoiceStore.ts`
- Modify: `frontend/src/posapp/components/pos/invoice/invoiceItemMethods.ts`
- Test: `frontend/tests/invoiceOfflineFallbacks.spec.ts`
- Test: `frontend/tests/useInvoicePrinting.spec.ts`
- Test: `frontend/tests/invoiceCustomerSync.spec.ts`
- Test: `frontend/tests/payViewModes.spec.ts`

- [ ] **Step 1: Write or extend failing regression tests where checkout ownership assumptions changed**

```ts
it("keeps cached delivery and currency values available after checkout centralization", async () => {
	expect(await loadOfflineCheckoutFallback()).toMatchObject({ deliveryReady: true, currencyReady: true });
});
```

- [ ] **Step 2: Run regression slice**

Run: `yarn.cmd --cwd frontend test --run tests/invoiceOfflineFallbacks.spec.ts tests/useInvoicePrinting.spec.ts tests/invoiceCustomerSync.spec.ts tests/payViewModes.spec.ts`  
Expected: FAIL on at least one outdated ownership assumption

- [ ] **Step 3: Remove duplicate boot glue**

Keep business logic intact, but ensure invoice helpers act as consumers or pure helpers rather than peer orchestrators.

- [ ] **Step 4: Re-run regression slice**

Run: `yarn.cmd --cwd frontend test --run tests/invoiceOfflineFallbacks.spec.ts tests/useInvoicePrinting.spec.ts tests/invoiceCustomerSync.spec.ts tests/payViewModes.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/posapp/composables/pos/invoice frontend/src/posapp/stores/invoiceStore.ts frontend/src/posapp/components/pos/invoice/invoiceItemMethods.ts frontend/tests/invoiceOfflineFallbacks.spec.ts frontend/tests/useInvoicePrinting.spec.ts frontend/tests/invoiceCustomerSync.spec.ts frontend/tests/payViewModes.spec.ts
git commit -m "refactor: retire duplicate checkout boot glue"
```

## Chunk 5: Final Verification and Cleanup

### Task 5: Run full checkout regression suite and remove temporary planning docs at the end

**Files:**
- Modify: `docs/superpowers/specs/2026-04-10-pos-checkout-invoice-centralization-design.md` only if implementation changed the design materially
- Delete at end: `docs/superpowers/specs/2026-04-10-pos-checkout-invoice-centralization-design.md`
- Delete at end: `docs/superpowers/plans/2026-04-10-pos-checkout-invoice-centralization-implementation-plan.md`

- [ ] **Step 1: Run focused checkout and payment suite**

Run:
`yarn.cmd --cwd frontend test --run tests/posCheckoutStore.spec.ts tests/checkoutDiagnostics.spec.ts tests/startCheckout.spec.ts tests/checkoutOfflineFallback.spec.ts tests/posShellCheckoutIndependence.spec.ts tests/paymentRouteReadiness.spec.ts tests/paymentInitialization.spec.ts tests/invoiceOfflineFallbacks.spec.ts tests/useInvoicePrinting.spec.ts tests/invoiceCustomerSync.spec.ts tests/payViewModes.spec.ts`

Expected: PASS

- [ ] **Step 2: Run existing adjacent regression suite**

Run:
`yarn.cmd --cwd frontend test --run tests/posSessionStore.spec.ts tests/recoverPosSession.spec.ts tests/defaultLayoutSessionGate.spec.ts tests/defaultLayoutStartup.spec.ts tests/catalogStartup.spec.ts tests/invoiceStore.spec.ts tests/paymentSummary.spec.ts tests/paymentMethods.spec.ts`

Expected: PASS

- [ ] **Step 3: Run production build**

Run: `yarn.cmd --cwd frontend build`  
Expected: PASS

- [ ] **Step 4: Remove temporary spec/plan docs after implementation is fully complete**

```bash
git rm docs/superpowers/specs/2026-04-10-pos-checkout-invoice-centralization-design.md docs/superpowers/plans/2026-04-10-pos-checkout-invoice-centralization-implementation-plan.md
```

- [ ] **Step 5: Commit final cleanup**

```bash
git add frontend
git commit -m "chore: finalize checkout centralization rollout"
```
