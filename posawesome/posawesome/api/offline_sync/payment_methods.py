import frappe

from posawesome.posawesome.api.offline_sync.common import (
	_build_response,
	_normalize_timestamp,
	_resolve_profile,
)
from posawesome.posawesome.api.payment_processing.utils import (
	get_mode_of_payment_accounts,
)
SYNC_SCHEMA_VERSION = "2026-04-09"


def _should_include(modified, watermark):
	modified = _normalize_timestamp(modified)
	watermark = _normalize_timestamp(watermark)
	if not watermark:
		return True
	if not modified:
		return True
	return modified > watermark


@frappe.whitelist()
def sync_payment_method_currencies(
	pos_profile=None,
	watermark=None,
	schema_version=None,
):
	if schema_version and schema_version != SYNC_SCHEMA_VERSION:
		return _build_response(full_resync_required=True)

	profile = _resolve_profile(pos_profile)
	if not profile:
		frappe.throw("pos_profile is required")

	payment_methods = [
		str(row.get("mode_of_payment") or "").strip()
		for row in (profile.get("payments") or [])
		if str(row.get("mode_of_payment") or "").strip()
	]
	profile_modified = _normalize_timestamp(profile.get("modified"))

	changes = []
	if _should_include(profile_modified, watermark):
		mapping = get_mode_of_payment_accounts(profile.get("company"), payment_methods)
		changes.append(
			{
				"key": "payment_method_currencies",
				"modified": profile_modified,
				"data": {
					"company": profile.get("company"),
					"pos_profile": profile.get("name"),
					"payment_methods": payment_methods,
					"mapping": mapping or {},
				},
			}
		)

	return _build_response(
		changes=changes,
		deleted=[],
		next_watermark=profile_modified,
		has_more=False,
	)
