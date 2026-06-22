import frappe

from posawesome.posawesome.api.offline_sync.common import (
    _build_response,
    _max_timestamp,
    _resolve_profile,
)

SYNC_SCHEMA_VERSION = "2026-04-09"

ITEM_PRICE_FIELDS = [
    "name",
    "price_list",
    "item_code",
    "uom",
    "currency",
    "customer",
    "price_list_rate",
    "valid_from",
    "valid_upto",
    "modified",
]


def _coerce_int(value, default, minimum=0, maximum=2000):
    try:
        resolved = int(value if value is not None else default)
    except (TypeError, ValueError):
        resolved = default
    return max(minimum, min(resolved, maximum))


def _selling_price_lists(profile):
    rows = (
        frappe.get_all(
            "Price List",
            filters={"selling": 1},
            fields=["name"],
            order_by="name asc",
        )
        or []
    )
    names = [row.get("name") for row in rows if row.get("name")]
    selected = profile.get("selling_price_list")
    if selected and selected not in names:
        names.append(selected)
    return sorted(set(names))


def _deleted_item_prices(watermark):
    if not watermark:
        return []
    rows = (
        frappe.get_all(
            "Deleted Document",
            filters={
                "deleted_doctype": "Item Price",
                "creation": [">", watermark],
            },
            fields=["deleted_name", "creation"],
            order_by="creation asc, deleted_name asc",
        )
        or []
    )
    return [
        {
            "key": f"item_price::{row.get('deleted_name')}",
            "modified": row.get("creation"),
        }
        for row in rows
        if row.get("deleted_name")
    ]


@frappe.whitelist()
def sync_item_prices(
    pos_profile=None,
    watermark=None,
    offset=0,
    limit=500,
    schema_version=None,
):
    if schema_version and schema_version != SYNC_SCHEMA_VERSION:
        return _build_response(full_resync_required=True)

    profile = _resolve_profile(pos_profile)
    if not profile:
        frappe.throw("pos_profile is required")

    price_lists = _selling_price_lists(profile)
    if not price_lists:
        response = _build_response(next_watermark=watermark)
        response["scope"] = {"price_lists": []}
        return response

    resolved_offset = _coerce_int(offset, 0)
    resolved_limit = _coerce_int(limit, 500, minimum=1)
    filters = {"price_list": ("in", price_lists)}
    if watermark:
        filters["modified"] = [">", watermark]

    rows = (
        frappe.get_all(
            "Item Price",
            filters=filters,
            fields=ITEM_PRICE_FIELDS,
            order_by="modified asc, name asc",
            start=resolved_offset,
            limit_page_length=resolved_limit + 1,
        )
        or []
    )
    has_more = len(rows) > resolved_limit
    page_rows = rows[:resolved_limit]
    deleted_rows = _deleted_item_prices(watermark)

    changes = [
        {
            "key": f"item_price::{row.get('name')}",
            "modified": row.get("modified"),
            "data": dict(row),
        }
        for row in page_rows
        if row.get("name")
    ]
    deleted = [{"key": row["key"]} for row in deleted_rows]
    next_watermark = None
    if not has_more:
        next_watermark = _max_timestamp(
            watermark,
            [row.get("modified") for row in page_rows],
            [row.get("modified") for row in deleted_rows],
        )

    response = _build_response(
        changes=changes,
        deleted=deleted,
        next_watermark=next_watermark,
        has_more=has_more,
    )
    response["next_offset"] = resolved_offset + len(page_rows) if has_more else None
    response["scope"] = {"price_lists": price_lists}
    return response
