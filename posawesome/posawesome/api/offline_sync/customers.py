import json

import frappe

from posawesome.posawesome.api.customers import (
	get_customer_groups,
	get_customer_names,
)
from posawesome.posawesome.api.offline_sync.common import (
	_build_response,
	_max_timestamp,
	_normalize_timestamp,
	_resolve_profile,
)
SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=200, maximum=2000):
	try:
		resolved = int(value or default)
	except (TypeError, ValueError):
		resolved = default
	return max(1, min(resolved, maximum))


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
	rows = get_customer_names(
		serialized_profile,
		limit=fetch_limit,
		start_after=start_after,
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
