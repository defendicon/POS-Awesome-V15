import frappe

from posawesome.posawesome.api.offline_sync.common import (
    _build_response,
    _max_timestamp,
    _resolve_profile,
)
from posawesome.posawesome.api.pricing_rules import (
    _get_targets_map,
    _normalise_rule,
    _serialize_rule,
)

SYNC_SCHEMA_VERSION = "2026-04-09"

BASE_FIELDS = [
    "name",
    "priority",
    "apply_multiple_pricing_rules",
    "apply_on",
    "min_qty",
    "valid_from",
    "valid_upto",
    "price_or_product_discount",
    "rate_or_discount",
    "discount_percentage",
    "discount_amount",
    "rate",
    "currency",
    "for_price_list",
    "company",
    "customer",
    "customer_group",
    "territory",
    "selling",
    "disable",
    "modified",
]

OPTIONAL_FIELDS = [
    "margin_type",
    "max_qty",
    "min_amt",
    "max_amt",
    "margin_rate_or_amount",
    "apply_discount_on_rate",
    "same_item",
    "free_item",
    "free_qty",
    "free_qty_per_unit",
    "free_item_rate",
    "apply_per_threshold",
    "max_free_qty",
    "is_recursive",
    "recurse_for",
    "apply_recursion_over",
    "round_free_qty",
    "dont_enforce_free_item_qty",
    "stop_further_rules",
    "for_price_list_rate",
    "uom",
    "apply_rule_on_other",
    "other_item_code",
    "other_item_group",
    "other_brand",
]


def _coerce_int(value, default, minimum=0, maximum=2000):
    try:
        resolved = int(value if value is not None else default)
    except (TypeError, ValueError):
        resolved = default
    return max(minimum, min(resolved, maximum))


def _pricing_rule_fields():
    try:
        meta = frappe.get_meta("Pricing Rule")
    except Exception:
        return BASE_FIELDS
    return BASE_FIELDS + [field for field in OPTIONAL_FIELDS if meta.has_field(field)]


def _deleted_rules(watermark):
    if not watermark:
        return []
    rows = (
        frappe.get_all(
            "Deleted Document",
            filters={
                "deleted_doctype": "Pricing Rule",
                "creation": [">", watermark],
            },
            fields=["deleted_name", "creation"],
            order_by="creation asc, deleted_name asc",
        )
        or []
    )
    return [
        {
            "key": f"pricing_rule::{row.get('deleted_name')}",
            "modified": row.get("creation"),
        }
        for row in rows
        if row.get("deleted_name")
    ]


def _target_descriptor(rule):
    mapping = {
        "Item Code": ("item_code", rule.get("item_code")),
        "Item Group": ("item_group", rule.get("item_group")),
        "Brand": ("brand", rule.get("brand")),
    }
    return mapping.get(rule.get("apply_on"), ("all", ""))


def _serialize_rows(rows):
    parent_names = [row.get("name") for row in rows if row.get("name")]
    targets = _get_targets_map(parent_names)
    changes = []

    for row in rows:
        normalised = _normalise_rule(row)
        target_field = {
            "Item Code": "item_code",
            "Item Group": "item_group",
            "Brand": "brand",
        }.get(row.get("apply_on"))
        target_values = targets.get(target_field, {}).get(row.get("name")) if target_field else None
        for rule in _serialize_rule(normalised, target_field, target_values):
            target_type, target_value = _target_descriptor(rule)
            data = dict(rule)
            data.update(
                {
                    "key": f"{row.get('name')}::{target_type}::{target_value or ''}",
                    "rule_name": row.get("name"),
                    "target_type": target_type,
                    "target_value": target_value or "",
                    "modified": row.get("modified"),
                }
            )
            changes.append(
                {
                    "key": f"pricing_rule::{data['key']}",
                    "modified": row.get("modified"),
                    "data": data,
                }
            )
    return changes


@frappe.whitelist()
def sync_pricing_rules(
    pos_profile=None,
    watermark=None,
    offset=0,
    limit=200,
    schema_version=None,
):
    if schema_version and schema_version != SYNC_SCHEMA_VERSION:
        return _build_response(full_resync_required=True)

    profile = _resolve_profile(pos_profile)
    if not profile:
        frappe.throw("pos_profile is required")
    company = profile.get("company")
    if not company:
        frappe.throw("POS Profile company is required")

    resolved_offset = _coerce_int(offset, 0)
    resolved_limit = _coerce_int(limit, 200, minimum=1)
    if watermark:
        filters = {"modified": [">", watermark]}
    else:
        filters = {"company": company, "selling": 1, "disable": 0}

    rows = (
        frappe.get_all(
            "Pricing Rule",
            filters=filters,
            fields=_pricing_rule_fields(),
            order_by="modified asc, name asc",
            start=resolved_offset,
            limit_page_length=resolved_limit + 1,
        )
        or []
    )
    has_more = len(rows) > resolved_limit
    page_rows = rows[:resolved_limit]
    active_rows = [
        row
        for row in page_rows
        if row.get("company") == company
        and row.get("selling")
        and not row.get("disable")
    ]
    inactive_rows = [
        row
        for row in page_rows
        if row.get("name") and row not in active_rows
    ]
    deleted_rows = _deleted_rules(watermark)
    deleted = [
        {"key": f"pricing_rule::{row.get('name')}"}
        for row in inactive_rows
    ] + [{"key": row["key"]} for row in deleted_rows]

    next_watermark = None
    if not has_more:
        next_watermark = _max_timestamp(
            watermark,
            [row.get("modified") for row in page_rows],
            [row.get("modified") for row in deleted_rows],
        )

    response = _build_response(
        changes=_serialize_rows(active_rows),
        deleted=deleted,
        next_watermark=next_watermark,
        has_more=has_more,
    )
    response["next_offset"] = resolved_offset + len(page_rows) if has_more else None
    return response
