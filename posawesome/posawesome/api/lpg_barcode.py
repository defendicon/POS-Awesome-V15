"""
Builds the receipt-barcode payload for Sales Invoice / POS Invoice.

Encoding format (Code128-friendly, kept under 30 chars):

    {invoice_name}|{total_kg}

    e.g. "ACC-SINV-2026-00001|62.50"

Stored on `Sales Invoice.posa_receipt_barcode` (Data, read-only). Print formats
render this as a Code128 barcode via Frappe's built-in {{ get_barcode_image }}.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt


def set_receipt_barcode(doc, method=None):
    """Compute and stamp the barcode payload on validate."""
    name = doc.name or "DRAFT"
    total_kg = 0.0
    for row in getattr(doc, "items", None) or []:
        total_kg += flt(getattr(row, "posa_kg_qty", 0) or 0)

    # Pipe-delimited so a single barcode encodes both invoice ID and Kg total.
    payload = f"{name}|{flt(total_kg, 2)}"

    if hasattr(doc, "posa_receipt_barcode") or "posa_receipt_barcode" in (doc.as_dict() or {}):
        doc.posa_receipt_barcode = payload


@frappe.whitelist()
def get_barcode_payload(invoice_name: str) -> dict:
    """Used by Vue print previews / Electron client when offline."""
    doctype = "Sales Invoice"
    if not frappe.db.exists(doctype, invoice_name):
        if frappe.db.exists("POS Invoice", invoice_name):
            doctype = "POS Invoice"
        else:
            frappe.throw(f"Invoice {invoice_name} not found.")

    row = frappe.db.get_value(
        doctype, invoice_name, ["name", "posa_receipt_barcode"], as_dict=True
    ) or {}
    return {
        "invoice_name": row.get("name"),
        "payload": row.get("posa_receipt_barcode") or "",
        "doctype": doctype,
    }
