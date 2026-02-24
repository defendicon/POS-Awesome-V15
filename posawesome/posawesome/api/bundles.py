import json

import frappe
from frappe import _
from posawesome.posawesome.api.item_processing.stock import _assert_stock_lookup_access

MAX_BUNDLE_LOOKUPS = 300


@frappe.whitelist()
def get_bundle_components(bundles):
    """Return component items for Product Bundles.

    Args:
        bundles (str | list): JSON string or list of bundle item codes.

    Returns:
        dict: mapping of bundle_code -> list of components dicts with
        item_code, qty, uom, is_batch, is_serial.
    """
    _assert_stock_lookup_access()

    if isinstance(bundles, str):
        try:
            bundles = json.loads(bundles)
        except Exception:
            frappe.throw(_("Invalid bundles payload. Expected a JSON array of item codes."))

    if bundles is None:
        bundles = []
    if not isinstance(bundles, (list, tuple)):
        frappe.throw(_("Invalid bundles payload. Expected a list of item codes."))
    if len(bundles) > MAX_BUNDLE_LOOKUPS:
        frappe.throw(_("Too many bundles requested in one call."))

    result = {}
    for code in bundles:
        code = frappe.as_unicode(code or "").strip()
        if not code:
            continue
        if not frappe.db.exists("Product Bundle", code):
            result[code] = []
            continue
        bundle = frappe.get_doc("Product Bundle", code)

        components = []
        for row in bundle.items:
            item = frappe.db.get_value(
                "Item",
                row.item_code,
                ["has_batch_no", "has_serial_no", "stock_uom", "is_stock_item"],
                as_dict=True,
            )
            uom = row.uom or (item.stock_uom if item else None)
            components.append(
                {
                    "item_code": row.item_code,
                    "qty": row.qty,
                    "uom": uom,
                    "is_batch": item.has_batch_no if item else 0,
                    "is_serial": item.has_serial_no if item else 0,
                    "is_stock_item": item.is_stock_item if item else 0,
                }
            )
        result[code] = components

    return result
