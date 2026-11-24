"""Hand the ``Sales Invoice Reference`` DocType back to ERPNext.

ERPNext v16 ships its own ``Sales Invoice Reference`` (module Accounts). Older
POS Awesome releases shipped a DocType with the same name, which overwrote
ERPNext's definition on every migrate and registered it under the POSAwesome
module (so uninstalling POS Awesome would drop the shared table).

POS Awesome no longer syncs a standard copy of the DocType. Its extra fields are provided as
Custom Fields and its fetch behaviour as Property Setters (see fixtures), so
POS Closing Shift rows keep the same values. Existing rows are not touched:
the table name, columns and data stay as they are.
"""

import importlib.util
import json
from pathlib import Path

import frappe

DOCTYPE = "Sales Invoice Reference"
ERPNEXT_MODULE = "erpnext.accounts.doctype.sales_invoice_reference.sales_invoice_reference"


def execute():
    try:
        has_erpnext_definition = importlib.util.find_spec(ERPNEXT_MODULE) is not None
    except ModuleNotFoundError as error:
        # v15 has no sales_invoice_reference package. Other broken ERPNext
        # imports must still fail visibly rather than hiding an installation error.
        if error.name not in (
            "erpnext.accounts.doctype.sales_invoice_reference",
            ERPNEXT_MODULE,
        ):
            raise
        has_erpnext_definition = False

    if not has_erpnext_definition:
        _ensure_v15_definition()
        return

    if frappe.db.exists("DocType", DOCTYPE):
        if (
            frappe.db.get_value("DocType", DOCTYPE, "module") == "Accounts"
            and not frappe.db.get_value("DocType", DOCTYPE, "custom")
        ):
            return
        frappe.db.set_value(
            "DocType", DOCTYPE, {"module": "Accounts", "custom": 0}, update_modified=False
        )

    frappe.reload_doc("accounts", "doctype", "sales_invoice_reference", force=True)
    frappe.clear_cache(doctype=DOCTYPE)


def _ensure_v15_definition():
    """Keep v15 closing shifts working without a competing standard DocType.

    A custom child table uses Frappe's generic Document controller and is not
    treated as an orphan after the old Python controller is removed. Converting
    metadata does not delete or rewrite any child rows or currency values.
    """
    if frappe.db.exists("DocType", DOCTYPE):
        doc = frappe.get_doc("DocType", DOCTYPE)
        extra_fields = {"transaction_currency", "transaction_amount"}
        fields = [field for field in doc.fields if field.fieldname not in extra_fields]
        if doc.custom and len(fields) == len(doc.fields):
            return
        doc.custom = 1
        doc.set("fields", fields)
        doc.save(ignore_permissions=True)
    else:
        schema_path = Path(__file__).resolve().parents[1] / "compat" / "sales_invoice_reference.json"
        doc = frappe.get_doc(json.loads(schema_path.read_text(encoding="utf-8")))
        doc.insert(ignore_permissions=True)

    frappe.clear_cache(doctype=DOCTYPE)
