import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields(
        {
            "POS Profile": [
                {
                    "fieldname": "posa_allow_item_exchange",
                    "label": "Allow Item Exchange",
                    "fieldtype": "Check",
                    "default": "0",
                    "description": (
                        "Create a linked return and replacement Sales Invoice and "
                        "collect only the net difference."
                    ),
                    "depends_on": (
                        "eval:doc.posa_allow_return==1 && "
                        "!doc.create_pos_invoice_instead_of_sales_invoice"
                    ),
                    "insert_after": "posa_allow_return",
                }
            ]
        },
        update=True,
    )
    frappe.clear_cache(doctype="POS Profile")
