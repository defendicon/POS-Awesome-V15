# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

"""Public item API facade.

Keep whitelisted paths in this module stable for clients and route heavy
implementation work to `posawesome.posawesome.api.item_processing` modules.
"""

import json
from frappe import _, as_json
import frappe
from frappe.utils import cint, get_datetime

from posawesome.posawesome.api.utils import get_active_pos_profile
from posawesome.posawesome.api.utils import (
    HAS_VARIANTS_EXCLUSION,
    expand_item_groups,
    get_item_groups,
    _ensure_pos_profile,
)
from posawesome.posawesome.api.item_processing.stock import (
    get_stock_availability,
    get_bulk_stock_availability,
    get_available_qty
)
from posawesome.posawesome.api.item_processing.barcode import (
    parse_scale_barcode,
    get_items_from_barcode,
    build_scale_barcode,
    search_serial_or_batch_or_barcode_number
)
from posawesome.posawesome.api.item_processing.details import (
    get_items_details,
    get_item_detail,
    get_item_variants,
    get_item_attributes,
    get_item_optional_attributes
)
from posawesome.posawesome.api.item_processing.price import (
    update_price_list_rate,
    get_price_for_uom
)
from posawesome.posawesome.api.item_processing.search import (
    get_items,
    get_items_groups,
    get_items_count,
    normalize_brand
)


def _collect_delta_item_codes(pos_profile, modified_after, price_list, limit):
    """Collect changed item codes from Item Price and Bin updates."""
    changed_codes = set()
    timestamp = modified_after.isoformat()

    if price_list:
        price_codes = frappe.get_all(
            "Item Price",
            filters={
                "price_list": price_list,
                "modified": [">", timestamp],
            },
            pluck="item_code",
            limit_page_length=limit,
        )
        changed_codes.update([code for code in price_codes if code])

    warehouse = pos_profile.get("warehouse")
    if warehouse:
        warehouses = [warehouse]
        if frappe.db.get_value("Warehouse", warehouse, "is_group"):
            warehouses = frappe.db.get_descendants("Warehouse", warehouse) or []

        if warehouses:
            stock_codes = frappe.get_all(
                "Bin",
                filters={
                    "warehouse": ["in", warehouses],
                    "modified": [">", timestamp],
                },
                pluck="item_code",
                limit_page_length=limit,
            )
            changed_codes.update([code for code in stock_codes if code])

    return changed_codes


@frappe.whitelist()
def get_delta_items(
    pos_profile,
    modified_after=None,
    price_list=None,
    customer=None,
    limit=500,
):
    """Return only items changed since ``modified_after`` for price/stock updates."""
    profile, profile_json = _ensure_pos_profile(pos_profile)

    if not modified_after:
        return []

    try:
        parsed_modified_after = get_datetime(modified_after)
    except Exception:
        frappe.throw(_("modified_after must be a valid ISO datetime"))

    resolved_limit = cint(limit) or 500
    resolved_limit = max(1, min(resolved_limit, 2000))

    effective_price_list = price_list or profile.get("selling_price_list")
    base_items = get_items(
        profile_json,
        price_list=effective_price_list,
        item_group="",
        search_value="",
        customer=customer,
        limit=resolved_limit,
        modified_after=parsed_modified_after.isoformat(),
    ) or []

    if len(base_items) >= resolved_limit:
        return base_items[:resolved_limit]

    existing_codes = {
        row.get("item_code")
        for row in base_items
        if row and row.get("item_code")
    }

    delta_codes = _collect_delta_item_codes(
        profile,
        parsed_modified_after,
        effective_price_list,
        resolved_limit,
    )
    extra_codes = [code for code in delta_codes if code not in existing_codes]

    if not extra_codes:
        return base_items

    allowed_groups = expand_item_groups(get_item_groups(profile.get("name")) or [])
    filters = {
        "item_code": ["in", extra_codes],
        "disabled": 0,
        "is_sales_item": 1,
        "is_fixed_asset": 0,
    }

    if allowed_groups:
        filters["item_group"] = ["in", allowed_groups]

    if not profile.get("posa_show_template_items"):
        filters.update(HAS_VARIANTS_EXCLUSION)

    if profile.get("posa_hide_variants_items"):
        filters["variant_of"] = ["is", "not set"]

    remaining = max(0, resolved_limit - len(base_items))
    if remaining <= 0:
        return base_items[:resolved_limit]

    fields = [
        "name",
        "item_code",
        "item_name",
        "stock_uom",
        "is_stock_item",
        "has_variants",
        "variant_of",
        "item_group",
        "idx",
        "has_batch_no",
        "has_serial_no",
        "max_discount",
        "brand",
        "allow_negative_stock",
    ]

    item_rows = frappe.get_all(
        "Item",
        filters=filters,
        fields=fields,
        limit_page_length=remaining,
        order_by="item_name asc",
    )

    if not item_rows:
        return base_items[:resolved_limit]

    details = get_items_details(
        profile_json,
        as_json(item_rows),
        price_list=effective_price_list,
        customer=customer,
    )
    detail_map = {
        row.get("item_code"): row
        for row in (details or [])
        if row and row.get("item_code")
    }

    for item in item_rows:
        item_code = item.get("item_code")
        detail = detail_map.get(item_code, {})
        merged = {}
        merged.update(item)
        merged.update(detail)

        if (
            profile.get("posa_display_items_in_stock")
            and (not merged.get("actual_qty") or merged.get("actual_qty") < 0)
            and not merged.get("has_variants")
        ):
            continue

        base_items.append(merged)

    return base_items[:resolved_limit]

def build_item_cache(item_code):
    """Build item cache for faster access."""
    # Implementation for building item cache
    pass

@frappe.whitelist()
def get_item_brand(item_code):
    """Return normalized brand for an item, falling back to its template's brand."""
    if not item_code:
        return ""
    data = frappe.db.get_value("Item", item_code, ["brand", "variant_of"], as_dict=True)
    if not data:
        return ""
    brand = data.get("brand")
    if not brand and data.get("variant_of"):
        brand = frappe.db.get_value("Item", data.get("variant_of"), "brand")
    return normalize_brand(brand) if brand else ""
