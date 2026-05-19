# Stage Develop Code Audit

## Verification Basis

This audit was written from the current repository state and spot-checked against the local `stage-develop` ref where earlier claims appeared to disagree with the checked-out worktree.

Commands used for verification:

- `rg -n "v-html" frontend/src`
- `git show stage-develop:frontend/src/posapp/components/pos/customer/Customer.vue | Select-String -Pattern "v-html" -Context 1,1`
- `rg -n "itemsData|watch\\(|deep:\\s*true" frontend/src/posapp`
- `git show stage-develop:frontend/src/posapp/stores/invoiceStore.ts | Select-String -Pattern "deep|watch\\(" -Context 1,2`
- `rg -n "RecycleScroller|virtual|ItemsSelector" frontend/src`
- `rg -n "Payments\\.vue|PayView\\.vue|PayView|Payments" frontend/src docs`
- `rg -n "ignore_permissions|@frappe\\.whitelist" posawesome -g "*.py"`
- `rg -n "assert_pos_profile_write_allowed|_assert_customer_write_allowed|_assert_pos_write_allowed|ignore_permissions" posawesome/posawesome/api -g "*.py"`
- `Get-Content package.json`
- `Get-Content eslint.config.mjs`

## 1. Confirmed Issues

- `Customer.vue` XSS issue is confirmed on the local `stage-develop` ref. The dropdown renders customer-controlled fields with `v-html` for ID, TAX ID, Email, Mobile No, and Primary Address. Those fields come from customer/database data and must be rendered through Vue text interpolation or equivalent text binding.
- `Customer.vue` in the checked-out worktree no longer contains `v-html`, and `frontend/tests/customerDropdownXss.spec.ts` exists. Keep the issue marked confirmed for `stage-develop`, but do not re-open it if the fix branch is being audited.
- Root Electron packaging still includes `node_modules/**/*` in `package.json` `build.files`. That can ship build-time and frontend dependencies into the desktop installer even though the Electron runtime shell appears to need only `electron/**/*`, package metadata, and `electron-store` with production transitive dependencies.
- `invoiceStore.itemsData` remains a sensitive API surface. The checked-out worktree exposes the raw reactive `Map`, but direct cart item mutations need to go through store-mediated helpers such as `updateItemWithTotals(rowId, updater)` so totals remain synchronized.
- `PayView.vue` is the current route-level payment page for `/payments` in `frontend/src/posapp/router/index.ts`. Older audit notes that call this route component `Payments.vue` are ambiguous because `frontend/src/posapp/components/pos/Payments.vue` still exists for POS shell/dialog payment flows.

## 2. Outdated/Incorrect Previous Audit Claims

- The blanket claim that `invoiceStore` currently relies on a deep `itemsData` watcher is outdated for the checked-out worktree if no active watcher exists. The current file still has stale comments mentioning a deep watcher, but the active total-maintenance path is store-mediated recalculation/delta updates. Note: the local `stage-develop` ref still contains a deep `watch(itemsData, ..., { deep: true })`, so this claim depends on the exact ref under review.
- The claim that `ItemsSelector` card view has no virtualization is outdated. `frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue` uses `RecycleScroller` from `vue-virtual-scroller`, and table view uses Vuetify virtual table components.
- The claim that the payments route component is `Payments.vue` is outdated for the route page. The current `/payments` route imports `frontend/src/posapp/components/pos/shell/PayView.vue`.
- The advice to blindly remove `ignore_permissions` is incorrect. POS write flows often need controlled permission bypasses for ERPNext document creation; the safer direction is to add explicit authorization guards before the bypass and reduce `ignore_permissions` only after behavior is proven.

## 3. Security Issues

- Confirmed on local `stage-develop`: `Customer.vue` dropdown `v-html` creates an XSS risk for customer fields. Fix by replacing `v-html` with interpolation/text binding and keeping the regression test that asserts `<img>` or `<script>` payloads are rendered as literal text.
- Electron packaging includes full `node_modules/**/*`. This increases installer size and attack surface by bundling dev tooling, tests, CLIs, source maps, and unrelated frontend packages. The safer strategy is documented in `docs/electron/packaging-audit.md`.
- Public/whitelisted write APIs must be reviewed as security boundaries. Any method that writes documents with `ignore_permissions` should validate the current user, POS Profile, company, and feature flag before document creation.
- Guest-allowed callbacks such as M-Pesa endpoints need separate review because their threat model differs from authenticated POS operator APIs.

## 4. Backend Permission Risks

- `ignore_permissions` should not be removed blindly from invoice, payment, purchase, shift, gift card, cash movement, and customer flows. Removal can break valid POS workflows where the POS Profile intentionally allows a cashier to create ERPNext documents through controlled backend methods.
- A centralized helper now exists in `posawesome/posawesome/api/utils.py`: `assert_pos_profile_write_allowed(pos_profile, action_flag=None, company=None)`. It blocks Guest users, verifies POS Profile existence when provided, checks company compatibility, and checks an optional POS Profile flag.
- Purchase order write APIs in the checked-out worktree call the helper before document creation, while preserving specific flags such as `posa_allow_create_purchase_suppliers`, `posa_allow_create_purchase_items`, `posa_allow_purchase_order`, and `posa_allow_purchase_receipt`.
- Customer write APIs in the checked-out worktree call customer write validation for `create_customer`, `set_customer_info`, and `make_address`. Missing or weak POS Profile context remains a risk for any alternate wrapper or legacy endpoint that can reach those writes without the expected arguments.
- Remaining areas that still need authorization guard review include invoice creation/submission, payment entry creation, stored value/gift card writes, employee/user writes, shift opening/closing, sales order/quotation writes, cash movements, and M-Pesa write paths.

## 5. TypeScript/Tooling Issues

- `eslint.config.mjs` now includes `**/*.ts` and `**/*.tsx` in the main lint target and configures `@typescript-eslint/parser` through `vue-eslint-parser`. This corrects the previous direct-TypeScript lint coverage gap in the checked-out worktree.
- The current ESLint config keeps rules relatively light, using warnings for common legacy issues rather than introducing a strict TypeScript rule set. That is appropriate for avoiding hundreds of unrelated lint failures.
- Continue to run both lint and type-check because ESLint is not a substitute for Vue/TypeScript type validation.
- Electron packaging validation is separate from frontend type-check/build validation. Packaging changes should run `yarn electron:smoke` and a Windows Electron Builder job in addition to frontend checks.

## 6. Performance/Architecture Issues

- `ItemsSelector` already uses virtualization in card and table views, so the performance focus should move from "add virtualization" to verifying buffer sizing, lazy loading thresholds, search responsiveness, and large POS Profile item sets.
- `invoiceStore.itemsData` exposes a raw reactive `Map`. This is efficient for keyed cart rows but creates an architecture risk when external components mutate row fields directly and bypass total updates. Prefer explicit mutation helpers and treat direct reads as safe only when they do not mutate cart rows.
- `PayView.vue` remains a large route-level orchestration component. A docs-only split plan exists in `docs/refactor/payview-split-plan.md` with micro PRs for route readiness, party selection, reconciliation state, submit/print orchestration, and gradual Options API migration.
- `Reports.vue` remains large and should be split carefully with characterization tests. A docs-only split plan exists in `docs/refactor/reports-vue-split-plan.md`.
- Electron desktop packaging currently bundles too broadly. Use a staged production app directory before narrowing `build.files`.

## 7. Suggested PR Order

1. Land or verify the `Customer.vue` XSS fix on `stage-develop`, including `frontend/tests/customerDropdownXss.spec.ts`.
2. Land POS authorization helper coverage and apply the helper to high-risk write APIs before reducing any `ignore_permissions` usage.
3. Audit remaining whitelisted backend write APIs in batches: invoice/payment first, then stored value/gift card, shifts, cash movement, purchase/sales/quotation flows.
4. Enforce `invoiceStore.itemsData` mutation discipline by replacing direct external mutations with `updateItemWithTotals(rowId, updater)` and fixing stale comments about any removed deep watcher.
5. Keep TypeScript lint coverage minimal and stable; only tighten rules after existing warning volume is known.
6. Implement staged Electron packaging so the installer no longer includes full root `node_modules`.
7. Refactor `PayView.vue` using the documented micro PR sequence.
8. Refactor `Reports.vue` using the documented micro PR sequence.

## 8. Verification Commands

Frontend safety checks:

```bash
cd frontend
yarn test:unit
yarn type-check
yarn build
```

Root tooling checks:

```bash
yarn lint
yarn electron:smoke
```

Backend syntax checks for changed Python files:

```bash
python -m py_compile posawesome/posawesome/api/utils.py
python -m py_compile posawesome/posawesome/api/customers.py
python -m py_compile posawesome/posawesome/api/purchase_orders.py
```

Focused backend tests where available:

```bash
python -m unittest posawesome.posawesome.api.test_pos_authorization
python -m unittest posawesome.posawesome.api.test_purchase_orders
```

Windows Electron packaging checks:

```powershell
yarn build
yarn verify:build
yarn electron:smoke
yarn electron:build:win
yarn electron:smoke --require-artifact
```

Manual verification should include POS customer search, quick customer creation, cart item mutation flows, payment submit/print, offline sync, POS Profile company/payment-method behavior, and installed Windows desktop launch/settings/offline flows.
