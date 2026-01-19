import frappe
from frappe.utils.fixtures import sync_fixtures

from posawesome.uninstall import clear_custom_fields_and_properties


def _delete_posawesome_custom_fields():
    custom_fields = frappe.db.get_all(
        "Custom Field",
        filters={"name": ("like", "%-posa_%")},
        pluck="name",
    )
    for name in custom_fields:
        frappe.db.delete("Custom Field", {"name": name})

    property_setters = frappe.db.get_all(
        "Property Setter",
        filters={"name": ("like", "%-posa_%")},
        pluck="name",
    )
    for name in property_setters:
        frappe.db.delete("Property Setter", {"name": name})


def reset_custom_fields_on_migrate():
    """Remove POS Awesome custom fields/properties then re-apply fixtures."""
    clear_custom_fields_and_properties()
    _delete_posawesome_custom_fields()
    sync_fixtures("posawesome")
