# Safe Refresh and offline receipt reprint

## Summary

The ERP now offers Safe Refresh from Actions > Tools and intercepts page-focused
Ctrl/Cmd+R, including Shift, when the browser delivers the key event to the page.
The custom dialog saves the cashier cart and waits for persistence, reports
pending invoices/other transactions, and checks again before refreshing. Failed
saves or active payment, recovery, exchange or sync operations block navigation.

Offline Invoices now offers **Reprint receipt** for saved pending/review entries.
It reads the durable sale again and prints a labelled local copy with original
request ID, posting date/time, items, UOM, amounts, taxes and payments. No invoice
is created/submitted, no reservation is released, and no retry state is changed.

## Working behavior

- Safe Refresh is a normal app reload that preserves offline storage. It does not
  force a browser cache purge. The update prompt applies new service-worker builds
  through the same confirmation gate; cancellation restores the update prompt.
- Cart persistence uses the existing builder and scoped recovery controller.
  Storage failure, incomplete recovery scope, or an active exchange rejects the
  refresh. Payment submission/loading has an independent synchronous veto.
- Pending counts come from the shared merged recovery reader and durable write
  queue. A real coordinator run blocks refresh. Persisted active delivery claims
  use the same five-minute lease as write queue/outbox/recovery logic. Expired
  crashed claims are retained, counted and left for normal recovery, not deleted.
- Counts and persistence are rechecked on confirmation. Cancellation never
  triggers the reload callback. Browser-cancelled navigation offers Cancel/Retry
  after five seconds instead of trapping the operator behind a permanent spinner.
- Refresh from language changes, successful cache-clear completion and Alt+Home
  uses the gate too. Boot recovery, authentication/navigation and browser toolbar
  actions retain their own established behavior.
- Reprint revalidates POS Profile/company and document type from the saved record.
  Profile-disabled server-draft printing is blocked. A pending offline checkout
  is distinguished from a server draft and is labelled pending server sync.
- Browser preview/new-tab, raw/silent printing, configured QZ printer/width and
  cached template behavior use existing POS Profile settings. Missing/unrenderable
  cached formats retain the existing sanitized fallback template.
- HTML prints **OFFLINE COPY — PENDING SERVER SYNC** (or **DRAFT COPY — NOT
  SUBMITTED**) above the cached/fallback format, with a stable request reference.
  Raw receipts include the same status/reference. First offline prints use the
  same service with an offline-sale label instead of a copy label.
- Raw printing receives the provided local document (`localOnly`) instead of
  requesting a replacement server invoice. HTML QZ prints the same local HTML.
  QZ signing/certificates/connection can still require the configured service.
  Uncertain print errors ask before browser fallback to avoid automatic duplicates.
- The print window is reserved before asynchronous reads. Popup blocking and
  printing errors are surfaced. A print failure after checkout is reported as a
  receipt failure and does not retry or undo the saved sale.
- The last-offline-sale button routes to pending local reprint, including after
  reconnect. Its request ID is never sent to `/printview` as a server docname.
  After successful sync, use the official receipt in Invoice Management/history.
  This phase does not add an offline archive of all previously submitted receipts.

## Files changed and why

- `frontend/src/posapp/services/safeRefresh.ts`: shared request/preparation events,
  persistence gate, pending counts and active/expired sync checks.
- `frontend/src/posapp/components/ui/SafeRefreshDialog.vue`: ERP confirmation,
  retry/cancel handling, page shortcut and delayed-navigation recovery. It does
  not instantiate invoice state before Frappe/offline bootstrap is ready.
- `frontend/src/posapp/layouts/DefaultLayout.vue`: mount the global dialog.
- `frontend/src/posapp/components/navbar/NavbarMenu.vue`: Safe Refresh action and
  language-reload routing.
- `frontend/src/posapp/components/Navbar.vue`: route successful cache-clear reload
  through the shared gate.
- `frontend/src/posapp/components/pos/invoice/invoiceShortcuts.ts`: defer Alt+Home
  navigation until refresh confirmation.
- `frontend/src/posapp/components/ui/UpdatePrompt.vue`: gate update activation and
  restore the original prompt after cancellation.
- `frontend/src/posapp/composables/pos/invoice/useCartRecovery.ts`: synchronous
  refresh save/veto, scoped-cart validation and exchange/recovery protection.
- `frontend/src/posapp/components/pos/Payments.vue`: payment-in-flight veto and one
  shared print-error handler for both offline submission/shortcut paths.
- `frontend/src/offline/sync/SyncCoordinator.ts`: expose actual in-flight execution
  separately from persisted state, so long-running local sync is not interrupted.
- `frontend/src/offline/writeQueue.ts`: export the existing delivery lease constant.
- `frontend/src/offline/invoiceOutbox.ts` and `frontend/src/offline/invoiceRecovery.ts`:
  share that constant with refresh checks without changing delivery durations.
- `frontend/src/posapp/services/offlineReceiptPrint.ts`: immutable, scoped queued
  reprint and shared local browser/QZ printing with explicit fallback handling.
- `frontend/src/posapp/components/OfflineInvoices.vue`: per-entry receipt action
  and visible error handling.
- `frontend/src/offline_print_template.ts`: immutable paid/change preparation,
  credential stripping and escaped copy/status/reference banners for both cached
  templates and fallback HTML.
- `frontend/src/posapp/services/rawDocumentPrint.ts`: explicit local-only document
  source and raw status/reference labels.
- `frontend/src/posapp/composables/pos/payments/usePaymentPrinting.ts`: delegate
  first offline receipt output to the same shared local printer.
- `frontend/src/posapp/composables/pos/payments/usePaymentSubmission.ts`: remember
  a local last-receipt reference only after successful durable offline save.
- `frontend/src/posapp/composables/core/useLastInvoicePrinting.ts`: route local IDs
  to local reprint and surface errors; preserve online/exchange printing paths.
- `frontend/tests/safeRefresh.spec.ts`: save failure, counts, active sync,
  persistence failure and expired-claim retention.
- `frontend/tests/safeRefreshDialog.spec.ts`: explicit consent, retry/cancel,
  page-focused hard-refresh interception and browser-cancelled navigation.
- `frontend/tests/offlineReceiptPrint.spec.ts`: immutable receipt identity/data,
  scope/draft permissions, raw/HTML QZ, preview, fallback consent and popup errors.
- `frontend/tests/cartRecovery.spec.ts`: integration of cart save, storage failure
  and exchange veto with Safe Refresh.
- `frontend/tests/offlinePrintTemplate.spec.ts`: cached-format labels, original
  time, net paid amount, escaping and source-payload immutability.
- `frontend/tests/rawDocumentPrint.spec.ts`: local receipt labels with no invoice
  fetch.
- `frontend/tests/syncCoordinator.spec.ts`: real in-flight lifecycle visibility.
- `frontend/tests/useLastInvoicePrinting.spec.ts`: local IDs never become server
  print URLs after reconnect.
- `frontend/tests/updatePrompt.spec.ts`: update activation stays behind the gate
  and cancellation restores the update prompt.
- `docs/FEATURE_CONTRACTS.md`: document refresh and pending-receipt contracts.

## Linked features checked

POS Profile remains authoritative for company, warehouse, pricing, customer price
list, currency, taxes, payment methods, print format and print permissions. No
parallel item-price, discount, UOM, stock or tax calculation was introduced.
The existing offline paid-minus-change preparation now also feeds raw copies.
Cart/payment totals, queued payloads, invoice IDs/timestamps, sync retry state,
stock reservations, opening/closing, exchanges, server print and reports retain
their existing business behavior. No backend method, IndexedDB schema, fixture,
POS Profile field or dependency was added.

## Verification

Run from `frontend/`:

- `node node_modules/vitest/vitest.mjs run offline cartRecovery savedCartRecovery safeRefresh usePaymentSubmission usePaymentPrinting useLastInvoicePrinting invoiceDocument invoiceOutbox invoiceShortcuts employeeStore employeeSwitchDialog navbar stockSalePolicy syncCoordinator rawDocumentPrint documentPrint updateStore updatePrompt sw-updater useInvoicePrinting invoiceShortcutListener --maxWorkers=2 --minWorkers=1`:
  **52 suites, 338 tests passed**.
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`: passed.
- ESLint via `node node_modules/eslint/bin/eslint.js` on all 20 changed/new runtime
  files: passed.
- `node node_modules/vite/bin/vite.js build`: passed. Existing nonblocking bundle
  size, static/dynamic import and old Browserslist warnings remain.
- `node scripts/audit-chrome109-css.mjs`: passed for four Counter Grid states.
- Root `git diff --check`: passed.

Coverage includes failed cart/storage saves, UI confirmation and cancellation,
active/expired sync claims, real coordinator execution, update handoff, immutable
queued receipt values, scope/draft permission checks, local raw printing without
invoice fetch, cached-template sanitization, popup errors and consent after QZ
failure. Tests use browser/printer doubles, so the physical checks below remain.
No backend code changed and no local bench was available; no migration was run.

## Deployment and live verification

The user handles GitHub push, server `git pull` and build. This workspace has no
local bench or configured production deployment connection; no production write,
server deployment, real invoice submission or physical printer job was performed.

After the reviewed commit is pushed, use the existing app checkout/bench:

```sh
git pull --ff-only
bench build --app posawesome
bench --site erp.farooqchemical.com clear-cache
```

No new migration is required for this frontend phase. Reload using the normal
update flow; prepare the profile/caches online first. Then verify on the terminal:

1. Put a disposable item in a cart and open Actions > Tools > Safe Refresh.
   Confirm that the saved-cart notice and pending counts appear. Cancel once;
   the cart must remain. Then confirm and check same-cashier recovery after reload.
2. During payment submission or active sync, refresh must explain why it is
   blocked. A failed storage save must keep the app open.
3. In Offline Invoices, reprint an existing pending sale. Compare its original
   date/time, currency, UOM, discounts, taxes, paid/change and total with the saved
   sale. Printing must not increase invoice count or change stock/sync state.
4. Check preview-only, configured raw/silent QZ, printer-disconnect consent and
   browser fallback on the actual printer. Cancel fallback once to check that no
   automatic second copy is dispatched.
5. After sync, use the server invoice's official history receipt, not its local
   request reference. Check normal online and combined exchange receipts too.

Browser toolbar/address-bar/reserved refresh shortcuts may bypass page key
handlers, and browser-native leave/reload warnings cannot be replaced with ERP
text. Safe Refresh preserves cached work; it is not a browser hard-cache purge.
Physical QZ output, printer signing availability while disconnected, and a real
browser hard-refresh/update still require deployed terminal checks. Saved carts
remain subject to browser storage durability and the existing 200ms snapshot
debounce. No screenshots or temporary test logs are included in the changes.

Suggested commit: `feat(offline): add safe refresh and pending receipt reprint`
