import frappe


CUSTOM_FIELD_NAME = "Item Barcode-posa_uom"


def execute():
    if not frappe.db.exists("Custom Field", CUSTOM_FIELD_NAME):
        return

    frappe.delete_doc("Custom Field", CUSTOM_FIELD_NAME, ignore_permissions=True, force=True)
    frappe.clear_cache(doctype="Item Barcode")
