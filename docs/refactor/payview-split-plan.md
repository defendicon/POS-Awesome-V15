# PayView.vue Safe Split Plan

## Goal

Split `frontend/src/posapp/components/pos/shell/PayView.vue` into smaller, testable pieces without changing POS payment behavior, backend calls, print behavior, event names, route semantics, or UI layout.

This plan is documentation only. Each extraction should be a small PR with characterization tests before or alongside the move.

## Current Shape

`PayView.vue` is already partly decomposed. The template delegates visible sections to these subcomponents:

- `Customer`
- `PayPartySelector`
- `PayInvoicesTable`
- `PayUnallocatedTable`
- `PayMpesaSection`
- `PayTotalsSidebar`
- `PayActionButtons`
- `AppLoadingOverlay`
- `VueDatePicker`

The component also uses existing composables and helper modules:

- `usePosPayData`
- `usePosPaySelection`
- `usePosPaySubmission`
- `useRtl`
- `paymentModes`
- `paymentRouteReadiness`
- `paymentMethodCurrencyCache`
- offline opening/payment cache helpers
- POS print and QZ Tray helpers

Even with those pieces, `PayView.vue` remains the orchestrating shell for route readiness, party selection, reconciliation data, payment method setup, submit/print flow, offline sync, and several lifecycle watchers.

## Remaining Logic Inside PayView

### Payment Route Readiness

Current responsibilities:

- Tracks route-targeted payment state through `paymentRouteTarget`.
- Computes whether payment entry UI should be temporarily locked.
- Builds the loading message shown by `AppLoadingOverlay`.
- Applies route target data to customer and payment context.
- Coordinates customer-store updates with route readiness.

This logic is sensitive because it prevents premature customer changes while route-provided payment context is still loading.

### Party Selection State

Current responsibilities:

- Manages `paymentEntryType`, `partyType`, and allowed party types.
- Normalizes party type from payment entry type.
- Switches between customer, supplier, and employee flows.
- Searches suppliers and employees.
- Maintains selected party values and party display options.
- Resets party-specific context when the selected payment flow changes.
- Coordinates customer component state with payment party state.

This is closely linked to POS Profile configuration, party account lookup, and payment method availability.

### Reconciliation State

Current responsibilities:

- Loads and refreshes outstanding invoices, unallocated payments, and M-Pesa payments through `usePosPayData`.
- Tracks selected invoices, selected unallocated payments, and selected M-Pesa payments through `usePosPaySelection`.
- Maintains currency, POS profile, posting date, and payment method filters.
- Computes invoice totals, payment totals, difference amounts, and currency summaries.
- Handles auto-reconciliation and selection reset behavior.

This area affects payment allocation correctness and must preserve existing totals exactly.

### Submit And Print Orchestration

Current responsibilities:

- Delegates payment submission through `usePosPaySubmission`.
- Tracks submit state and loading state.
- Supports submit-only and submit-and-print actions.
- Calls print page, browser print, and QZ Tray paths.
- Preserves offline payment behavior and sync retry events.
- Coordinates successful submission with local state reset and refreshed payment data.

This is high risk because successful flows must remain unchanged for invoices, payments, print formats, silent print, offline cache, and sync.

### Opening, Payment Method, And Currency Setup

Current responsibilities:

- Checks opening entry state.
- Applies opening entry data to payment method choices.
- Loads payment method currency metadata.
- Looks up available accounts and party accounts.
- Fetches company currency and exchange rates.
- Validates exchange-rate requirements.
- Handles bank account changes.

This is tied to POS Profile payment methods, company currency, multi-currency payment behavior, and cached opening data.

### Lifecycle And Watchers

Current responsibilities:

- Initializes opening entry, payment methods, payment currency metadata, outstanding invoices, unallocated payments, and M-Pesa payments.
- Watches payment type, party type, route target, customer selection, filters, and reconciliation state.
- Registers and reacts to online/offline payment sync events.

Watcher ordering is one of the main behavior risks during extraction.

## Micro PR Sequence

### PR 0: Add Characterization Coverage

Before extracting logic, add focused tests around current behavior:

- Route-targeted payment locks the UI until readiness checks pass.
- Route target applies the expected customer and payment context.
- Customer, supplier, and employee party transitions preserve current reset behavior.
- Outstanding invoice, unallocated payment, and M-Pesa selections produce the same totals.
- Submit-only and submit-and-print call the same orchestration paths as today.
- Offline payment sync events still refresh or preserve state as expected.

Acceptance checks:

- Existing payment tests continue to pass.
- New tests fail if route lock, party reset, selection totals, or submit/print call order changes.
- No production code is moved in this PR unless tests require a tiny testability fix.

### PR 1: Extract Payment Route Readiness

Create a small composable such as `usePayRouteReadiness` that owns:

- `paymentRouteTarget`
- route lock computed state
- route loading message
- route target application helpers
- watcher setup needed only for route readiness

Keep `paymentRouteReadiness` utility functions as the source of truth; the composable should orchestrate them, not duplicate them.

Acceptance checks:

- Route-targeted payment still shows the same loading overlay message.
- Customer selection is not applied before route readiness allows it.
- Non-route payment entry flow is unchanged.
- No template markup changes except renamed bindings if needed.

Rollback strategy:

- Revert this PR only; no later PR should depend on changed public behavior.

### PR 2: Extract Party Selection State

Create a composable such as `usePayPartySelection` that owns:

- `paymentEntryType`
- `partyType`
- allowed party type computation
- customer, supplier, and employee option state
- supplier and employee search handlers
- party reset behavior
- party type normalization from payment type

The existing `PayPartySelector` prop and event contract should remain unchanged.

Acceptance checks:

- Customer, supplier, and employee modes render the same controls.
- Switching payment entry type preserves current party type normalization.
- Switching party type clears only the same state it clears today.
- Supplier and employee searches call the same backend methods with the same arguments.
- Customer quick selection and customer-store synchronization remain unchanged.

Rollback strategy:

- Revert the composable extraction and restore local state in `PayView.vue`.
- Since the child component contract remains stable, UI rollback should be isolated.

### PR 3: Extract Reconciliation State

Create a composable such as `usePayReconciliationState` that coordinates:

- `usePosPayData`
- `usePosPaySelection`
- currency and POS profile filters
- outstanding invoice loading
- unallocated payment loading
- M-Pesa loading
- selected row totals and summaries
- auto-reconcile behavior

Do not move table markup in this PR. Keep `PayInvoicesTable`, `PayUnallocatedTable`, and `PayMpesaSection` wired from `PayView.vue` until the state extraction is stable.

Acceptance checks:

- Invoice, unallocated payment, and M-Pesa row selections produce identical totals before and after extraction.
- Currency summaries and difference amounts are unchanged.
- Filter changes reload the same datasets.
- Empty, loading, and error states remain unchanged.
- Multi-currency totals match current behavior.

Rollback strategy:

- Revert only the reconciliation composable.
- Keep existing data and selection composables untouched so the rollback is mostly binding-level.

### PR 4: Extract Submit And Print Orchestration

Create a composable such as `usePaySubmitPrintFlow` that owns:

- submit-only orchestration
- submit-and-print orchestration
- print page loading
- QZ Tray and browser-print branching
- post-submit refresh/reset calls
- offline sync retry hooks related to payment submission

Keep `usePosPaySubmission` as the payment submission source of truth. The new composable should coordinate PayView-specific steps around it.

Acceptance checks:

- Submit-only creates the same payment entry payload and post-submit state.
- Submit-and-print uses the same print format, QZ Tray, and browser fallback behavior.
- Failure paths keep current user-visible errors and loading cleanup.
- Offline queued payments and sync retry behavior remain unchanged.
- `PayActionButtons` receives the same disabled/loading state.

Rollback strategy:

- Revert the orchestration composable and keep `usePosPaySubmission` unchanged.
- Avoid combining print UI changes with orchestration extraction.

### PR 5: Extract Opening, Payment Method, And Currency Setup

If `PayView.vue` is still large after the required extractions, create a focused composable such as `usePayOpeningAndMethods` for:

- opening entry checks
- opening entry data application
- payment method setup
- payment method currency map loading
- company currency lookup
- party account lookup
- exchange rate validation
- bank account changes

Acceptance checks:

- POS Profile payment methods match the current list and order.
- Payment method account and currency selection remain unchanged.
- Company currency and exchange-rate behavior remain unchanged.
- Missing opening entry behavior remains unchanged.
- Cached opening data fallback still works.

Rollback strategy:

- Revert this PR independently.
- Keep any cache helper changes out of this PR unless required by tests.

### PR 6: Gradually Migrate Remaining Options API

After the behavior-heavy pieces are in composables, migrate the shell gradually:

- Keep `PayView.vue` as the route-level container.
- Move remaining small computed values into `setup()` only when covered by tests.
- Avoid converting the entire component to `<script setup>` in one PR.
- Move styles only after logic has settled, and only if there is a clear component ownership boundary.

Acceptance checks:

- No user-facing layout changes.
- Existing events and child props remain stable.
- Snapshot or DOM tests confirm the major payment sections still render in the same order.
- Type-check and build pass after each migration PR.

Rollback strategy:

- Revert the smallest migration PR.
- Avoid mixing Options API migration with state extraction or CSS movement.

## Risk Areas

- Route-targeted payment readiness can change when customer state is applied too early.
- Party type normalization can break supplier or employee payment flows.
- Customer selection is linked to customer price list and POS Profile customer behavior.
- POS Profile payment method configuration controls valid payment choices.
- Company currency and payment method account currency affect exchange-rate validation.
- Reconciliation totals depend on selected invoices, unallocated payments, M-Pesa rows, and currency filters.
- Submit and print flow touches payment creation, offline queueing, print format, QZ Tray, and browser fallback.
- Watcher ordering may affect data refresh timing.
- Online/offline event handling can create duplicate refreshes or missed sync retries.
- Posting date changes can affect backend query results and exchange rates.

## General Rollback Strategy

- Keep each extraction PR small and behavior-preserving.
- Do not combine state extraction, template movement, CSS movement, and Options API migration in one PR.
- Keep existing child component prop and event contracts stable until all tests pass.
- Prefer adding characterization tests before moving logic.
- Preserve existing composables and helper modules as sources of truth.
- If a regression appears, revert the most recent micro PR rather than patching around it in a later extraction.

## Suggested Validation Per PR

Run the smallest focused tests first, then the standard frontend checks:

```bash
cd frontend
yarn test:unit
yarn type-check
yarn build
```

For print or offline-sensitive PRs, also run any existing focused payment submission, offline queue, and print-related tests before merging.
