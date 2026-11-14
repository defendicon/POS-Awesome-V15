# Offline live verification follow-up

## Summary

Live verification on 7 November 2026 confirmed that the second cashier could
authenticate in application offline mode and a test sale synchronized while
retaining its original posting timestamp. It also exposed false cache readiness
warnings, unformatted sync notifications and an internal customer ID in recovery.

The warning was caused by two writers of resource state: adapters persisted the
correct POS scope, then coordinator completion overwrote it with its in-memory
null scope. The shared runner now returns the same scope signature to the
coordinator, including after a schema rebuild. Existing unscoped records remain
unverified until an online resource refresh; this fix does not invent freshness.

## Files changed

- `docs/FEATURE_CONTRACTS.md`: document scope preservation across sync completion
  and the separation between recovery labels and queued invoice payloads.
- `frontend/src/offline/sync/resourceRunner.ts`: preserve the shared profile,
  company and warehouse signature through coordinator completion and rebuilds.
- `frontend/src/posapp/utils/translate.ts`: shared translation helper passes a
  replacement array to Frappe and formats placeholders in offline fallbacks.
- `frontend/src/posapp/components/Navbar.vue`: use that helper for sync counts
  and notifications instead of spreading replacements into Frappe's arguments.
- `frontend/src/posapp/components/navbar/NavbarCashierPinForm.vue`: fix the same
  argument bug through the shared helper in cashier PIN messages.
- `frontend/src/posapp/components/navbar/OfflineStatusPanel.vue`: show readiness
  warnings/errors instead of claiming ready; show row reasons and recheck when
  the POS Profile or coordinator state changes.
- `frontend/src/offline/invoiceRecovery.ts`: resolve customer display names from
  durable cached customers, with invoice-name and ID fallbacks. Display metadata
  never changes the queued invoice, customer ID or request identity.
- `frontend/src/posapp/components/OfflineInvoices.vue`: display and search the
  resolved customer label.
- `frontend/tests/offlineSyncResourceRunner.spec.ts`: exercise runner/coordinator
  completion across all six checkout readiness resources.
- `frontend/tests/offlineReadiness.spec.ts`: retain blocking for null, malformed
  and legacy scopes, alongside existing stale-age and wrong-scope coverage.
- `frontend/tests/offlineStatusPanel.spec.ts`: cover truthful readiness display
  and updating the panel after coordinator state changes.
- `frontend/tests/offlineReliability.spec.ts`: cover durable customer labels,
  missing-cache fallback, original invoice title and immutable queue payloads.
- `frontend/tests/translate.spec.ts`: cover Frappe's array contract, zero counts,
  singular/plural messages, translated templates and offline fallbacks.

## Linked features checked

Readiness continues to use the shared checkout evaluator and POS Profile cache
age/Warn/Block controls. Profile/company/warehouse, profile revision and terminal
user validation remain enforced. Items, prices, pricing rules, customers, tax and
payment configuration, and stock all retain scope evidence after successful sync.

Invoice request IDs, replay/acknowledgement, original posting times, stock
reservations and cashier authentication rules remain unchanged. Customer labels
are presentation metadata only; no pricing, discount, UOM, tax, total, payment,
Sales Invoice API, report or receipt/QZ calculation changed. No backend endpoint,
POS Profile field, IndexedDB schema or dependency was added.

## Verification

From `frontend/`:

- `node node_modules/vitest/vitest.mjs run offline cartRecovery usePaymentSubmission invoiceDocument invoiceOutbox employeeStore employeeSwitchDialog navbar stockSalePolicy translate syncCoordinator --maxWorkers=2 --minWorkers=1`:
  **41 suites, 242 tests passed**. This covers checkout, profile-controlled
  readiness, queue persistence/recovery, cashier handover, stock and offline print.
- Final focused rerun of `offlineStatusPanel`, `offlineReadiness`,
  `offlineReliability` and `translate`: **4 suites, 26 tests passed**.
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`: passed.
- ESLint on all seven changed runtime files: passed, using
  `node node_modules/eslint/bin/eslint.js` with those files as arguments.
- `node node_modules/vite/bin/vite.js build`: passed. Existing bundle-size,
  static/dynamic import and old Browserslist warnings remain nonblocking.
- `node scripts/audit-chrome109-css.mjs`: passed for four Counter Grid states.

Root `git diff --check`: passed. No Python/backend change or new schema was
introduced, so backend migration was not run. Test-only failure scenarios log
expected network/draft errors; the test run reported no failed tests.

The six browser screenshots were removed from the repository at the user's
request; they must not be included in the commit.

## Risks / deployment

These are local repository fixes. They have not been deployed to the ERP site.
Deploy the normal frontend build, reload the terminal, and run **Refresh Offline
Data** online so resources previously saved with a null scope are reverified.
Do not clear pending invoices or cache to remove the warning. No new migration is
required for these changes. Repeat the readiness/notification check after deploy;
application offline mode testing does not cover a physical network interruption.

Suggested commit: `fix(offline): preserve sync scope and format recovery notifications`
