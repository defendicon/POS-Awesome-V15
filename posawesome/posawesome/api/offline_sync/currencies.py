import json

import frappe

from posawesome.posawesome.api.invoice_processing.utils import (
	get_available_currencies,
	get_latest_rate,
	get_price_list_currency,
)
from posawesome.posawesome.api.utils import get_active_pos_profile

SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=200, maximum=1000):
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


def _normalize_pairs(currency_pairs, profile):
	if isinstance(currency_pairs, str):
		raw_value = currency_pairs.strip()
		if raw_value:
			try:
				currency_pairs = json.loads(raw_value)
			except Exception:
				currency_pairs = []

	pairs = []
	if isinstance(currency_pairs, list):
		for row in currency_pairs:
			if not isinstance(row, dict):
				continue
			from_currency = str(row.get("from_currency") or "").strip()
			to_currency = str(row.get("to_currency") or "").strip()
			if from_currency and to_currency:
				pairs.append((from_currency, to_currency))

	if pairs:
		return list(dict.fromkeys(pairs))

	profile_currency = str(profile.get("currency") or "").strip()
	price_list_currency = ""
	if profile.get("selling_price_list"):
		price_list_currency = str(
			get_price_list_currency(profile.get("selling_price_list")) or ""
		).strip()
	if profile_currency and price_list_currency and profile_currency != price_list_currency:
		return [(price_list_currency, profile_currency)]
	return []


@frappe.whitelist()
def sync_currency_scope(
	pos_profile=None,
	watermark=None,
	currency_pairs=None,
	limit=200,
	schema_version=None,
):
	if schema_version and schema_version != SYNC_SCHEMA_VERSION:
		return _build_response(full_resync_required=True)

	profile = _resolve_profile(pos_profile)
	if not profile:
		frappe.throw("pos_profile is required")

	resolved_limit = _coerce_limit(limit)
	currency_rows = frappe.get_all(
		"Currency",
		fields=["name", "enabled", "modified"],
		order_by="name asc",
	) or []
	enabled_rows = [row for row in currency_rows if row.get("enabled")]
	enabled_modified = _max_timestamp(
		[row.get("modified") for row in enabled_rows]
	)

	available_currency_payload = [
		{"name": row.get("name")}
		for row in enabled_rows
		if row.get("name")
	]
	if not available_currency_payload:
		available_currency_payload = [
			{"name": row.get("name")}
			for row in (get_available_currencies() or [])
			if row.get("name")
		]

	changes = []
	if _should_include(enabled_modified, watermark):
		changes.append(
			{
				"key": "currency_options",
				"modified": enabled_modified,
				"data": available_currency_payload,
			}
		)

	pair_modifications = []
	for from_currency, to_currency in _normalize_pairs(currency_pairs, profile):
		exchange_rows = frappe.get_all(
			"Currency Exchange",
			filters={
				"from_currency": from_currency,
				"to_currency": to_currency,
			},
			fields=["modified"],
			order_by="date desc, modified desc",
			limit_page_length=1,
		) or []
		pair_modified = _max_timestamp([row.get("modified") for row in exchange_rows])
		pair_modifications.append(pair_modified)
		if not _should_include(pair_modified, watermark):
			continue
		exchange_rate, rate_date = get_latest_rate(from_currency, to_currency)
		changes.append(
			{
				"key": f"exchange_rate::{from_currency}::{to_currency}",
				"modified": pair_modified,
				"data": {
					"from_currency": from_currency,
					"to_currency": to_currency,
					"exchange_rate": exchange_rate,
					"date": rate_date,
				},
			}
		)

	deleted = [
		{"key": f"currency::{row.get('name')}"}
		for row in currency_rows
		if not row.get("enabled")
		and row.get("name")
		and _should_include(row.get("modified"), watermark)
	]

	has_more = len(changes) > resolved_limit
	if has_more:
		changes = changes[:resolved_limit]

	next_watermark = _max_timestamp(enabled_modified, pair_modifications)
	return _build_response(
		changes=changes,
		deleted=deleted,
		next_watermark=next_watermark,
		has_more=has_more,
	)

