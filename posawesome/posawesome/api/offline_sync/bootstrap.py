import json

import frappe

from posawesome.posawesome.api.invoice_processing.utils import get_price_list_currency
from posawesome.posawesome.api.utilities import (
	get_pos_profile_tax_inclusive,
	get_selling_price_lists,
)
from posawesome.posawesome.api.utils import get_active_pos_profile

SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=100, maximum=1000):
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


def _should_include(modified, watermark):
	modified = _normalize_timestamp(modified)
	watermark = _normalize_timestamp(watermark)
	if not watermark:
		return True
	if not modified:
		return True
	return modified > watermark


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


@frappe.whitelist()
def sync_bootstrap_config(
	pos_profile=None,
	watermark=None,
	limit=100,
	schema_version=None,
):
	if schema_version and schema_version != SYNC_SCHEMA_VERSION:
		return _build_response(full_resync_required=True)

	profile = _resolve_profile(pos_profile)
	if not profile:
		frappe.throw("pos_profile is required")

	resolved_limit = _coerce_limit(limit)
	profile_name = profile.get("name")
	profile_modified = _normalize_timestamp(profile.get("modified"))
	selected_price_list = profile.get("selling_price_list")

	price_list_rows = frappe.get_all(
		"Price List",
		filters={"selling": 1},
		fields=["name", "modified"],
		order_by="name asc",
	) or []
	price_lists = [row.get("name") for row in price_list_rows if row.get("name")]
	if not price_lists:
		price_lists = [row.get("name") for row in (get_selling_price_lists() or []) if row.get("name")]

	if selected_price_list and selected_price_list not in price_lists:
		price_lists.append(selected_price_list)

	price_list_modified = _max_timestamp(
		[row.get("modified") for row in price_list_rows],
		profile_modified,
	)

	changes = []

	if _should_include(profile_modified, watermark):
		changes.append(
			{
				"key": "bootstrap_config",
				"modified": profile_modified,
				"data": {
					"profile_name": profile_name,
					"company": profile.get("company"),
					"tax_inclusive": get_pos_profile_tax_inclusive(profile_name),
					"profile_modified": profile_modified,
				},
			}
		)

	if _should_include(price_list_modified, watermark):
		changes.append(
			{
				"key": "price_list_meta",
				"modified": price_list_modified,
				"data": {
					"price_lists": price_lists,
					"selected_price_list": selected_price_list,
					"price_list_currency": (
						get_price_list_currency(selected_price_list)
						if selected_price_list
						else None
					),
				},
			}
		)

	has_more = len(changes) > resolved_limit
	if has_more:
		changes = changes[:resolved_limit]

	next_watermark = _max_timestamp(profile_modified, price_list_modified)
	return _build_response(
		changes=changes,
		deleted=[],
		next_watermark=next_watermark,
		has_more=has_more,
	)

