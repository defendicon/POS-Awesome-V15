import json

import frappe

from posawesome.posawesome.api.items import get_delta_items, get_items
from posawesome.posawesome.api.utils import (
	expand_item_groups,
	get_active_pos_profile,
	get_item_groups,
)

SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=200, maximum=2000):
	try:
		resolved = int(value or default)
	except (TypeError, ValueError):
		resolved = default
	return max(1, min(resolved, maximum))


def _normalize_timestamp(value):
	text = str(value or "").strip()
	return text or None


def _max_timestamp(*values):
	normalized = []
	for value in values:
		if isinstance(value, (list, tuple, set)):
			normalized.extend(
				[item for item in (_normalize_timestamp(entry) for entry in value) if item]
			)
			continue
		timestamp = _normalize_timestamp(value)
		if timestamp:
			normalized.append(timestamp)
	return max(normalized) if normalized else None


def _build_response(
	changes=None,
	deleted=None,
	next_watermark=None,
	has_more=False,
	full_resync_required=False,
):
	response = {
		"changes": changes or [],
		"deleted": deleted or [],
		"next_watermark": next_watermark,
		"has_more": bool(has_more),
		"schema_version": SYNC_SCHEMA_VERSION,
	}
	if full_resync_required:
		response["full_resync_required"] = True
	return response


def _resolve_profile(pos_profile=None):
	if isinstance(pos_profile, dict):
		return pos_profile

	if isinstance(pos_profile, str):
		raw_value = pos_profile.strip()
		if not raw_value:
			return get_active_pos_profile()
		try:
			decoded = json.loads(raw_value)
		except Exception:
			decoded = raw_value

		if isinstance(decoded, dict):
			return decoded
		if isinstance(decoded, str):
			doc = frappe.get_cached_doc("POS Profile", decoded)
			return doc.as_dict() if hasattr(doc, "as_dict") else doc

	return get_active_pos_profile()


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
