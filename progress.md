# Progress Log

## 2026-04-04
- Reviewed local POS Awesome capabilities and major frontend surfaces.
- Compared feature positioning against Odoo POS, ERPNext POS docs, Open Source POS, and uniCenta.
- Wrote a prioritized modernization roadmap focused on highest-value missing capabilities and cashier UX improvements.
- Wrote a repo-specific phased implementation plan at `docs/superpowers/plans/2026-04-04-modern-pos-roadmap.md`.
- Added a duplicate-avoidance audit so future implementation extends existing drafts, customer-credit/cashback, and shortcut hooks before creating parallel systems.
- Started Phase 1 implementation by reusing the existing drafts flow as a parked-orders cache and adding a visible parked-orders rail in the invoice summary.
- Added payment quick-action UI in the payments screen using existing `set_full_amount` and `set_rest_amount` flows instead of creating duplicate payment logic.
- Added targeted frontend tests for parked-order state/rendering and payment quick-action rendering, then verified them along with `vue-tsc`.
- Started Phase 2 with a shared-terminal cashier switching slice: added a dedicated employee store, navbar switch/lock entry points, and a persistent employee switch dialog.
- Converted invoice shortcut placeholders into real `F4` switch-cashier and `F8` lock-screen events, wired through the shared event bus and navbar shell.
- Added a backend employee-list endpoint based on existing `POS Profile User` membership and verified it with a standalone Python test plus targeted frontend specs.
- Extended Phase 2 with PIN-gated cashier switching/unlocking: the dialog now verifies the selected cashier against `POS Profile User` membership and a new POS PIN field on `User` before applying the switch.
- Added repo fixtures for `User-posa_pos_pin` and `User-posa_is_pos_supervisor`, updated hooks so they ship with the app, and verified the flow with new frontend and backend tests plus `vue-tsc`.
- Added a stored-value UX slice on top of the existing customer-credit engine: payment options and redemption copy now surface `stored value` terminology, available/applied balance, and source counts instead of a hidden legacy credit flow.
- Tightened redemption behavior so manual source edits are automatically capped by both source balance and remaining invoice amount after loyalty, preventing over-redemption errors from surfacing only at submit time.
- Polished shared-terminal UX: cashier PIN inputs now support show/hide, invalid PIN messages are surfaced in a stronger alert state, and the dialog now includes setup guidance for assigning POS Profile users and User PINs.
- Cleaned up navbar identity affordances so desktop shows a single actionable cashier chip with terminal context instead of duplicate user chips, and mobile menu profile info is styled as static terminal status rather than a dead action.
- Updated `User-posa_pos_pin` to a `Password` custom field so the Desk form stores it as a masked password-style field with reveal support.
- Added self-service cashier PIN management in the actions menu so the current cashier can create a first PIN or change an existing PIN without leaving the POS flow; backend APIs now expose PIN status and save/update behavior using the masked `User` password field.
- Restricted Awesome Dashboard visibility to POS supervisors by removing the drawer item for non-supervisors and gating the reports view so non-supervisors see an access warning instead of loading dashboard data.
- Fixed stale `.js` store imports in navbar-related components that surfaced during regression testing and added targeted frontend/backend regression tests for cashier PIN self-service, supervisor-only dashboard access, and wrong-current-PIN rejection.
- Refactored the long navbar actions menu into a cashier-first flow: quick actions now sit on the first panel, while language/theme/terminal/system/session tools live inside a categorized settings panel.
- Added a two-column quick actions layout, a dedicated settings entry point, and a restricted supervisor tools section inside the settings panel without duplicating existing dialogs or handlers.
- Added navbar menu regression coverage for quick-action grouping, settings sections, and supervisor-only restricted tools, then re-verified navbar/report access behavior and `vue-tsc`.
