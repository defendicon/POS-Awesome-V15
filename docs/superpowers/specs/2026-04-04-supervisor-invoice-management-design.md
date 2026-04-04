# Supervisor Invoice Management Design

**Goal:** Let POS supervisors use Invoice Management across the whole company, not just the current profile or shift, while keeping standard cashiers scoped to the current profile flow.

**Context:** The current Invoice Management screen mixes two data-access patterns. History and unpaid invoices are fetched directly with `frappe.client.get_list` scoped to the current `pos_profile` and sometimes `posa_pos_opening_shift`, while drafts are fetched from `get_draft_invoices(pos_opening_shift, ...)`, which is strictly shift-scoped. Supervisors already exist in frontend state via `employeeStore.currentCashier.is_supervisor`, but Invoice Management does not use that role yet.

**Design:**
- Keep normal cashier behavior unchanged.
- When the current cashier is a POS supervisor:
  - History, returns, unpaid invoices, and drafts should load for the current company across all POS profiles.
  - The existing search boxes should also match `pos_profile`, `owner`, `modified_by`, and any cashier-facing name field available such as `custom_created_by_name`.
- Add supervisor-aware backend support for drafts because the current draft API only accepts `pos_opening_shift`.
- Keep the UI changes focused:
  - show the same tabs and workflows
  - optionally show `POS Profile` and `Cashier` metadata in fetched rows
  - avoid a separate bulk-management surface

**Scope rules:**
- Supervisor mode: filter by `company`, not by current `pos_profile` or opening shift.
- Cashier mode: preserve current filters exactly.
- Searches remain client-side for this iteration, but the loaded row payload must include enough metadata for searching by user/profile.

**Error handling:**
- If the company-wide draft query fails, only the drafts tab should error and the others should still load normally.
- Existing search and detail flows should continue to work even when metadata fields are missing on a given row.

**Testing:**
- Add focused frontend coverage for supervisor scoping and search matching.
- Add backend draft-query tests for supervisor company-wide filtering and cashier shift-scoped fallback.
