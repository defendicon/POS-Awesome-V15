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
            "fieldname": "posa_section_awesome_dashboard",
            "label": "Awesome Dashboard",
            "fieldtype": "Section Break",
            "collapsible": 1,
            "insert_after": "posa_auto_open_customer_display",
        },
        {
            "fieldname": "posa_enable_awesome_dashboard",
            "label": "Enable Awesome Dashboard",
            "fieldtype": "Check",
            "default": "1",
            "description": "Show in-POS retail dashboard and reporting widgets.",
            "insert_after": "posa_section_awesome_dashboard",
        },
        {
            "fieldname": "posa_allow_company_dashboard_scope",
            "label": "Enable Company-Wide Dashboard Scope",
            "fieldtype": "Check",
            "default": "1",
            "depends_on": "eval:doc.posa_enable_awesome_dashboard==1",
            "description": "Allow this profile to view all company profiles in dashboard scope selector.",
            "insert_after": "posa_enable_awesome_dashboard",
        },
        {
            "fieldname": "posa_low_stock_alert_threshold",
            "label": "Low Stock Alert Threshold",
            "fieldtype": "Int",
            "default": "10",
            "depends_on": "eval:doc.posa_enable_awesome_dashboard==1",
            "description": "Items with stock at or below this value are highlighted in dashboard alerts.",
            "insert_after": "posa_allow_company_dashboard_scope",
        },
    ]

    for field in fields:
        _upsert_custom_field(field)

    frappe.clear_cache(doctype="POS Profile")
