import frappe

from posawesome.posawesome.api.invoice_processing.utils import get_price_list_currency
from posawesome.posawesome.api.offline_sync.common import (
	_build_response,
	_max_timestamp,
	_normalize_timestamp,
	_resolve_profile,
)
from posawesome.posawesome.api.utilities import (
	get_pos_profile_tax_inclusive,
	get_selling_price_lists,
)
SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=100, maximum=1000):
	try:
		resolved = int(value or default)
	except (TypeError, ValueError):
		resolved = default
	return max(1, min(resolved, maximum))


def _should_include(modified, watermark):
	modified = _normalize_timestamp(modified)
	watermark = _normalize_timestamp(watermark)
	if not watermark:
		return True
	if not modified:
		return True
	return modified > watermark


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

