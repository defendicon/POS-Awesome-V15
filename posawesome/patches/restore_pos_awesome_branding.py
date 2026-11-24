import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


CANONICAL_FIELD_UPDATES = {
    "POS Profile-posa_pos_awesome_settings": {"label": "POS Awesome Settings"},
    "POS Profile-pos_awesome_payments": {"label": "POS Awesome Payments"},
    "POS Profile-posa_use_pos_awesome_payments": {
        "label": "Use POS Awesome Payments"
    },
    "POS Profile-posa_pos_awesome_advance_settings": {
        "label": "POS Awesome Advance Settings"
    },
    "POS Profile-posa_use_server_cache": {
        "description": "Use Redis cache on the server to speedup initial loads of POS Awesome "
    },
    "POS Profile-posa_qz_printer_name": {
        "description": "QZ Tray printer name saved from POS Awesome setup."
    },
    "POS Profile-posa_language": {
        "description": "Language for POS Awesome interface"
    },
    "POS Profile-posa_section_awesome_dashboard": {"label": "Awesome Dashboard"},
    "POS Profile-posa_enable_awesome_dashboard": {
        "label": "Enable Awesome Dashboard"
    },
    "POS Settings-posa_section_dashboard": {"label": "Awesome Dashboard"},
    "POS Settings-posa_enable_awesome_dashboard_global": {
        "label": "Enable Awesome Dashboard",
        "description": "Enable POS Awesome dashboard globally.",
    },
    "Item-retailmind_short_name": {
        "label": "POS Short Name",
        "description": "Short pharmacy display name used by POS Awesome item maintenance.",
    },
}

BRANDING_FIELDS = [
    {
        "fieldname": "posa_branding_section",
        "label": "POS Branding",
        "fieldtype": "Section Break",
        "collapsible": 1,
        "insert_after": "posa_ui_template",
    },
    {
        "fieldname": "posa_enable_custom_branding",
        "label": "Enable Custom Branding",
        "fieldtype": "Check",
        "default": "0",
        "description": "Use this POS Profile's custom name and logo in the POS navigation bar.",
        "insert_after": "posa_branding_section",
    },
    {
        "fieldname": "posa_brand_name",
        "label": "Brand Name",
        "fieldtype": "Data",
        "depends_on": "eval:doc.posa_enable_custom_branding",
        "description": "Full POS brand name. Leave blank to use POS Awesome.",
        "insert_after": "posa_enable_custom_branding",
    },
    {
        "fieldname": "posa_brand_short_name",
        "label": "Brand Short Name",
        "fieldtype": "Data",
        "depends_on": "eval:doc.posa_enable_custom_branding",
        "description": "Compact name used on small screens. Leave blank to use POS.",
        "insert_after": "posa_brand_name",
    },
    {
        "fieldname": "posa_brand_logo",
        "label": "Brand Logo",
        "fieldtype": "Attach Image",
        "depends_on": "eval:doc.posa_enable_custom_branding",
        "description": "Optional logo shown in the POS navigation bar.",
        "insert_after": "posa_brand_short_name",
    },
]


def _upsert_custom_field(doctype, field):
    custom_field_name = f"{doctype}-{field['fieldname']}"
    if not frappe.db.exists("Custom Field", custom_field_name):
        create_custom_field(doctype, field)
        return

    frappe.db.set_value(
        "Custom Field",
        custom_field_name,
        field,
        update_modified=False,
    )


def execute():
    changed_doctypes = set()
    for custom_field_name, updates in CANONICAL_FIELD_UPDATES.items():
        if not frappe.db.exists("Custom Field", custom_field_name):
            continue
        frappe.db.set_value(
            "Custom Field",
            custom_field_name,
            updates,
            update_modified=False,
        )
        changed_doctypes.add(custom_field_name.split("-", 1)[0])

    for field in BRANDING_FIELDS:
        _upsert_custom_field("POS Profile", field)
    changed_doctypes.add("POS Profile")

    ui_template_field = "POS Profile-posa_ui_template"
    if frappe.db.exists("Custom Field", ui_template_field):
        frappe.db.set_value(
            "Custom Field",
            ui_template_field,
            "options",
            "Classic\nPOS Awesome Counter Grid\nPOS Awesome Retail",
            update_modified=False,
        )
        frappe.db.set_value(
            "POS Profile",
            {"posa_ui_template": "RetailMind Counter Grid"},
            "posa_ui_template",
            "POS Awesome Counter Grid",
            update_modified=False,
        )

    cash_field = "POS Profile-posa_cash_mode_of_payment"
    if frappe.db.exists("Custom Field", cash_field):
        frappe.db.set_value(
            "Custom Field",
            cash_field,
            "insert_after",
            "posa_brand_logo",
            update_modified=False,
        )

    for doctype in changed_doctypes:
        frappe.clear_cache(doctype=doctype)
