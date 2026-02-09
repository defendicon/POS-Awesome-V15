# POS Profile Organization Journal

Last updated: 2026-02-09
Owner: POSAwesome Team
Scope: `POS Profile` cleanup, structure, and migration tracking

## Purpose

This file is the single source of truth for:

- What changes are planned
- What is in progress
- What is completed
- What decisions were made and why

Update this file every time a POS Profile change is started or completed.

## Current Baseline (From Analysis)

- `POS Profile` custom fields: **91** (`posawesome/fixtures/custom_field.json`)
- Dedicated section breaks for POSAwesome settings: **3**
- Symptoms: mixed concerns in one form (payments, UI, inventory, returns, performance, purchase)
- Candidate unused field in code scan: `posa_smart_reload_mode`

## Target Architecture

Move from one large settings form to layered configuration:

1. Global defaults (company/site)
2. POS Profile (operational identity + policy links)
3. Optional register/device overrides (future)

## Workboard

| ID       | Task                                                     | Status      | Priority | Notes                                       |
| -------- | -------------------------------------------------------- | ----------- | -------- | ------------------------------------------- |
| POSP-001 | Create settings taxonomy (domain buckets)                | DONE        | High     | Completed in analysis                       |
| POSP-002 | Build field-by-field mapping sheet                       | DONE        | High     | Initial mapping sheet added in this journal |
| POSP-003 | Add UI sections/tabs without behavior change             | IN_PROGRESS | High     | Draft tab/section plan added                |
| POSP-004 | Introduce policy doctypes (pricing/payment/inventory/ui) | TODO        | High     | Keep backward compatibility                 |
| POSP-005 | Add effective-settings resolver layer                    | TODO        | High     | Centralized config read path                |
| POSP-006 | Migrate reads from scattered fields to resolver          | TODO        | Medium   | Incremental migration                       |
| POSP-007 | Validate and remove dead/unused settings                 | TODO        | Medium   | Start with `posa_smart_reload_mode`         |
| POSP-008 | Add admin docs and rollback notes                        | TODO        | Medium   | Include migration and support notes         |

Status values: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`

## Domain Taxonomy (Approved)

- Core Setup
- Pricing
- Payments
- Returns and Tax
- Stock and Orders
- Interface and Speed

## POSP-002 Field Mapping Sheet (v1)

Source: `posawesome/fixtures/custom_field.json`

Action legend:

- `KEEP` = keep in new structure
- `MOVE` = move under a clearer section/policy
- `REVIEW` = validate behavior/ownership before migration
- `REMOVE?` = candidate removal (if confirmed unused)

| Field                                       | Domain                        | Action  | Notes                            |
| ------------------------------------------- | ----------------------------- | ------- | -------------------------------- |
| posa_force_price_from_customer_price_list   | Catalog and Pricing           | MOVE    | Pricing behavior                 |
| posa_pos_awesome_settings                   | Layout (Legacy)               | REMOVE? | Legacy section break             |
| posa_cash_mode_of_payment                   | Checkout and Payments         | KEEP    | Cash payment mode link           |
| posa_allow_delete                           | Checkout and Payments         | MOVE    | Draft invoice deletion policy    |
| posa_allow_user_to_edit_rate                | Catalog and Pricing           | MOVE    | Cashier pricing permission       |
| posa_allow_user_to_edit_additional_discount | Catalog and Pricing           | MOVE    | Discount permission              |
| posa_use_percentage_discount                | Catalog and Pricing           | MOVE    | Discount mode                    |
| posa_max_discount_allowed                   | Catalog and Pricing           | MOVE    | Discount guardrail               |
| posa_enable_camera_scanning                 | UI, Printing, and Performance | MOVE    | Scanner UX                       |
| posa_camera_scan_type                       | UI, Printing, and Performance | MOVE    | Scanner type                     |
| posa_allow_change_posting_date              | Returns and Compliance        | MOVE    | Accounting control               |
| posa_show_customer_balance                  | Checkout and Payments         | MOVE    | Checkout info toggle             |
| posa_default_card_view                      | UI, Printing, and Performance | MOVE    | Default item presentation        |
| posa_default_sales_order                    | Inventory and Fulfillment     | MOVE    | Sales order workflow default     |
| posa_col_1                                  | Layout (Legacy)               | REMOVE? | Legacy column break              |
| posa_allow_user_to_edit_item_discount       | Catalog and Pricing           | MOVE    | Item-level discount permission   |
| posa_display_items_in_stock                 | Inventory and Fulfillment     | MOVE    | Stock visibility rule            |
| posa_allow_partial_payment                  | Checkout and Payments         | KEEP    | Core payment behavior            |
| posa_allow_credit_sale                      | Checkout and Payments         | KEEP    | Credit sale policy               |
| posa_allow_return                           | Returns and Compliance        | KEEP    | Core return enablement           |
| posa_apply_customer_discount                | Catalog and Pricing           | MOVE    | Customer discount policy         |
| use_cashback                                | Checkout and Payments         | MOVE    | Cashback handling                |
| use_customer_credit                         | Checkout and Payments         | MOVE    | Customer credit handling         |
| posa_hide_closing_shift                     | UI, Printing, and Performance | MOVE    | Shift UI visibility              |
| posa_auto_set_batch                         | Inventory and Fulfillment     | KEEP    | Batch selection automation       |
| posa_display_item_code                      | UI, Printing, and Performance | MOVE    | Item display option              |
| posa_allow_zero_rated_items                 | Catalog and Pricing           | REVIEW  | Tax/price edge case              |
| hide_expected_amount                        | UI, Printing, and Performance | MOVE    | Cash/closing display option      |
| posa_column_break_112                       | Layout (Legacy)               | REMOVE? | Legacy column break              |
| posa_allow_sales_order                      | Inventory and Fulfillment     | KEEP    | Sales order creation from POS    |
| custom_allow_select_sales_order             | Inventory and Fulfillment     | MOVE    | Sales order selection behavior   |
| posa_create_only_sales_order                | Inventory and Fulfillment     | MOVE    | Restrictive order mode           |
| posa_show_template_items                    | Catalog and Pricing           | MOVE    | Template item visibility         |
| posa_hide_variants_items                    | Catalog and Pricing           | MOVE    | Variant display control          |
| posa_fetch_coupon                           | Catalog and Pricing           | MOVE    | Coupon auto-fetch                |
| posa_allow_customer_purchase_order          | Inventory and Fulfillment     | REVIEW  | Customer PO flow                 |
| posa_allow_purchase_order                   | Inventory and Fulfillment     | REVIEW  | Purchase flow from POS           |
| posa_allow_purchase_receipt                 | Inventory and Fulfillment     | REVIEW  | Receive stock in POS             |
| posa_allow_create_purchase_items            | Inventory and Fulfillment     | REVIEW  | Item creation from POS           |
| posa_allow_create_purchase_suppliers        | Inventory and Fulfillment     | REVIEW  | Supplier creation from POS       |
| posa_allow_print_last_invoice               | UI, Printing, and Performance | MOVE    | Print shortcut                   |
| posa_display_additional_notes               | UI, Printing, and Performance | MOVE    | Notes visibility                 |
| posa_allow_write_off_change                 | Checkout and Payments         | MOVE    | Change/write-off handling        |
| posa_new_line                               | UI, Printing, and Performance | MOVE    | Cart line behavior               |
| posa_input_qty                              | UI, Printing, and Performance | MOVE    | Quantity input mode              |
| posa_allow_print_draft_invoices             | UI, Printing, and Performance | MOVE    | Draft print policy               |
| posa_use_delivery_charges                   | Inventory and Fulfillment     | MOVE    | Delivery charge enablement       |
| posa_auto_set_delivery_charges              | Inventory and Fulfillment     | MOVE    | Delivery charge automation       |
| posa_allow_duplicate_customer_names         | Identity and Access           | REVIEW  | Customer master policy           |
| pos_awesome_payments                        | Layout (Legacy)               | REMOVE? | Legacy section break             |
| posa_use_pos_awesome_payments               | Checkout and Payments         | KEEP    | Payment subsystem toggle         |
| column_break_uolvm                          | Layout (Legacy)               | REMOVE? | Legacy column break              |
| posa_allow_make_new_payments                | Checkout and Payments         | MOVE    | Payment creation permission      |
| posa_allow_reconcile_payments               | Checkout and Payments         | MOVE    | Reconciliation permission        |
| posa_allow_mpesa_reconcile_payments         | Checkout and Payments         | MOVE    | M-Pesa reconciliation permission |
| posa_pos_awesome_advance_settings           | Layout (Legacy)               | REMOVE? | Legacy section break             |
| posa_allow_submissions_in_background_job    | UI, Printing, and Performance | REVIEW  | Performance and async behavior   |
| posa_search_serial_no                       | UI, Printing, and Performance | MOVE    | Search behavior                  |
| posa_search_batch_no                        | UI, Printing, and Performance | MOVE    | Search behavior                  |
| posa_tax_inclusive                          | Returns and Compliance        | KEEP    | Tax treatment at POS             |
| column_break_dqsba                          | Layout (Legacy)               | REMOVE? | Legacy column break              |
| posa_local_storage                          | UI, Printing, and Performance | KEEP    | Offline and cache policy         |
| posa_force_server_items                     | UI, Printing, and Performance | KEEP    | Item source mode                 |
| posa_use_server_cache                       | UI, Printing, and Performance | KEEP    | Caching policy                   |
| posa_server_cache_duration                  | UI, Printing, and Performance | MOVE    | Cache TTL                        |
| column_break_anyol                          | Layout (Legacy)               | REMOVE? | Legacy column break              |
| pose_use_limit_search                       | UI, Printing, and Performance | MOVE    | Search limit toggle              |
| posa_search_limit                           | UI, Printing, and Performance | MOVE    | Search size control              |
| posa_allow_return_without_invoice           | Returns and Compliance        | KEEP    | Return policy                    |
| posa_allow_free_batch_return                | Returns and Compliance        | REVIEW  | Batch return exception           |
| posa_allow_multi_currency                   | Checkout and Payments         | KEEP    | Multi-currency checkout          |
| posa_allow_delete_offline_invoice           | UI, Printing, and Performance | REVIEW  | Offline cleanup policy           |
| posa_allow_price_list_rate_change           | Catalog and Pricing           | MOVE    | Price list override permission   |
| posa_decimal_precision                      | Catalog and Pricing           | MOVE    | Numeric precision policy         |
| posa_force_reload_items                     | UI, Printing, and Performance | REVIEW  | Item sync behavior               |
| posa_smart_reload_mode                      | UI, Printing, and Performance | REMOVE? | Candidate unused field           |
| posa_display_discount_percentage            | Catalog and Pricing           | MOVE    | Discount display mode            |
| posa_display_discount_amount                | Catalog and Pricing           | MOVE    | Discount display mode            |
| posa_silent_print                           | UI, Printing, and Performance | KEEP    | Print workflow                   |
| posa_language                               | Identity and Access           | KEEP    | POS locale                       |
| posa_default_country                        | Identity and Access           | MOVE    | Regional defaulting              |
| posa_block_sale_beyond_available_qty        | Inventory and Fulfillment     | KEEP    | Stock blocking rule              |
| posa_allow_line_item_name_override          | Catalog and Pricing           | REVIEW  | Item naming override policy      |
| posa_show_custom_name_marker_on_print       | UI, Printing, and Performance | MOVE    | Receipt printing marker          |
| create_pos_invoice_instead_of_sales_invoice | Returns and Compliance        | KEEP    | Compliance/document mode         |
| posa_sales_persons                          | Identity and Access           | KEEP    | Allowed sales persons            |
| posa_display_authorization_code             | Checkout and Payments         | MOVE    | Payment/auth display             |
| posa_enable_return_validity                 | Returns and Compliance        | KEEP    | Return validity enforcement      |
| posa_return_validity_days                   | Returns and Compliance        | KEEP    | Validity window                  |
| posa_open_print_in_new_tab                  | UI, Printing, and Performance | MOVE    | Browser print behavior           |
| posa_print_format_rules                     | UI, Printing, and Performance | KEEP    | Print routing/format rules       |

## POSP-003 Proposed Tab and Section Layout (No Behavior Change)

Goal: reorganize only the form layout first. No logic change, no field rename, no default change.

### Tab 0 (First Screen): Core Setup

This must be the first visible section when page opens.
Without this, POS should not be considered ready.

- Core Required (show at top, clearly highlighted)
    - company (core)
    - warehouse (core)
    - currency (core)
    - selling_price_list (core)
    - customer (core)
    - cost_center (core)
    - taxes_and_charges (core)
    - payments (core child table)
- Core Operational Toggles
    - update_stock (core)
    - create_pos_invoice_instead_of_sales_invoice
    - posa_use_pos_awesome_payments
    - posa_allow_multi_currency
    - posa_block_sale_beyond_available_qty

### Tab 1: Team and Access

- Company and Operational Scope
    - posa_default_country
    - posa_language
- Staff and Permissions
    - posa_sales_persons
    - posa_allow_duplicate_customer_names
    - posa_allow_change_posting_date

### Tab 2: Pricing

- Price Source and Overrides
    - selling_price_list (core)
    - posa_force_price_from_customer_price_list
    - posa_allow_price_list_rate_change
    - posa_allow_user_to_edit_rate
- Discount Controls
    - posa_use_percentage_discount
    - posa_max_discount_allowed
    - posa_allow_user_to_edit_additional_discount
    - posa_allow_user_to_edit_item_discount
    - posa_apply_customer_discount
    - posa_display_discount_percentage
    - posa_display_discount_amount
- Item Presentation
    - posa_show_template_items
    - posa_hide_variants_items
    - posa_display_item_code
    - posa_allow_line_item_name_override
    - posa_show_custom_name_marker_on_print

### Tab 3: Payments

- Payment Methods and Modes
    - posa_cash_mode_of_payment
    - posa_use_pos_awesome_payments
    - posa_allow_make_new_payments
    - posa_allow_partial_payment
    - posa_allow_credit_sale
    - posa_allow_multi_currency
- Settlement and Reconciliation
    - posa_allow_reconcile_payments
    - posa_allow_mpesa_reconcile_payments
    - use_cashback
    - use_customer_credit
    - posa_allow_write_off_change
    - posa_display_authorization_code
    - hide_expected_amount

### Tab 4: Returns and Tax

- Return Policy
    - posa_allow_return
    - posa_allow_return_without_invoice
    - posa_enable_return_validity
    - posa_return_validity_days
    - posa_allow_free_batch_return
- Invoice and Tax Policy
    - create_pos_invoice_instead_of_sales_invoice
    - posa_tax_inclusive
    - posa_allow_zero_rated_items

### Tab 5: Stock and Orders

- Stock Controls
    - posa_block_sale_beyond_available_qty
    - posa_display_items_in_stock
    - posa_auto_set_batch
- Sales/Purchase Operations from POS
    - posa_allow_sales_order
    - custom_allow_select_sales_order
    - posa_create_only_sales_order
    - posa_default_sales_order
    - posa_allow_customer_purchase_order
    - posa_allow_purchase_order
    - posa_allow_purchase_receipt
    - posa_allow_create_purchase_items
    - posa_allow_create_purchase_suppliers
- Delivery Charges and Coupon
    - posa_use_delivery_charges
    - posa_auto_set_delivery_charges
    - posa_fetch_coupon

### Tab 6: Interface and Speed

- POS Interaction and Input
    - posa_default_card_view
    - posa_new_line
    - posa_input_qty
    - posa_display_additional_notes
    - posa_hide_closing_shift
- Search and Scan
    - posa_enable_camera_scanning
    - posa_camera_scan_type
    - posa_search_serial_no
    - posa_search_batch_no
    - pose_use_limit_search
    - posa_search_limit
- Printing
    - posa_silent_print
    - posa_open_print_in_new_tab
    - posa_allow_print_last_invoice
    - posa_allow_print_draft_invoices
    - posa_print_format_rules
- Data Fetch, Cache, and Offline
    - posa_local_storage
    - posa_force_server_items
    - posa_use_server_cache
    - posa_server_cache_duration
    - posa_force_reload_items
    - posa_smart_reload_mode (candidate remove later)
    - posa_allow_delete_offline_invoice
    - posa_allow_submissions_in_background_job
    - posa_decimal_precision
    - posa_allow_delete

### Legacy Layout Fields (Planned to Remove After Re-layout)

- posa_pos_awesome_settings
- pos_awesome_payments
- posa_pos_awesome_advance_settings
- posa_col_1
- posa_column_break_112
- column_break_uolvm
- column_break_dqsba
- column_break_anyol

### POSP-003 Verification Checklist

- Existing values remain unchanged after layout update
- Core Setup section appears first on page load
- POS cannot be marked ready until core fields are selected
- POS loads successfully for profiles with old and new data
- Payments section still reads `payments` child table correctly
- Print rules still resolve from `posa_print_format_rules`
- Return validity flow still enforces `posa_enable_return_validity` and `posa_return_validity_days`
- Offline/cache toggles still control current behavior
- No hidden dependency broken by section/column break removal

## Implementation Readiness Pack

Use this pack before touching fixtures/migrations. This is intentionally strict to reduce rollout errors.

### 1) Core Readiness Contract (Blocking Rules)

POS Profile should be treated as `NOT READY` until all fields below are present:

- `company`
- `warehouse`
- `currency`
- `selling_price_list`
- `customer`
- `cost_center`
- `payments` (at least one row)

Behavior rules:

- If any required field is missing, show clear setup error in profile view and block POS opening.
- If `payments` has zero rows, block POS opening with action hint to add a mode of payment.
- If `create_pos_invoice_instead_of_sales_invoice=1`, show one-time note in Core Setup for user clarity.

Recommended user-facing error text:

- `POS Profile is incomplete. Please set: <missing_fields_list>.`
- `At least one payment mode is required in POS Profile.`

### 2) Dependency Matrix (Critical)

| If field is enabled           | Then enforce                         | On failure                                  |
| ----------------------------- | ------------------------------------ | ------------------------------------------- |
| `posa_enable_return_validity` | `posa_return_validity_days > 0`      | Block return with validation message        |
| `posa_use_server_cache`       | `posa_server_cache_duration >= 1`    | Fallback to safe default duration           |
| `pose_use_limit_search`       | `posa_search_limit >= 1`             | Fallback to default search limit            |
| `posa_enable_camera_scanning` | `posa_camera_scan_type` not empty    | Default to `Both`                           |
| `posa_use_delivery_charges`   | delivery charge setup available      | Show warning, allow save, block auto-charge |
| `posa_allow_multi_currency`   | payment method currencies resolvable | Fallback to profile currency                |

### 3) Data Migration Safety Rules

- Phase-1 (`POSP-003`) is layout-only: no rename, no delete, no default change.
- Keep all legacy section/column fields until successful production verification.
- Do not remove `REMOVE?` fields before completing `POSP-007` validation.
- Keep dual-read compatibility if any field location/order changes impact frontend assumptions.

### 4) Pre-Change Snapshot Checklist

Before first implementation commit:

- Export current `POS Profile` custom fields list (name, fieldtype, insert_after).
- Capture at least 2 real POS Profile records (anonymized) for comparison.
- Capture current POS load flow screenshots: profile select, item screen, pay screen, print flow.
- Record baseline manual results for: cash sale, credit sale, return, offline invoice, print.

### 5) Test Matrix (Must Pass)

| Scenario                                  | Expected Result                                      |
| ----------------------------------------- | ---------------------------------------------------- |
| POS open with fully configured profile    | Opens normally                                       |
| POS open with missing core field          | Blocked with clear message                           |
| Cash payment sale                         | Completes and posts correctly                        |
| Credit sale enabled                       | Credit flow available                                |
| Return with validity enabled and expired  | Blocked by validity rule                             |
| Return without invoice disabled           | Blocked                                              |
| Silent print enabled                      | Print fires without extra dialog (browser-dependent) |
| Offline mode with local storage enabled   | Invoice persists and sync path remains stable        |
| Multi-currency enabled with mixed methods | Currency selection and totals remain correct         |

### 6) Rollout and Rollback Plan

Rollout order:

1. Deploy layout-only changes to staging.
2. Run full test matrix on staging using existing POS profiles.
3. Validate no diff in business behavior (only presentation change).
4. Deploy to production in low-traffic window.
5. Monitor first 24 hours for POS open failures and payment/print issues.

Rollback (if high-severity issue):

1. Revert layout migration commit.
2. Run migrate and clear cache.
3. Validate POS open, payment, and print on one known profile.
4. Keep failed migration notes in `Decision Log` with root cause.

### 7) Known Risk Register

| Risk                                          | Severity | Mitigation                                          |
| --------------------------------------------- | -------- | --------------------------------------------------- |
| Hidden dependency on old `insert_after` chain | High     | Keep phase-1 layout-only + full staging checks      |
| Payment table rendering side effects          | High     | Verify `payments` load in Pay screen before release |
| Return policy regression                      | Medium   | Dedicated return test cases with/without invoice    |
| Offline behavior drift                        | High     | Test offline create/delete/sync paths explicitly    |
| Browser print behavior variance               | Medium   | Verify Chrome/Edge with silent/new-tab toggles      |

## Change Log

### 2026-02-09

- Initial POS Profile analysis completed
- Journal file created
- Baseline and phased workboard documented
- POSP-002 initial field mapping sheet (all 91 fields) added
- POSP-003 draft tab/section layout added
- Domain names simplified and Core Setup made first-screen section
- Implementation Readiness Pack added (validation, dependencies, tests, rollback)

## In-Progress Notes

Use this section for daily updates while a task is running.

### 2026-02-09 - POSP-003

- Start: Ongoing
- Planned: Re-layout POS Profile fields into domain tabs and clean legacy section/column breaks.
- Risk: Medium
- Affected files: `posawesome/fixtures/custom_field.json` (and/or migration patch files)
- Verification plan: Use POSP-003 verification checklist in this journal.

Template:

```md
### YYYY-MM-DD - POSP-XXX

- Start: <time>
- Planned: <what will change>
- Risk: <low/medium/high>
- Affected files: <paths>
- Verification plan: <tests/manual steps>
```

## Completion Notes

When closing a task, add a completion note.

### 2026-02-09 - POSP-002

- Completed change: Added field-by-field mapping for all `POS Profile` custom fields.
- Why: To make migration/refactor work trackable and reduce missed settings during cleanup.
- Files changed: `POS_PROFILE_ORGANIZATION_JOURNAL.md`
- Verification done: Cross-checked against `posawesome/fixtures/custom_field.json` list count (91).
- Follow-ups: Start POSP-003 and convert legacy section/column breaks into structured tabs.

Template:

```md
### YYYY-MM-DD - POSP-XXX

- Completed change:
- Why:
- Files changed:
- Verification done:
- Follow-ups:
```

## Decision Log

Track non-trivial decisions here.

| Date       | Decision                                            | Reason                                     | Impact                             |
| ---------- | --------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| 2026-02-09 | Start with non-breaking UI grouping first           | Lowest operational risk                    | Faster adoption and safer rollout  |
| 2026-02-09 | Keep backward compatibility during policy migration | Existing installs depend on current fields | Requires temporary dual-read logic |

## Next Immediate Actions

1. Start `POSP-003` and implement section/tab grouping without behavior changes
2. Apply Core Readiness Contract in UI validation and POS open guard
3. Execute full Test Matrix in staging before production rollout
