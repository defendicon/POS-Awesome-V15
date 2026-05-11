"""
Server-side ₦↔Kg sync helpers.

Invoked from posawesome.posawesome.api.invoice.validate (and equivalents for
Quotation / Sales Order via hooks) to keep the custom fields
`posa_kg_qty` and `posa_rate_per_kg` consistent with qty/rate, regardless of
which UI (desk form, POS Awesome Vue, REST) mutated the document.

Conversion rules (only for items where Item.weight_uom == "Kg" and
Item.weight_per_unit > 0):

    posa_kg_qty       = qty  * weight_per_unit
    posa_rate_per_kg  = rate / weight_per_unit

If weight_uom is not Kg or weight_per_unit is 0/None, the fields are left
empty (0) — the calculator is opt-in per item.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt


KG_UOM = "Kg"
_WEIGHT_CACHE: dict[str, tuple[float, str]] = {}


def _get_item_weight(item_code: str) -> tuple[float, str]:
    """Return (weight_per_unit, weight_uom) for an Item, cached per request."""
    if not item_code:
        return (0.0, "")
    cached = _WEIGHT_CACHE.get(item_code)
    if cached is not None:
        return cached

    row = frappe.db.get_value(
        "Item",
        item_code,
        ["weight_per_unit", "weight_uom"],
        as_dict=True,
    )
    if not row:
        result = (0.0, "")
    else:
        result = (flt(row.get("weight_per_unit") or 0), row.get("weight_uom") or "")
    _WEIGHT_CACHE[item_code] = result
    return result


def sync_kg_fields(doc, method=None):
    """Recompute posa_kg_qty and posa_rate_per_kg on every item row."""
    items = getattr(doc, "items", None) or []
    for row in items:
        weight_per_unit, weight_uom = _get_item_weight(getattr(row, "item_code", None))

        if weight_uom != KG_UOM or weight_per_unit <= 0:
            # Not a kg-based item — clear computed fields so stale values
            # from another item don't linger after item_code change.
            row.posa_kg_qty = 0
            row.posa_rate_per_kg = 0
            continue

        qty = flt(getattr(row, "qty", 0) or 0)
        rate = flt(getattr(row, "rate", 0) or 0)

        row.posa_kg_qty = flt(qty * weight_per_unit, 3)
        row.posa_rate_per_kg = flt(rate / weight_per_unit, 6) if weight_per_unit else 0


@frappe.whitelist()
def get_item_weight(item_code: str) -> dict:
    """Lightweight API used by client-side JS / Vue to fetch Item weight info."""
    weight_per_unit, weight_uom = _get_item_weight(item_code)
    return {
        "item_code": item_code,
        "weight_per_unit": weight_per_unit,
        "weight_uom": weight_uom,
        "is_kg": weight_uom == KG_UOM and weight_per_unit > 0,
    }
