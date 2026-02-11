# POS Cash Movement Implementation Checklist

Owner: Codex
Status: In Progress
Last Updated: 2026-02-11

## Goal
- Add modular POS Cash Movement feature with:
- POS Expense booking via POS App
- Cash Deposit to back-office cash account via POS App
- Journal Entry based posting
- Offline queue + sync
- Profile-driven visibility and permissions
- Submitted entries listing + profile-driven cancel/delete actions

## Progress Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[-]` Blocked/Deferred

## Phase 0: Functional Contract
- [x] Freeze accounting approach to Journal Entry for both Expense and Deposit
- [x] Define requirement for offline queue and sync
- [x] Define requirement for submitted entries listing
- [x] Define requirement for profile-level cancel/delete controls

## Phase 1: POS Profile Controls
- [x] Add `posa_enable_cash_movement` custom field
- [x] Add `posa_allow_pos_expense` custom field
- [x] Add `posa_allow_cash_deposit` custom field
- [x] Add `posa_default_expense_account` custom field
- [x] Add `posa_back_office_cash_account` custom field
- [x] Add `posa_allow_cancel_submitted_cash_movement` custom field
- [x] Add `posa_allow_delete_cancelled_cash_movement` custom field
- [x] (Optional) Add `posa_require_cash_movement_remarks` custom field
- [x] (Optional) Add `posa_cash_movement_max_amount` custom field
- [x] Update `posawesome/hooks.py` fixtures list for new fields
- [x] Add profile form queries/UX rules in `posawesome/posawesome/api/pos_profile.js`
- [x] Add migration patch file for safer rollout
- [x] Register patch in `posawesome/patches.txt`

## Phase 2: New DocType (Audit Trail)
- [x] Create `POS Cash Movement` DocType JSON
- [x] Add Python controller for validate/lifecycle hooks
- [x] Add permissions and role access rules
- [x] Add link to Journal Entry
- [x] Add status model (Draft/Submitted/Cancelled)
- [x] Ensure shift/profile/user/company linkage fields exist

## Phase 3: Backend Modular API
- [x] Create `posawesome/posawesome/api/cash_movement/__init__.py`
- [x] Create `permissions.py`
- [x] Create `validation.py`
- [x] Create `posting.py`
- [x] Create `queries.py`
- [x] Create `service.py` (whitelisted endpoints)
- [-] Add/create compatibility facade module if needed
- [x] Implement `create_pos_expense(payload)`
- [x] Implement `create_cash_deposit(payload)`
- [x] Implement `get_shift_cash_movements(pos_opening_shift, filters)`
- [x] Implement `cancel_cash_movement(name)`
- [x] Implement `delete_cash_movement(name)`
- [x] Add idempotency key handling (`client_request_id`)

## Phase 4: Journal Entry Posting Rules
- [x] Expense JE rule: Dr Expense, Cr POS Cash
- [x] Deposit JE rule: Dr Back Office Cash, Cr POS Cash
- [x] Validate account company consistency
- [x] Validate positive amount and precision
- [x] Validate open shift ownership before posting
- [x] Cancel flow: cancel JE then cancel movement
- [x] Delete flow: only cancelled movement and profile flag enabled

## Phase 5: Frontend Cash Movement Module
- [x] Add new route `/cash-movement` in router
- [x] Add nav menu item in `Navbar.vue` and drawer/menu components
- [x] Add module folder `frontend/src/posapp/components/pos/cash/`
- [x] Create `CashMovementView.vue`
- [x] Create `CashMovementForm.vue`
- [x] Create `CashMovementHistory.vue`
- [x] Create `useCashMovement.ts`
- [x] Create `useCashMovementValidation.ts`
- [x] Create `cashMovementService.ts`
- [x] Enforce profile toggles for visibility/actions

## Phase 6: Submitted Entries View + Actions
- [x] Add Submitted filter as default in history
- [x] Add movement-type filters (Expense/Deposit)
- [x] Show JE reference and posting metadata
- [x] Add cancel action button (guarded by profile flag)
- [x] Add delete action button for cancelled entries (guarded by profile flag)
- [x] Add action confirmations and user feedback toasts

## Phase 7: Offline Queue + Sync
- [x] Add `offline_cash_movements` memory key in `frontend/src/offline/db.ts`
- [x] Create `frontend/src/offline/cash_movements.ts`
- [x] Export in `frontend/src/offline/index.ts`
- [x] Implement save/get/delete offline queue utilities
- [x] Implement `syncOfflineCashMovements()`
- [x] Integrate sync trigger in `frontend/src/posapp/layouts/DefaultLayout.vue`
- [x] Add duplicate-safe sync via `client_request_id`
- [x] Add UI indicator for pending offline cash movements

## Phase 8: Closing Shift Integration
- [x] Include submitted cash movements in expected cash computation
- [x] Update closing backend aggregation in `creation.py`
- [x] Extend overview payload in `overview.py`
- [x] Update frontend normalizer in `useClosingShift.ts`
- [x] Update summary calculations in `useClosingSummary.ts`
- [x] Update `ShiftOverview.vue` cards/tables for cash movement impact

## Phase 9: Testing
- [x] Add backend tests for validation/permissions/posting/cancel/delete
- [x] Add backend tests for closing-shift impact
- [x] Add frontend tests for service/composable behavior
- [x] Add offline queue/sync tests
- [-] Run targeted regression checks for payments and closing

## Phase 10: Documentation + Rollout
- [x] Add feature usage notes to `README.md`
- [x] Add admin configuration notes (POS Profile flags + accounts)
- [x] Add known limitations/guardrails
- [x] Add rollout checklist and rollback notes

## Live Change Log
- [x] 2026-02-11: Initial execution checklist created and saved.
- [x] 2026-02-11: Phase 1 POS Profile controls implemented (fixtures + hooks + patch + form queries).
- [x] 2026-02-11: Phase 2/3 backend scaffolding implemented (DocType + modular cash movement APIs + JE posting).
- [x] 2026-02-11: Phase 5/6 frontend cash movement flow completed (filters, profile guards, submit/cancel/delete UX, offline queue indicator).
- [x] 2026-02-11: Phase 7 offline queue + sync completed (queue storage, sync worker path, layout sync integration, idempotent request handling).
- [x] 2026-02-11: Phase 8 closing shift integration completed (expected cash adjustment + overview payload + UI overview updates).
- [x] 2026-02-11: Phase 9 test files added (backend unit tests with mocks + frontend vitest specs for validation/service and offline queue sync).
- [x] 2026-02-11: Phase 10 documentation completed (`README.md` usage/admin/guardrails + `CASH_MOVEMENT_ROLLOUT.md` rollout and rollback runbook).
