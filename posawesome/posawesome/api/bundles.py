import json

import frappe
from frappe import _


@frappe.whitelist()
def get_bundle_components(bundles):
    """Return component items for Product Bundles.

    Args:
        bundles (str | list): JSON string or list of bundle item codes.

    Returns:
        dict: mapping of bundle_code -> list of components dicts with
        item_code, qty, uom, is_batch, is_serial.
    """
    if isinstance(bundles, str):
        bundles = json.loads(bundles)
    bundles = [c for c in (bundles or []) if c]
    if not bundles:
        return {}

    bundle_rows = frappe.get_all(
        "Product Bundle Item",
        filters={"parent": ["in", bundles]},
        fields=["parent", "item_code", "qty", "uom"],
        order_by="parent, idx",
    )

    all_item_codes = list({row.item_code for row in bundle_rows if row.item_code})
    item_map = {}
    if all_item_codes:
        item_rows = frappe.get_all(
            "Item",
            filters={"name": ["in", all_item_codes]},
            fields=["name", "has_batch_no", "has_serial_no", "stock_uom", "is_stock_item"],
        )
        item_map = {r.name: r for r in item_rows}

    result = {code: [] for code in bundles}
    for row in bundle_rows:
        item = item_map.get(row.item_code) or {}
        uom = row.uom or (item.get("stock_uom") if item else None)
        result.setdefault(row.parent, []).append({
            "item_code": row.item_code,
            "qty": row.qty,
            "uom": uom,
            "is_batch": item.get("has_batch_no") or 0,
            "is_serial": item.get("has_serial_no") or 0,
            "is_stock_item": item.get("is_stock_item") or 0,
        })
    return result
