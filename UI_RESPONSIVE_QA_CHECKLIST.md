# POS Awesome Responsive QA Checklist

Use this checklist before merging UI changes that affect POS layouts, navigation, dialogs, tables, or theme behavior.

## Viewports

- [ ] `375px` phone width
  - Confirm no horizontal scrolling in the main POS shell.
  - Confirm mobile action bar does not cover content or buttons.
  - Confirm invoice, payment, and item search remain reachable with one intentional scroll container.

- [ ] `768px` tablet width
  - Confirm navbar actions do not overflow or truncate critical controls.
  - Confirm popovers, drawers, and menus stay inside the viewport.
  - Confirm invoice and item panels feel intentional without browser resize affordances.

- [ ] `1024px` small laptop width
  - Confirm diagnostics, notifications, and menus remain stable in the app bar.
  - Confirm invoice management dialog fits without clipped cards or tables.
  - Confirm dual-panel POS layout preserves clear action hierarchy.

- [ ] Wide desktop
  - Confirm layouts do not become excessively stretched or sparse.
  - Confirm grids, cards, and summary tiles maintain readable spacing.
  - Confirm empty and loading states still feel proportional.

## Interaction

- [ ] Touch targets
  - Confirm primary and icon-only actions meet the `44x44px` minimum.
  - Confirm quantity steppers, navbar actions, and mobile anchors are easy to tap.

- [ ] Keyboard-only pass
  - Confirm all interactive controls are reachable with `Tab`.
  - Confirm visible focus rings remain present in navbar, invoice tables, dialogs, and menus.
  - Confirm focus order matches the visual order of the layout.

- [ ] Empty, loading, and zero states
  - Confirm loading states reserve space and do not cause major content jumps.
  - Confirm empty states provide clear next actions where recovery is possible.
  - Confirm notification, invoice-management, and item-search panels do not end in dead ends.

## Internationalization And Theme

- [ ] RTL pass
  - Confirm alignment, spacing, and menu positioning remain consistent in RTL.
  - Confirm widgets only force LTR for data fragments that truly require it.

- [ ] Light and dark theme contrast
  - Confirm text remains readable on cards, chips, tiles, and empty-state surfaces.
  - Confirm focus rings and status colors remain visible in both themes.

## Regression Notes

- [ ] Record what was tested
  - Screens or flows checked:
  - Browser/device used:
  - Known follow-ups:
