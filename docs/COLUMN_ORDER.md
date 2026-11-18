# Drag-and-drop column order

Header grips appear while the relevant **Customize workspace** section is open.
The shared editor provides move buttons, Reset section and preview with
Apply/Cancel. See [Workspace customization](WORKSPACE_CUSTOMIZATION.md).

Use the grip beside a table heading to move its column left or right. The edge
indicator previews the insertion point. Alt + Left / Right moves a focused grip;
Escape cancels a drag. Reset section in the inspector restores table presentation
defaults. Clicking the heading title still uses Vuetify sorting.

## Ownership and linked features

`useColumnOrder` owns presentation order only. The existing column selection,
required-column rules, POS Profile settings and responsive filters continue to
own visibility. Remembered keys cannot expose a hidden or unauthorized column,
including conditional pharmacy profit columns. Unknown keys are ignored and
newly available columns are appended using their configured defaults.

Preferences are stored in this browser, scoped by cashier/terminal user,
company, POS Profile, warehouse and table/context. The classic selector,
pharmacy selector and invoice table have separate orders. Optional columns keep
their saved position when hidden and shown again. Invalid/unavailable browser
storage uses a visible warning and a default/session fallback.

The invoice applies order before responsive header processing. Headers, cart
cells, the Counter Grid entry row and keyboard-navigation columns therefore
derive from the same ordered array. Selector body cells use Vuetify's ordered
header list. Selection, row-drag utility columns and invoice expansion remain
in their existing reserved positions.

Column movement does not change item rows, amounts, quantities, UOM, discounts,
customer/price-list/warehouse selection, taxes, payment methods or invoice
payload order. Backend APIs, invoice/offline caches, synchronization, browser/QZ
receipts and report calculations require no transformations for this display
preference.

## Files changed

- `frontend/src/posapp/components/ui/ColumnOrderHeader.vue`: compact grip,
  sorting indicator, reset control and drop-marker styling.
- `frontend/src/posapp/composables/core/useColumnOrder.ts`: shared order,
  scoped persistence, reset and safe storage fallbacks.
- `frontend/src/posapp/composables/core/useRowReorder.ts`: adds an optional
  horizontal axis to the existing shared pointer/keyboard/scrolling behavior;
  vertical row callers retain their default behavior. Includes RTL support.
- `frontend/src/posapp/components/pos/invoice/ItemsTable.vue`: ordered headers
  feed existing responsive/body/entry/keyboard flows and header controls.
- `frontend/src/posapp/components/pos/Invoice.vue`: supplies active cashier scope.
- `frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue`: shared header
  controls and ordered business columns, keeping drag/selection utilities pinned.
- `frontend/src/posapp/components/pos/items/PharmacyItemSearchTable.vue`: same
  behavior for Counter Grid search and existing conditional columns.
- `frontend/src/posapp/components/pos/items/ItemsSelector.vue`: supplies cashier
  scope and isolates header keyboard controls from item-selection shortcuts.
- `frontend/tests/columnOrder.spec.ts`: header/cell agreement, saved keys,
  visibility changes, profile/user/table scopes, reset, RTL, stale preferences
  and storage failures.

## Verification

74 targeted Vitest tests passed covering column and row order, cart editing and
focus, column visibility, pharmacy results, invoice data, Counter Grid entry
and styling, and selector stock wiring. ESLint, production build/type-check,
Chrome 109 CSS audit and build-artifact verification were also run.

Local browser checks used actual selector, invoice and pharmacy components:
mouse/keyboard column moves, header/cell alignment, unchanged invoice row data,
sorting after moving, Counter Grid entry alignment, cashier switching,
reload/reset and row dragging after column changes all passed.

Live ERPNext site verification remains a follow-up; preferences do not sync to
another browser/device.

Suggested commit: `feat(pos): add persistent drag-and-drop table column ordering`
