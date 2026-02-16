import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


def _upsert_custom_field(field):
    fieldname = field["fieldname"]
    custom_field_name = f"POS Profile-{fieldname}"

    if not frappe.db.exists("Custom Field", custom_field_name):
        create_custom_field("POS Profile", field)
        return

    updates = {k: v for k, v in field.items() if k != "insert_after"}
    if updates:
        frappe.db.set_value(
            "Custom Field",
            custom_field_name,
            updates,
            update_modified=False,
        )

    insert_after = field.get("insert_after")
    if insert_after:
        frappe.db.set_value(
            "Custom Field",
            custom_field_name,
            "insert_after",
            insert_after,
            update_modified=False,
        )


def execute():
    fields = [
        {
            "fieldname": "posa_section_customer_display",
            "label": "Customer Display",
            "fieldtype": "Section Break",
            "collapsible": 1,
            "insert_after": "posa_print_format_rules",
        },
        {
            "fieldname": "posa_enable_customer_display",
            "label": "Enable Customer Display",
            "fieldtype": "Check",
            "default": "0",
            "description": "Allow opening a read-only customer-facing cart screen.",
            "insert_after": "posa_section_customer_display",
        },
        {
            "fieldname": "posa_auto_open_customer_display",
            "label": "Auto Open Customer Display",
            "fieldtype": "Check",
            "default": "0",
            "depends_on": "eval:doc.posa_enable_customer_display==1",
            "description": "Open customer display window automatically when POS screen loads.",
            "insert_after": "posa_enable_customer_display",
        },
    ]

    for field in fields:
        _upsert_custom_field(field)

    frappe.clear_cache(doctype="POS Profile")
