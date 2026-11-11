# Offline reliability phase 2

## Summary

This phase implements failed-invoice recovery, cache readiness policies, saved
cashier carts, and device-local handover summaries. It extends the existing
queues, invoice builder/loader and authorized ERPNext invoice endpoints.

### Operator behavior

- Offline Invoices combines legacy and coordinator records for the current POS
  Profile/company. Failed and exhausted records stay visible with error/attempt
  information, search, Retry and online Reconcile actions. Operations use the
  request ID rather than a sorted table's display index.
- A name/draft/transport acknowledgement is insufficient to finish sync. Only a
  named document with submitted status completes recovery. Lost responses retain
  the original request ID; sync no longer guesses by writing a second draft.
- An unsent offline invoice can be deleted when the profile allows deletion.
  Sent/uncertain invoices require reconciliation. Dual queue copies are removed
  together and stock is released. Manual retries never make a previously sent
  invoice eligible for unsafe local deletion.
- Resource readiness shows last verification, cashier preparation/expiry and
  explicit stock limitations. Checkout applies the active profile's cache policy.
- Each cashier keeps a separate cart for the same user, company, profile,
  warehouse, opening shift and tab. Cart edits save after 200 ms; page hide flushes
  synchronously. A switch first saves the outgoing cart and loads the incoming
  cashier's snapshot through the normal invoice loader. Storage failure can block
  a switch before its PIN request changes the server cashier.
- A recovered cart requires operator review. Queued/submitted sale identities
  cannot reappear as new carts. Offline credentials/supervisor approvals are not
  restored. An active item exchange blocks cashier switching.
- Handover shows offline sales, cash net of change, and pending counts per
  currency for this device/opening/cashier. Transitions are journaled locally and
  included in recovery export. This is not an ERPNext drawer closing or a combined
  balance across terminals.
- Completing invoice sync retains master/reference caches for the next outage.
  Cache-clear flows check for unsynced transactions, intent journals and saved
  carts before deleting. Recovery export includes carts and handover logs.

## POS Profile settings and deployment

| Field | Default | Meaning |
|---|---|---|
| `posa_offline_cache_max_age_hours` | 24 | Age limit for verified resource evidence. |
| `posa_offline_stale_cache_action` | Warn | Warn or Block offline checkout for missing/stale/out-of-scope resources. |
| `posa_allow_offline_customer_credit` | Off | Explicitly permit replay of cached customer-credit sources. Server validation still applies. |

Actual cross-user/profile revision conflicts block offline checkout. The Warn
default retains compatibility with older caches without falsely declaring them
verified. Strict operation should use Block after a complete online preparation.
The cashier grant duration remains independent of this cache-age setting.

Deploy backend and frontend together. Run normal site migration to import the
new POS Profile Custom Field fixtures, then rebuild assets and reload/reprepare
each POS Profile online. No new dependency or Dexie schema version is required.

## Files Changed

- `frontend/src/offline/invoiceAcknowledgement.ts`: shared submitted-document proof.
- `frontend/src/offline/invoiceRecovery.ts`: scoped merged recovery rows, stable-ID
  retry/reconcile/delete, pending counts, dual-copy cleanup and reservation release.
- `frontend/src/offline/invoiceOutbox.ts`: atomic cross-tab claims and lease recovery,
  legacy adoption, strict acknowledgement, visible exhausted records, captured
  journal timestamps and retained completion evidence.
- `frontend/src/offline/invoices.ts`: retains draft/error states, stops speculative
  fallback writes, validates document types, deduplicates stock consumption, and
  routes deletion through shared recovery logic. Legacy/coordinator replay use
  the same backend outbox endpoint, including its existing server-controlled,
  audited opening-shift reconciliation. Successful sync retains caches.
- `frontend/src/offline/writeQueue.ts`: draft lifecycle state and enqueue-created
  information without adding a second persisted business model.
- `frontend/src/offline/stock.ts`: shared signed stock-UOM quantity and pending
  reservation calculation, zero availability preservation, and refresh alignment.
- `frontend/src/offline/sync/adapters/stock.ts`: passes the actual warehouse/profile
  scope when applying server stock snapshots.
- `frontend/src/offline/cashierHandover.ts`: scoped offline sales/cash summaries and
  durable device handover journal using the existing key-value table.
- `frontend/src/offline/db.ts`: protects pending work from cache deletion and adds
  cashier carts/handovers to the existing recovery export. Maintenance prunes
  acknowledged history only; exhausted unsubmitted sales are retained.
- `frontend/src/offline/index.ts`: exposes shared recovery operations.
- `frontend/src/posapp/components/OfflineInvoices.vue`: searchable status/error list
  with Retry/Reconcile and guarded stable-ID deletion; periodically refreshes open UI.
- `frontend/src/posapp/stores/syncStore.ts`: counts all unresolved request IDs rather
  than hiding exhausted/outbox-only records.
- `frontend/src/posapp/utils/offlineReadiness.ts`: pure evaluation of resource age,
  company/profile/warehouse scope and POS Profile Warn/Block policy.
- `frontend/src/posapp/services/offlineReadiness.ts`: reads real persisted evidence
  for the same readiness rules used by checkout and the status panel.
- `frontend/src/posapp/components/navbar/OfflineStatusPanel.vue`: verification times,
  policy, cashier expiry, device stock limitation and scrollable readiness display.
- `frontend/src/posapp/utils/cartRecovery.ts`: versioned, scoped snapshots that omit
  credentials/approvals and keep malformed data available for recovery review.
- `frontend/src/posapp/composables/pos/invoice/useCartRecovery.ts`: debounced/page-hide
  persistence, cashier isolation, existing-loader restoration, queued-ID checks and
  pre-switch storage protection.
- `frontend/src/posapp/components/pos/Invoice.vue`: attaches recovery lifecycle and
  displays recovery/error notices.
- `frontend/src/posapp/components/pos/invoice_utils/document.ts`: preserves a sale's
  stable request ID and selected manual posting time even before ERPNext assigns
  a document name.
- `frontend/src/posapp/components/pos/employee/CashierHandoverSummary.vue`: displays
  scoped currency/cash/pending summaries without claiming an official closing balance.
- `frontend/src/posapp/components/pos/employee/EmployeeSwitchDialog.vue`: handover
  display/logging, cart-save gate before verification and exchange ownership guard.
- `frontend/src/posapp/composables/pos/payments/usePaymentSubmission.ts`: applies
  cache/credit policies, preserves original cashier grants in recoverable intents,
  retains completion evidence and rejects unconfirmed/non-invoice recovery flows.
- `frontend/src/utils/clearAllCaches.ts`: applies pending-data checks before broad
  deletion; keyboard-triggered failures are reported to the operator.
- `posawesome/posawesome/api/offline_sync/invoices.py`: only acknowledges submitted
  documents and rejects order/quotation replay through the invoice endpoint.
- `posawesome/fixtures/custom_field.json`, `posawesome/hooks.py`, and
  `posawesome/patches/reorganize_pos_profile_sections.py`: register and position the
  three POS Profile settings for fixture import/export and new installations.
- New tests: `frontend/tests/offlineReliability.spec.ts`,
  `frontend/tests/offlineReadiness.spec.ts`, `frontend/tests/cartRecovery.spec.ts`.
- `frontend/tests/usePaymentSubmission.spec.ts`: checks checkout policy/credit
  restrictions and retained durable acknowledgement after timeout/retry.
- `frontend/tests/offlineInvoicesDialog.spec.ts`: exercises the merged asynchronous
  recovery-list refresh contract.
- `frontend/tests/employeeSwitchDialog.spec.ts`, `frontend/tests/navbar.spec.ts`:
  provide realistic date boot data for the new exchange-ownership store dependency.
- `frontend/tests/offlineSyncOperational.spec.ts`: checks the profile/warehouse
  scope now passed to the shared stock refresh helper.
- `posawesome/posawesome/api/test_offline_sync_invoices.py`: proves drafts are not
  acknowledged and Orders cannot be replayed as Sales Invoices.
- `docs/FEATURE_CONTRACTS.md`: records linked recovery and handover invariants.

## Linked Features Checked

POS Profile/company/warehouse/opening scope; item rows and stock UOM; discounts,
customer/pricing/tax caches; cashier PIN authorization; cart/payment recovery;
Sales Invoice/POS Invoice payloads; legacy/coordinator queues; invoice timestamps;
submitted receipt sources; exchange ownership; recovery export and cache clearing.
Price, tax and total calculations continue through existing shared paths. No
offline card authorization, cross-terminal stock guarantee, supervisor bypass or
financial closing ledger was introduced.

## Verification

Verified: 226 frontend cases across 39 suites passed. After the final common
replay-endpoint alignment, all 25 cases in the three affected recovery suites
passed again (these are included in the 226, not additional distinct cases).
Python backend suites passed 103 cases; POS Profile form checks passed two cases.
Type-check, changed-runtime ESLint, production build, Chrome 109 CSS audit, JSON
fixture validation and whitespace checks passed. Existing bundle-size and stale
Browserslist-data warnings remain non-blocking.

Commands use installed Node tool entry points because this Windows checkout has
no usable yarn executable shims.

- Frontend: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`.
- Frontend: `node node_modules/vite/bin/vite.js build` and
  `node scripts/audit-chrome109-css.mjs`.
- Frontend: ESLint on changed runtime modules/components.
- Frontend: `node node_modules/vitest/vitest.mjs run offline cartRecovery usePaymentSubmission invoiceDocument invoiceOutbox employeeStore employeeSwitchDialog navbar stockSalePolicy --maxWorkers=2 --minWorkers=1`.
- Final focused rerun: `node node_modules/vitest/vitest.mjs run tests/offlineReliability.spec.ts tests/offlineQueueDurability.spec.ts tests/invoiceOutbox.spec.ts --maxWorkers=2 --minWorkers=1`.
- Root: `node --test scripts/pos_profile_form.test.mjs`.
- Root: Python unittests for offline-sync invoices, cashier grants, employees and
  invoice creation: `python -m unittest posawesome.posawesome.api.test_offline_sync_invoices posawesome.posawesome.api.test_offline_cashier posawesome.posawesome.api.test_employees posawesome.posawesome.api.invoice_processing.test_creation`.
- Root: JSON fixture parsing and `git diff --check`.

## Risks / Notes

- No running ERPNext/Frappe site or printer was available. Bench migration,
  database posting/payment/stock reconciliation, service-worker offline reload and
  physical QZ output must be smoke-tested on staging before production rollout.
  The local environment has no `bench` executable. On the deployment server run
  `bench --site <site> migrate`, `bench build --app posawesome`, and
  `bench --site <site> clear-cache`, then reload and prepare the POS online.
- A browser reload/restored tab keeps automatic cart recovery isolated from other
  live tabs. If the browser discards session storage/tab identity, local snapshots
  remain in recovery export for manual review; they are not automatically taken
  from another tab. Private browsing, storage denial or quota exhaustion is reported.
- The last 200 ms of edits can be lost on abrupt power failure before persistence;
  page-hide flushing covers normal navigation. Queued sales and their request IDs
  are durable. Cashier handover records are device-local, not a server audit ledger.
- A lost server response can make local stock conservatively lower than actual
  stock until reconciliation and another stock refresh. Pending reservations never
  establish the live stock balance of a different disconnected terminal.
- Cached customer credit can be spent on another terminal. Its new profile setting
  defaults Off; enabling it accepts a replay conflict risk. Server credit/stock,
  accounting-period, membership and PIN checks still decide final acceptance.
- Automatic speculative draft fallback was removed because it could hide failures
  or follow an already-committed submit. Existing server drafts remain visible and
  can be retried/reconciled. Online asynchronous background submission stays supported.
- Offline Orders/Quotations are now blocked instead of being incorrectly replayed
  as invoices. Their normal online workflows remain available.

Suggested commit: `feat(offline): add reliable recovery, readiness policies and cashier cart handover`
