"""
LPG tiered-pricing engine.

Resolves the most-specific applicable `LPG Outlet Price Tier` for each item
row of Sales Invoice / POS Invoice / Quotation / Sales Order, replacing
native Frappe Pricing Rules (which can't combine Customer Group + Territory
without conflict in v15).

Lookup priority (most-specific wins):
    1. Exact (customer_group, territory) match
    2. Tiers where qty falls within [min_qty, max_qty]   (0 = no bound)
    3. Tiers active on posting_date (valid_from..valid_to)
    4. enabled = 1

If multiple tiers match, the one with the highest min_qty wins
(largest volume bracket = most-specific bulk pricing).
"""

from __future__ import annotations

import frappe
from frappe.utils import flt, getdate, today


def _get_customer_meta(customer: str) -> dict:
    if not customer:
        return {}
    row = frappe.db.get_value(
        "Customer",
        customer,
        ["customer_group", "territory"],
        as_dict=True,
    )
    return row or {}


def find_applicable_tier(
    item_code: str,
    customer_group: str | None,
    territory: str | None,
    qty: float,
    posting_date: str | None = None,
) -> dict | None:
    """Return the best-matching tier dict (or None)."""
    if not item_code or not customer_group or not territory:
        return None

    posting_date = posting_date or today()

    candidates = frappe.get_all(
        "LPG Outlet Price Tier",
        filters={
            "item_code": item_code,
            "customer_group": customer_group,
            "territory": territory,
            "enabled": 1,
        },
        fields=["name", "rate", "currency", "min_qty", "max_qty", "valid_from", "valid_to"],
    )

    qty = flt(qty or 0)
    pd = getdate(posting_date)

    def _matches(t: dict) -> bool:
        # Qty window
        mn = flt(t.get("min_qty") or 0)
        mx = flt(t.get("max_qty") or 0)
        if qty < mn:
            return False
        if mx > 0 and qty > mx:
            return False
        # Date window
        if t.get("valid_from") and getdate(t["valid_from"]) > pd:
            return False
        if t.get("valid_to") and getdate(t["valid_to"]) < pd:
            return False
        return True

    matched = [t for t in candidates if _matches(t)]
    if not matched:
        return None

    # Highest min_qty wins (bulk bracket); ties broken by latest valid_from.
    matched.sort(
        key=lambda t: (flt(t.get("min_qty") or 0), str(t.get("valid_from") or "")),
        reverse=True,
    )
    return matched[0]


def apply_tiered_pricing(doc, method=None):
    """
    Document-level entry. Iterates rows of doc.items and overrides `rate`
    whenever a tier matches. Safe to call on every validate.
    """
    if not getattr(doc, "items", None):
        return

    meta = _get_customer_meta(getattr(doc, "customer", None))
    customer_group = meta.get("customer_group")
    territory = meta.get("territory")
    posting_date = getattr(doc, "posting_date", None) or getattr(doc, "transaction_date", None)

    if not customer_group or not territory:
        # Cannot resolve tier without both — leave native pricing in place.
        return

    for row in doc.items:
        tier = find_applicable_tier(
            item_code=row.item_code,
            customer_group=customer_group,
            territory=territory,
            qty=flt(getattr(row, "qty", 0) or 0),
            posting_date=posting_date,
        )
        if not tier:
            continue

        tier_rate = flt(tier["rate"])
        if tier_rate <= 0:
            continue

        # Override only if the tier rate differs (avoid pointless writes).
        if flt(getattr(row, "rate", 0)) != tier_rate:
            row.price_list_rate = tier_rate
            row.rate = tier_rate
            # Stamp where the rate came from for traceability.
            if hasattr(row, "posa_offers"):
                # Append tier ref to existing offers field (without clobbering coupons).
                existing = row.posa_offers or ""
                marker = f"LPG-Tier:{tier['name']}"
                if marker not in existing:
                    row.posa_offers = (existing + "," + marker).strip(",")


@frappe.whitelist()
def get_tier_rate(item_code: str, customer: str, qty: float = 0, posting_date: str = None) -> dict:
    """
    Lightweight API used by POS Awesome to fetch the tier rate before
    submitting an invoice.
    """
    meta = _get_customer_meta(customer)
    tier = find_applicable_tier(
        item_code=item_code,
        customer_group=meta.get("customer_group"),
        territory=meta.get("territory"),
        qty=flt(qty),
        posting_date=posting_date,
    )
    if not tier:
        return {"has_tier": False}
    return {
        "has_tier": True,
        "tier_name": tier["name"],
        "rate": flt(tier["rate"]),
        "currency": tier["currency"],
        "min_qty": flt(tier.get("min_qty") or 0),
        "max_qty": flt(tier.get("max_qty") or 0),
    }
