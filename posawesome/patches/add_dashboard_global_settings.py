import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


def _upsert_custom_field(doctype, field):
    fieldname = field["fieldname"]
    custom_field_name = f"{doctype}-{fieldname}"

    if not frappe.db.exists("Custom Field", custom_field_name):
        create_custom_field(doctype, field)
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
            "fieldname": "posa_section_dashboard",
            "label": "Awesome Dashboard",
            "fieldtype": "Section Break",
            "collapsible": 1,
            "insert_after": "posa_return_validity_days",
        },
        {
            "fieldname": "posa_enable_awesome_dashboard_global",
            "label": "Enable Awesome Dashboard",
            "fieldtype": "Check",
            "default": "1",
            "description": "Enable POS Awesome dashboard globally.",
            "insert_after": "posa_section_dashboard",
        },
        {
            "fieldname": "posa_dashboard_default_scope",
            "label": "Dashboard Default Scope",
            "fieldtype": "Select",
            "options": "All Profiles\nCurrent Profile",
            "default": "All Profiles",
            "depends_on": "eval:doc.posa_enable_awesome_dashboard_global==1",
            "description": "Default dashboard scope when POS opens.",
            "insert_after": "posa_enable_awesome_dashboard_global",
        },
        {
            "fieldname": "posa_dashboard_low_stock_alert_threshold",
            "label": "Dashboard Low Stock Alert Threshold",
            "fieldtype": "Int",
            "default": "10",
            "depends_on": "eval:doc.posa_enable_awesome_dashboard_global==1",
            "description": "Fallback low-stock threshold when profile-specific value is not set.",
            "insert_after": "posa_dashboard_default_scope",
        },
    ]

    for field in fields:
        _upsert_custom_field("POS Settings", field)

    frappe.clear_cache(doctype="POS Settings")
