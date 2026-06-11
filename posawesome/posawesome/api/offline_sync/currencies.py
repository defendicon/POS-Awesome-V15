import json

import frappe

from posawesome.posawesome.api.invoice_processing.utils import (
    get_available_currencies,
    get_latest_rate,
    get_price_list_currency,
)
from posawesome.posawesome.api.offline_sync.common import (
    _build_response,
    _max_timestamp,
    _normalize_timestamp,
    _resolve_profile,
)
from posawesome.posawesome.api.payment_processing.utils import (
    get_mode_of_payment_accounts,
)

SYNC_SCHEMA_VERSION = "2026-04-09"


def _coerce_limit(value, default=200, maximum=1000):
    try:
        resolved = int(value or default)
    except (TypeError, ValueError):
        resolved = default
    return max(1, min(resolved, maximum))


def _coerce_offset(value):
    try:
        resolved = int(value or 0)
    except (TypeError, ValueError):
        resolved = 0
    return max(0, resolved)


def _should_include(modified, watermark):
    modified = _normalize_timestamp(modified)
    watermark = _normalize_timestamp(watermark)
    if not watermark:
        return True
    if not modified:
        return True
    return modified > watermark


def _parse_pairs(currency_pairs):
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

    return list(dict.fromkeys(pairs))


def _get_payment_currencies(profile):
    payment_methods = [
        str(row.get("mode_of_payment") or "").strip()
        for row in (profile.get("payments") or [])
        if str(row.get("mode_of_payment") or "").strip()
    ]
    mapping = get_mode_of_payment_accounts(profile.get("company"), payment_methods) or {}
    currencies = []
    for value in mapping.values():
        if isinstance(value, dict):
            currency = value.get("account_currency") or value.get("currency")
        else:
            currency = value
        if currency:
            currencies.append(str(currency).strip())
    return currencies


def _discover_pairs(profile, enabled_currencies):
    company_currency = ""
    if profile.get("company"):
        company_currency = str(
            frappe.db.get_value("Company", profile.get("company"), "default_currency") or ""
        ).strip()

    profile_currency = str(profile.get("currency") or "").strip()
    price_list_rows = (
        frappe.get_all(
            "Price List",
            filters={"selling": 1},
            fields=["name", "currency"],
            order_by="name asc",
        )
        or []
    )
    price_list_currencies = []
    for row in price_list_rows:
        currency = str(row.get("currency") or "").strip()
        if not currency and row.get("name"):
            currency = str(get_price_list_currency(row.get("name")) or "").strip()
        if currency:
            price_list_currencies.append(currency)

    selected_price_list = profile.get("selling_price_list")
    if selected_price_list:
        selected_currency = str(get_price_list_currency(selected_price_list) or "").strip()
        if selected_currency:
            price_list_currencies.append(selected_currency)

    invoice_currencies = (
        list(enabled_currencies)
        if profile.get("posa_allow_multi_currency")
        else [profile_currency or company_currency]
    )
    invoice_currencies.extend(_get_payment_currencies(profile))
    invoice_currencies = [currency for currency in dict.fromkeys(invoice_currencies) if currency]
    price_list_currencies = [
        currency for currency in dict.fromkeys(price_list_currencies) if currency
    ]

    pairs = []
    for price_list_currency in price_list_currencies:
        for invoice_currency in invoice_currencies:
            if price_list_currency != invoice_currency:
                pairs.append((price_list_currency, invoice_currency))
    for invoice_currency in invoice_currencies:
        if company_currency and invoice_currency != company_currency:
            pairs.append((invoice_currency, company_currency))
    return list(dict.fromkeys(pairs))


def _normalize_pairs(currency_pairs, profile, enabled_currencies):
    explicit_pairs = _parse_pairs(currency_pairs)
    if explicit_pairs:
        return explicit_pairs, True
    return _discover_pairs(profile, enabled_currencies), False


def _get_exchange_rows(resolved_pairs):
    if not resolved_pairs:
        return {}
    pair_set = set(resolved_pairs)
    rows = (
        frappe.get_all(
            "Currency Exchange",
            filters={
                "from_currency": ["in", sorted({pair[0] for pair in pair_set})],
                "to_currency": ["in", sorted({pair[1] for pair in pair_set})],
            },
            fields=[
                "name",
                "from_currency",
                "to_currency",
                "exchange_rate",
                "date",
                "modified",
            ],
            order_by="date asc, modified asc, name asc",
        )
        or []
    )
    grouped = {}
    for row in rows:
        pair = (row.get("from_currency"), row.get("to_currency"))
        if pair not in pair_set:
            continue
        grouped.setdefault(pair, []).append(row)
    return grouped


@frappe.whitelist()
def sync_currency_scope(
    pos_profile=None,
    watermark=None,
    currency_pairs=None,
    offset=0,
    limit=200,
    schema_version=None,
):
    if schema_version and schema_version != SYNC_SCHEMA_VERSION:
        return _build_response(full_resync_required=True)

    profile = _resolve_profile(pos_profile)
    if not profile:
        frappe.throw("pos_profile is required")

    resolved_limit = _coerce_limit(limit)
    resolved_offset = _coerce_offset(offset)
    currency_rows = (
        frappe.get_all(
            "Currency",
            fields=["name", "enabled", "modified"],
            order_by="name asc",
        )
        or []
    )
    enabled_rows = [row for row in currency_rows if row.get("enabled")]
    enabled_modified = _max_timestamp([row.get("modified") for row in enabled_rows])

    available_currency_payload = [{"name": row.get("name")} for row in enabled_rows if row.get("name")]
    if not available_currency_payload:
        available_currency_payload = [
            {"name": row.get("name")} for row in (get_available_currencies() or []) if row.get("name")
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

    enabled_currencies = [
        str(row.get("name") or "").strip()
        for row in enabled_rows
        if str(row.get("name") or "").strip()
    ]
    resolved_pairs, explicit_pairs = _normalize_pairs(
        currency_pairs,
        profile,
        enabled_currencies,
    )
    exchange_rows_by_pair = _get_exchange_rows(resolved_pairs)
    pair_modifications = []
    for from_currency, to_currency in resolved_pairs:
        exchange_rows = exchange_rows_by_pair.get((from_currency, to_currency), [])
        pair_modified = _max_timestamp([row.get("modified") for row in exchange_rows])
        pair_modifications.append(pair_modified)
        for row in exchange_rows:
            if explicit_pairs and not _should_include(row.get("modified"), watermark):
                continue
            if not row.get("name"):
                continue
            changes.append(
                {
                    "key": f"currency_rate::{row.get('name')}",
                    "modified": row.get("modified"),
                    "data": dict(row),
                }
            )
        if explicit_pairs and not _should_include(pair_modified, watermark):
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
        if not row.get("enabled") and row.get("name") and _should_include(row.get("modified"), watermark)
    ]
    deleted_rate_rows = []
    if watermark:
        deleted_rate_rows = (
            frappe.get_all(
                "Deleted Document",
                filters={
                    "deleted_doctype": "Currency Exchange",
                    "creation": [">", watermark],
                },
                fields=["deleted_name", "creation"],
                order_by="creation asc, deleted_name asc",
            )
            or []
        )
        deleted.extend(
            {
                "key": f"currency_rate::{row.get('deleted_name')}",
            }
            for row in deleted_rate_rows
            if row.get("deleted_name")
        )

    has_more = len(changes) > resolved_offset + resolved_limit
    changes = changes[resolved_offset : resolved_offset + resolved_limit]

    next_watermark = None
    if not has_more:
        next_watermark = _max_timestamp(
            enabled_modified,
            pair_modifications,
            [row.get("creation") for row in deleted_rate_rows],
        )
    response = _build_response(
        changes=changes,
        deleted=deleted,
        next_watermark=next_watermark,
        has_more=has_more,
    )
    response["next_offset"] = resolved_offset + len(changes) if has_more else None
    return response
