# Cashier-First Menu Design

Date: 2026-04-04

## Goal

Reduce menu clutter in the POS navbar by prioritizing high-frequency cashier actions and moving low-frequency, UI, and terminal-management actions into a categorized settings surface.

## Problem

The current actions menu has grown into a long vertical list. Cashiers have to scroll to reach lower actions, which slows down daily use and makes the menu feel overloaded. This especially hurts on mobile and smaller screens.

## Design Decision

Adopt a `cashier-first` structure using:

1. A short `Quick Actions` area for high-frequency session actions
2. A dedicated `Settings` entry that opens a second-level categorized panel
3. A separate `Supervisor Only` section for restricted tools

This keeps the first surface fast for cashiers while preserving access to lower-frequency options.

## Information Architecture

### Quick Actions

These actions stay directly visible in the main menu:

- `Switch Cashier`
- `Lock Screen`
- `Print Last Invoice`
- `Sync Offline Invoices`
- `Close Shift`

### Settings

These actions move into a categorized settings panel:

#### Personal

- `Manage Cashier PIN`
- `Language`
- `Theme`

#### Terminal

- `Open Customer Display`
- `QZ Tray Setup`
- `Print Last Invoice` if later we decide it is not frequent enough for Quick Actions

#### System

- `Sync Offline Invoices` if later we decide it belongs outside Quick Actions
- `Clear Cache`
- `Check for Updates`

#### Session

- `Logout`

### Supervisor Only

Restricted tools only visible to POS supervisors:

- `Awesome Dashboard`
- future admin or sensitive terminal actions

## UI Behavior

### Main Menu

- The main menu opens on `Quick Actions`
- It should show at most `5-6` visible primary actions
- No scrolling should be needed for the first screen on normal desktop or mobile heights
- A `Settings` entry appears below Quick Actions as a distinct secondary action

### Settings Surface

- On mobile: use a `bottom sheet`
- On desktop: use a `nested panel`, side drawer, or secondary popover attached to the menu
- Settings are grouped into visually separated sections with labels and short supporting text
- Destructive actions such as `Clear Cache` and `Logout` are visually separated from routine settings

### Optional Polish Included

- Render `Quick Actions` as a `2-column action grid` instead of one long list
- Add a separate destructive block inside Settings for `Clear Cache` and `Logout`
- Add a subtle `Restricted` badge or section label for supervisor-only tools

## Visibility Rules

- Normal cashiers see `Quick Actions` and `Settings`
- Supervisors additionally see `Supervisor Only`
- Restricted actions must not appear as dead or disabled menu items for non-supervisors; they should be hidden

## Reuse Rules

- Reuse the existing `NavbarMenu.vue` action handlers
- Reuse current dialogs for language, PIN management, QZ Tray, and customer display
- Do not create duplicate dialogs for settings already implemented
- Prefer restructuring existing actions over adding new state machines

## Implementation Notes

- Refactor the existing long menu list into grouped data structures
- Add a small state machine for `main menu` vs `settings panel`
- Keep current event emissions unchanged where possible
- Preserve current mobile/desktop responsive behavior, but reduce initial action density
- Preserve supervisor gating already implemented for dashboard access

## Testing

Verify:

- main menu shows only quick actions initially
- settings panel opens and exposes grouped items
- non-supervisor users do not see supervisor-only section
- supervisor users do see restricted tools
- existing actions still emit their current events
- mobile layout does not require deep vertical scrolling for first-level actions

## Recommendation

Proceed with:

- `Quick Actions + Settings Drawer`
- `2-column action grid`
- categorized Settings sections
- hidden supervisor-only tools for non-supervisors

This gives the cleanest cashier UX with the smallest behavior change risk.
