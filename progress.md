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
- Reworked parked-order UX around `Drafts`: the visible copy now uses ERPNext-style drafts terminology instead of parked orders, while the store-backed draft cache and resume flow stay unchanged.
- Moved the inline draft list out of the invoice summary flow by introducing a compact recent-drafts surface plus a reusable full drafts list component for secondary surfaces.
- Added responsive placement for drafts: desktop now uses a right-side drawer, while non-desktop layouts use a secondary dialog surface, and verified the relocation with focused frontend regression tests plus `vue-tsc`.
- Completed the missing Phase 2 stored-value slice without adding a parallel wallet system: added a dedicated `stored_value` API wrapper over the existing customer-credit engine, exposed stored-value summary fields in customer info responses, and kept redemption sourcing on the proven credit/cashback path.
- Added a compact customer insights surface so the selected customer now shows stored-value balance and loyalty points inline, and updated payment redemption copy to use `stored value` terminology consistently across summary and source-allocation views.
- Verified the new Phase 2 stored-value slice with targeted frontend Vitest coverage and a dedicated backend Python test, while leaving manual release-gate walkthroughs as a separate operational check.
- Closed the remaining code-level Phase 2 gap for reloadable gift cards: added `POS Gift Card` and `POS Gift Card Transaction` DocType scaffolding, supervisor-gated issue/top-up APIs, balance lookup, and invoice-linked redemption history.
- Extended the payment flow with a scan-friendly gift-card dialog, gift-card payment-row treatment, supervisor-only issue/top-up actions inside POS, and submit-time payload/offline validation so gift-card redemption stays online-only.
- Extended offline customer-balance support with stored-value snapshot caches, richer cached customer summary fields, and replay-safe redemption metadata on queued offline invoices so customer-balance redemption remains recoverable after sync.
- Re-verified the Phase 2 closeout slices with focused frontend Vitest coverage, frontend type-check, and backend Python tests for gift cards plus invoice post-submit payment processing.

## 2026-04-07
- Removed the shell-level drafts rail from `Pos.vue` after confirming the accepted Phase 1 UX keeps drafts inside the existing invoice summary drawer/dialog surfaces rather than duplicating that surface at the POS shell level.
- Kept the `Drafts` label unchanged, retained the faster payment quick actions and settlement-state polish, and marked Phase 1 code-level scope complete under the current accepted UX shape.
