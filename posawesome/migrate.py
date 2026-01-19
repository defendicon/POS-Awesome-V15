import frappe
from frappe.utils.fixtures import sync_fixtures

from posawesome.uninstall import clear_custom_fields_and_properties


def reset_custom_fields_on_migrate():
    """Remove POS Awesome custom fields/properties then re-apply fixtures."""
    clear_custom_fields_and_properties()
    sync_fixtures("posawesome")
