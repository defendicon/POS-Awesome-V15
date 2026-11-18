# Item selector and invoice row ordering

Drag the small grip beside a row to move it before or after another row. The
highlighted edge previews the insertion position. Escape cancels a drag; a
focused grip also supports Alt + Up / Down. Row clicks, text editing and native
selector-to-cart drag-to-add retain their existing flows.

## Ownership and linked behavior

- `useRowReorder` owns pointer handling, drop markers, cancellation and scrolling.
  It accepts drops only inside its own table/selector, using stable row keys.
- `rowOrder` handles before/after insertion and the currently rendered sorted
  slice. Filtered or unrendered rows retain their relative order.
- Selector order is a browser preference scoped by cashier/terminal user, POS
  Profile, warehouse and purchase/POS context. It is applied after existing
  search filters and result limits, so it cannot expose out-of-scope items or
  expand a limited server result. Fresh cached/API item objects retain current
  prices and stock; preferences contain item codes only. List, card and Counter
  Grid search presentations share this order. Search tools open Customize table;
  its inspector contains Reset item row order. See
  [Workspace customization](WORKSPACE_CUSTOMIZATION.md) for Apply/Cancel behavior.
  Storage failures are visible and fall back to session/default order.
- Invoice order belongs to `invoiceStore.itemOrder`, keyed by `posa_row_id`.
  Reordering validates a complete permutation and updates sequential `idx`
  without replacing row objects or recalculating business values. Duplicate item
  codes, UOM, batch/serial allocations, quantity, rates, discounts and totals
  remain attached to their original lines. The existing invoice builder and
  persistence paths receive that order, including drafts and offline recovery.
- POS Profile company, warehouse, customer/pricing, stock, taxes, payment and
  print settings remain authoritative. No backend, cache schema, sync, pricing,
  print-format, QZ or report calculation changes are required.

## Files changed

- `frontend/src/posapp/components/ui/RowReorderHandle.vue`: shared accessible grip
  and feedback styles.
- `frontend/src/posapp/composables/core/useRowReorder.ts`: shared pointer/keyboard
  handling, cancellation, scoping and automatic scrolling.
- `frontend/src/posapp/utils/rowOrder.ts`: key-based insertion and saved ordering.
- `frontend/src/posapp/composables/pos/items/useSelectorRowOrder.ts`: scoped browser
  preferences, validation, reset and storage fallbacks.
- `frontend/src/posapp/components/pos/items/ItemsSelector.vue`: owns selector order
  for every presentation and wires search-tool reset and keyboard navigation.
- `frontend/src/posapp/components/pos/items/ItemsSelectorTable.vue`: list grips,
  stable item keys and clearing column sort after a manual move.
- `frontend/src/posapp/components/pos/items/ItemsSelectorCards.vue`: enables card
  grips while retaining existing card drag-to-cart.
- `frontend/src/posapp/components/pos/items/ItemCard.vue`: optional reorder grip
  and stable drop identity.
- `frontend/src/posapp/components/pos/items/PharmacyItemSearchTable.vue`: Counter
  Grid row grips and keyboard isolation.
- `frontend/src/posapp/components/pos/items/ItemHeader.vue`: reset in existing
  search tools, without adding a toolbar row.
- `frontend/src/posapp/components/pos/invoice/CartItemRow.vue`: invoice row grip
  and stable drop identity.
- `frontend/src/posapp/components/pos/invoice/ItemsTable.vue`: connects drag/keyboard
  moves to the existing invoice reorder event, excluding the entry placeholder.
- `frontend/src/posapp/composables/pos/invoice/useInvoiceItems.ts`: routes validated
  row-ID order and legacy index moves through the store.
- `frontend/src/posapp/stores/invoiceStore.ts`: reorders existing row objects and
  updates `idx`, rejecting stale/duplicate/incomplete permutations.
- `frontend/tests/rowReorder.spec.ts`: insertion, sorted/filtered slices, scoped
  persistence, storage failures, pointer/keyboard cancellation, duplicate invoice
  lines, unchanged totals, invoice payload and serialization/recovery checks.

## Verification and limits

Targeted Vitest runs passed 85 tests across row ordering, invoice store/document,
stock quantity, cart keyboard/focus, alternate cart, Counter Grid styling, item
card currency/keyboard, selector stock wiring, dark mode and pharmacy search.
The existing ItemHeader New Item emission test fails identically with the
unchanged HEAD component; the other two ItemHeader tests pass. This baseline
test failure is retained for separate investigation.

Browser checks using actual selector and invoice table components passed mouse
dragging, duplicate-line identity, sequential indices, unchanged row data,
keyboard moving, click isolation, saved selector order after reload and Reset
item order from the actual search tools. These were local component checks;
live ERPNext submission and printed receipts still need site verification.

Suggested commit: `feat(pos): enable drag-and-drop ordering of selector and invoice rows`
