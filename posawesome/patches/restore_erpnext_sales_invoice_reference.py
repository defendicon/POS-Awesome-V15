"""Hand the ``Sales Invoice Reference`` DocType back to ERPNext.

ERPNext v16 ships its own ``Sales Invoice Reference`` (module Accounts). Older
POS Awesome releases shipped a DocType with the same name, which overwrote
ERPNext's definition on every migrate and registered it under the POSAwesome
module (so uninstalling POS Awesome would drop the shared table).

POS Awesome no longer ships the DocType. Its extra fields are provided as
Custom Fields and its fetch behaviour as Property Setters (see fixtures), so
POS Closing Shift rows keep the same values. Existing rows are not touched:
the table name, columns and data stay as they are.
"""

import importlib.util

import frappe

DOCTYPE = "Sales Invoice Reference"
ERPNEXT_MODULE = "erpnext.accounts.doctype.sales_invoice_reference.sales_invoice_reference"


def execute():
    if not frappe.db.exists("DocType", DOCTYPE):
        return

    # Only ERPNext versions that ship this DocType (v16+) can take it back.
    if importlib.util.find_spec(ERPNEXT_MODULE) is None:
        return

    if frappe.db.get_value("DocType", DOCTYPE, "module") != "Accounts":
        frappe.db.set_value("DocType", DOCTYPE, "module", "Accounts", update_modified=False)

    frappe.reload_doc("accounts", "doctype", "sales_invoice_reference", force=True)
    frappe.clear_cache(doctype=DOCTYPE)
