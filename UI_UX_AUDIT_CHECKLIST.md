# POS Awesome UI/UX Audit Checklist

Date: 2026-03-09

Scope reviewed:
- `frontend/src/posapp/layouts`
- `frontend/src/posapp/styles`
- `frontend/src/posapp/components/navbar`
- `frontend/src/posapp/components/pos`

Audit baseline used:
- Minimum `44x44` touch targets
- Visible keyboard focus states
- Responsive layouts without viewport locking
- Icon-only controls with accessible names
- RTL support without forced LTR islands unless data truly requires it

## Critical Issues

- [x] `P0` Remove viewport locking and nested scroll traps from the main POS shell.
  - Why it matters: mobile and tablet flows can get clipped, produce awkward double-scroll behavior, and make dialogs/content feel trapped inside fixed-height panels.
  - Evidence:
    - `frontend/src/posapp/layouts/DefaultLayout.vue:634-636`
    - `frontend/src/posapp/layouts/DefaultLayout.vue:650`
    - `frontend/src/posapp/styles/theme.css:515-516`
    - `frontend/src/posapp/styles/theme.css:529-530`
    - `frontend/src/posapp/components/pos/Invoice.vue:11-14`
  - Fix direction:
    - Prefer flexible height with one intentional scroll container.
    - Avoid combining `100vh/100dvh`, `100vw`, and `overflow: hidden` on multiple parents.
    - Let mobile layouts grow naturally when dialogs, tables, and summaries expand.
  - Done when:
    - Phone and tablet views scroll naturally.
    - No clipped invoice/payment content.
    - No horizontal jump caused by `100vw`.

- [x] `P0` Raise all core touch targets to the minimum ergonomic size.
  - Why it matters: several primary controls are below the skill baseline and will be hard to tap on handheld devices and touch POS screens.
  - Evidence:
    - `frontend/src/posapp/components/navbar/NavbarAppBar.vue:947-954`
    - `frontend/src/posapp/components/navbar/NavbarAppBar.vue:988-989`
    - `frontend/src/posapp/components/navbar/NavbarAppBar.vue:1085-1086`
    - `frontend/src/posapp/components/pos/items/ItemActionToolbar.vue:87`
    - `frontend/src/posapp/components/pos/items/ItemActionToolbar.vue:102`
    - `frontend/src/posapp/components/pos/invoice/items-table-styles.css:230-232`
    - `frontend/src/posapp/components/pos/invoice/items-table-styles.css:435-437`
    - `frontend/src/posapp/components/pos/invoice/items-table-styles.css:736-738`
  - Fix direction:
    - Standardize icon and utility buttons on a shared `44px` token.
    - Keep compact visuals by reducing icon size, not hit-area size.
    - Recheck quantity steppers, navbar actions, list/card toggle, and quick action buttons.
  - Done when:
    - All primary and icon-only controls meet `44x44`.
    - Touch testing works without precision taps.

- [x] `P0` Add accessible names to icon-only actions that currently depend on `title`.
  - Why it matters: `title` is not a reliable accessible name pattern for screen readers and is weak on touch devices.
  - Evidence:
    - `frontend/src/posapp/components/navbar/StatusIndicator.vue:3`
    - `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue:192-194`
    - `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue:258-259`
    - `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue:400-402`
    - `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue:542-543`
    - `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue:699-700`
  - Fix direction:
    - Add `aria-label` to every icon-only button.
    - Keep tooltip/title as a secondary affordance, not the only label.
    - Audit similar patterns in other dialogs and tables.
  - Done when:
    - Every icon-only action has an explicit accessible name.
    - Keyboard and screen-reader pass is clean.

## High Priority Issues

- [x] `P1` Restore visible focus treatment in the invoice table instead of suppressing outlines.
  - Why it matters: keyboard users lose orientation inside one of the densest areas of the app.
  - Evidence:
    - `frontend/src/posapp/components/pos/invoice/items-table-styles.css:116`
    - `frontend/src/posapp/components/pos/invoice/items-table-styles.css:130`
  - Fix direction:
    - Replace removed outlines with a deliberate focus ring token.
    - Apply the same focus style to editable amount/rate/qty/UOM cells.
  - Done when:
    - Tabbing through invoice items clearly shows current focus.

- [x] `P1` Remove rigid navbar and menu widths that will crowd smaller breakpoints.
  - Why it matters: fixed-width gadgets fight the available header space and encourage overflow, truncation, and hidden actions.
  - Evidence:
    - `frontend/src/posapp/components/navbar/NotificationBell.vue:151-152`
    - `frontend/src/posapp/components/navbar/NavbarMenu.vue:773`
    - `frontend/src/posapp/components/navbar/NavbarMenu.vue:971`
    - `frontend/src/posapp/components/navbar/NavbarMenu.vue:1003`
    - `frontend/src/posapp/components/navbar/CacheUsageMeter.vue:180`
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue:143`
    - `frontend/src/posapp/components/navbar/StatusIndicator.vue:207`
  - Fix direction:
    - Convert hard `min-width` rules to `clamp()` or viewport-aware sizing.
    - Collapse secondary gadgets into a drawer or popover sooner.
    - Let menu cards use `max-width: min(...)` patterns on mobile.
  - Done when:
    - Navbar remains stable at tablet widths.
    - Popovers never exceed viewport width.

- [x] `P1` Stop forcing the database health widget into LTR when the app is in RTL.
  - Why it matters: this creates a visibly inconsistent navbar and breaks the otherwise intentional RTL support.
  - Evidence:
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue:111-112`
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue:119-120`
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue:145`
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue:157-158`
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue:201-202`
  - Fix direction:
    - Keep numbers/data LTR only where needed.
    - Let container alignment and text flow follow global RTL settings.
  - Done when:
    - RTL mode feels consistent across all navbar gadgets.

- [ ] `P1` Replace desktop-only manual panel resizing with predictable responsive behavior.
  - Why it matters: `resize: vertical` is low-discoverability on desktop and effectively useless on touch devices, yet it is applied to the main working panels.
  - Evidence:
    - `frontend/src/posapp/components/pos/Invoice.vue:13`
    - `frontend/src/posapp/components/pos/items/ItemsSelector.vue:18`
    - `frontend/src/posapp/components/pos/items/ItemActionToolbar.vue:2`
  - Fix direction:
    - Use responsive presets, collapsible sections, or saved split-pane controls with explicit handles.
    - Avoid relying on browser resize affordances for core POS workflows.
  - Done when:
    - Panel behavior is intentional on desktop and touch-friendly on tablets.

## Improvements And Enhancements

- [ ] Introduce a mobile-first action hierarchy for POS flows.
  - Suggested implementation:
    - Keep only `Search`, `Invoice`, and `Pay` as persistent mobile anchors.
    - Move secondary utilities into one overflow sheet.
  - Likely files:
    - `frontend/src/posapp/components/pos/shell/Pos.vue`
    - `frontend/src/posapp/components/navbar/NavbarAppBar.vue`
    - `frontend/src/posapp/components/navbar/NavbarMenu.vue`

- [ ] Convert navbar diagnostics into progressive disclosure.
  - Suggested implementation:
    - Show a compact single health chip in the app bar.
    - Open cache/database/server details inside a unified diagnostics panel.
  - Likely files:
    - `frontend/src/posapp/components/navbar/NavbarInfoGadgets.vue`
    - `frontend/src/posapp/components/navbar/CacheUsageMeter.vue`
    - `frontend/src/posapp/components/navbar/DatabaseUsageGadget.vue`
    - `frontend/src/posapp/components/navbar/ServerUsageGadget.vue`

- [ ] Add a shared focus-ring and touch-target utility layer.
  - Suggested implementation:
    - Define reusable CSS tokens for focus ring, target size, and interactive spacing.
    - Apply them to navbar buttons, table controls, dialogs, and toolbars.
  - Likely files:
    - `frontend/src/posapp/styles/theme.css`
    - `frontend/src/posapp/components/pos/invoice/items-table-styles.css`
    - `frontend/src/posapp/components/navbar/NavbarAppBar.vue`

- [ ] Improve empty, loading, and zero-state polish in high-frequency panels.
  - Suggested implementation:
    - Add clearer empty-state copy and next actions in invoice/history/notifications areas.
    - Use skeletons or reserved space to reduce jumpiness during sync/loading.
  - Likely files:
    - `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`
    - `frontend/src/posapp/components/navbar/NotificationBell.vue`
    - `frontend/src/posapp/components/pos/items/ItemsSelector.vue`

- [ ] Add explicit responsive QA checkpoints before future UI merges.
  - Suggested checklist:
    - `375px`, `768px`, `1024px`, and wide desktop
    - touch target audit
    - keyboard-only pass
    - RTL pass
    - dark/light contrast check

## Recommended Fix Order

- [ ] Fix layout/overflow locking first.
- [ ] Fix touch target sizes second.
- [ ] Fix icon-button accessibility and focus states third.
- [ ] Simplify navbar density and RTL inconsistencies fourth.
- [ ] Apply enhancements after the core usability regressions are closed.
