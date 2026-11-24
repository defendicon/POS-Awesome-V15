# PR #3167 port without rebranding

## Summary

Branch: `codex/pr-3167-without-rebranding`.
Source: [PR #3167](https://github.com/defendicon/POS-Awesome-V15/pull/3167), commit `ec0cc7b0489823a85d5f9f17ab83e7ffed54b691`.
Ported onto existing branch head `d84b3b60`, preserving later workspace customization, pricing, recovery and exchange work.

The optional interface is named **POS Awesome Retail**. Select it in **POS Profile → POS Interface** on a screen at least 1100px wide. Below 1100px it resolves to Classic. Existing profiles and the Classic default remain unchanged. The orange/ink color replacement applies to the existing POS themes as requested, including the PWA theme color.

Product name, short name, logos, application icons, desktop identity, URLs, and the existing POS Profile custom-branding behavior are retained. The PR's private brand assets, display-name replacements and wordmark swap were omitted. The existing stylesheet-based theme switching remains authoritative rather than restoring obsolete inline color mutations.

## Files changed and reasons

- `frontend/scripts/verify-retail-layout.mjs`: Repeatable browser component harness checking identity, real layout overflow, colors, RTL, cart, discounts and Pay at four viewport sizes; temporary fixtures are cleaned up.
- `frontend/src/posapp/components/navbar/NavbarAppBar.vue`: Register/shift label and desktop clock; retain existing POS Awesome/custom logo and cashier-switch chip; start/stop timer with the Retail presentation.
- `frontend/src/posapp/components/navbar/NavbarMenu.vue`: Retail cashier avatar/name menu trigger; reuse existing actions.
- `frontend/src/posapp/components/pos/Invoice.vue`: Retail sale heading and compact cart inside existing customizable card slots; preserve recovery and expose the detailed price/UOM/batch editor.
- `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`: Use a supported repair-action MDI glyph.
- `frontend/src/posapp/components/pos/invoice/InvoiceActionButtons.vue`: Retail action presentation, Pay amount and F9 hint using the current customizable buttons and exchange behavior.
- `frontend/src/posapp/components/pos/invoice/InvoiceSummary.vue`: Retail discount/total presentation using current values and handlers; retain prorated-return and exchange context.
- `frontend/src/posapp/components/pos/invoice/ItemSalesHistoryModal.vue`: Use a supported empty-history MDI glyph.
- `frontend/src/posapp/components/pos/invoice/ItemsTable.vue`: Use a supported cart-search MDI glyph.
- `frontend/src/posapp/components/pos/invoice/RetailCartList.vue`: Compact cart rows, shared quantity callbacks, return/offer locks, and quick-edit event.
- `frontend/src/posapp/components/pos/invoice_utils/dialogs.ts`: Prevent overlapping Pay saves; release the guard on success, error and early return while retaining missing-price/price-list checks.
- `frontend/src/posapp/components/pos/items/ItemCard.vue`: Retail product tile, size/initials fallback, cart quantity and stock badge; retain keyboard selection and reordering.
- `frontend/src/posapp/components/pos/items/ItemHeader.vue`: Retail search, F2 hint and scanner/tools controls using existing events.
- `frontend/src/posapp/components/pos/items/ItemsSelector.vue`: Group chips/counts, selected price-list label, grid/list toggle, cart badges and Offers/Coupons shortcuts.
- `frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue`: Pass presentation/cart quantities into virtual product cards.
- `frontend/src/posapp/components/pos/items/RetailItemFilters.vue`: Display loaded group counts and current price list, with grid/list selection.
- `frontend/src/posapp/components/pos/shell/BarcodePrinting.vue`: Use a supported verification MDI glyph.
- `frontend/src/posapp/components/pos/shell/Pos.vue`: Select Retail presentation from POS Profile and the shared viewport resolver; preserve mobile and Counter Grid flows.
- `frontend/src/posapp/components/pos/shell/VerificationDialog.vue`: Use a supported verification MDI glyph.
- `frontend/src/posapp/components/ui/CustomizableButtonLayout.vue`: Isolate Retail button preferences from Classic/Counter Grid; make default Retail Pay full width without overriding custom widths.
- `frontend/src/posapp/composables/pos/closing/useClosingSummary.ts`: Use a supported invoice-summary MDI glyph.
- `frontend/src/posapp/composables/pos/items/useItemSelectorLayout.ts`: Retail virtual-card metrics and product-pane sizing.
- `frontend/src/posapp/config/brandPalette.ts`: Imported orange/ink Vuetify light/dark palette, independent of product identity.
- `frontend/src/posapp/plugins/vuetify.ts`: Use the imported palettes while retaining existing theme bootstrap.
- `frontend/src/posapp/posapp.ts`: Load preview visual and Retail layout styles after theme.css.
- `frontend/src/posapp/styles/retail-template.css`: Imported desktop layout/component styles adapted for current customizable cards/buttons, smaller desktop panes, short screens and reduced motion.
- `frontend/src/posapp/styles/retail.css`: Imported global visual/color layer with unused wordmark branding rules removed; update current shared action/focus tokens.
- `frontend/src/posapp/styles/theme.css`: Imported light/dark color tokens; retain current resolved-theme stylesheet architecture and workspace tokens.
- `frontend/src/posapp/utils/posUiTemplate.ts`: Add POS Awesome Retail and its 1100px Classic fallback through the existing resolver.
- `frontend/src/posapp/utils/retailItemLabel.ts`: Shared product/cart size-or-initials label.
- `frontend/tests/buttonLayout.spec.ts`: Verify Retail view isolation and fractional width restoration.
- `frontend/tests/invoiceDialogs.spec.ts`: Verify overlap prevention and recovery after early returns/errors.
- `frontend/tests/retailCartList.spec.ts`: Verify quantities, line removal, return locks and quick-edit forwarding.
- `frontend/tests/retailTemplate.spec.ts`: Verify profile fixture agreement, Classic default, breakpoints and tile labels.
- `posawesome/compat/sales_invoice_reference.json`: Retain a v15 custom-child fallback outside automatic standard-model sync; currency extras remain managed Custom Fields.
- `posawesome/fixtures/custom_field.json`: Expose the new interface and closing reference currency/amount fields; preserve valid Classic default.
- `posawesome/fixtures/property_setter.json`: Preserve closing reference fetch behavior and visible customer field on the core v16 DocType.
- `posawesome/hooks.py`: Register closing-reference fields/setters plus installation and idempotent upgrade ownership hooks.
- `posawesome/patches.txt`: Register ownership migration while retaining all current pre/post-model patches.
- `posawesome/patches/add_pos_ui_template.py`: Expose Retail in profile-field creation/update and document viewport fallback.
- `posawesome/patches/restore_erpnext_sales_invoice_reference.py`: Use ERPNext ownership on v16; preserve/create a custom child on v15; retain existing row data and remove duplicate native currency-field metadata.
- `posawesome/patches/restore_pos_awesome_branding.py`: Retain the Retail option if the existing branding-restoration patch runs.
- `posawesome/posawesome/api/test_pr3167_compatibility.py`: Standalone batch and v15/v16 migration behavior regressions.
- `posawesome/posawesome/api/utilities.py`: Replace obsolete bundle batch helper with dated warehouse-scoped ERPNext availability and quantity validation; preserve current utility imports.
- `posawesome/posawesome/doctype/sales_invoice_reference/__init__.py`: Remove competing standard DocType package; v15 now uses a generic custom child controller.
- `posawesome/posawesome/doctype/sales_invoice_reference/sales_invoice_reference.json`: Stop overwriting ERPNext v16 metadata; legacy v15 schema is retained under compat/.
- `posawesome/posawesome/doctype/sales_invoice_reference/sales_invoice_reference.py`: Remove redundant standard controller; v16 uses core and v15 uses Frappe generic Document.
- `posawesome/www/manifest.json`: Apply orange PWA theme color while retaining POS Awesome names and original icons.
- `docs/PR_3167_PORT.md`: scope, file-by-file explanation, verification and deployment notes for this branch.

## Linked features checked

- POS Profile: template, company/currency, warehouse scope, price-list display, scanner, returns, draft print and customer-display permissions. The new price-list label uses the existing boolean parser.
- Search/cards and cart: existing selection, virtual cards, keyboard hooks, row ordering, quantity callbacks and offer/return locks. Full cart controls remain accessible for UOM, discounts, rates, serials and batches.
- Totals/payments: existing subtotal/discount values and shared handlers; no new pricing or tax calculations. The payment guard retains current missing-price and price-list-switch checks. Exchange status and completion are forwarded in Retail.
- Offline/cache/sync: no schema, queued invoice, pricing cache, cashier authorization or sync transformations changed. Recovery state remains on the existing invoice component.
- Printing/QZ/reporting: no receipt calculation, official print path, invoice payload or report calculation changed. Existing actions are forwarded; the closing summary icon and closing-reference metadata are included.
- Closing/migrations: no submitted closing rows are deleted or rewritten. On v16, ERPNext owns the standard DocType; on v15 the existing child metadata becomes custom to avoid orphan removal. The installation hook prepares the v15 fallback before Custom Field fixtures; the migrate hook also handles a later v15-to-v16 upgrade.

## Commands run and results

- `npm run type-check`: passed.
- `npm run build`: passed, including TypeScript, Vite and the Chrome 109 CSS audit (4 Counter Grid states). Repeated after final runtime changes.
- Affected-file ESLint through `frontend/node_modules/eslint/bin/eslint.js`, including the browser harness: passed. The root config initially could not resolve dependencies because root node_modules is absent; the frontend config/dependencies were used successfully.
- Focused final Vitest run: **14 files / 68 tests passed**, covering Retail, branding, payment guard, workspace cards/buttons, navbar, themes, current cart/payment visuals, Counter Grid visuals and item-card currency/keyboard behavior.
- Full Vitest run: **252 files passed / 3 files failed; 1,348 tests passed / 5 failed**. Four failures reproduce on unchanged `d84b3b60` in a detached baseline worktree: three `customersStore.spec.ts` remote/cache cases and one `itemHeader.spec.ts` New Item case. The fifth was the 100K-catalog performance threshold under concurrent load (15.7s vs 15s); an isolated rerun passed all 9 catalog performance tests. These unrelated baseline failures were not changed.
- `python -m unittest posawesome.posawesome.api.test_pr3167_compatibility posawesome.posawesome.api.test_pos_awesome_branding posawesome.posawesome.api.invoice_processing.test_creation`: **83 tests passed**.
- Python compile check of migration and utilities: passed.
- `$env:POSA_BROWSER_CHANNEL = 'msedge'; node scripts/verify-retail-layout.mjs` from frontend: passed at **1440×900 light/LTR, 1366×768 dark/RTL, 1100×768 light/LTR and 1024×768 Classic fallback**. Actual Vue/Vuetify components checked for page identity, no horizontal overflow, orange Pay color, cart +/-/removal, discount changes and Pay event forwarding. Reduced-motion mode enabled. This is a component harness, not a connected Frappe transaction test.
- `git diff --check`: passed.

## Risks / notes

- No local running Frappe/ERPNext bench/database is available, so live install/migrate, submitted sales, real cashier permissions, product-bundle serial/batch submission and closing reconciliation require a test-site check on ERPNext 15 and 16.
- Offline invoice replay, physical QZ/browser receipts, reports and end-to-end exchanges were not exercised against a live server; their payload/calculation implementations were retained.
- Build output has existing Browserslist/chunk-size warnings. The repository's four reproducible baseline unit failures remain as described above.
- This is a local testing branch; nothing was merged, pushed or deployed.

## Suggested commit message

`feat(pos): port PR 3167 layout and fixes without rebranding`


## Follow-up: compact Retail checkout

Reference inspected: [POSNext InvoiceCart](https://github.com/BrainWise-DEV/POSNext/blob/develop/POS/src/components/sale/InvoiceCart.vue). Its compact header/footer structure was used as a visual comparison; business logic was not imported.

The reported screenshot had only one cart row visible because the old table editor's 320px minimum-height rules, wrapped customer/type controls, large summary and spacious buttons were combined with a fixed-height Retail pane. The previous browser fixture had only two items and a placeholder customer field, so it did not cover this configuration.

### Files changed and reasons

- `frontend/src/posapp/styles/retail-template.css`: compact sale heading, cart rows, totals, actions, product search/filter controls and list rows. Remove the old short-screen workaround that scrolled the entire invoice, and remove full-table minimum heights from compact cart wrappers. Keep coarse-pointer controls larger for touch terminals.
- `frontend/src/posapp/components/pos/Invoice.vue`: enable compact presentation only for Retail, forward compact flags to customer/posting/card components, and move detailed-editor access into the cart heading.
- `frontend/src/posapp/components/pos/invoice/InvoiceCardLayout.vue`: optional compact variant removes the 320px item-card minimum; reserve space for the customization button to avoid overlapping fields. Preserve fractional widths, order, scope and the existing preview/apply/cancel machinery.
- `frontend/src/posapp/components/pos/invoice/InvoiceCustomerSection.vue`: opt-in compact customer/type row, with a narrow-card fallback and unchanged POS Profile visibility and events.
- `frontend/src/posapp/components/pos/invoice/PostingDateRow.vue`: opt-in compact date, price-list and balance layout, preserving configured controls and currency/visibility logic.
- `frontend/src/posapp/components/pos/invoice/RetailCartList.vue`: action slot in the existing cart heading so the detail-editor button no longer consumes a separate row.
- `frontend/src/posapp/components/navbar/NavbarAppBar.vue`: use the existing 56px desktop navbar height for Retail as well.
- `frontend/scripts/verify-retail-layout.mjs`: replace placeholder customer controls with real customer and posting components, reproduce legacy invoice-shell styles directly from the source, and start with 12 rows. Verify loaded fractional card preferences, real visible-row counts, calendar selection, one-pixel pointer/keyboard resizing and Apply/Cancel in LTR/RTL, cart mutations, discount changes and Pay.
- `frontend/tests/postingDateRowBalance.spec.ts`: verify compact mode retains profile-controlled date/price-list/balance controls and customer-balance formatting.
- `docs/PR_3167_PORT.md`: record this follow-up and its verification.

### Linked features and verification

This follow-up changes presentation only. Classic/Counter Grid layout, pricing/UOM/discount/tax calculation, POS Profile authorization, stock checks, payment routing, invoice payload, offline/cache/sync, printing/QZ and report calculations retain their existing implementations. Detailed editing remains accessible through **Edit details**.

- `npm run type-check`: passed.
- `npm run build`: passed, including the Chrome 109 CSS audit for all 4 existing Counter Grid states.
- Affected-file frontend ESLint: passed.
- Focused Vitest run: **12 files / 71 tests passed**, including card/button/workspace customization, columns, customer synchronization, balances, Retail cart/template, navbar, and Classic/Counter Grid visual contracts.
- `$env:POSA_BROWSER_CHANNEL = 'msedge'; node scripts/verify-retail-layout.mjs`: passed. With 12 sample lines, customer/type controls and date/balance enabled, **9 complete rows** were visible at **1920×914**, **7** at **1440×900**, and **4** at **1366×768 dark/RTL** and **1100×768**. These are initial, unscrolled measurements of the actual cart panel. The 1920px and RTL cases also loaded fractional saved card widths. 1024px Classic fallback passed.
- Browser verification also passed actual calendar selection, orange Pay color, cart +/-/removal, discount changes, Pay forwarding, one-pixel pointer and keyboard resizing, and Apply/Cancel. Reduced-motion mode was enabled; no horizontal page overflow was detected.
- `git diff --check`: passed.

The browser fixture uses mocked Frappe services; the connected live site was not deployed or modified. Visible row count can vary with browser zoom, enabled delivery/currency controls, saved layouts and large notices. Physical printing and backend transactions were not rerun for this presentation-only follow-up.

Suggested commit: `fix(pos): compact Retail checkout to show more cart rows`.
