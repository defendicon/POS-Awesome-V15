import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


SECTION_FIELDS = [
    {
        "fieldname": "posa_section_pricing_controls",
        "label": "Pricing and Discount Controls",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_sales_returns",
        "label": "Sales and Return Controls",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_sales_purchase",
        "label": "Sales and Purchase Flows",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_inventory_controls",
        "label": "Inventory and Item Controls",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_print_delivery",
        "label": "Printing and Delivery",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_cash_movement",
        "label": "Cash Movement",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_customer_display",
        "label": "Customer Display",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
    {
        "fieldname": "posa_section_awesome_dashboard",
        "label": "Awesome Dashboard",
        "fieldtype": "Section Break",
        "collapsible": 1,
    },
]


ORDERED_CHAIN = [
    "posa_pos_awesome_settings",
    "posa_cash_mode_of_payment",
    "posa_language",
    "posa_default_country",
    "posa_show_customer_balance",
    "posa_hide_closing_shift",
    "posa_allow_change_posting_date",
    "posa_allow_delete",
    "posa_allow_multi_currency",
    "posa_decimal_precision",
    "create_pos_invoice_instead_of_sales_invoice",
    "posa_col_1",
    "posa_section_pricing_controls",
    "posa_allow_user_to_edit_rate",
    "posa_allow_user_to_edit_additional_discount",
    "posa_allow_user_to_edit_item_discount",
    "posa_use_percentage_discount",
    "posa_max_discount_allowed",
    "posa_display_discount_percentage",
    "posa_display_discount_amount",
    "posa_allow_price_list_rate_change",
    "posa_force_price_from_customer_price_list",
    "posa_section_sales_returns",
    "posa_allow_credit_sale",
    "posa_allow_return",
    "posa_allow_return_without_invoice",
    "posa_allow_free_batch_return",
    "posa_enable_return_validity",
    "posa_return_validity_days",
    "use_cashback",
    "use_customer_credit",
    "posa_sales_persons",
    "posa_apply_customer_discount",
    "posa_allow_write_off_change",
    "hide_expected_amount",
    "posa_column_break_112",
    "posa_section_sales_purchase",
    "posa_allow_sales_order",
    "custom_allow_select_sales_order",
    "posa_create_only_sales_order",
    "posa_default_sales_order",
    "posa_allow_customer_purchase_order",
    "posa_allow_purchase_order",
    "posa_allow_purchase_receipt",
    "posa_allow_create_purchase_items",
    "posa_allow_create_purchase_suppliers",
    "posa_section_inventory_controls",
    "posa_display_items_in_stock",
    "posa_display_item_code",
    "posa_default_card_view",
    "posa_enable_camera_scanning",
    "posa_camera_scan_type",
    "posa_show_template_items",
    "posa_hide_variants_items",
    "posa_auto_set_batch",
    "posa_search_batch_no",
    "posa_search_serial_no",
    "posa_block_sale_beyond_available_qty",
    "posa_allow_line_item_name_override",
    "posa_show_custom_name_marker_on_print",
    "posa_allow_zero_rated_items",
    "posa_input_qty",
    "posa_new_line",
    "posa_section_print_delivery",
    "posa_use_delivery_charges",
    "posa_auto_set_delivery_charges",
    "posa_display_additional_notes",
    "posa_display_authorization_code",
    "posa_allow_print_last_invoice",
    "posa_allow_print_draft_invoices",
    "posa_open_print_in_new_tab",
    "posa_silent_print",
    "posa_print_format_rules",
    "posa_section_cash_movement",
    "posa_enable_cash_movement",
    "posa_allow_pos_expense",
    "posa_allow_cash_deposit",
    "posa_default_expense_account",
    "posa_allowed_expense_accounts",
    "posa_default_source_account",
    "posa_allow_source_account_override",
    "posa_allowed_source_accounts",
    "posa_back_office_cash_account",
    "posa_allow_cancel_submitted_cash_movement",
    "posa_allow_delete_cancelled_cash_movement",
    "posa_require_cash_movement_remarks",
    "posa_cash_movement_max_amount",
    "posa_section_customer_display",
    "posa_enable_customer_display",
    "posa_auto_open_customer_display",
    "posa_section_awesome_dashboard",
    "posa_enable_awesome_dashboard",
    "posa_allow_company_dashboard_scope",
    "posa_low_stock_alert_threshold",
    "pos_awesome_payments",
    "posa_use_pos_awesome_payments",
    "posa_allow_partial_payment",
    "column_break_uolvm",
    "posa_allow_make_new_payments",
    "posa_allow_reconcile_payments",
    "posa_allow_mpesa_reconcile_payments",
    "posa_pos_awesome_advance_settings",
    "posa_allow_submissions_in_background_job",
    "column_break_dqsba",
    "posa_local_storage",
    "posa_force_server_items",
    "posa_use_server_cache",
    "posa_server_cache_duration",
    "posa_force_reload_items",
    "posa_smart_reload_mode",
    "column_break_anyol",
    "pose_use_limit_search",
    "posa_search_limit",
    "posa_tax_inclusive",
    "posa_allow_duplicate_customer_names",
    "posa_fetch_coupon",
    "posa_allow_delete_offline_invoice",
]


def _ensure_section_fields():
    for field in SECTION_FIELDS:
        fieldname = field["fieldname"]
        cf_name = f"POS Profile-{fieldname}"
        if not frappe.db.exists("Custom Field", cf_name):
            create_custom_field(
                "POS Profile",
                {
                    **field,
                    "insert_after": "posa_pos_awesome_settings",
                },
            )
        else:
            frappe.db.set_value(
                "Custom Field",
                cf_name,
                {
                    "label": field["label"],
                    "fieldtype": "Section Break",
                    "collapsible": 1,
                },
                update_modified=False,
            )


def _set_insert_after(fieldname, insert_after):
    cf_name = f"POS Profile-{fieldname}"
    if not frappe.db.exists("Custom Field", cf_name):
        return False
    frappe.db.set_value(
        "Custom Field",
        cf_name,
        "insert_after",
        insert_after,
        update_modified=False,
    )
    return True


def _reanchor_fields():
    # Keep the primary POS Awesome section attached to POS Profile core field.
    _set_insert_after("posa_pos_awesome_settings", "company_address")

    previous = None
    for fieldname in ORDERED_CHAIN:
        cf_name = f"POS Profile-{fieldname}"
        if not frappe.db.exists("Custom Field", cf_name):
            continue
        if previous and previous != fieldname:
            _set_insert_after(fieldname, previous)
        previous = fieldname


def execute():
    _ensure_section_fields()
    _reanchor_fields()
    frappe.clear_cache(doctype="POS Profile")
