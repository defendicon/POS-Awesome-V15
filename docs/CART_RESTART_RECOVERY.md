# Cart recovery after browser or PC restart

## Summary

Same-tab recovery previously required the original sessionStorage tab identity.
The cart itself survived in localStorage, but a fresh browser session could not
find it. Matching saved carts can now be explicitly recovered into an empty sale
after a restart in the same browser profile and origin.

## Behavior and safety

- The terminal user, cashier, company, POS Profile, warehouse and opening shift
  must all match. Normal cashier PIN/authentication and profile rules still apply.
- A browser Web Lock owns the current tab's cart slot until scope change, unmount
  or document/process destruction. No time-based lease can expire underneath a
  slow, sleeping or still-open tab. Cloned sessionStorage gets a separate slot.
- Only snapshots written under that ownership protocol can be adopted across
  browser sessions. Existing v1 snapshots retain same-tab recovery and become
  eligible after a normal successful save under the upgraded controller. Older
  unowned snapshots remain available to the existing recovery export/review.
- The saved-cart panel shows customer, time, item count and stored currency/total.
  It requires an empty active sale. An overlay blocks interaction during adoption.
- Discovery refreshes on focus, storage changes, visibility and a 15-second timer.
  Discovery is advisory: adoption reclaims the source lock and checks its scope
  and durable queue/outbox/journal again before loading.
- The normal invoice loader restores customer, item rows, UOM, discounts, currency
  and payment data. It retains the original client request ID. Credentials and
  below-cost approvals are stripped on both save and read and need revalidation.
- The source is deleted only after loading and destination persistence succeed.
  If loading/storage fails, the source is retained. A partially loaded cart keeps
  its source locked until the controller stops or changes scope.
- The usual submitted/queued invoice checks and backend idempotency identity
  remain the duplicate-accounting protection, including a crash between destination
  persistence and source removal. A transfer is not a localStorage transaction.
- Restart adoption supports normal Sales Invoice/POS Invoice carts. Orders,
  returns and exchanges retain their existing workflows and are not offered here.
- Existing cache-clear protection and recovery export continue recognizing the
  unchanged `posa_cart_recovery_v1:` prefix. No IndexedDB schema migration, new
  backend endpoint, new POS Profile setting or dependency is required.

## Files changed

- `frontend/src/posapp/utils/cartRecovery.ts`: shared validated reads by saved key,
  sanitization, lock acquisition, restart discovery and optional ownership marker.
- `frontend/src/posapp/composables/pos/invoice/useCartRecovery.ts`: lifecycle-owned
  slots, duplicate-tab isolation, scoped candidate discovery and explicit adoption
  through the existing loader, durable duplicate checks and failure retention.
- `frontend/src/posapp/components/pos/invoice/SavedCartRecovery.vue`: saved-cart
  selection and disabled actions while busy or while a current cart exists.
- `frontend/src/posapp/components/pos/Invoice.vue`: connect recovery state/actions
  and show the busy overlay within the existing invoice flow.
- `frontend/tests/cartRecovery.spec.ts`: same-tab regression and restart/locking,
  queue, scope, storage failure, sanitization and lifecycle tests.
- `frontend/tests/savedCartRecovery.spec.ts`: visible sale details, selection
  events and disabled adoption over an active cart.
- `docs/FEATURE_CONTRACTS.md`: document explicit ownership-based restart adoption.

## Linked features

No parallel pricing, UOM, discount, stock, tax or payment calculation was added.
Recovery uses the existing builder/loader and normal checkout validation. Profile
company, warehouse, customer pricing, currency, payment methods and taxes continue
through those shared paths. Invoice payload identity, submission timestamp capture,
cache clearing, outbox recovery, print/QZ and reporting behavior are preserved.

## Verification

Run from `frontend/`:

- `node node_modules/vitest/vitest.mjs run offline cartRecovery savedCartRecovery usePaymentSubmission invoiceDocument invoiceOutbox employeeStore employeeSwitchDialog navbar stockSalePolicy syncCoordinator --maxWorkers=2 --minWorkers=1`:
  **41 suites, 249 tests passed**, including 16 cart recovery tests and the new
  saved-cart selection test. Linked checkout, stock, offline cache, print and
  cashier/sync tests passed.
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`: passed.
- `node node_modules/eslint/bin/eslint.js src/posapp/utils/cartRecovery.ts src/posapp/composables/pos/invoice/useCartRecovery.ts src/posapp/components/pos/invoice/SavedCartRecovery.vue src/posapp/components/pos/Invoice.vue`:
  passed.
- `node node_modules/vite/bin/vite.js build`: passed. Existing nonblocking old
  Browserslist, static/dynamic import and bundle-size warnings remain.
- `node scripts/audit-chrome109-css.mjs`: passed for all four Counter Grid states.
- Root `git diff --check`: passed.

Web Lock tests model exclusive browser ownership and release semantics; they do
not replace a physical browser/PC restart test after deployment. No screenshot
or test log is included in the repository changes.

## Deployment

The user deploys manually through GitHub, server `git pull`, then app build. No
production login or deployment was performed from this workspace. There is no
local `bench` installation or configured production deployment connection.

On the server, use the existing checkout/branch and bench environment:

```sh
# In the existing POS Awesome app checkout, after pushing the reviewed commit:
git pull --ff-only
# In the bench directory:
bench build --app posawesome
bench --site erp.farooqchemical.com clear-cache
```

This frontend change adds no migration. Use the normal update prompt/reload so
the new app bundle and service worker activate. First load the profile online and
refresh offline data before the cold-start test. Never clear unsynced data to
force an update.

## Live checks / limits

1. With an authenticated cashier and open shift, put a disposable test item in an
   unsubmitted cart. Check customer, price, discount, UOM and payment details.
2. Close the browser or restart the PC. Reopen the same browser profile/site and
   authenticate as the same cashier with the same POS Profile and opening shift.
3. Recover the matching saved cart. Verify the rows, customer and amounts; inspect
   payment without creating another production accounting entry just for this test.
4. Keep a cart open in another live tab: it must not be offered for adoption.
   A different cashier/profile/warehouse/opening must not see the cart.
5. A queued/submitted sale must stay in invoice recovery, not become a new cart.

Web Locks must be available (modern Chromium over HTTPS/localhost). If unavailable,
same-tab recovery remains; cross-session adoption is disabled. Browser storage
clearing, private-mode data loss, a different browser profile/device, a closed
opening shift or revoked cashier access require manual review instead. Physical
browser/PC crash and offline cold startup still require the deployed live checks.
Normal snapshots are debounced by 200ms; an abrupt power loss can lose the latest
unsaved edit. A failed transfer can retain more than one snapshot with the same
request ID; never turn such copies into new invoice identities.

Suggested commit: `feat(offline): recover scoped carts after browser restart`
