import json

import frappe
from frappe import as_json

from posawesome.posawesome.api.items import get_delta_items
from posawesome.posawesome.api.item_processing.details import get_items_details
from posawesome.posawesome.api.item_processing.search import get_items_count
from posawesome.posawesome.api.utils import (
	HAS_VARIANTS_EXCLUSION,
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
	next_cursor=None,
	has_more=False,
	total_count=None,
	sync_mode=None,
	full_resync_required=False,
):
	response = {
		"changes": changes or [],
		"deleted": deleted or [],
		"next_watermark": next_watermark,
		"next_cursor": next_cursor,
		"has_more": bool(has_more),
		"total_count": total_count,
		"sync_mode": sync_mode,
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


def _get_full_items_page(profile, price_list, customer, start_after, limit):
	allowed_groups = _get_allowed_item_groups(profile)
	filters = {
		"disabled": 0,
		"is_sales_item": 1,
		"is_fixed_asset": 0,
	}
	if allowed_groups:
		filters["item_group"] = ["in", allowed_groups]
	if start_after:
		filters["item_code"] = [">", start_after]
	if not profile.get("posa_show_template_items"):
		filters.update(HAS_VARIANTS_EXCLUSION)
	if profile.get("posa_hide_variants_items"):
		filters["variant_of"] = ["is", "not set"]

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
		"modified",
		"image",
	]

	result = []
	cursor = start_after
	while len(result) < limit:
		remaining = max(1, limit - len(result))
		raw_rows = frappe.get_all(
			"Item",
			filters=filters,
			fields=fields,
			order_by="item_code asc",
			limit_page_length=remaining + 25,
		) or []

		if not raw_rows:
			break

		details = get_items_details(
			json.dumps(profile),
			as_json(raw_rows),
			price_list=price_list,
			customer=customer,
		) or []
		detail_map = {
			row.get("item_code"): row
			for row in details
			if row and row.get("item_code")
		}

		for raw_row in raw_rows:
			cursor = raw_row.get("item_code") or cursor
			item_code = raw_row.get("item_code")
			if not item_code:
				continue
			detail = detail_map.get(item_code, {})
			merged = {}
			merged.update(raw_row)
			merged.update(detail)
			if (
				profile.get("posa_display_items_in_stock")
				and (not merged.get("actual_qty") or merged.get("actual_qty") < 0)
				and not merged.get("has_variants")
			):
				continue
			result.append(merged)
			if len(result) >= limit:
				break

		if len(raw_rows) < remaining + 25:
			break

		filters["item_code"] = [">", cursor]

	return result, cursor


@frappe.whitelist()
def sync_items(
	pos_profile=None,
	watermark=None,
	price_list=None,
	customer=None,
	start_after=None,
	cursor=None,
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
	full_sync_mode = not watermark
	effective_cursor = cursor or start_after

	if watermark:
		rows = get_delta_items(
			serialized_profile,
			modified_after=watermark,
			price_list=effective_price_list,
			customer=customer,
			limit=fetch_limit,
		) or []
	else:
		rows, effective_cursor = _get_full_items_page(
			profile,
			effective_price_list,
			customer,
			effective_cursor,
			fetch_limit,
		)

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
	next_cursor = rows[-1].get("item_code") if has_more and rows else None
	total_count = (
		get_items_count(serialized_profile, item_groups=_get_allowed_item_groups(profile))
		if full_sync_mode and not profile.get("posa_display_items_in_stock")
		else None
	)

	next_watermark = _max_timestamp(
		watermark,
		[row.get("modified") for row in rows],
		[row.get("modified") for row in deleted_rows],
	)
	return _build_response(
		changes=changes,
		deleted=deleted,
		next_watermark=next_watermark,
		next_cursor=next_cursor,
		has_more=has_more,
		total_count=total_count,
		sync_mode="full" if full_sync_mode else "delta",
	)
