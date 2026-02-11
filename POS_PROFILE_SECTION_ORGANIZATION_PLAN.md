# POS Profile Section Organization Plan

Last Updated: 2026-02-11  
Scope: Re-organize `POS Profile` form into clear sections to reduce clutter and improve admin usability.

## 0. New Feature Coverage (Explicit)

This plan **does include** the newly added `POS Cash Movement` feature.  
Cash movement is handled as its own dedicated section with all related controls grouped together.

- Feature block name: `Cash Movement`
- Related fields covered:
  - `posa_enable_cash_movement`
  - `posa_allow_pos_expense`
  - `posa_allow_cash_deposit`
  - `posa_default_expense_account`
  - `posa_back_office_cash_account`
  - `posa_allow_cancel_submitted_cash_movement`
  - `posa_allow_delete_cancelled_cash_movement`
  - `posa_require_cash_movement_remarks`
  - `posa_cash_movement_max_amount`

## 1. Current Audit Summary

Based on repo inspection:

- Source checked:
  - `posawesome/fixtures/custom_field.json`
  - `posawesome/hooks.py`
- Current POS Profile custom field volume:
  - `100` custom fields total
  - `78` Check fields
  - only `3` Section Break fields
  - only `5` Column Break fields
- Result:
  - Most settings are chained in one long sequence via `insert_after`
  - Mixed concerns (pricing, returns, purchase, cache, payments, printing, cash movement) appear in same visual block
  - New cash movement fields are technically correct but visually buried in long settings flow

## 2. Reorganization Goals

- Keep all existing behavior unchanged.
- Only improve form structure and discoverability.
- Group settings by business workflow.
- Preserve existing `depends_on` logic.
- Keep migration safe for existing sites.

## 3. Proposed Target Layout

Use dedicated Section Breaks and controlled Column Breaks.

### Section A: POS Awesome Core

Purpose: Main POS behavior switches.

Fields:
- `posa_cash_mode_of_payment`
- `posa_allow_delete`
- `posa_allow_user_to_edit_rate`
- `posa_allow_user_to_edit_additional_discount`
- `posa_allow_user_to_edit_item_discount`
- `posa_show_customer_balance`
- `posa_default_card_view`
- `posa_allow_change_posting_date`
- `posa_allow_print_last_invoice`
- `posa_hide_closing_shift`

### Section B: Pricing and Discount Controls

Purpose: Discount policy and pricing edit constraints.

Fields:
- `posa_use_percentage_discount`
- `posa_max_discount_allowed`
- `posa_display_discount_percentage`
- `posa_display_discount_amount`
- `posa_allow_price_list_rate_change`
- `posa_force_price_from_customer_price_list`

### Section C: Returns and Credit

Purpose: Return, refund and credit controls.

Fields:
- `posa_allow_return`
- `posa_allow_return_without_invoice`
- `posa_allow_free_batch_return`
- `posa_enable_return_validity`
- `posa_return_validity_days`
- `use_cashback`
- `use_customer_credit`
- `posa_allow_credit_sale`
- `posa_allow_partial_payment`

### Section D: Sales and Purchase Flows

Purpose: Order creation and purchasing options.

Fields:
- `posa_allow_sales_order`
- `custom_allow_select_sales_order`
- `posa_create_only_sales_order`
- `posa_default_sales_order`
- `posa_allow_customer_purchase_order`
- `posa_allow_purchase_order`
- `posa_allow_purchase_receipt`
- `posa_allow_create_purchase_items`
- `posa_allow_create_purchase_suppliers`

### Section E: Product and Inventory UX

Purpose: Item visibility and stock behavior.

Fields:
- `posa_display_items_in_stock`
- `posa_display_item_code`
- `posa_show_template_items`
- `posa_hide_variants_items`
- `posa_block_sale_beyond_available_qty`
- `posa_allow_zero_rated_items`
- `posa_auto_set_batch`
- `posa_search_batch_no`
- `posa_search_serial_no`
- `posa_input_qty`
- `posa_new_line`

### Section F: Notes, Print and Output

Purpose: Print and document metadata controls.

Fields:
- `posa_display_additional_notes`
- `posa_display_authorization_code`
- `posa_open_print_in_new_tab`
- `posa_silent_print`
- `posa_print_format_rules`
- `posa_allow_print_draft_invoices`

### Section G: Delivery and Customer Data

Purpose: Delivery logic and customer data safety.

Fields:
- `posa_use_delivery_charges`
- `posa_auto_set_delivery_charges`
- `posa_allow_duplicate_customer_names`
- `posa_default_country`
- `posa_language`

### Section H: Offline, Search and Performance

Purpose: Caching, sync and search behavior.

Fields:
- `posa_local_storage`
- `posa_force_server_items`
- `posa_use_server_cache`
- `posa_server_cache_duration`
- `pose_use_limit_search`
- `posa_search_limit`
- `posa_force_reload_items`
- `posa_smart_reload_mode`

### Section I: Payment Integration Controls

Purpose: POS Awesome Payments and reconciliation capabilities.

Fields:
- `posa_use_pos_awesome_payments`
- `posa_allow_make_new_payments`
- `posa_allow_reconcile_payments`
- `posa_allow_mpesa_reconcile_payments`

### Section J: Cash Movement

Purpose: Expense/deposit control from POS app.

Fields:
- `posa_enable_cash_movement`
- `posa_allow_pos_expense`
- `posa_allow_cash_deposit`
- `posa_default_expense_account`
- `posa_back_office_cash_account`
- `posa_allow_cancel_submitted_cash_movement`
- `posa_allow_delete_cancelled_cash_movement`
- `posa_require_cash_movement_remarks`
- `posa_cash_movement_max_amount`

Behavior expected in this section:

- `Enable Cash Movement` off:
  - all cash movement detail fields hidden
- `Enable Cash Movement` on:
  - expense/deposit toggles visible
- `Allow POS Expense` on:
  - `Default POS Expense Account` visible
- `Allow Cash Deposit` on:
  - `Back Office Cash Account` visible
- Cancel/delete policy fields visible only under cash movement scope

## 4. Implementation Plan

## Phase 1: Add Structural Section Break Fields

Create new custom fields of type `Section Break` (and selective `Column Break`) for POS Profile:

- `posa_section_core`
- `posa_section_pricing`
- `posa_section_returns_credit`
- `posa_section_sales_purchase`
- `posa_section_inventory`
- `posa_section_notes_print`
- `posa_section_delivery_customer`
- `posa_section_offline_perf`
- `posa_section_payments`
- `posa_section_cash_movement`

Optional helper column breaks:

- `posa_col_core_right`
- `posa_col_pricing_right`
- `posa_col_returns_right`
- `posa_col_offline_right`
- `posa_col_cash_movement_right`

## Phase 2: Re-anchor Existing Fields

Update `insert_after` in fixture + patch so every field lands in its intended section.

Rule:
- do not change `fieldname`
- do not change `depends_on` expressions
- only change position and grouping

## Phase 3: Migration Safety

Add patch:
- `posawesome/patches/reorganize_pos_profile_sections.py`

Patch behavior:
- create missing section break fields if absent
- update field `insert_after` only for targeted POS Profile custom fields
- keep idempotent behavior

Register in:
- `posawesome/patches.txt`

Keep `after_migrate` safety hook for cash movement settings as already implemented.

## Phase 4: Workspace + UX Validation

Validate in UI:
- POS Profile opens without layout break
- each section visible and coherent
- dependent fields still hide/show correctly
- cash movement block appears in isolated section

Cash movement specific validation:

- [ ] Cash movement settings visible in dedicated section only
- [ ] No cash movement field remains mixed inside unrelated sections
- [ ] `depends_on` visibility still works for expense/deposit account fields
- [ ] Existing POS App behavior unchanged after section re-order

## 5. Acceptance Checklist

- [ ] POS Profile no longer appears as one long mixed list
- [ ] All legacy fields still present
- [ ] No field logic regression (`depends_on`, defaults, permissions)
- [ ] Cash movement settings grouped in one clear section
- [ ] New admins can find key settings in under 30 seconds

## 6. Risks and Mitigations

Risk:
- Existing user-personalized form layout might still cache old order.

Mitigation:
- run `bench --site <site> clear-cache`
- hard refresh browser (`Ctrl+Shift+R`)

Risk:
- Another app may add POS Profile custom fields with conflicting `insert_after`.

Mitigation:
- anchor section breaks to stable nearby fields
- keep patch idempotent and re-runnable

## 7. Rollback Strategy

- Revert section patch commit.
- Re-run migrate.
- Keep functional fields unchanged (only visual order rollback needed).

## 8. Recommended Next Step

Implement this plan in one dedicated PR:

- Commit 1: section break fields + patch
- Commit 2: field re-anchoring
- Commit 3: QA pass notes/screenshots

## 9. Cash Movement Deep-Check Checklist

When implementing section reorganization, explicitly verify the new cash movement feature is not regressed:

- [ ] POS Profile can still activate/deactivate cash movement from profile
- [ ] POS App still shows/hides `Cash Movement` route based on profile flag
- [ ] Expense account logic still works when default account is empty
- [ ] Deposit account policy still enforces cash-account-only behavior
- [ ] Cancel/delete permissions continue to be profile-driven
- [ ] Offline queue settings remain unaffected by section changes
