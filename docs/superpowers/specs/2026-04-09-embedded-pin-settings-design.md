# Embedded PIN Settings Design

## Summary

Move `Manage Cashier PIN` from the `NavbarMenu` dialog flow into the hybrid settings workspace. The `Personal` category will keep its action card, but selecting it will open an embedded detail view in the right pane instead of a modal dialog.

## Goals

- Keep PIN management inside the new settings workspace.
- Establish a reusable pattern for future embedded settings forms.
- Reduce menu fragmentation by removing dialog-only settings flows.

## Non-Goals

- Converting every settings action to embedded detail in this phase.
- Changing cashier switching or PIN verification flows outside settings.
- Reworking top-right status panel behavior.

## Current Problems

- `Manage Cashier PIN` lives in `NavbarMenu.vue` as a separate dialog flow.
- The new settings workspace is only a launcher surface for most actions.
- Future form-based settings would repeat the same dialog fragmentation.

## Proposed Design

### Workspace behavior

`NavbarSettingsPanel.vue` will manage:

- `activeSectionId` for the selected category
- `activeActionId` for the selected action within a category
- two right-pane states:
  - section overview
  - action detail

When `Manage Cashier PIN` is selected from `Personal`, the right pane will switch into detail mode and render an embedded PIN form.

### Component split

- `Navbar.vue`
  - passes section/action data and cashier/profile context into the settings workspace
- `NavbarSettingsPanel.vue`
  - handles category selection
  - handles action selection
  - renders either overview cards or the active detail component
- `NavbarCashierPinForm.vue`
  - owns cashier PIN status loading
  - owns validation
  - owns save submission
  - owns success/error messaging

### Personal section UX

- Default state shows overview cards for `Manage Cashier PIN`, `Language`, and `Theme`.
- Clicking `Manage Cashier PIN` opens detail mode.
- Detail mode shows:
  - title/breadcrumb context
  - current cashier summary
  - inline status/help message
  - current/new/confirm PIN fields
  - save and back controls
- Success keeps the user inside settings and shows inline confirmation.

### State migration

PIN state currently in `NavbarMenu.vue` will move into `NavbarCashierPinForm.vue`:

- `pinStatusLoading`
- `pinSubmitting`
- `pinStatus`
- `pinForm`
- `pinVisibility`
- `pinMessage`
- `pinMessageType`

`NavbarMenu.vue` will keep menu-only actions and lose its PIN dialog/template/methods.

## Error Handling

- If no active cashier or POS profile exists, show an inline warning state instead of opening a dialog.
- Failed status load or save keeps the user in detail mode and surfaces the error inline.
- Closing the settings panel resets transient PIN form state.

## Testing

- `NavbarSettingsPanel` renders overview and embedded detail states correctly.
- `NavbarCashierPinForm` covers missing context, status load, validation, and save success/error flows.
- `NavbarMenu` regression verifies non-PIN actions still work after removing PIN dialog code.

## Rollout Notes

- This phase establishes the detail-surface pattern for future embedded settings such as language, theme, and device forms.
- Temporary spec/plan docs can be removed after final implementation is complete, per repo cleanup preference.
