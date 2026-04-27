import json

import frappe

from posawesome.posawesome.api.items import get_delta_items, get_items
from posawesome.posawesome.api.offline_sync.common import (
	_build_response,
	_max_timestamp,
	_normalize_timestamp,
	_resolve_profile,
)
from posawesome.posawesome.api.utils import (
	expand_item_groups,
	get_item_groups,
)

SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=200, maximum=2000):
	try:
		resolved = int(value or default)
	except (TypeError, ValueError):
		resolved = default
	return max(1, min(resolved, maximum))


def _get_allowed_item_groups(profile):
	try:
		return expand_item_groups(get_item_groups(profile.get("name")) or [])
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			f"POS Awesome: failed to resolve offline-sync item groups for profile {profile.get('name') if isinstance(profile, dict) else ''}",
		)
		return []


def _is_item_allowed(item_row, allowed_groups):
	if item_row.get("disabled"):
		return False
	if not item_row.get("is_sales_item", 0):
		return False
	if item_row.get("is_fixed_asset"):
		return False
	if allowed_groups and item_row.get("item_group") not in allowed_groups:
		return False
	return True


def _collect_deleted_items(profile, watermark, limit):
	if not watermark:
		return []

	rows = frappe.get_all(
		"Item",
		filters={"modified": [">", watermark]},
		fields=[
			"item_code",
			"modified",
			"disabled",
			"is_sales_item",
			"is_fixed_asset",
			"item_group",
			"variant_of",
		],
		order_by="item_code asc",
		limit_page_length=limit,
	) or []

	allowed_groups = _get_allowed_item_groups(profile)
	return [
		{
			"key": f"item::{row.get('item_code')}",
			"modified": row.get("modified"),
		}
		for row in rows
		if row.get("item_code") and not _is_item_allowed(row, allowed_groups)
	]


@frappe.whitelist()
def sync_items(
	pos_profile=None,
	watermark=None,
	price_list=None,
	customer=None,
	start_after=None,
	limit=200,
	schema_version=None,
):
	if schema_version and schema_version != SYNC_SCHEMA_VERSION:
		return _build_response(full_resync_required=True)

	profile = _resolve_profile(pos_profile)
	if not profile:
		frappe.throw("pos_profile is required")

	resolved_limit = _coerce_limit(limit)
	fetch_limit = resolved_limit + 1
	serialized_profile = json.dumps(profile)
	effective_price_list = price_list or profile.get("selling_price_list")

	if watermark:
		rows = get_delta_items(
			serialized_profile,
			modified_after=watermark,
			price_list=effective_price_list,
			customer=customer,
			limit=fetch_limit,
		) or []
	else:
		rows = get_items(
			serialized_profile,
			price_list=effective_price_list,
			item_group="",
			search_value="",
			customer=customer,
			start_after=start_after,
			limit=fetch_limit,
		) or []

	has_more = len(rows) > resolved_limit
	rows = rows[:resolved_limit]

	changes = [
		{
			"key": f"item::{row.get('item_code')}",
			"modified": row.get("modified"),
			"data": row,
		}
		for row in rows
		if row.get("item_code")
	]

	deleted_rows = _collect_deleted_items(profile, watermark, fetch_limit)
	deleted = [{"key": row["key"]} for row in deleted_rows]

	next_watermark = _max_timestamp(
		watermark,
		[row.get("modified") for row in rows],
		[row.get("modified") for row in deleted_rows],
	)
	return _build_response(
		changes=changes,
		deleted=deleted,
		next_watermark=next_watermark,
		has_more=has_more,
	)
