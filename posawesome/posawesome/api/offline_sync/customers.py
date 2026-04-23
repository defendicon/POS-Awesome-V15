import json

import frappe

from posawesome.posawesome.api.customers import (
	get_customer_groups,
	get_customer_names,
)
from posawesome.posawesome.api.utils import get_active_pos_profile

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


def _collect_deleted_customers(profile, watermark, limit):
	if not watermark:
		return []

	rows = frappe.get_all(
		"Customer",
		filters={"modified": [">", watermark]},
		fields=["name", "modified", "disabled", "customer_group"],
		order_by="name asc",
		limit_page_length=limit,
	) or []
	allowed_groups = set(get_customer_groups(profile) or [])

	return [
		{
			"key": f"customer::{row.get('name')}",
			"modified": row.get("modified"),
		}
		for row in rows
		if row.get("name")
		and (
			row.get("disabled")
			or (allowed_groups and row.get("customer_group") not in allowed_groups)
		)
	]


@frappe.whitelist()
def sync_customers(
	pos_profile=None,
	watermark=None,
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
	full_sync_mode = not watermark
	effective_cursor = cursor or start_after
	rows = get_customer_names(
		serialized_profile,
		limit=fetch_limit,
		start_after=effective_cursor,
		modified_after=watermark,
	) or []

	has_more = len(rows) > resolved_limit
	rows = rows[:resolved_limit]

	changes = [
		{
			"key": f"customer::{row.get('name')}",
			"modified": row.get("modified"),
			"data": row,
		}
		for row in rows
		if row.get("name")
	]

	deleted_rows = _collect_deleted_customers(profile, watermark, fetch_limit)
	deleted = [{"key": row["key"]} for row in deleted_rows]
	next_cursor = rows[-1].get("name") if has_more and rows else None
	total_count = (
		get_customers_count(serialized_profile)
		if full_sync_mode
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
