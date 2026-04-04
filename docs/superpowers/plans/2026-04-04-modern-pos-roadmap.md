# Modern POS Roadmap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the highest-value missing modern POS workflows to POS Awesome without destabilizing the current retail core.

**Architecture:** Build the roadmap in thin vertical slices that reuse the existing Vue 3 + Pinia + offline Dexie frontend and the existing Frappe DocType/API backend patterns. Ship cashier-speed improvements first, then add new operational domains as separate routes, stores, queues, and DocTypes so each phase is deployable on its own.

**Tech Stack:** Vue 3, Pinia, Vuetify, Vue Router, TypeScript, Dexie offline cache, Frappe/ERPNext DocTypes, Python whitelisted APIs, Vitest, existing Python unit tests.

---

## Scope Note

This roadmap spans multiple independent subsystems. Execute it as five separate delivery phases, each with its own PR, migration, and rollback path:

1. Cashier UX and parked orders
2. Employee PIN plus stored value
3. Kitchen/preparation plus pickup status
4. Restaurant mode
5. Self-order and kiosk

Do not start Phase 3+ before Phase 1 is stable in production-like testing.

## Duplicate-Avoidance Rules

- Reuse the existing draft invoice flow as the persistence backbone for parked orders. Do not create a second parked-order document unless drafts prove technically insufficient.
- Extend `use_customer_credit` and `use_cashback` into stored value where possible. Do not introduce wallet accounting that bypasses the existing credit redemption path without a concrete limitation.
- Treat the existing `F4` profile switch and `F8` POS lock placeholders as hooks for cashier/session work. Finish those behaviors before adding separate, disconnected terminal-auth UX.
- Audit `pos_awesome_print_format_rule` before inventing any new print-routing configuration for kitchen/prep tickets.
- Only create a new DocType when no current invoice, draft, credit, or print-rule primitive can safely model the new workflow.

## File Map

### Existing files to reuse
- Modify: `frontend/src/posapp/router/index.ts`
- Modify: `frontend/src/posapp/stores/uiStore.ts`
- Modify: `frontend/src/posapp/stores/invoiceStore.ts`
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
- Modify: `frontend/src/posapp/components/pos/Invoice.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/InvoiceSummary.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/InvoiceActionButtons.vue`
- Modify: `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`
- Modify: `frontend/src/posapp/components/pos/payments/PaymentMethods.vue`
- Modify: `frontend/src/offline/db.ts`
- Modify: `frontend/src/offline/index.ts`
- Modify: `posawesome/hooks.py`
- Modify: `posawesome/fixtures/custom_field.json`
- Modify: `posawesome/posawesome/api/shifts.py`
- Modify: `posawesome/posawesome/api/payments.py`
- Modify: `posawesome/posawesome/api/invoices.py`
- Modify: `posawesome/posawesome/api/customers.py`

### New frontend files likely needed
- Create: `frontend/src/posapp/components/pos/flows/ParkedOrdersRail.vue`
- Create: `frontend/src/posapp/components/pos/employee/EmployeeSwitchDialog.vue`
- Create: `frontend/src/posapp/components/pos/wallet/GiftCardPanel.vue`
- Create: `frontend/src/posapp/components/pos/wallet/StoredValueDialog.vue`
- Create: `frontend/src/posapp/components/pos/kitchen/KitchenDisplayView.vue`
- Create: `frontend/src/posapp/components/pos/kitchen/KitchenTicketCard.vue`
- Create: `frontend/src/posapp/components/pos/kitchen/PickupStatusView.vue`
- Create: `frontend/src/posapp/components/pos/restaurant/FloorPlanView.vue`
- Create: `frontend/src/posapp/components/pos/restaurant/TableCard.vue`
- Create: `frontend/src/posapp/components/pos/restaurant/ReservationDialog.vue`
- Create: `frontend/src/posapp/components/self_order/SelfOrderHome.vue`
- Create: `frontend/src/posapp/components/self_order/SelfOrderCart.vue`
- Create: `frontend/src/posapp/components/self_order/SelfOrderCheckout.vue`
- Create: `frontend/src/posapp/stores/employeeStore.ts`
- Create: `frontend/src/posapp/stores/kitchenStore.ts`
- Create: `frontend/src/posapp/stores/restaurantStore.ts`
- Create: `frontend/src/posapp/stores/selfOrderStore.ts`
- Create: `frontend/src/offline/kitchen.ts`
- Create: `frontend/src/offline/self_order.ts`

### New backend files likely needed
- Create: `posawesome/posawesome/api/employees.py`
- Create: `posawesome/posawesome/api/stored_value.py`
- Create: `posawesome/posawesome/api/kitchen.py`
- Create: `posawesome/posawesome/api/restaurant.py`
- Create: `posawesome/posawesome/api/self_order.py`

### New DocTypes likely needed
- Create: `posawesome/posawesome/doctype/pos_terminal_employee/`
- Create: `posawesome/posawesome/doctype/pos_stored_value_account/`
- Create: `posawesome/posawesome/doctype/pos_gift_card/`
- Create: `posawesome/posawesome/doctype/pos_preparation_ticket/`
- Create: `posawesome/posawesome/doctype/pos_restaurant_floor/`
- Create: `posawesome/posawesome/doctype/pos_restaurant_table/`
- Create: `posawesome/posawesome/doctype/pos_restaurant_booking/`
- Create: `posawesome/posawesome/doctype/pos_self_order_session/`

### Test files to extend or add
- Modify: `frontend/tests/invoiceDialogs.spec.ts`
- Modify: `frontend/tests/invoiceShortcutListener.spec.ts`
- Modify: `frontend/tests/paymentSelectionFields.spec.ts`
- Modify: `frontend/tests/payTotalsSidebar.spec.ts`
- Modify: `frontend/tests/offlineKeyMapParity.spec.ts`
- Create: `frontend/tests/parkedOrders.spec.ts`
- Create: `frontend/tests/employeeSwitch.spec.ts`
- Create: `frontend/tests/storedValue.spec.ts`
- Create: `frontend/tests/kitchenDisplay.spec.ts`
- Create: `frontend/tests/restaurantMode.spec.ts`
- Create: `frontend/tests/selfOrder.spec.ts`
- Create: `posawesome/posawesome/api/test_employees.py`
- Create: `posawesome/posawesome/api/test_stored_value.py`
- Create: `posawesome/posawesome/api/test_kitchen.py`
- Create: `posawesome/posawesome/api/test_restaurant.py`
- Create: `posawesome/posawesome/api/test_self_order.py`

## Chunk 1: Phase 1 Cashier UX And Parked Orders

### Task 1: Replace draft-first recovery with a parked-order rail

**Files:**
- Create: `frontend/src/posapp/components/pos/flows/ParkedOrdersRail.vue`
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/InvoiceSummary.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/InvoiceActionButtons.vue`
- Modify: `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`
- Modify: `frontend/src/posapp/stores/uiStore.ts`
- Test: `frontend/tests/parkedOrders.spec.ts`

- [ ] Add `parkedOrders`, `selectedParkedOrder`, and rail visibility state to `frontend/src/posapp/stores/uiStore.ts`.
- [ ] Write `frontend/tests/parkedOrders.spec.ts` covering park, resume, replace-current-sale, and mobile rail visibility.
- [ ] Build `ParkedOrdersRail.vue` as a compact ticket strip with cashier name, total, age, and status chips.
- [ ] Mount the rail in `frontend/src/posapp/components/pos/shell/Pos.vue` above the mobile dock and desktop invoice area.
- [ ] Change `InvoiceActionButtons.vue` label from `Load Drafts` to `Park/Resume` while keeping draft fallback available inside invoice management.
- [ ] Refactor `InvoiceManagement.vue` so drafts become a secondary recovery tab, not the primary daily workflow.
- [ ] Implement parked-order rail actions by calling the existing draft load/save APIs first; only add new endpoints if the current draft endpoints cannot support cashier-speed resume.
- [ ] Run: `yarn.cmd test --run frontend/tests/parkedOrders.spec.ts`
- [ ] Run: `yarn.cmd test --run frontend/tests/invoiceDialogs.spec.ts frontend/tests/invoiceShortcutListener.spec.ts`
- [ ] Commit: `git commit -m "feat: add parked orders rail workflow"`

### Task 2: Tighten payment speed UX

**Files:**
- Modify: `frontend/src/posapp/components/pos/payments/PaymentMethods.vue`
- Modify: `frontend/src/posapp/components/pos/payments/PaymentSummary.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/InvoiceActionButtons.vue`
- Modify: `frontend/src/posapp/components/pos/invoice/InvoiceSummary.vue`
- Test: `frontend/tests/paymentSelectionFields.spec.ts`
- Test: `frontend/tests/payTotalsSidebar.spec.ts`

- [ ] Write failing tests for denomination shortcuts, exact-cash action, and primary pay CTA ordering.
- [ ] Promote denomination chips, exact amount, and nearest-round-up actions into the first visible payment cluster.
- [ ] Reduce low-value actions in the summary area so `PAY` and `Pay & Print` dominate visually.
- [ ] Add explicit tender-state banners for underpaid, exact, and overpaid conditions.
- [ ] Run: `yarn.cmd test --run frontend/tests/paymentSelectionFields.spec.ts frontend/tests/payTotalsSidebar.spec.ts`
- [ ] Commit: `git commit -m "feat: streamline payment speed flow"`

### Release gate for Phase 1
- [ ] Manual test desktop cashier flow for new sale, park sale, resume sale, exact-cash payment, split payment, and print.
- [ ] Manual test phone-width layout in the existing POS shell.
- [ ] Verify no regression in drafts and invoice management history.

## Chunk 2: Phase 2 Employee PIN And Stored Value

### Task 3: Add employee switching for shared terminals

**Files:**
- Create: `frontend/src/posapp/components/pos/employee/EmployeeSwitchDialog.vue`
- Create: `frontend/src/posapp/stores/employeeStore.ts`
- Create: `posawesome/posawesome/api/employees.py`
- Create: `posawesome/posawesome/doctype/pos_terminal_employee/`
- Modify: `frontend/src/posapp/components/Navbar.vue`
- Modify: `frontend/src/posapp/stores/uiStore.ts`
- Modify: `posawesome/hooks.py`
- Test: `frontend/tests/employeeSwitch.spec.ts`
- Test: `posawesome/posawesome/api/test_employees.py`

- [ ] Add a `POS Terminal Employee` DocType for PIN, role, shift scope, and terminal assignment.
- [ ] Expose backend APIs for terminal employee list, PIN verification, and supervisor override.
- [ ] Write frontend tests for login, failed PIN, shift handoff, and manager override.
- [ ] Add an employee switch action in the navbar and convert the existing `F4`/`F8` unavailable shortcut hooks into real profile-switch or lock-screen entry points where possible.
- [ ] Persist current cashier identity in store state and attach it to parked orders, invoices, and cash actions.
- [ ] Run: `yarn.cmd test --run frontend/tests/employeeSwitch.spec.ts`
- [ ] Run: `python -m unittest posawesome.posawesome.api.test_employees`
- [ ] Commit: `git commit -m "feat: add terminal employee switching"`

### Task 4: Add gift card and stored-value accounts

**Files:**
- Create: `frontend/src/posapp/components/pos/wallet/GiftCardPanel.vue`
- Create: `frontend/src/posapp/components/pos/wallet/StoredValueDialog.vue`
- Create: `posawesome/posawesome/api/stored_value.py`
- Create: `posawesome/posawesome/doctype/pos_stored_value_account/`
- Create: `posawesome/posawesome/doctype/pos_gift_card/`
- Modify: `frontend/src/posapp/components/pos/payments/PaymentMethods.vue`
- Modify: `frontend/src/posapp/components/pos/customer/Customer.vue`
- Modify: `frontend/src/offline/db.ts`
- Modify: `posawesome/fixtures/custom_field.json`
- Test: `frontend/tests/storedValue.spec.ts`
- Test: `frontend/tests/offlineKeyMapParity.spec.ts`
- Test: `posawesome/posawesome/api/test_stored_value.py`

- [ ] Add DocTypes and backend APIs for issuing, topping up, redeeming, and checking balances.
- [ ] Add a customer-side stored-value summary next to balance and loyalty data.
- [ ] Implement redemption by extending the current customer-credit/cashback logic first, then layer gift-card-specific issuance and lookup only where existing credit flows are insufficient.
- [ ] Add payment methods for gift card and stored value with balance validation before submit.
- [ ] Extend offline schema with cached stored-value balance snapshots and replay-safe redemption queue metadata.
- [ ] Run: `yarn.cmd test --run frontend/tests/storedValue.spec.ts frontend/tests/offlineKeyMapParity.spec.ts`
- [ ] Run: `python -m unittest posawesome.posawesome.api.test_stored_value`
- [ ] Commit: `git commit -m "feat: add gift card and stored value support"`

### Release gate for Phase 2
- [ ] Validate shift handoff between two cashiers on one terminal.
- [ ] Validate gift card partial redemption, full redemption, and insufficient-balance rejection.
- [ ] Validate stored-value behavior offline and after replay.

## Chunk 3: Phase 3 Kitchen Display And Pickup Status

### Task 5: Add preparation ticket domain and kitchen board

**Files:**
- Create: `frontend/src/posapp/components/pos/kitchen/KitchenDisplayView.vue`
- Create: `frontend/src/posapp/components/pos/kitchen/KitchenTicketCard.vue`
- Create: `frontend/src/posapp/stores/kitchenStore.ts`
- Create: `frontend/src/offline/kitchen.ts`
- Create: `posawesome/posawesome/api/kitchen.py`
- Create: `posawesome/posawesome/doctype/pos_preparation_ticket/`
- Modify: `frontend/src/posapp/router/index.ts`
- Modify: `posawesome/posawesome/api/invoice_processing/creation.py`
- Modify: `posawesome/hooks.py`
- Test: `frontend/tests/kitchenDisplay.spec.ts`
- Test: `posawesome/posawesome/api/test_kitchen.py`

- [ ] Model `POS Preparation Ticket` with invoice link, course/station, stage, SLA timestamps, and ready state.
- [ ] Emit preparation tickets during invoice submit for profiles flagged as hospitality/preparation-enabled.
- [ ] Add `/kitchen` route and board UI with columns for `new`, `preparing`, `ready`, and `completed`.
- [ ] Add station/category filtering so kitchen screens can be dedicated to item groups.
- [ ] Audit `pos_awesome_print_format_rule` before adding any new kitchen print routing fields; reuse it if it can safely map station/category to receipt format output.
- [ ] Extend offline queue rules so tickets can be generated and replayed safely when invoices sync later.
- [ ] Run: `yarn.cmd test --run frontend/tests/kitchenDisplay.spec.ts`
- [ ] Run: `python -m unittest posawesome.posawesome.api.test_kitchen`
- [ ] Commit: `git commit -m "feat: add preparation ticket workflow"`

### Task 6: Add pickup/customer order status screen

**Files:**
- Create: `frontend/src/posapp/components/pos/kitchen/PickupStatusView.vue`
- Modify: `frontend/src/posapp/router/index.ts`
- Modify: `frontend/src/posapp/components/customer_display/CustomerDisplay.vue`
- Modify: `posawesome/posawesome/api/kitchen.py`
- Test: `frontend/tests/kitchenDisplay.spec.ts`

- [ ] Add `/pickup-status` route showing ready and in-progress order states for front counter screens.
- [ ] Reuse existing customer display styling patterns where possible instead of inventing a separate visual system.
- [ ] Publish ready-state changes via existing realtime/event infrastructure.
- [ ] Run: `yarn.cmd test --run frontend/tests/kitchenDisplay.spec.ts`
- [ ] Commit: `git commit -m "feat: add pickup status screen"`

### Release gate for Phase 3
- [ ] Submit mixed orders and verify only configured items create preparation tickets.
- [ ] Verify kitchen status transitions update pickup screen in near-real time.
- [ ] Verify retail-only profiles remain unaffected.

## Chunk 4: Phase 4 Restaurant Mode

### Task 7: Add floors, tables, and reservation domain

**Files:**
- Create: `frontend/src/posapp/components/pos/restaurant/FloorPlanView.vue`
- Create: `frontend/src/posapp/components/pos/restaurant/TableCard.vue`
- Create: `frontend/src/posapp/components/pos/restaurant/ReservationDialog.vue`
- Create: `frontend/src/posapp/stores/restaurantStore.ts`
- Create: `posawesome/posawesome/api/restaurant.py`
- Create: `posawesome/posawesome/doctype/pos_restaurant_floor/`
- Create: `posawesome/posawesome/doctype/pos_restaurant_table/`
- Create: `posawesome/posawesome/doctype/pos_restaurant_booking/`
- Modify: `frontend/src/posapp/router/index.ts`
- Modify: `frontend/src/posapp/components/pos/shell/Pos.vue`
- Modify: `posawesome/fixtures/custom_field.json`
- Test: `frontend/tests/restaurantMode.spec.ts`
- Test: `posawesome/posawesome/api/test_restaurant.py`

- [ ] Add DocTypes for floors, tables, and reservations scoped by POS profile/company.
- [ ] Add `/restaurant` route and floor-plan UI with occupied, available, reserved, and dirty states.
- [ ] Attach active invoice/parked order records to a table instead of only a cashier session.
- [ ] Support transfer table, merge table, and split bill entry points.
- [ ] Add dine-in, takeout, and delivery order type flags that propagate into kitchen tickets and printouts.
- [ ] Run: `yarn.cmd test --run frontend/tests/restaurantMode.spec.ts`
- [ ] Run: `python -m unittest posawesome.posawesome.api.test_restaurant`
- [ ] Commit: `git commit -m "feat: add restaurant floor and table mode"`

### Release gate for Phase 4
- [ ] Verify one table can hold multiple parked checks.
- [ ] Verify split and transfer flows do not break payment and return logic.
- [ ] Verify restaurant features can be disabled cleanly by profile.

## Chunk 5: Phase 5 Self-Order And Kiosk

### Task 8: Add self-order session domain and public ordering flow

**Files:**
- Create: `frontend/src/posapp/components/self_order/SelfOrderHome.vue`
- Create: `frontend/src/posapp/components/self_order/SelfOrderCart.vue`
- Create: `frontend/src/posapp/components/self_order/SelfOrderCheckout.vue`
- Create: `frontend/src/posapp/stores/selfOrderStore.ts`
- Create: `frontend/src/offline/self_order.ts`
- Create: `posawesome/posawesome/api/self_order.py`
- Create: `posawesome/posawesome/doctype/pos_self_order_session/`
- Modify: `frontend/src/posapp/router/index.ts`
- Modify: `posawesome/hooks.py`
- Test: `frontend/tests/selfOrder.spec.ts`
- Test: `posawesome/posawesome/api/test_self_order.py`

- [ ] Model `POS Self Order Session` for menu source, table/queue reference, customer token, and payment state.
- [ ] Add public/self-service routes under the POS app for QR menu and kiosk browsing.
- [ ] Reuse item cards, pricing, offers, and tax calculation logic from the main POS selector instead of duplicating pricing logic.
- [ ] Create a controlled checkout path that submits into the same invoice pipeline or into a dedicated pre-order document, depending on profile configuration.
- [ ] Extend kitchen integration so self-orders generate preparation tickets automatically.
- [ ] Run: `yarn.cmd test --run frontend/tests/selfOrder.spec.ts`
- [ ] Run: `python -m unittest posawesome.posawesome.api.test_self_order`
- [ ] Commit: `git commit -m "feat: add self-order and kiosk flow"`

### Release gate for Phase 5
- [ ] Verify QR ordering from phone-width layout.
- [ ] Verify kiosk mode on a locked-down browser window.
- [ ] Verify order handoff into kitchen and pickup screens.

## Cross-Cutting Rules

- [ ] Keep each phase behind `POS Profile` flags first; do not expose new workflows globally by default.
- [ ] Preserve existing offline behavior and extend schema incrementally in `frontend/src/offline/db.ts`.
- [ ] Prefer reusing `invoiceStore`, `uiStore`, and existing invoice-processing APIs over building parallel sales pipelines.
- [ ] Add migration patches and fixtures updates in the same PR as each DocType.
- [ ] Keep new routes additive so current `/pos`, `/payments`, `/reports`, and `/customer-display` remain stable.
- [ ] Write frontend tests before UI implementation and backend tests before API implementation.

## Recommended PR Order

1. `feat: add parked orders rail workflow`
2. `feat: streamline payment speed flow`
3. `feat: add terminal employee switching`
4. `feat: add gift card and stored value support`
5. `feat: add preparation ticket workflow`
6. `feat: add pickup status screen`
7. `feat: add restaurant floor and table mode`
8. `feat: add self-order and kiosk flow`

## Verification Checklist

- [ ] `yarn.cmd test --run frontend/tests/parkedOrders.spec.ts`
- [ ] `yarn.cmd test --run frontend/tests/paymentSelectionFields.spec.ts frontend/tests/payTotalsSidebar.spec.ts`
- [ ] `yarn.cmd test --run frontend/tests/employeeSwitch.spec.ts`
- [ ] `yarn.cmd test --run frontend/tests/storedValue.spec.ts frontend/tests/offlineKeyMapParity.spec.ts`
- [ ] `yarn.cmd test --run frontend/tests/kitchenDisplay.spec.ts`
- [ ] `yarn.cmd test --run frontend/tests/restaurantMode.spec.ts`
- [ ] `yarn.cmd test --run frontend/tests/selfOrder.spec.ts`
- [ ] `python -m unittest posawesome.posawesome.api.test_employees`
- [ ] `python -m unittest posawesome.posawesome.api.test_stored_value`
- [ ] `python -m unittest posawesome.posawesome.api.test_kitchen`
- [ ] `python -m unittest posawesome.posawesome.api.test_restaurant`
- [ ] `python -m unittest posawesome.posawesome.api.test_self_order`

## Notes For Execution

- Start with Phase 1 even if the business goal is kiosk or restaurant mode. It improves daily cashier speed immediately and provides the parked-order primitives later phases need.
- Do not implement kitchen, restaurant, and self-order in the same branch.
- If this roadmap proves too large for one quarter, stop after Phase 3. At that point the product already differentiates strongly from a standard ERP-linked POS.
