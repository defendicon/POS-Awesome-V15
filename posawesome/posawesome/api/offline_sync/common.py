import json

import frappe

from posawesome.posawesome.api.utils import get_active_pos_profile

SYNC_SCHEMA_VERSION = "2026-04-09"


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
