# Offline cashier and invoice posting time

## Summary

Assigned cashiers can unlock or switch a prepared, existing POS terminal while
offline using their own PINs. Each queued invoice carries a signed cashier grant
and its captured sale instant. Reconnection preserves the original cashier and
posting date/time instead of using the terminal cashier or clock at sync time.

Preparation: assign enabled users in POS Profile User, set their PINs in User,
then open the POS Profile online on each device. **Offline Cashier Access Duration
(Hours)** on POS Profile accepts 1 to 168 whole hours and defaults to 24. A
duration change takes effect when the terminal opens that profile online again
and receives newly issued grants. The Offline Status panel shows the actual
expiry of cached access. A previously authenticated, cached POS session and existing
opening shift are required. Full Frappe account login and new shift creation
still require connectivity. Use HTTPS for browser Web Crypto support.

After deploying the duration setting, run `bench --site <site> migrate` to load
the POS Profile field and build the frontend. Save the duration on the profile,
reload each terminal online, and check the expiry in Offline Status before
testing an offline cashier switch.

## Files Changed

- `frontend/src/posapp/utils/offlineCashier.ts`: stores encrypted grants under
  the session user/profile scope, decrypts with PBKDF2/AES-GCM, checks local
  scope/expiry, and persists five-attempt/five-minute PIN throttling.
- `frontend/src/posapp/components/Navbar.vue`: requests offline grants with the
  authorized employee list, caches them, restores the selector without network
  requests offline, and allows local terminal locking offline.
- `frontend/src/posapp/components/pos/employee/EmployeeSwitchDialog.vue`: uses
  cached PIN decryption offline and retains a replay grant after online PIN
  verification; explains device preparation and access duration.
- `frontend/src/posapp/stores/employeeStore.ts`: holds the unlocked replay grant
  in memory, clears it on locks/profile loading/server-state changes, and tracks
  when online cashier verification is required after an offline switch.
- `frontend/src/offline/invoiceTimestamp.ts`: captures original posting time,
  site-local posting date, and UTC sale instant once; respects manual posting.
- `frontend/src/offline/invoices.ts`: applies the shared timestamp helper before
  writing either queue so persisted retries retain the original sale time.
- `frontend/src/posapp/composables/pos/payments/usePaymentSubmission.ts`: binds
  offline sales to the verified cashier grant, aligns receipt timestamps with
  queued data, and requires online verification before the first online sale
  after an offline cashier switch.
- `posawesome/posawesome/api/offline_cashier.py`: issues PIN-encrypted signed
  grants, checks session user/profile/sale validity, and revalidates assignment,
  enabled status and current PIN when replaying.
- `posawesome/posawesome/api/employees.py`: prepares grants only for enabled
  assigned cashiers with configured PINs when explicitly requested by the client.
- `posawesome/posawesome/api/invoice_processing/creation.py`: resolves replay
  cashier identity through one shared validator for draft creation and submit,
  including nested new-draft creation; preserves normal terminal authorization.
- `frontend/tests/offlineCashier.spec.ts`: real Web Crypto decryption, incorrect
  PIN throttling, profile/session isolation, expiry, and store locking.
- `frontend/tests/invoiceTimestamp.spec.ts`: timezone midnight rollover, stable
  retry timestamps, explicit manual dates/times, and old boot data fallback.
- `frontend/tests/employeeSwitchDialog.spec.ts`: verifies offline unlock makes
  no server request; isolates network/decryption dependencies in dialog tests.
- `frontend/tests/navbar.spec.ts`: verifies an offline reload restores prepared
  cashiers, remains locked until PIN verification, and makes no cashier API request.
- `frontend/tests/usePaymentSubmission.spec.ts`: verifies offline payload
  timestamps/grant alongside loyalty redemption and online re-verification.
- `posawesome/posawesome/api/test_offline_cashier.py`: encryption, signature
  tampering, scope, PIN revocation, disabled cashier, expiry and replay bounds.
- `posawesome/posawesome/api/test_employees.py`: checks opt-in grant preparation
  for assigned cashiers; makes the existing unit harness runnable without Frappe.
- `posawesome/posawesome/api/invoice_processing/test_creation.py`: checks original
  offline cashier and same-day time survive submission while the terminal is locked.
- `docs/FEATURE_CONTRACTS.md`: documents the new shared authorization/time contract.
- `docs/OFFLINE_CASHIER_UPGRADE.md`: implementation, verification and rollout notes.

## Linked Features Checked

- POS Profile authorization, company, assigned users and existing opening-shift
  ownership remain server-controlled. No new hardcoded warehouse, customer,
  price list, currency, payment, tax or print defaults are introduced.
- Item search, cart rows, pricing rules, discount percentage/amount, UOM,
  customer price list, warehouse, stock checks, cart totals and payment methods
  keep their existing calculation/configuration paths. Relevant invoice and
  payment regression tests exercise the unchanged payload calculations.
- Both legacy write queue and coordinator outbox keep the grant and original
  timestamp. The shared backend path covers sync and draft fallback. Existing
  idempotency and shift validation remain in force; IndexedDB schema is unchanged.
- Offline browser/QZ receipt sources receive the captured posting fields before
  print. Server receipts and invoice/history/report flows use persisted posting
  fields and `posa_cashier`; their calculations are unchanged. Hardware QZ output
  and a real ERPNext database require deployment smoke testing.
- Offline users receive no supervisor privilege from cached metadata. Existing
  online-only gift-card redemption/exchange and supervisor approval rules remain.

## Commands Run

Run from `frontend` unless otherwise specified. Local Windows dependency folders
have no usable executable shims, so installed tools were invoked with Node.

- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit` — passed.
- `node node_modules/vite/bin/vite.js build` — passed.
- `node scripts/audit-chrome109-css.mjs` — passed.
- `node node_modules/eslint/bin/eslint.js src/offline/invoiceTimestamp.ts src/offline/invoices.ts src/posapp/utils/offlineCashier.ts src/posapp/stores/employeeStore.ts src/posapp/components/Navbar.vue src/posapp/components/pos/employee/EmployeeSwitchDialog.vue src/posapp/composables/pos/payments/usePaymentSubmission.ts` — passed.
- `node node_modules/vitest/vitest.mjs run tests/offlineCashier.spec.ts tests/invoiceTimestamp.spec.ts tests/employeeStore.spec.ts tests/employeeSwitchDialog.spec.ts tests/navbar.spec.ts tests/usePaymentSubmission.spec.ts tests/invoiceDocument.spec.ts tests/invoiceOutbox.spec.ts tests/offlineQueueDurability.spec.ts tests/offlinePrintTemplate.spec.ts --maxWorkers=2 --minWorkers=1` — 88 tests passed across 10 suites.
- Repository root: `python -m unittest posawesome.posawesome.api.test_employees posawesome.posawesome.api.test_offline_cashier posawesome.posawesome.api.invoice_processing.test_creation` — 97 tests passed.
- `git diff --check` — passed.

## Risks / Notes

- This change has not been deployed to a running Frappe/ERPNext site. Bench build,
  real posting/stock-ledger validation, browser offline reload, physical QZ printing,
  closed-shift reconciliation and cashier reports need a staging smoke test.
- Offline access requires the prepared browser/device and cached terminal session.
  Cache clearing removes prepared access. Missing/expired cache requires online
  preparation; it does not bypass PIN verification.
- The default offline grant is 24 hours. The replay limit remains 30 days after
  capture. Replay checks the signed expiry issued with each original grant, so
  a duration change does not invalidate already captured sales.
  A changed PIN, disabled cashier, removed assignment, changed site encryption key,
  unauthorized terminal session or invalid posting period can prevent replay.
  Failed invoices remain available for review/retry under existing queue behavior.
- Device time must be correct. Site timezone comes from cached boot configuration;
  old boot data falls back to device timezone. Manual accounting dates/times remain
  supported. Frappe's audit `creation`/`modified` timestamps remain server timestamps;
  the sale's business date/time is `posting_date`/`posting_time`.
- Old queued invoices lacking a recorded original time cannot reliably recover it.
  Their existing sync compatibility is preserved; the new capture applies to new saves.
- Browser PIN throttling is best effort on a trusted terminal. Local device/browser
  administrators can clear browser storage; server-side replay validation remains
  authoritative. Decrypted replay grants are held in memory and queued invoices;
  PINs are never persisted as plaintext.
- Preparing grants performs one PBKDF2 derivation per cashier; unusually large
  profiles may need startup performance validation on the deployment server.
- Cryptography is already a Frappe dependency; no repository dependency was added.
  It was installed into the local Python test environment for standalone tests.

## Follow-up Suggestions

On staging: load two assigned cashiers online, disconnect, switch by PIN, create
sales before/after midnight, reload offline and unlock again, then reconnect and
sync. Confirm each invoice's posting fields/cashier, stock, payments, receipt and
daily/hourly cashier reports. Verify the next online sale requires online PIN
confirmation, and test a revoked PIN with a queued invoice.

Suggested commit: `feat(offline): support cashier PIN switching and preserve sale timestamps`
