import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


def execute():
    fields = [
        {
            "fieldname": "posa_enable_cash_movement",
            "label": "Enable Cash Movement",
            "fieldtype": "Check",
            "default": "0",
            "insert_after": "posa_print_format_rules",
        },
        {
            "fieldname": "posa_allow_pos_expense",
            "label": "Allow POS Expense",
            "fieldtype": "Check",
            "default": "0",
            "depends_on": "eval:doc.posa_enable_cash_movement==1",
            "insert_after": "posa_enable_cash_movement",
        },
        {
            "fieldname": "posa_allow_cash_deposit",
            "label": "Allow Cash Deposit",
            "fieldtype": "Check",
            "default": "0",
            "depends_on": "eval:doc.posa_enable_cash_movement==1",
            "insert_after": "posa_allow_pos_expense",
        },
        {
            "fieldname": "posa_default_expense_account",
            "label": "Default POS Expense Account",
            "fieldtype": "Link",
            "options": "Account",
            "depends_on": "eval:doc.posa_enable_cash_movement==1 && doc.posa_allow_pos_expense==1",
            "insert_after": "posa_allow_cash_deposit",
        },
        {
            "fieldname": "posa_back_office_cash_account",
            "label": "Back Office Cash Account",
            "fieldtype": "Link",
            "options": "Account",
            "depends_on": "eval:doc.posa_enable_cash_movement==1 && doc.posa_allow_cash_deposit==1",
            "insert_after": "posa_default_expense_account",
        },
        {
            "fieldname": "posa_allow_cancel_submitted_cash_movement",
            "label": "Allow Cancel Submitted Cash Movement",
            "fieldtype": "Check",
            "default": "0",
            "depends_on": "eval:doc.posa_enable_cash_movement==1",
            "insert_after": "posa_back_office_cash_account",
        },
        {
            "fieldname": "posa_allow_delete_cancelled_cash_movement",
            "label": "Allow Delete Cancelled Cash Movement",
            "fieldtype": "Check",
            "default": "0",
            "depends_on": "eval:doc.posa_enable_cash_movement==1",
            "insert_after": "posa_allow_cancel_submitted_cash_movement",
        },
        {
            "fieldname": "posa_require_cash_movement_remarks",
            "label": "Require Cash Movement Remarks",
            "fieldtype": "Check",
            "default": "1",
            "depends_on": "eval:doc.posa_enable_cash_movement==1",
            "insert_after": "posa_allow_delete_cancelled_cash_movement",
        },
        {
            "fieldname": "posa_cash_movement_max_amount",
            "label": "Cash Movement Max Amount",
            "fieldtype": "Currency",
            "options": "Company:company:default_currency",
            "depends_on": "eval:doc.posa_enable_cash_movement==1",
            "insert_after": "posa_require_cash_movement_remarks",
        },
    ]

    for field in fields:
        custom_field_name = f"POS Profile-{field['fieldname']}"
        if not frappe.db.exists("Custom Field", custom_field_name):
            create_custom_field("POS Profile", field)
