import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


FIELDS_BY_DOCTYPE = {
    "Sales Invoice": [
        {
            "fieldname": "posa_redeemed_customer_credit",
            "label": "Customer Credit Used",
            "fieldtype": "Currency",
            "insert_after": "advances",
            "read_only": 1,
            "no_copy": 1,
            "print_hide_if_no_value": 1,
        },
        {
            "fieldname": "posa_remaining_customer_credit_balance",
            "label": "Remaining Customer Credit Balance",
            "fieldtype": "Currency",
            "insert_after": "posa_redeemed_customer_credit",
            "read_only": 1,
            "no_copy": 1,
            "print_hide_if_no_value": 1,
        },
    ],
    "POS Invoice": [
        {
            "fieldname": "posa_redeemed_customer_credit",
            "label": "Customer Credit Used",
            "fieldtype": "Currency",
            "insert_after": "payments",
            "read_only": 1,
            "no_copy": 1,
            "print_hide_if_no_value": 1,
        },
        {
            "fieldname": "posa_remaining_customer_credit_balance",
            "label": "Remaining Customer Credit Balance",
            "fieldtype": "Currency",
            "insert_after": "posa_redeemed_customer_credit",
            "read_only": 1,
            "no_copy": 1,
            "print_hide_if_no_value": 1,
        },
    ],
}


def execute():
    for doctype, fields in FIELDS_BY_DOCTYPE.items():
        for field in fields:
            custom_field_name = f"{doctype}-{field['fieldname']}"
            if not frappe.db.exists("Custom Field", custom_field_name):
                create_custom_field(doctype, field)
                continue

            frappe.db.set_value(
                "Custom Field",
                custom_field_name,
                {
                    "label": field["label"],
                    "fieldtype": field["fieldtype"],
                    "insert_after": field["insert_after"],
                    "read_only": field["read_only"],
                    "no_copy": field["no_copy"],
                    "print_hide_if_no_value": field["print_hide_if_no_value"],
                },
                update_modified=False,
            )
        frappe.clear_cache(doctype=doctype)
