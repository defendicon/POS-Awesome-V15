# POS Session and Register Centralization Design

Date: 2026-04-10
Branch: `centralization-of-pos-app`
Status: Draft approved for spec review

## Summary

POS session and register readiness are currently split across layout startup, shell components, opening dialog logic, and shared composables. This creates duplicate ownership for the same concerns:

- current POS profile
- current opening shift
- register recovery from cache/server
- register setup submission
- opening and closing session lifecycle
- readiness and warning state that blocks normal POS startup

This design centralizes those concerns into a dedicated `posSession` domain module and replaces the current opening dialog-first flow with a fullscreen `Register Setup` workspace.

The goal is not only cleaner code ownership, but also a cleaner cashier experience:

- if a valid session exists, POS opens directly
- if a session is missing, cashier sees a dedicated setup screen
- POS shell no longer partially mounts behind a hidden or blocking modal

## Goals

- Make POS session and register readiness have one primary owner.
- Replace the current opening dialog with a fullscreen `Register Setup` workspace.
- Keep naming human-friendly and developer-friendly.
- Remove session recovery and opening setup ownership from `Pos.vue`.
- Gate normal POS startup on session readiness rather than component side effects.
- Preserve offline-aware recovery using existing cache/bootstrap helpers.

## Non-Goals

- Rebuild catalog startup again in this phase.
- Redesign checkout or payment flows in this phase.
- Introduce a step-by-step wizard unless later needed.
- Rework close-shift UX into a separate page right now.

## Current Problems

Current ownership is split across:

- `frontend/src/posapp/layouts/DefaultLayout.vue`
- `frontend/src/posapp/components/pos/shell/Pos.vue`
- `frontend/src/posapp/components/pos/shift/OpeningDialog.vue`
- `frontend/src/posapp/composables/pos/shared/usePosShift.ts`
- `frontend/src/posapp/stores/uiStore.ts`
- `frontend/src/posapp/components/pos/shell/PayView.vue`
- `frontend/src/posapp/components/pos/Invoice.vue`

This causes a few concrete issues:

1. Session data leaks into many unrelated surfaces.
2. POS shell still owns parts of register recovery and dialog control.
3. Startup can partially proceed before register state is truly settled.
4. Opening setup UX is hidden behind a modal instead of being a primary state.
5. Future changes to cashier/session behavior will require editing too many files.

## Recommended Approach

Use a dedicated `posSession` domain module with a fullscreen `Register Setup` page.

Why this approach:

- It matches the recently centralized startup flow.
- It gives register readiness a single owner.
- It removes hidden modal behavior from the POS shell.
- It creates a natural route-level boundary between setup and active selling.
- It gives us a safe foundation for future session, closing, and cashier UX work.

## Module Boundary

New domain module:

- `frontend/src/posapp/domain/session/posSessionTypes.ts`
- `frontend/src/posapp/domain/session/posSessionStore.ts`
- `frontend/src/posapp/domain/session/recoverPosSession.ts`
- `frontend/src/posapp/domain/session/registerSetupPage.ts`
- `frontend/src/posapp/domain/session/closePosSession.ts`

New UI surface:

- `frontend/src/posapp/components/pos/session/RegisterSetupPage.vue`

## Ownership

`posSession` owns:

- current POS profile
- current opening shift
- current session readiness state
- register setup loading, prefill, submission, and error state
- session recovery from cache and server
- close-shift ownership behind a session-aware boundary
- register-facing warnings and recovery state relevant to session readiness

`posSession` does not own:

- items/customers catalog loading
- invoice/payment business logic
- navbar utilities
- global offline sync control surfaces

## Naming Principles

Use names that describe the job directly:

- `posSessionStore`
- `recoverPosSession`
- `registerSetupPage`
- `submitOpeningShift`
- `closePosSession`

Avoid abstract names like:

- `domainCore`
- `runtimeManager`
- `flowController`
- `handlerFactory`

## Route Design

Add a new route:

- `/register`

Current route behavior becomes:

- `/pos` for active POS shell
- `/register` for setup when session is not ready

`DefaultLayout` becomes the gate:

- if session is ready, continue normal POS startup
- if session is missing or needs setup, route to `/register`

This means `Pos.vue` no longer decides whether the cashier needs to open or restore a shift.

## UX Flow

### Primary Flow

1. User opens `/app/posapp`.
2. App runs session recovery before normal POS shell startup.
3. If a valid cached or server-backed opening shift exists, app continues to POS.
4. If no valid opening shift exists, app routes to fullscreen `Register Setup`.

### Register Setup Workspace

Use a fullscreen workspace, not a modal.

Layout:

- left panel:
  - setup summary
  - selected company/profile summary
  - cashier/session status
  - offline note or warning
- right panel:
  - company selector
  - POS profile selector
  - payment method opening balances
  - inline submit action and inline errors
- top header:
  - title
  - short status copy
  - logout
  - close/exit action

### Behavior

- Cached opening dialog data should prefill immediately when available.
- Online refresh should update setup data silently when possible.
- Submit success should:
  - update session state
  - cache opening data
  - refresh bootstrap snapshot
  - route back to `/pos`
- Submit failure should remain on the same page with inline feedback and preserved form data.

### Cashier States

The workspace should make the state obvious:

- `Recovering session`
- `Register setup required`
- `Submitting opening shift`
- `Ready, redirecting to POS`

## State Model

`posSessionStore` should expose a small, explicit state model.

Suggested session stages:

- `recovering`
- `ready`
- `needs_register_setup`
- `submitting_register_setup`
- `closing_shift`
- `blocked`

Derived values:

- current profile
- current opening shift
- has ready session
- needs register setup
- blocking message
- recovery source (`cache`, `server`, `none`)

## Integration Plan

### DefaultLayout

`DefaultLayout.vue` should:

- ask the session module for readiness
- route to `/register` when setup is required
- allow the centralized startup flow to continue only after session becomes ready

### Pos Shell

`Pos.vue` should:

- stop rendering `OpeningDialog.vue`
- stop owning register recovery and opening setup gating
- assume that if it mounts, session is already ready

### Existing Composable Split

Current `usePosShift.ts` should be decomposed:

- recovery logic -> `recoverPosSession.ts`
- opening submit flow -> `registerSetupPage.ts`
- close-shift flow -> `closePosSession.ts`

### UI Store

`uiStore.ts` should become lighter:

- keep view/drawer/dialog state
- stop being the conceptual owner of session state
- consume session-derived values where necessary

## Migration Strategy

Order matters. Do not do a big-bang rewrite.

1. Add `posSession` files and tests first.
2. Add `/register` route and `RegisterSetupPage.vue`.
3. Wire `DefaultLayout` to gate startup on session readiness.
4. Move opening create/recover logic out of `usePosShift.ts`.
5. Remove `OpeningDialog.vue` from `Pos.vue`.
6. Clean session leaks from `PayView.vue`, `Invoice.vue`, and `uiStore.ts`.
7. Retire the old dialog path once the new route is authoritative.

## Testing Strategy

Add targeted tests with friendly names:

- `frontend/tests/posSessionStore.spec.ts`
  - ready / missing / recovering / blocked states
- `frontend/tests/recoverPosSession.spec.ts`
  - cache hit
  - server hit
  - offline fallback
  - invalid cached user
- `frontend/tests/registerSetupPage.spec.ts`
  - prefill
  - validation
  - submit success
  - submit error
- `frontend/tests/defaultLayoutSessionGate.spec.ts`
  - redirects to `/register` when session missing
  - continues startup when session ready
- `frontend/tests/posShellSessionIndependence.spec.ts`
  - `Pos.vue` no longer owns opening dialog or session recovery

Verification after implementation:

- targeted Vitest suite for the new session module
- startup regression suite
- frontend production build

## Success Criteria

This phase is successful when:

1. POS startup no longer depends on opening dialog mounted in the shell.
2. Session and register state have one primary owner.
3. Cashier sees either `Register Setup` or actual POS, not a broken partial boot.
4. Opening session logic is no longer scattered across layout, shell, and dialog files.
5. Existing cache/bootstrap helpers still support offline-aware recovery.

## Risks and Controls

### Risk: Duplicate old and new setup flows

Control:

- make `/register` the primary setup path
- retire `OpeningDialog.vue` after migration, do not keep parallel ownership

### Risk: Session logic breaks startup gating

Control:

- reuse existing bootstrap/cache helpers
- keep startup and session boundaries explicit
- add route-level session gate tests

### Risk: Checkout surfaces still expect old state locations

Control:

- migrate `PayView.vue`, `Invoice.vue`, and any session readers after the store boundary exists
- keep compatibility reads only temporarily

## Implementation Notes

- Prefer session-specific names over generic orchestration names.
- Keep new files focused and small.
- Do not mix catalog or invoice ownership into this phase.
- Treat `Register Setup` as a first-class screen, not a patched modal.

