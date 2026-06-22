# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

"""Data source connectors (Sales Order, Delivery Note, BOM) with atomic serial counter."""

import frappe
from frappe import _
from frappe.model.naming import make_autoname


@frappe.whitelist()
def search_label_source_documents(source_type: str, search_term: str, company: str = None):
    """Search SO/DN/BOM scoped to POS Profile company."""
    if not company:
        company = frappe.defaults.get_user_default("Company")

    search_val = f"%{search_term}%"

    if source_type == "Sales Order":
        docs = frappe.get_all(
            "Sales Order",
            filters={"company": company, "docstatus": 1, "status": ["in", ["To Deliver and Bill", "To Deliver"]]},
            or_filters=[
                ["name", "like", search_val],
                ["customer", "like", search_val],
            ],
            fields=["name", "customer", "transaction_date", "grand_total", "status"],
            limit=20,
        )
        return [{"type": "Sales Order", **d} for d in docs]

    if source_type == "Delivery Note":
        docs = frappe.get_all(
            "Delivery Note",
            filters={"company": company, "docstatus": 1, "status": ["in", ["Not Delivered", "Partly Delivered"]]},
            or_filters=[
                ["name", "like", search_val],
                ["customer", "like", search_val],
            ],
            fields=["name", "customer", "posting_date", "grand_total", "status"],
            limit=20,
        )
        return [{"type": "Delivery Note", **d} for d in docs]

    if source_type == "BOM":
        docs = frappe.get_all(
            "BOM",
            filters={"company": company, "docstatus": 1, "is_active": 1},
            or_filters=[
                ["name", "like", search_val],
                ["item", "like", search_val],
            ],
            fields=["name", "item", "item_name", "quantity", "is_active"],
            limit=20,
        )
        return [{"type": "BOM", **d} for d in docs]

    return []


def _get_item_barcode(item_code: str) -> str | None:
    """Get primary barcode for item."""
    barcodes = frappe.get_all(
        "Item Barcode",
        filters={"parent": item_code},
        fields=["barcode"],
        order_by="idx",
        limit=1,
    )
    return barcodes[0].barcode if barcodes else None


@frappe.whitelist()
def get_sales_order_items(name: str):
    """Get items from a submitted Sales Order for label printing."""
    so = frappe.get_doc("Sales Order", name)
    if so.docstatus != 1:
        frappe.throw(_("Sales Order must be submitted"))

    items = []
    for item in so.items:
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "uom": item.uom,
            "barcode": _get_item_barcode(item.item_code),
            "batch_no": None,
            "serial_no": None,
        })
    return items


@frappe.whitelist()
def get_delivery_note_items(name: str):
    """Get items from a submitted Delivery Note for label printing."""
    dn = frappe.get_doc("Delivery Note", name)
    if dn.docstatus != 1:
        frappe.throw(_("Delivery Note must be submitted"))

    items = []
    for item in dn.items:
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "uom": item.uom,
            "barcode": _get_item_barcode(item.item_code),
            "batch_no": getattr(item, "batch_no", None),
            "serial_no": getattr(item, "serial_no", None),
        })
    return items


@frappe.whitelist()
def get_bom_items(bom: str, for_qty: float = 1):
    """Get BOM items with quantities scaled to production batch size."""
    bom_doc = frappe.get_doc("BOM", bom)
    if bom_doc.docstatus != 1:
        frappe.throw(_("BOM must be submitted"))

    items = []
    for item in bom_doc.items:
        scaled_qty = item.qty * for_qty / (bom_doc.quantity or 1)
        items.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": round(scaled_qty, 3),
            "uom": item.uom,
            "barcode": _get_item_barcode(item.item_code),
            "batch_no": None,
            "serial_no": None,
        })
    return items


@frappe.whitelist()
def get_next_serial_numbers(naming_series: str, count: int = 1):
    """Atomically reserve the next N serial numbers from a Naming Series.

    Uses frappe.model.naming.make_autoname with DB-level locking
    to guarantee uniqueness across all POS terminals and users.

    Args:
        naming_series: ERPNext Naming Series pattern (e.g. "POS-SERIAL-.#####")
        count: Number of serial numbers to reserve (max 1000).

    Returns:
        List of numeric serial numbers.
    """
    if not naming_series:
        frappe.throw(_("Naming Series is required"))

    count = max(1, min(1000, int(count or 1)))

    numbers = []
    for _ in range(count):
        name = make_autoname(naming_series)
        parts = name.split("-")
        num = int(parts[-1]) if parts else 0
        numbers.append(num)

    return numbers
