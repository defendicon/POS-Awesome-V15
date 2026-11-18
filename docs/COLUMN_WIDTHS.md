# Adjustable table column widths

Open **Customize workspace** and select the relevant table before resizing.
The consolidated editor provides pixel inputs, Reset section and preview with
Apply/Cancel. See [Workspace customization](WORKSPACE_CUSTOMIZATION.md).

Drag the divider at a heading's trailing edge to make that column narrower or
wider. All displayed business columns and the selector row/selection controls
and invoice details column support resizing. Widths snap to whole pixels with
minimum sizes that keep controls usable and a maximum of 1600px.

A focused divider supports Left / Right in 10px steps, Shift + Left / Right in
50px steps, and Home to reset that column. Double-click also resets a single
column. Escape, pointer cancellation and loss of window focus cancel an active
resize. Reset section in the inspector restores the table presentation defaults;
individual divider resets retain the other columns' settings.

## Shared ownership and linked flows

`useColumnWidths` owns width measurement, live preview, keyboard resizing,
cancellation, validation and persistence. It freezes neighbouring displayed
widths at drag start so resizing one column does not unexpectedly stretch the
others. The header and body use the same fixed pixel widths; overflow scrolls
inside the table rather than widening the page. Untouched tables retain their
existing automatic/responsive sizing.

Width preferences use a separate browser key from column order, with the same
cashier/terminal user, company, POS Profile, warehouse and table/context scope.
Hidden columns retain their widths, and reordering carries widths by column key.
Newly available columns use their configured/default widths. Corrupt or blocked
storage falls back to defaults/session settings with a visible warning.

The invoice applies widths after its existing responsive visibility filter and
uses that same header array for cart cells, Counter Grid entry cells and keyboard
navigation. Resizing cannot expose a hidden/profile-controlled column. Existing
sorting, row dragging, column dragging, search and selection remain separate.

No item values, pricing rules, discounts, UOM, taxes, stock, customer/price-list
resolution, payment settings, invoice payloads, offline invoice data, sync,
browser/QZ receipts or report calculations are transformed by this preference.

## Files changed

- `frontend/src/posapp/composables/core/useColumnWidths.ts`: shared resize,
  measurement, bounds, reset, scope and persistence behavior.
- `frontend/src/posapp/components/ui/ColumnResizeHandle.vue`: accessible divider
  and shared fixed-width/scrolling styles.
- `frontend/src/posapp/components/ui/ColumnOrderHeader.vue`: divider and separate
  width reset, with titles available for truncated headings.
- `frontend/src/posapp/components/pos/invoice/ItemsTable.vue`: widths shared by
  headers/body/entry rows, including details, with event isolation from row and
  column dragging.
- `frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue`: widths for
  business columns and reserved drag/selection controls.
- `frontend/src/posapp/components/pos/items/PharmacyItemSearchTable.vue`: same
  resizing behavior for Counter Grid search.
- `frontend/src/posapp/components/pos/items/ItemsSelector.vue`: excludes divider
  keys from parent item-selection shortcuts.
- `frontend/tests/columnWidths.spec.ts`: measurement, exact width preview,
  adjacent-column stability, save/reload, cancellation, RTL/keyboard, bounds,
  reset, visibility/order changes, user/profile scope and storage fallbacks.

## Verification and limits

83 targeted tests passed, covering widths, ordering, invoice data and totals,
cart editors/focus, responsive columns, Counter Grid, and selector stock wiring.
ESLint, production build/type-check, Chrome 109 CSS audit and build-artifact
verification were run.

Local browser checks used actual selector, invoice and pharmacy tables. They
verified exact pixel growth/shrinkage, unchanged neighbouring widths, reserved
control columns, unchanged invoice row values, reordered-column widths,
Counter Grid entry alignment, cashier scope, reload/reset, keyboard adjustment,
Escape cancellation and contained scrolling at 600px and 390px.

Preferences remain local to this browser. Live ERPNext site verification is a
follow-up; the UI change requires no backend migration.

Suggested commit: `feat(pos): add persistent adjustable table column widths`
