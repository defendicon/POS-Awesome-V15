import json

import frappe

from posawesome.posawesome.api.payment_processing.utils import (
	get_mode_of_payment_accounts,
)
from posawesome.posawesome.api.utils import get_active_pos_profile

SYNC_SCHEMA_VERSION = "2026-04-09"


def _normalize_timestamp(value):
	text = str(value or "").strip()
	return text or None


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
