import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


FIELD = {
    "fieldname": "posa_ui_template",
    "label": "POS Interface",
    "fieldtype": "Select",
    "options": "Classic\nPOS Awesome Counter Grid\nNornux",
    "default": "Classic",
    "description": (
        "Select the selling interface for this POS Profile. Counter Grid is "
        "used only on screens at least 1024 pixels wide."
    ),
    "insert_after": "posa_pos_awesome_settings",
}


def execute():
    custom_field_name = f"POS Profile-{FIELD['fieldname']}"
    if not frappe.db.exists("Custom Field", custom_field_name):
        create_custom_field("POS Profile", FIELD)
    else:
        frappe.db.set_value(
            "Custom Field",
            custom_field_name,
            FIELD,
            update_modified=False,
        )

    cash_field_name = "POS Profile-posa_cash_mode_of_payment"
    if frappe.db.exists("Custom Field", cash_field_name):
        frappe.db.set_value(
            "Custom Field",
            cash_field_name,
            "insert_after",
            FIELD["fieldname"],
            update_modified=False,
        )

    frappe.clear_cache(doctype="POS Profile")
