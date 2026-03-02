import frappe
from frappe.utils import flt


STOCK_CHANGE_EVENT = "posa_stock_changed"


def publish_bin_stock_change(doc, method=None):
    """Queue Bin stock changes and broadcast them after the transaction commits."""

    if not doc or not doc.get("item_code") or not doc.get("warehouse"):
        return

    has_changed = True
    has_value_changed = getattr(doc, "has_value_changed", None)
    if callable(has_value_changed):
        try:
            has_changed = bool(
                doc.has_value_changed("actual_qty")
                or doc.has_value_changed("item_code")
                or doc.has_value_changed("warehouse")
            )
        except Exception:
            has_changed = True

    if not has_changed:
        return

    entry = _build_stock_entry(doc)
    if not entry:
        return

    queue = getattr(frappe.flags, "_posa_stock_change_queue", None)
    if queue is None:
        queue = {}
        frappe.flags._posa_stock_change_queue = queue

    queue[(entry["item_code"], entry["warehouse"])] = entry

    if getattr(frappe.flags, "_posa_stock_change_flush_registered", False):
        return

    frappe.flags._posa_stock_change_flush_registered = True
    frappe.db.after_commit.add(_flush_stock_change_queue)


def _build_stock_entry(doc):
    item_code = str(doc.get("item_code") or "").strip()
    warehouse = str(doc.get("warehouse") or "").strip()
    if not item_code or not warehouse:
        return None

    company = frappe.get_cached_value("Warehouse", warehouse, "company")
    return {
        "item_code": item_code,
        "warehouse": warehouse,
        "company": company,
        "actual_qty": flt(doc.get("actual_qty")),
    }


def _flush_stock_change_queue():
    queue = getattr(frappe.flags, "_posa_stock_change_queue", None) or {}
    frappe.flags._posa_stock_change_queue = {}
    frappe.flags._posa_stock_change_flush_registered = False

    if not queue:
        return

    items = list(queue.values())
    payload = {
        "items": items,
        "item_codes": sorted({row["item_code"] for row in items}),
        "warehouses": sorted({row["warehouse"] for row in items}),
        "companies": sorted({row["company"] for row in items if row.get("company")}),
        "source_doctype": "Bin",
    }
    frappe.publish_realtime(STOCK_CHANGE_EVENT, payload)
