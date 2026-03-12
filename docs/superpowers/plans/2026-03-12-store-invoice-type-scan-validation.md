# Store-Backed Invoice Type Scan Validation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invoice type a shared store-backed source of truth so barcode scanning only blocks on stock shortages for Sales Invoice flows, never for Sales Order, Quotation, or Purchase Order flows.

**Architecture:** Move `invoiceType` ownership into `invoiceStore`, then have `Invoice.vue`, `ItemsSelector.vue`, and `Payments.vue` read/write the same reactive state instead of syncing over `eventBus`. Keep the existing event emission as a temporary compatibility bridge while scanner stock deferral becomes a computed rule derived from store invoice type plus selector context.

**Tech Stack:** Vue 3, Pinia, Vitest, Playwright

---

## Chunk 1: Store Source Of Truth

### Task 1: Add invoice type state to the invoice store

**Files:**
- Modify: `frontend/src/posapp/stores/invoiceStore.ts`
- Test: `frontend/tests/invoiceStore.spec.ts` or existing targeted regression spec if adding store-only coverage is warranted

- [ ] **Step 1: Add a failing test or targeted assertion for store-backed invoice type defaults/reset behavior**
- [ ] **Step 2: Run the targeted test to verify it fails for the expected reason**
- [ ] **Step 3: Add `invoiceType`, setter/reset helpers, and a computed `deferStockValidationToPayment` flag to the store**
- [ ] **Step 4: Re-run the targeted test to verify it passes**

### Task 2: Switch `Invoice.vue` to use the store-backed invoice type

**Files:**
- Modify: `frontend/src/posapp/components/pos/Invoice.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/invoiceWatchers.ts`

- [ ] **Step 1: Update component setup/data access so invoice type reads/writes the store instead of a local `ref`**
- [ ] **Step 2: Keep `update_invoice_type` emission only as a compatibility bridge for untouched listeners**
- [ ] **Step 3: Verify Invoice initialization, return flow, and clear/reset paths still set the right invoice type**

## Chunk 2: Scanner And Selector Rules

### Task 3: Add failing scanner regressions first

**Files:**
- Modify: `frontend/tests/useScanProcessor.spec.ts`

- [ ] **Step 1: Add a failing test showing insufficient stock still blocks Sales Invoice scans**
- [ ] **Step 2: Add failing tests showing the same scan does not block for `Order` and `Quotation`**
- [ ] **Step 3: Run `vitest` on the spec and verify the new tests fail before implementation**

### Task 4: Make scan stock validation depend on store invoice type and selector context

**Files:**
- Modify: `frontend/src/posapp/components/pos/items/ItemsSelector.vue`
- Modify: `frontend/src/posapp/composables/pos/items/useScanProcessor.ts`

- [ ] **Step 1: Replace selector-local invoice-type state with store-derived state**
- [ ] **Step 2: Make deferred stock validation true for selector `context="purchase"` regardless of invoice type**
- [ ] **Step 3: Ensure Sales Invoice continues to block on insufficient stock while Order/Quotation/Purchase flows do not**
- [ ] **Step 4: Re-run the scanner regression tests to verify green**

## Chunk 3: Cross-Component Consistency

### Task 5: Move payments to the same invoice type source

**Files:**
- Modify: `frontend/src/posapp/components/pos/Payments.vue`

- [ ] **Step 1: Replace `Payments.vue` event-bus-driven invoice type state with `invoiceStore` refs**
- [ ] **Step 2: Keep any invoice-type side effects intact when the store value changes**
- [ ] **Step 3: Run a targeted payment-related test if available, otherwise rely on smoke/browser verification**

### Task 6: Verify end-to-end behavior

**Files:**
- Test: `frontend/tests/useScanProcessor.spec.ts`
- Test: `frontend/tests/useItemAddition.spec.ts`
- Test: `frontend/tests/newItemDialog.spec.ts`
- Test: `frontend/tests/itemService.spec.ts`
- Test: Playwright deployed-env browser verification

- [ ] **Step 1: Run targeted `vitest` suites for scanner/item addition/new-item regressions**
- [ ] **Step 2: Run deployed Playwright verification covering Sales Order or Purchase Order scan add behavior**
- [ ] **Step 3: Confirm Sales Invoice still surfaces stock shortage errors when expected**
