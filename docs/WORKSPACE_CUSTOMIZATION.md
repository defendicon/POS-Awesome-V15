# Workspace customization

Cards, item selector columns and invoice columns now use one **Customize
workspace** inspector. Open it from the compact card tune button, Menu > Tools,
the selector's search tools, or **Table options** beside invoice search.

The inspector uses the existing POS theme, supports light/dark modes and becomes
a scrollable bottom sheet on small screens. It can be minimized while arranging
the canvas. Column grips and dividers appear only while their section is being
customized; ordinary row grips appear on hover/focus or on touch devices.

## Interaction and ownership

- Cards: drag/reorder and resize on the canvas, or use width controls, move
  buttons and side-by-side/separate-row presets in the inspector.
- Tables: drag header grips, resize dividers, enter pixel widths or use move
  buttons. Invoice optional-column visibility uses the same panel. Required
  fields and POS Profile/responsive visibility rules remain authoritative.
- Changes across sections are a live preview. **Apply** saves changed
  preferences; **Cancel** restores the state present when the editor opened.
  **Reset section** is also previewed until Apply. Cashier/profile scope changes
  cancel an active preview.
- Existing storage keys and scope boundaries remain compatible. Card settings
  are per user/profile; table order/widths include existing company, warehouse
  and context scope. Invoice visibility retains its legacy browser-wide key.
- Invoice row movement still changes actual line order immediately. Invoice
  rows, quantities, prices and other sale data are not layout preferences and
  are never rolled back by Cancel. Selector row order remains a presentation
  preference and can be reset from the inspector.
- A failed save keeps the editor open with a visible error. Earlier writes are
  restored where browser storage permits, so the user can retry or cancel.

## Files changed and reasons

Paths below are relative to `frontend/` unless otherwise stated.

- `src/posapp/composables/core/workspaceCustomization.ts`: central preview,
  registration, rollback, save/retry and scope lifecycle.
- `src/posapp/components/ui/WorkspaceCustomizer.vue`: shared themed inspector,
  section tabs, controls, keyboard focus and mobile layout.
- `src/posapp/composables/core/useColumnOrder.ts` and `useColumnWidths.ts`:
  register existing preferences, defer storage during previews and expose
  existing movement/width logic to the inspector.
- `src/posapp/composables/pos/items/useSelectorRowOrder.ts`: participates in
  preview/reset without changing item search or cached item data.
- `src/posapp/composables/pos/invoice/useInvoiceItems.ts`: registers visibility
  and shares POS Profile default selection between loading and reset.
- `src/posapp/components/pos/invoice/InvoiceCardLayout.vue`: replaces the large
  inline editor with compact entry and canvas handles; retains existing grid.
- `src/posapp/components/pos/invoice/InvoiceItemsActionToolbar.vue`: replaces the
  separate visibility dialog with Table options and keeps search aligned.
- `src/posapp/components/ui/ColumnOrderHeader.vue`, `ColumnResizeHandle.vue` and
  `RowReorderHandle.vue`: consistent handles with reduced visual clutter.
- `src/posapp/components/pos/invoice/ItemsTable.vue`,
  `src/posapp/components/pos/items/ItemsSelectorTable.vue` and
  `PharmacyItemSearchTable.vue`: register table contexts and activate matching
  canvas affordances.
- `src/posapp/components/pos/items/ItemHeader.vue` and `ItemsSelector.vue`:
  replace the separate row-order reset entry with the common table editor.
- `src/posapp/components/pos/Invoice.vue`: removes obsolete visibility-dialog
  bindings; the existing invoice composable remains the source of truth.
- `src/posapp/components/pos/shell/Pos.vue`: mounts one editor and keeps Counter
  Grid search dialog focus/closing behavior compatible with the inspector.
- `src/posapp/components/navbar/NavbarMenu.vue`: adds the shared workspace entry.
- `tests/workspaceCustomization.spec.ts`, `tests/invoiceCardLayout.spec.ts` and
  `tests/useInvoiceItemsColumns.spec.ts`: preview, cancellation, persistence,
  failed-save rollback, scope isolation and required-column regression coverage.
- `docs/COLUMN_ORDER.md`, `docs/COLUMN_WIDTHS.md`, `docs/ROW_REORDER.md` and this
  document: describe the consolidated interaction and retained data boundaries.

## Linked features and verification

This is a presentation change. Existing item filtering/search, cart editing,
pricing rules, discount percentage/amount, UOM, customer/profile price lists,
warehouse/stock, taxes, payment settings, totals and invoice preparation remain
owned by their existing modules. Offline invoice/cache/sync, browser/QZ receipt
and report paths do not consume these layout preferences and were not modified.

Validation: 98 targeted tests across 16 suites cover layout, column/row handling,
cart keyboard/focus, invoice store/document, responsive filters, Counter Grid
and selector stock wiring. Type-check, changed-file ESLint, production build,
Chrome 109 CSS audit, build-artifact verification and `git diff --check` passed.

A local Chrome harness using the real editor, cards and tables verified quiet
default controls, preview/Cancel, Apply/reload, exact widths, column movement,
required visibility, scope cancellation, unchanged invoice data, dark/mobile
layout and inspector focus while Counter Grid search remains open.

Limits: browser checks use fixture sale data, not a logged-in Frappe server.
Preferences stay local to this browser; cross-device account synchronization is
not introduced. Narrow responsive views may still hide columns under existing
table rules. Backend posting, offline sync and physical receipt printing require
the deployed ERP environment for end-to-end testing.

Suggested commit: `feat(pos): unify workspace customization with preview and apply`
