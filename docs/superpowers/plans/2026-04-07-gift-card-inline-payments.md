# Gift Card Inline Payments Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the payments gift card area into a single inline expandable redeem/apply section that collapses after applying and changes the trigger button text to an edit action when a gift card is already applied.

**Architecture:** Keep gift-card state ownership in `Payments.vue` and move the payments-area interaction into `PaymentGiftCardSection.vue`. The section becomes a collapsible inline form for redeem/apply only, while existing management actions remain outside the payments section.

**Tech Stack:** Vue 3, Vuetify component patterns, Vitest, Vue Test Utils

---

## Chunk 1: Inline Gift Card UI

### Task 1: Extend the section component API

**Files:**
- Modify: `frontend/src/posapp/components/pos/payments/PaymentGiftCardSection.vue`
- Test: `frontend/tests/paymentGiftCardSection.spec.ts`

- [ ] **Step 1: Write the failing test**
  Add coverage for collapsed button labels, expanded inline fields, and collapse/clear events.

- [ ] **Step 2: Run test to verify it fails**
  Run: `yarn.cmd test --run frontend/tests/paymentGiftCardSection.spec.ts`
  Expected: FAIL because the component does not yet expose inline expandable redeem/apply behavior.

- [ ] **Step 3: Write minimal implementation**
  Update the section component to accept expanded/form props and emit toggle, input update, balance check, apply, and clear events.

- [ ] **Step 4: Run test to verify it passes**
  Run: `yarn.cmd test --run frontend/tests/paymentGiftCardSection.spec.ts`
  Expected: PASS

### Task 2: Wire the inline section into payments state

**Files:**
- Modify: `frontend/src/posapp/components/pos/Payments.vue`
- Test: `frontend/tests/paymentGiftCardSection.spec.ts`

- [ ] **Step 1: Write the failing test**
  Add coverage for the applied-state label and auto-collapse behavior driven by parent state.

- [ ] **Step 2: Run test to verify it fails**
  Run: `yarn.cmd test --run frontend/tests/paymentGiftCardSection.spec.ts`
  Expected: FAIL because parent-driven expanded state and collapse handling are not wired.

- [ ] **Step 3: Write minimal implementation**
  Add a local expanded flag in `Payments.vue`, pass through gift-card form state to the section, open inline instead of dialog from the dedicated section button, and collapse after apply/clear.

- [ ] **Step 4: Run test to verify it passes**
  Run: `yarn.cmd test --run frontend/tests/paymentGiftCardSection.spec.ts`
  Expected: PASS

## Chunk 2: Focused Verification

### Task 3: Verify adjacent gift-card UX remains intact

**Files:**
- Verify: `frontend/tests/giftCardPayment.spec.ts`

- [ ] **Step 1: Run targeted regression tests**
  Run: `yarn.cmd test --run frontend/tests/giftCardPayment.spec.ts`
  Expected: PASS, confirming dialog-based supervisor actions still exist where already used.

- [ ] **Step 2: Run the updated inline section test suite**
  Run: `yarn.cmd test --run frontend/tests/paymentGiftCardSection.spec.ts`
  Expected: PASS
