from __future__ import annotations

import json
from datetime import timedelta
from math import ceil
from collections import defaultdict
from typing import Any

import frappe
from frappe import _
from frappe.utils import add_months, cint, cstr, flt, getdate, now_datetime, nowdate

from .utils import get_active_pos_profile, get_default_warehouse

INVOICE_SOURCES: tuple[tuple[str, str], ...] = (
    ("Sales Invoice", "Sales Invoice Item"),
    ("POS Invoice", "POS Invoice Item"),
)

SCOPE_ALL = "all"
SCOPE_CURRENT = "current"
SCOPE_SPECIFIC = "specific"

DASHBOARD_MANAGER_ROLES = {
    "System Manager",
    "Accounts Manager",
    "Sales Manager",
    "Stock Manager",
    "POS Manager",
}


def _pick_first_column(doctype: str, candidates: list[str]) -> str | None:
    for fieldname in candidates:
        if frappe.db.has_column(doctype, fieldname):
            return fieldname
    return None


def _resolve_profile(pos_profile: Any) -> dict[str, Any]:
    profile_name = ""

    if isinstance(pos_profile, dict):
        profile_name = cstr(pos_profile.get("name")).strip()
    elif isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if raw_value:
            parsed_value: Any = raw_value
            if raw_value.startswith("{"):
                try:
                    parsed_value = json.loads(raw_value)
                except Exception:
                    parsed_value = raw_value

            if isinstance(parsed_value, dict):
                profile_name = cstr(parsed_value.get("name")).strip()
            elif isinstance(parsed_value, str):
                profile_name = parsed_value.strip()

    if profile_name:
        if not frappe.db.exists("POS Profile", profile_name):
            frappe.throw(_("POS Profile {0} does not exist.").format(profile_name))
        return frappe.get_cached_doc("POS Profile", profile_name).as_dict()

    active_profile = get_active_pos_profile()
    if not active_profile:
        frappe.throw(_("No active POS Profile found for current user."))
    return active_profile


def _check_profile_permission(profile_name: str):
    if not frappe.has_permission("POS Profile", "read", profile_name):
        frappe.throw(
            _("You are not permitted to access POS Profile {0}.").format(profile_name),
            frappe.PermissionError,
        )


def _build_in_filter(column_sql: str, values: list[str]) -> tuple[str, list[str]]:
    cleaned_values = [cstr(value).strip() for value in values if cstr(value).strip()]
    if not cleaned_values:
        return "", []
    placeholders = ", ".join(["%s"] * len(cleaned_values))
    return f" and {column_sql} in ({placeholders})", cleaned_values


def _coerce_limit(value: Any, default: int, minimum: int = 1, maximum: int = 50) -> int:
    coerced = cint(value) if value is not None else default
    if not coerced:
        coerced = default
    return max(minimum, min(int(coerced), maximum))


def _coerce_page(value: Any, default: int = 1, maximum: int = 100000) -> int:
    page = cint(value) if value is not None else default
    if not page:
        page = default
    return max(1, min(int(page), maximum))


def _coerce_threshold(value: Any, fallback: Any, default: int = 10, maximum: int = 9999) -> int:
    if value is None:
        value = fallback
    threshold = cint(value) if value is not None else default
    if threshold <= 0:
        threshold = default
    return min(int(threshold), maximum)


def _to_bool_setting(value: Any, default: bool = False) -> bool:
    if value in (None, ""):
        return default
    return bool(cint(value))


def _is_dashboard_enabled(profile_doc: dict[str, Any]) -> bool:
    if not frappe.db.has_column("POS Profile", "posa_enable_awesome_dashboard"):
        return True

    value = profile_doc.get("posa_enable_awesome_dashboard")
    return _to_bool_setting(value, True)


def _safe_pos_settings_value(fieldname: str, default: Any = None):
    if not frappe.db.exists("DocType", "POS Settings"):
        return default
    if not frappe.db.has_column("POS Settings", fieldname):
        return default
    value = frappe.db.get_single_value("POS Settings", fieldname)
    return default if value in (None, "") else value


def _get_global_dashboard_settings() -> dict[str, Any]:
    enabled_raw = _safe_pos_settings_value("posa_enable_awesome_dashboard_global", 1)
    default_scope_raw = cstr(
        _safe_pos_settings_value("posa_dashboard_default_scope", "All Profiles")
    ).strip()
    low_stock_threshold_raw = _safe_pos_settings_value(
        "posa_dashboard_low_stock_alert_threshold", 10
    )

    if default_scope_raw.lower().startswith("current"):
        default_scope = SCOPE_CURRENT
    else:
        default_scope = SCOPE_ALL

    return {
        "enabled": bool(cint(enabled_raw)),
        "default_scope": default_scope,
        "low_stock_threshold": _coerce_threshold(low_stock_threshold_raw, 10),
    }


def _user_can_view_all_profiles(user: str) -> bool:
    if user == "Administrator":
        return True
    user_roles = set(frappe.get_roles(user))
    return bool(user_roles & DASHBOARD_MANAGER_ROLES)


def _normalize_scope(scope: Any, default_scope: str, allow_all_profiles: bool) -> str:
    requested = cstr(scope).strip().lower()
    if requested in ("all", "company", "global"):
        normalized = SCOPE_ALL
    elif requested in ("specific", "profile"):
        normalized = SCOPE_SPECIFIC
    elif requested in ("current", "my", "active"):
        normalized = SCOPE_CURRENT
    else:
        normalized = default_scope

    if not allow_all_profiles and normalized in (SCOPE_ALL, SCOPE_SPECIFIC):
        return SCOPE_CURRENT
    return normalized


def _get_company_profiles(company: str) -> list[dict[str, Any]]:
    fields = ["name", "warehouse", "currency", "company"]
    has_disabled = frappe.db.has_column("POS Profile", "disabled")
    if has_disabled:
        fields.append("disabled")
    if frappe.db.has_column("POS Profile", "posa_enable_awesome_dashboard"):
        fields.append("posa_enable_awesome_dashboard")
    if frappe.db.has_column("POS Profile", "posa_allow_company_dashboard_scope"):
        fields.append("posa_allow_company_dashboard_scope")
    if frappe.db.has_column("POS Profile", "posa_low_stock_alert_threshold"):
        fields.append("posa_low_stock_alert_threshold")

    filters: dict[str, Any] = {"company": company}
    if has_disabled:
        filters["disabled"] = 0

    profiles = frappe.get_all(
        "POS Profile",
        filters=filters,
        fields=fields,
        order_by="name asc",
    )

    for profile in profiles:
        profile["dashboard_enabled"] = _is_dashboard_enabled(profile)
    return profiles


def _get_assigned_profiles(user: str, company_profiles: list[dict[str, Any]]) -> list[str]:
    if not frappe.db.exists("DocType", "POS Profile User"):
        return []

    allowed_profiles = set(
        frappe.get_all(
            "POS Profile User",
            filters={"user": user},
            pluck="parent",
        )
    )
    if not allowed_profiles:
        return []

    company_profile_names = {profile.get("name") for profile in company_profiles}
    return sorted(
        [name for name in allowed_profiles if name in company_profile_names]
    )


def _iter_invoice_sources() -> list[tuple[str, str]]:
    available_sources: list[tuple[str, str]] = []
    for parent_doctype, child_doctype in INVOICE_SOURCES:
        if not frappe.db.exists("DocType", parent_doctype):
            continue
        if not frappe.db.exists("DocType", child_doctype):
            continue
        if not frappe.db.has_column(parent_doctype, "pos_profile"):
            continue
        available_sources.append((parent_doctype, child_doctype))
    return available_sources


def _extra_parent_filter(parent_doctype: str, alias: str = "inv") -> str:
    if parent_doctype == "POS Invoice" and frappe.db.has_column(parent_doctype, "consolidated_invoice"):
        return f" and ifnull({alias}.consolidated_invoice, '') = ''"
    return ""


def _extra_sle_filter(alias: str = "sle") -> str:
    if frappe.db.has_column("Stock Ledger Entry", "is_cancelled"):
        return f" and ifnull({alias}.is_cancelled, 0) = 0"
    return ""


def _collect_sales_and_profit(
    parent_doctype: str,
    child_doctype: str,
    profile_names: list[str],
    company: str,
    date_from: str,
    date_to: str,
) -> dict[str, float]:
    if not profile_names:
        return {"sales": 0.0, "profit": 0.0, "profit_method": "invoice_item"}

    total_sales = 0.0
    total_sales_for_profit = 0.0
    total_profit = 0.0
    profit_method = "invoice_item"
    profile_filter, profile_filter_params = _build_in_filter("inv.pos_profile", profile_names)

    parent_amount_field = _pick_first_column(parent_doctype, ["base_grand_total", "grand_total"])
    parent_net_field = _pick_first_column(parent_doctype, ["base_net_total", "net_total"])
    if parent_amount_field or parent_net_field:
        sales_expression = f"sum(coalesce(inv.{parent_amount_field}, 0))" if parent_amount_field else "0"
        profit_sales_expression = (
            f"sum(coalesce(inv.{parent_net_field}, 0))"
            if parent_net_field
            else sales_expression
        )
        sales_row = frappe.db.sql(
            f"""
            select
                {sales_expression} as total_sales,
                {profit_sales_expression} as total_sales_for_profit
            from `tab{parent_doctype}` inv
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (company, date_from, date_to, *profile_filter_params),
            as_dict=True,
        )
        total_sales = flt((sales_row[0] or {}).get("total_sales"))
        total_sales_for_profit = flt((sales_row[0] or {}).get("total_sales_for_profit"))

    # Prefer stock-ledger-based COGS for a closer accounting-style gross profit.
    if (
        frappe.db.exists("DocType", "Stock Ledger Entry")
        and frappe.db.has_column("Stock Ledger Entry", "voucher_type")
        and frappe.db.has_column("Stock Ledger Entry", "voucher_no")
        and frappe.db.has_column("Stock Ledger Entry", "stock_value_difference")
    ):
        cogs_row = frappe.db.sql(
            f"""
            select sum((-1) * coalesce(sle.stock_value_difference, 0)) as total_cogs
            from `tabStock Ledger Entry` sle
            inner join `tab{parent_doctype}` inv
                on inv.name = sle.voucher_no
               and sle.voucher_type = %s
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_sle_filter("sle")}
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (parent_doctype, company, date_from, date_to, *profile_filter_params),
            as_dict=True,
        )
        total_cogs = flt((cogs_row[0] or {}).get("total_cogs"))
        total_profit = flt(total_sales_for_profit - total_cogs)
        profit_method = "stock_ledger"
        return {
            "sales": total_sales,
            "profit": total_profit,
            "profit_method": profit_method,
        }

    amount_field = _pick_first_column(child_doctype, ["base_net_amount", "net_amount", "amount"])
    qty_field = _pick_first_column(child_doctype, ["stock_qty", "qty"])
    cost_field = _pick_first_column(child_doctype, ["incoming_rate", "valuation_rate"])

    if amount_field and qty_field:
        if cost_field:
            profit_expression = (
                f"coalesce(item.{amount_field}, 0) - "
                f"(coalesce(item.{qty_field}, 0) * coalesce(item.{cost_field}, 0))"
            )
        else:
            profit_expression = f"coalesce(item.{amount_field}, 0)"

        profit_row = frappe.db.sql(
            f"""
            select sum({profit_expression}) as total_profit
            from `tab{child_doctype}` item
            inner join `tab{parent_doctype}` inv on inv.name = item.parent
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (company, date_from, date_to, *profile_filter_params),
            as_dict=True,
        )
        total_profit = flt((profit_row[0] or {}).get("total_profit"))

    return {
        "sales": total_sales,
        "profit": total_profit,
        "profit_method": profit_method,
    }


def _resolve_payment_child_doctype(parent_doctype: str) -> str | None:
    try:
        meta = frappe.get_meta(parent_doctype)
    except Exception:
        return None

    for field in meta.get("fields", []):
        if field.fieldtype == "Table" and field.fieldname == "payments" and field.options:
            if frappe.db.exists("DocType", field.options):
                return field.options

    for field in meta.get("fields", []):
        if field.fieldtype != "Table" or not field.options:
            continue
        if "payment" in cstr(field.options).lower() and frappe.db.exists("DocType", field.options):
            return field.options

    return None


def _get_mode_type_map(mode_names: list[str]) -> dict[str, str]:
    cleaned = sorted({cstr(name).strip() for name in mode_names if cstr(name).strip()})
    if not cleaned:
        return {}
    if not frappe.db.exists("DocType", "Mode of Payment"):
        return {}
    if not frappe.db.has_column("Mode of Payment", "type"):
        return {}

    rows = frappe.get_all(
        "Mode of Payment",
        filters={"name": ["in", cleaned]},
        fields=["name", "type"],
    )
    return {cstr(row.get("name")).strip(): cstr(row.get("type")).strip() for row in rows}


def _classify_payment_mode(mode_name: str, mode_type: str, cash_modes: set[str]) -> str:
    normalized_name = cstr(mode_name).strip()
    lowered_name = normalized_name.lower()
    lowered_type = cstr(mode_type).strip().lower()

    if normalized_name in cash_modes or lowered_type == "cash" or "cash" in lowered_name:
        return "cash"

    if lowered_type in {"bank", "card"}:
        return "card_online"

    if any(
        token in lowered_name
        for token in ("card", "bank", "online", "wallet", "upi", "mpesa", "transfer", "mobile")
    ):
        return "card_online"

    return "other"


def _collect_daily_sales_summary(
    profile_names: list[str],
    company: str,
    date_value: str,
) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "period": {"from": date_value, "to": date_value},
        "invoice_count": 0,
        "returns_count": 0,
        "gross_sales": 0.0,
        "net_sales": 0.0,
        "returns_amount": 0.0,
        "discount_amount": 0.0,
        "tax_amount": 0.0,
        "opening_amount": 0.0,
        "opening_cash": 0.0,
        "closing_amount": 0.0,
        "closing_cash": 0.0,
        "cash_collections": 0.0,
        "card_online_collections": 0.0,
        "other_collections": 0.0,
        "change_given": 0.0,
        "collections_total": 0.0,
        "expected_cash": 0.0,
        "actual_cash": 0.0,
        "cash_variance": 0.0,
        "average_invoice_value": 0.0,
        "has_closing_snapshot": False,
        "payment_methods": [],
    }
    if not profile_names:
        return summary

    profile_filter, profile_filter_params = _build_in_filter("inv.pos_profile", profile_names)
    cash_modes: set[str] = {"Cash"}

    if frappe.db.has_column("POS Profile", "posa_cash_mode_of_payment"):
        configured_cash_modes = frappe.get_all(
            "POS Profile",
            filters={"name": ["in", profile_names]},
            pluck="posa_cash_mode_of_payment",
        )
        cash_modes.update(
            cstr(mode_name).strip()
            for mode_name in configured_cash_modes
            if cstr(mode_name).strip()
        )

    payment_totals: dict[str, float] = defaultdict(float)
    opening_by_mode: dict[str, float] = defaultdict(float)
    closing_expected_by_mode: dict[str, float] = defaultdict(float)
    closing_actual_by_mode: dict[str, float] = defaultdict(float)
    mode_names: set[str] = set(cash_modes)

    if frappe.db.exists("DocType", "POS Opening Shift") and frappe.db.exists("DocType", "POS Opening Shift Detail"):
        opening_rows = frappe.db.sql(
            f"""
            select
                detail.mode_of_payment as mode_of_payment,
                sum(coalesce(detail.amount, 0)) as opening_amount
            from `tabPOS Opening Shift Detail` detail
            inner join `tabPOS Opening Shift` inv on inv.name = detail.parent
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date = %s
              {profile_filter}
            group by detail.mode_of_payment
            """,
            (company, date_value, *profile_filter_params),
            as_dict=True,
        )
        for row in opening_rows:
            mode_name = cstr(row.get("mode_of_payment")).strip()
            if not mode_name:
                continue
            amount = flt(row.get("opening_amount"))
            mode_names.add(mode_name)
            opening_by_mode[mode_name] += amount
            summary["opening_amount"] += amount

    if frappe.db.exists("DocType", "POS Closing Shift") and frappe.db.exists("DocType", "POS Closing Shift Detail"):
        closing_rows = frappe.db.sql(
            f"""
            select
                detail.mode_of_payment as mode_of_payment,
                sum(coalesce(detail.expected_amount, 0)) as expected_amount,
                sum(coalesce(detail.closing_amount, 0)) as closing_amount
            from `tabPOS Closing Shift Detail` detail
            inner join `tabPOS Closing Shift` inv on inv.name = detail.parent
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date = %s
              {profile_filter}
            group by detail.mode_of_payment
            """,
            (company, date_value, *profile_filter_params),
            as_dict=True,
        )
        if closing_rows:
            summary["has_closing_snapshot"] = True
        for row in closing_rows:
            mode_name = cstr(row.get("mode_of_payment")).strip()
            if not mode_name:
                continue
            expected_amount = flt(row.get("expected_amount"))
            closing_amount = flt(row.get("closing_amount"))
            mode_names.add(mode_name)
            closing_expected_by_mode[mode_name] += expected_amount
            closing_actual_by_mode[mode_name] += closing_amount
            summary["closing_amount"] += closing_amount

    for parent_doctype, child_doctype in _iter_invoice_sources():
        is_return_expression = (
            "ifnull(inv.is_return, 0)" if frappe.db.has_column(parent_doctype, "is_return") else "0"
        )
        amount_field = _pick_first_column(parent_doctype, ["base_grand_total", "grand_total"])
        discount_field = _pick_first_column(
            parent_doctype,
            [
                "base_discount_amount",
                "discount_amount",
                "base_additional_discount_amount",
                "additional_discount_amount",
            ],
        )
        tax_field = _pick_first_column(parent_doctype, ["base_total_taxes_and_charges", "total_taxes_and_charges"])
        change_field = _pick_first_column(parent_doctype, ["base_change_amount", "change_amount"])

        amount_expression = f"coalesce(inv.{amount_field}, 0)" if amount_field else "0"
        discount_expression = f"coalesce(inv.{discount_field}, 0)" if discount_field else "0"
        tax_expression = f"coalesce(inv.{tax_field}, 0)" if tax_field else "0"
        change_expression = f"coalesce(inv.{change_field}, 0)" if change_field else "0"

        daily_row = frappe.db.sql(
            f"""
            select
                count(inv.name) as invoice_count,
                sum(
                    case
                        when {is_return_expression} = 1 then abs({amount_expression})
                        else {amount_expression}
                    end
                ) as gross_sales,
                sum(
                    case
                        when {is_return_expression} = 1 then abs({amount_expression})
                        else 0
                    end
                ) as returns_amount,
                sum(
                    case
                        when {is_return_expression} = 1 then 1
                        else 0
                    end
                ) as returns_count,
                sum({amount_expression}) as net_sales,
                sum(
                    case
                        when {is_return_expression} = 1 then -abs({discount_expression})
                        else {discount_expression}
                    end
                ) as discount_amount,
                sum(
                    case
                        when {is_return_expression} = 1 then -abs({tax_expression})
                        else {tax_expression}
                    end
                ) as tax_amount,
                sum(
                    case
                        when {is_return_expression} = 1 then 0
                        else abs({change_expression})
                    end
                ) as change_given
            from `tab{parent_doctype}` inv
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date = %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (company, date_value, *profile_filter_params),
            as_dict=True,
        )

        row = daily_row[0] if daily_row else {}
        summary["invoice_count"] += cint(row.get("invoice_count"))
        summary["returns_count"] += cint(row.get("returns_count"))
        summary["gross_sales"] += flt(row.get("gross_sales"))
        summary["returns_amount"] += flt(row.get("returns_amount"))
        summary["net_sales"] += flt(row.get("net_sales"))
        summary["discount_amount"] += flt(row.get("discount_amount"))
        summary["tax_amount"] += flt(row.get("tax_amount"))
        summary["change_given"] += flt(row.get("change_given"))

        item_discount_field = _pick_first_column(child_doctype, ["base_discount_amount", "discount_amount"])
        if item_discount_field:
            item_discount_row = frappe.db.sql(
                f"""
                select
                    sum(
                        case
                            when {is_return_expression} = 1 then -abs(coalesce(item.{item_discount_field}, 0))
                            else coalesce(item.{item_discount_field}, 0)
                        end
                    ) as item_discount_amount
                from `tab{child_doctype}` item
                inner join `tab{parent_doctype}` inv on inv.name = item.parent
                where inv.docstatus = 1
                  and inv.company = %s
                  and inv.posting_date = %s
                  {profile_filter}
                  {_extra_parent_filter(parent_doctype, "inv")}
                """,
                (company, date_value, *profile_filter_params),
                as_dict=True,
            )
            summary["discount_amount"] += flt((item_discount_row[0] or {}).get("item_discount_amount"))

        payment_child_doctype = _resolve_payment_child_doctype(parent_doctype)
        if payment_child_doctype and frappe.db.has_column(payment_child_doctype, "mode_of_payment"):
            payment_amount_field = _pick_first_column(payment_child_doctype, ["base_amount", "amount"])
            if payment_amount_field:
                payment_rows = frappe.db.sql(
                    f"""
                    select
                        pay.mode_of_payment as mode_of_payment,
                        sum(
                            case
                                when {is_return_expression} = 1 then -abs(coalesce(pay.{payment_amount_field}, 0))
                                else coalesce(pay.{payment_amount_field}, 0)
                            end
                        ) as collected_amount
                    from `tab{payment_child_doctype}` pay
                    inner join `tab{parent_doctype}` inv on inv.name = pay.parent
                    where inv.docstatus = 1
                      and inv.company = %s
                      and inv.posting_date = %s
                      {profile_filter}
                      {_extra_parent_filter(parent_doctype, "inv")}
                    group by pay.mode_of_payment
                    """,
                    (company, date_value, *profile_filter_params),
                    as_dict=True,
                )
                for pay_row in payment_rows:
                    mode_name = cstr(pay_row.get("mode_of_payment")).strip()
                    if not mode_name:
                        continue
                    mode_names.add(mode_name)
                    payment_totals[mode_name] += flt(pay_row.get("collected_amount"))

    mode_type_map = _get_mode_type_map(sorted(mode_names))
    for mode_name, amount in opening_by_mode.items():
        category = _classify_payment_mode(mode_name, mode_type_map.get(mode_name, ""), cash_modes)
        if category == "cash":
            summary["opening_cash"] += flt(amount)

    for mode_name, amount in closing_actual_by_mode.items():
        category = _classify_payment_mode(mode_name, mode_type_map.get(mode_name, ""), cash_modes)
        if category == "cash":
            summary["closing_cash"] += flt(amount)

    cash_payments_raw = 0.0
    card_online_total = 0.0
    other_total = 0.0
    payment_method_rows: list[dict[str, Any]] = []
    for mode_name in sorted(payment_totals.keys()):
        amount = flt(payment_totals.get(mode_name))
        category = _classify_payment_mode(mode_name, mode_type_map.get(mode_name, ""), cash_modes)
        if category == "cash":
            cash_payments_raw += amount
        elif category == "card_online":
            card_online_total += amount
        else:
            other_total += amount

        payment_method_rows.append(
            {
                "mode_of_payment": mode_name,
                "mode_type": mode_type_map.get(mode_name, ""),
                "category": category,
                "amount": amount,
            }
        )

    summary["cash_collections"] = flt(cash_payments_raw - flt(summary.get("change_given")))
    summary["card_online_collections"] = flt(card_online_total)
    summary["other_collections"] = flt(other_total)
    summary["collections_total"] = flt(
        summary["cash_collections"] + summary["card_online_collections"] + summary["other_collections"]
    )
    summary["payment_methods"] = payment_method_rows

    closing_expected_cash = 0.0
    for mode_name, amount in closing_expected_by_mode.items():
        category = _classify_payment_mode(mode_name, mode_type_map.get(mode_name, ""), cash_modes)
        if category == "cash":
            closing_expected_cash += flt(amount)

    if summary["has_closing_snapshot"] and (closing_expected_cash or summary["closing_cash"]):
        summary["expected_cash"] = flt(closing_expected_cash)
        summary["actual_cash"] = flt(summary["closing_cash"])
    else:
        summary["expected_cash"] = flt(summary["opening_cash"] + summary["cash_collections"])
        summary["actual_cash"] = flt(summary["expected_cash"])

    summary["cash_variance"] = flt(summary["actual_cash"] - summary["expected_cash"])
    invoice_count = cint(summary.get("invoice_count"))
    summary["average_invoice_value"] = (
        flt(summary["net_sales"] / invoice_count) if invoice_count > 0 else 0.0
    )
    return summary


def _pct_change(current: float, previous: float) -> float | None:
    current_value = flt(current)
    previous_value = flt(previous)
    if abs(previous_value) < 0.00001:
        return 0.0 if abs(current_value) < 0.00001 else None
    return flt(((current_value - previous_value) / abs(previous_value)) * 100)


def _collect_sales_trend(
    profile_names: list[str],
    company: str,
    today,
    month_start,
) -> dict[str, Any]:
    week_window_start = today - timedelta(days=55)
    month_window_start = getdate(add_months(today, -5)).replace(day=1)

    trend: dict[str, Any] = {
        "period": {
            "day_from": str(month_start),
            "day_to": str(today),
            "week_from": str(week_window_start),
            "month_from": str(month_window_start),
            "to": str(today),
        },
        "day_wise": [],
        "week_wise": [],
        "month_wise": [],
        "hourly": [],
        "highlights": {
            "best_day": None,
            "best_hour": None,
            "day_growth_pct": None,
            "week_growth_pct": None,
            "month_growth_pct": None,
        },
    }
    if not profile_names:
        return trend

    profile_filter, profile_filter_params = _build_in_filter("inv.pos_profile", profile_names)

    day_buckets: dict[str, dict[str, Any]] = {}
    week_buckets: dict[str, dict[str, Any]] = {}
    month_buckets: dict[str, dict[str, Any]] = {}
    hourly_buckets: dict[int, dict[str, Any]] = {
        hour: {"hour": hour, "label": f"{hour:02d}:00", "sales": 0.0, "invoice_count": 0}
        for hour in range(24)
    }

    for parent_doctype, _child_doctype in _iter_invoice_sources():
        amount_field = _pick_first_column(parent_doctype, ["base_grand_total", "grand_total"])
        if not amount_field:
            continue
        amount_expression = f"coalesce(inv.{amount_field}, 0)"

        day_rows = frappe.db.sql(
            f"""
            select
                inv.posting_date as posting_date,
                sum({amount_expression}) as sales_amount,
                count(inv.name) as invoice_count
            from `tab{parent_doctype}` inv
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            group by inv.posting_date
            """,
            (company, str(month_start), str(today), *profile_filter_params),
            as_dict=True,
        )
        for row in day_rows:
            bucket = cstr(row.get("posting_date")).strip()
            if not bucket:
                continue
            entry = day_buckets.setdefault(
                bucket,
                {"date": bucket, "label": bucket, "sales": 0.0, "invoice_count": 0},
            )
            entry["sales"] += flt(row.get("sales_amount"))
            entry["invoice_count"] += cint(row.get("invoice_count"))

        week_rows = frappe.db.sql(
            f"""
            select
                yearweek(inv.posting_date, 1) as year_week,
                min(inv.posting_date) as week_start,
                max(inv.posting_date) as week_end,
                sum({amount_expression}) as sales_amount,
                count(inv.name) as invoice_count
            from `tab{parent_doctype}` inv
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            group by yearweek(inv.posting_date, 1)
            """,
            (company, str(week_window_start), str(today), *profile_filter_params),
            as_dict=True,
        )
        for row in week_rows:
            year_week = cint(row.get("year_week"))
            week_key = cstr(year_week).strip() or cstr(row.get("week_start")).strip()
            week_number = year_week % 100 if year_week else 0
            week_year = year_week // 100 if year_week else 0
            label = f"{week_year}-W{week_number:02d}" if year_week else week_key
            entry = week_buckets.setdefault(
                week_key,
                {
                    "year_week": year_week,
                    "label": label,
                    "week_start": cstr(row.get("week_start")).strip(),
                    "week_end": cstr(row.get("week_end")).strip(),
                    "sales": 0.0,
                    "invoice_count": 0,
                },
            )
            entry["sales"] += flt(row.get("sales_amount"))
            entry["invoice_count"] += cint(row.get("invoice_count"))

            start_candidate = cstr(row.get("week_start")).strip()
            end_candidate = cstr(row.get("week_end")).strip()
            if start_candidate and (
                not entry.get("week_start") or start_candidate < cstr(entry.get("week_start"))
            ):
                entry["week_start"] = start_candidate
            if end_candidate and (
                not entry.get("week_end") or end_candidate > cstr(entry.get("week_end"))
            ):
                entry["week_end"] = end_candidate

        month_rows = frappe.db.sql(
            f"""
            select
                date_format(inv.posting_date, '%%Y-%%m') as month_label,
                min(inv.posting_date) as month_start,
                max(inv.posting_date) as month_end,
                sum({amount_expression}) as sales_amount,
                count(inv.name) as invoice_count
            from `tab{parent_doctype}` inv
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            group by date_format(inv.posting_date, '%%Y-%%m')
            """,
            (company, str(month_window_start), str(today), *profile_filter_params),
            as_dict=True,
        )
        for row in month_rows:
            month_key = cstr(row.get("month_label")).strip()
            if not month_key:
                continue
            entry = month_buckets.setdefault(
                month_key,
                {
                    "month": month_key,
                    "label": month_key,
                    "month_start": cstr(row.get("month_start")).strip(),
                    "month_end": cstr(row.get("month_end")).strip(),
                    "sales": 0.0,
                    "invoice_count": 0,
                },
            )
            entry["sales"] += flt(row.get("sales_amount"))
            entry["invoice_count"] += cint(row.get("invoice_count"))

            start_candidate = cstr(row.get("month_start")).strip()
            end_candidate = cstr(row.get("month_end")).strip()
            if start_candidate and (
                not entry.get("month_start") or start_candidate < cstr(entry.get("month_start"))
            ):
                entry["month_start"] = start_candidate
            if end_candidate and (
                not entry.get("month_end") or end_candidate > cstr(entry.get("month_end"))
            ):
                entry["month_end"] = end_candidate

        hour_expression = None
        if frappe.db.has_column(parent_doctype, "posting_time"):
            hour_expression = "hour(inv.posting_time)"
        elif frappe.db.has_column(parent_doctype, "creation"):
            hour_expression = "hour(inv.creation)"

        if hour_expression:
            hour_rows = frappe.db.sql(
                f"""
                select
                    {hour_expression} as hour_of_day,
                    sum({amount_expression}) as sales_amount,
                    count(inv.name) as invoice_count
                from `tab{parent_doctype}` inv
                where inv.docstatus = 1
                  and inv.company = %s
                  and inv.posting_date = %s
                  {profile_filter}
                  {_extra_parent_filter(parent_doctype, "inv")}
                group by {hour_expression}
                """,
                (company, str(today), *profile_filter_params),
                as_dict=True,
            )
            for row in hour_rows:
                hour = cint(row.get("hour_of_day"))
                if hour < 0 or hour > 23:
                    continue
                hourly_buckets[hour]["sales"] += flt(row.get("sales_amount"))
                hourly_buckets[hour]["invoice_count"] += cint(row.get("invoice_count"))

    day_points = sorted(day_buckets.values(), key=lambda row: cstr(row.get("date")))
    week_points = sorted(week_buckets.values(), key=lambda row: cstr(row.get("week_start")))
    month_points = sorted(month_buckets.values(), key=lambda row: cstr(row.get("month")))
    hourly_points = [hourly_buckets[hour] for hour in range(24)]

    trend["day_wise"] = day_points
    trend["week_wise"] = week_points
    trend["month_wise"] = month_points
    trend["hourly"] = hourly_points

    day_map = {cstr(row.get("date")): flt(row.get("sales")) for row in day_points}
    today_key = str(today)
    yesterday_key = str(today - timedelta(days=1))
    trend["highlights"]["day_growth_pct"] = _pct_change(day_map.get(today_key, 0.0), day_map.get(yesterday_key, 0.0))

    if len(week_points) >= 2:
        trend["highlights"]["week_growth_pct"] = _pct_change(
            flt(week_points[-1].get("sales")),
            flt(week_points[-2].get("sales")),
        )
    elif len(week_points) == 1:
        trend["highlights"]["week_growth_pct"] = _pct_change(flt(week_points[-1].get("sales")), 0.0)

    if len(month_points) >= 2:
        trend["highlights"]["month_growth_pct"] = _pct_change(
            flt(month_points[-1].get("sales")),
            flt(month_points[-2].get("sales")),
        )
    elif len(month_points) == 1:
        trend["highlights"]["month_growth_pct"] = _pct_change(flt(month_points[-1].get("sales")), 0.0)

    if day_points:
        best_day = max(day_points, key=lambda row: flt(row.get("sales")))
        trend["highlights"]["best_day"] = {
            "date": best_day.get("date"),
            "sales": flt(best_day.get("sales")),
            "invoice_count": cint(best_day.get("invoice_count")),
        }

    non_zero_hours = [row for row in hourly_points if abs(flt(row.get("sales"))) > 0.00001]
    if non_zero_hours:
        best_hour = max(non_zero_hours, key=lambda row: flt(row.get("sales")))
        trend["highlights"]["best_hour"] = {
            "hour": cint(best_hour.get("hour")),
            "label": best_hour.get("label"),
            "sales": flt(best_hour.get("sales")),
            "invoice_count": cint(best_hour.get("invoice_count")),
        }

    return trend


def _collect_item_totals(
    profile_names: list[str],
    company: str,
    date_from: str,
    date_to: str,
) -> dict[str, dict[str, Any]]:
    if not profile_names:
        return {}

    profile_filter, profile_filter_params = _build_in_filter("inv.pos_profile", profile_names)
    grouped_items: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "item_code": "",
            "item_name": "",
            "stock_uom": "",
            "sold_qty": 0.0,
            "sales_amount": 0.0,
            "discount_amount": 0.0,
            "estimated_cost": 0.0,
            "total_lines": 0,
            "discounted_lines": 0,
        }
    )

    for parent_doctype, child_doctype in _iter_invoice_sources():
        qty_field = _pick_first_column(child_doctype, ["stock_qty", "qty"])
        if not qty_field:
            continue

        amount_field = _pick_first_column(child_doctype, ["base_net_amount", "net_amount", "amount"])
        discount_field = _pick_first_column(child_doctype, ["base_discount_amount", "discount_amount"])
        cost_field = _pick_first_column(child_doctype, ["incoming_rate", "valuation_rate"])
        name_field = _pick_first_column(child_doctype, ["item_name"])
        uom_field = _pick_first_column(child_doctype, ["stock_uom", "uom"])

        is_return_expression = (
            "ifnull(inv.is_return, 0)" if frappe.db.has_column(parent_doctype, "is_return") else "0"
        )

        qty_base_expression = f"coalesce(item.{qty_field}, 0)"
        amount_base_expression = f"coalesce(item.{amount_field}, 0)" if amount_field else "0"
        discount_base_expression = f"coalesce(item.{discount_field}, 0)" if discount_field else "0"
        cost_rate_expression = f"coalesce(item.{cost_field}, 0)" if cost_field else "0"

        qty_expression = (
            f"case when {is_return_expression} = 1 then -abs({qty_base_expression}) "
            f"else abs({qty_base_expression}) end"
        )
        amount_expression = (
            f"case when {is_return_expression} = 1 then -abs({amount_base_expression}) "
            f"else abs({amount_base_expression}) end"
        )
        discount_expression = (
            f"case when {is_return_expression} = 1 then -abs({discount_base_expression}) "
            f"else abs({discount_base_expression}) end"
        )
        discounted_line_expression = f"case when abs({discount_base_expression}) > 0.00001 then 1 else 0 end"
        item_name_expression = (
            f"coalesce(item.{name_field}, item.item_code)" if name_field else "item.item_code"
        )
        stock_uom_expression = f"coalesce(item.{uom_field}, '')" if uom_field else "''"

        rows = frappe.db.sql(
            f"""
            select
                item.item_code as item_code,
                max({item_name_expression}) as item_name,
                max({stock_uom_expression}) as stock_uom,
                sum({qty_expression}) as sold_qty,
                sum({amount_expression}) as sales_amount,
                sum({discount_expression}) as discount_amount,
                sum(({qty_expression}) * ({cost_rate_expression})) as estimated_cost,
                count(item.name) as total_lines,
                sum({discounted_line_expression}) as discounted_lines
            from `tab{child_doctype}` item
            inner join `tab{parent_doctype}` inv on inv.name = item.parent
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            group by item.item_code
            """,
            (company, date_from, date_to, *profile_filter_params),
            as_dict=True,
        )

        for row in rows:
            item_code = cstr(row.get("item_code")).strip()
            if not item_code:
                continue

            current = grouped_items[item_code]
            current["item_code"] = item_code
            current["item_name"] = cstr(row.get("item_name") or current.get("item_name") or item_code)
            current["stock_uom"] = cstr(row.get("stock_uom") or current.get("stock_uom") or "")
            current["sold_qty"] = flt(current.get("sold_qty")) + flt(row.get("sold_qty"))
            current["sales_amount"] = flt(current.get("sales_amount")) + flt(row.get("sales_amount"))
            current["discount_amount"] = flt(current.get("discount_amount")) + flt(row.get("discount_amount"))
            current["estimated_cost"] = flt(current.get("estimated_cost")) + flt(row.get("estimated_cost"))
            current["total_lines"] = cint(current.get("total_lines")) + cint(row.get("total_lines"))
            current["discounted_lines"] = cint(current.get("discounted_lines")) + cint(
                row.get("discounted_lines")
            )

    return dict(grouped_items)


def _collect_item_sales_report(
    profile_names: list[str],
    company: str,
    date_from: str,
    date_to: str,
    limit: int = 20,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "period": {"from": date_from, "to": date_to},
        "items": [],
        "highlights": {
            "best_seller": None,
            "top_margin_item": None,
            "top_discount_item": None,
        },
    }
    grouped_items = _collect_item_totals(
        profile_names=profile_names,
        company=company,
        date_from=date_from,
        date_to=date_to,
    )

    items: list[dict[str, Any]] = []
    for row in grouped_items.values():
        sold_qty = flt(row.get("sold_qty"))
        sales_amount = flt(row.get("sales_amount"))
        estimated_cost = flt(row.get("estimated_cost"))
        discount_amount = flt(row.get("discount_amount"))
        total_lines = max(0, cint(row.get("total_lines")))
        discounted_lines = max(0, min(total_lines, cint(row.get("discounted_lines"))))

        if abs(sold_qty) < 0.00001 and abs(sales_amount) < 0.00001:
            continue

        estimated_margin = flt(sales_amount - estimated_cost)
        margin_pct = (
            flt((estimated_margin / sales_amount) * 100) if abs(sales_amount) > 0.00001 else None
        )
        discount_frequency_pct = (
            flt((discounted_lines / total_lines) * 100) if total_lines > 0 else 0.0
        )

        items.append(
            {
                "item_code": cstr(row.get("item_code")),
                "item_name": cstr(row.get("item_name") or row.get("item_code")),
                "stock_uom": cstr(row.get("stock_uom")),
                "sold_qty": sold_qty,
                "sales_amount": sales_amount,
                "discount_amount": discount_amount,
                "estimated_cost": estimated_cost,
                "estimated_margin": estimated_margin,
                "estimated_margin_pct": margin_pct,
                "total_lines": total_lines,
                "discounted_lines": discounted_lines,
                "discount_frequency_pct": discount_frequency_pct,
            }
        )

    items.sort(
        key=lambda row: (flt(row.get("sales_amount")), flt(row.get("sold_qty"))),
        reverse=True,
    )
    report["items"] = items[: _coerce_limit(limit, default=20, minimum=1, maximum=100)]

    if items:
        best_seller = max(
            items,
            key=lambda row: (flt(row.get("sold_qty")), flt(row.get("sales_amount"))),
        )
        top_margin_item = max(items, key=lambda row: flt(row.get("estimated_margin")))
        top_discount_item = max(items, key=lambda row: abs(flt(row.get("discount_amount"))))
        report["highlights"] = {
            "best_seller": {
                "item_code": best_seller.get("item_code"),
                "item_name": best_seller.get("item_name"),
                "sold_qty": flt(best_seller.get("sold_qty")),
                "sales_amount": flt(best_seller.get("sales_amount")),
            },
            "top_margin_item": {
                "item_code": top_margin_item.get("item_code"),
                "item_name": top_margin_item.get("item_name"),
                "estimated_margin": flt(top_margin_item.get("estimated_margin")),
                "estimated_margin_pct": top_margin_item.get("estimated_margin_pct"),
            },
            "top_discount_item": {
                "item_code": top_discount_item.get("item_code"),
                "item_name": top_discount_item.get("item_name"),
                "discount_amount": flt(top_discount_item.get("discount_amount")),
                "discount_frequency_pct": flt(top_discount_item.get("discount_frequency_pct")),
            },
        }

    return report


def _collect_category_brand_variant_report(
    profile_names: list[str],
    company: str,
    date_from: str,
    date_to: str,
    limit: int = 12,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "period": {"from": date_from, "to": date_to},
        "category_wise": [],
        "brand_wise": [],
        "variant_wise": [],
        "attribute_wise": [],
        "highlights": {
            "top_category": None,
            "top_brand": None,
            "top_variant": None,
        },
    }

    grouped_items = _collect_item_totals(
        profile_names=profile_names,
        company=company,
        date_from=date_from,
        date_to=date_to,
    )
    if not grouped_items:
        return report

    item_codes = sorted(grouped_items.keys())
    if not item_codes:
        return report

    item_fields = ["name", "item_name", "item_group"]
    has_brand_field = frappe.db.has_column("Item", "brand")
    has_variant_of_field = frappe.db.has_column("Item", "variant_of")
    if has_brand_field:
        item_fields.append("brand")
    if has_variant_of_field:
        item_fields.append("variant_of")

    item_rows = frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=item_fields,
    )
    item_meta: dict[str, dict[str, Any]] = {
        cstr(row.get("name")).strip(): row for row in item_rows if cstr(row.get("name")).strip()
    }

    category_buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"label": "", "sold_qty": 0.0, "sales_amount": 0.0, "discount_amount": 0.0, "item_codes": set()}
    )
    brand_buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"label": "", "sold_qty": 0.0, "sales_amount": 0.0, "discount_amount": 0.0, "item_codes": set()}
    )
    variant_buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "variant_of": "",
            "label": "",
            "sold_qty": 0.0,
            "sales_amount": 0.0,
            "discount_amount": 0.0,
            "variant_item_codes": set(),
        }
    )
    attribute_buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "attribute": "",
            "attribute_value": "",
            "label": "",
            "sold_qty": 0.0,
            "sales_amount": 0.0,
            "discount_amount": 0.0,
            "item_codes": set(),
        }
    )

    for item_code, totals in grouped_items.items():
        meta = item_meta.get(item_code, {})
        category_label = cstr(meta.get("item_group")).strip() or _("Uncategorized")
        brand_label = cstr(meta.get("brand")).strip() if has_brand_field else ""
        brand_label = brand_label or _("Unbranded")
        variant_parent = cstr(meta.get("variant_of")).strip() if has_variant_of_field else ""

        sold_qty = flt(totals.get("sold_qty"))
        sales_amount = flt(totals.get("sales_amount"))
        discount_amount = flt(totals.get("discount_amount"))
        if abs(sold_qty) < 0.00001 and abs(sales_amount) < 0.00001:
            continue

        category_row = category_buckets[category_label]
        category_row["label"] = category_label
        category_row["sold_qty"] += sold_qty
        category_row["sales_amount"] += sales_amount
        category_row["discount_amount"] += discount_amount
        category_row["item_codes"].add(item_code)

        brand_row = brand_buckets[brand_label]
        brand_row["label"] = brand_label
        brand_row["sold_qty"] += sold_qty
        brand_row["sales_amount"] += sales_amount
        brand_row["discount_amount"] += discount_amount
        brand_row["item_codes"].add(item_code)

        if variant_parent:
            variant_row = variant_buckets[variant_parent]
            variant_row["variant_of"] = variant_parent
            variant_row["label"] = variant_parent
            variant_row["sold_qty"] += sold_qty
            variant_row["sales_amount"] += sales_amount
            variant_row["discount_amount"] += discount_amount
            variant_row["variant_item_codes"].add(item_code)

    if frappe.db.exists("DocType", "Item Variant Attribute"):
        parent_filter, parent_params = _build_in_filter("attr.parent", item_codes)
        if parent_filter:
            attribute_rows = frappe.db.sql(
                f"""
                select
                    attr.parent as item_code,
                    attr.attribute as attribute,
                    attr.attribute_value as attribute_value
                from `tabItem Variant Attribute` attr
                where 1=1
                  {parent_filter}
                """,
                tuple(parent_params),
                as_dict=True,
            )

            for row in attribute_rows:
                item_code = cstr(row.get("item_code")).strip()
                if not item_code or item_code not in grouped_items:
                    continue
                attribute = cstr(row.get("attribute")).strip()
                attribute_value = cstr(row.get("attribute_value")).strip()
                if not attribute or not attribute_value:
                    continue

                key = f"{attribute}:{attribute_value}"
                bucket = attribute_buckets[key]
                bucket["attribute"] = attribute
                bucket["attribute_value"] = attribute_value
                bucket["label"] = f"{attribute}: {attribute_value}"

                if item_code in bucket["item_codes"]:
                    continue
                bucket["item_codes"].add(item_code)

                item_totals = grouped_items[item_code]
                bucket["sold_qty"] += flt(item_totals.get("sold_qty"))
                bucket["sales_amount"] += flt(item_totals.get("sales_amount"))
                bucket["discount_amount"] += flt(item_totals.get("discount_amount"))

    category_rows = sorted(
        [
            {
                "category": key,
                "label": row.get("label"),
                "sold_qty": flt(row.get("sold_qty")),
                "sales_amount": flt(row.get("sales_amount")),
                "discount_amount": flt(row.get("discount_amount")),
                "item_count": len(row.get("item_codes", set())),
            }
            for key, row in category_buckets.items()
        ],
        key=lambda row: (flt(row.get("sales_amount")), flt(row.get("sold_qty"))),
        reverse=True,
    )
    brand_rows = sorted(
        [
            {
                "brand": key,
                "label": row.get("label"),
                "sold_qty": flt(row.get("sold_qty")),
                "sales_amount": flt(row.get("sales_amount")),
                "discount_amount": flt(row.get("discount_amount")),
                "item_count": len(row.get("item_codes", set())),
            }
            for key, row in brand_buckets.items()
        ],
        key=lambda row: (flt(row.get("sales_amount")), flt(row.get("sold_qty"))),
        reverse=True,
    )
    variant_rows = sorted(
        [
            {
                "variant_of": key,
                "label": row.get("label"),
                "sold_qty": flt(row.get("sold_qty")),
                "sales_amount": flt(row.get("sales_amount")),
                "discount_amount": flt(row.get("discount_amount")),
                "variant_item_count": len(row.get("variant_item_codes", set())),
            }
            for key, row in variant_buckets.items()
        ],
        key=lambda row: (flt(row.get("sales_amount")), flt(row.get("sold_qty"))),
        reverse=True,
    )
    attribute_rows = sorted(
        [
            {
                "attribute": row.get("attribute"),
                "attribute_value": row.get("attribute_value"),
                "label": row.get("label"),
                "sold_qty": flt(row.get("sold_qty")),
                "sales_amount": flt(row.get("sales_amount")),
                "discount_amount": flt(row.get("discount_amount")),
                "item_count": len(row.get("item_codes", set())),
            }
            for row in attribute_buckets.values()
        ],
        key=lambda row: (flt(row.get("sales_amount")), flt(row.get("sold_qty"))),
        reverse=True,
    )

    page_limit = _coerce_limit(limit, default=12, minimum=1, maximum=100)
    report["category_wise"] = category_rows[:page_limit]
    report["brand_wise"] = brand_rows[:page_limit]
    report["variant_wise"] = variant_rows[:page_limit]
    report["attribute_wise"] = attribute_rows[:page_limit]
    report["highlights"] = {
        "top_category": category_rows[0] if category_rows else None,
        "top_brand": brand_rows[0] if brand_rows else None,
        "top_variant": variant_rows[0] if variant_rows else None,
    }
    return report


def _collect_fast_moving_items(
    profile_names: list[str],
    company: str,
    date_from: str,
    date_to: str,
    limit: int,
    offset: int = 0,
    search_text: str = "",
) -> tuple[list[dict[str, Any]], int]:
    if not profile_names:
        return [], 0

    grouped_items: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "item_code": "",
            "item_name": "",
            "stock_uom": "",
            "sold_qty": 0.0,
            "sales_amount": 0.0,
        }
    )
    profile_filter, profile_filter_params = _build_in_filter("inv.pos_profile", profile_names)

    for parent_doctype, child_doctype in _iter_invoice_sources():
        qty_field = _pick_first_column(child_doctype, ["stock_qty", "qty"])
        amount_field = _pick_first_column(child_doctype, ["base_net_amount", "net_amount", "amount"])
        name_field = _pick_first_column(child_doctype, ["item_name"])
        uom_field = _pick_first_column(child_doctype, ["stock_uom", "uom"])

        if not qty_field:
            continue

        amount_expression = f"coalesce(item.{amount_field}, 0)" if amount_field else "0"
        item_name_expression = (
            f"coalesce(item.{name_field}, item.item_code)" if name_field else "item.item_code"
        )
        stock_uom_expression = f"coalesce(item.{uom_field}, '')" if uom_field else "''"

        rows = frappe.db.sql(
            f"""
            select
                item.item_code as item_code,
                max({item_name_expression}) as item_name,
                max({stock_uom_expression}) as stock_uom,
                sum(coalesce(item.{qty_field}, 0)) as sold_qty,
                sum({amount_expression}) as sales_amount
            from `tab{child_doctype}` item
            inner join `tab{parent_doctype}` inv on inv.name = item.parent
            where inv.docstatus = 1
              and inv.company = %s
              and inv.posting_date between %s and %s
              {profile_filter}
              {_extra_parent_filter(parent_doctype, "inv")}
            group by item.item_code
            """,
            (company, date_from, date_to, *profile_filter_params),
            as_dict=True,
        )

        for row in rows:
            item_code = cstr(row.get("item_code")).strip()
            if not item_code:
                continue

            current = grouped_items[item_code]
            current["item_code"] = item_code
            current["item_name"] = cstr(row.get("item_name") or item_code)
            current["stock_uom"] = cstr(row.get("stock_uom") or current["stock_uom"])
            current["sold_qty"] = flt(current["sold_qty"]) + flt(row.get("sold_qty"))
            current["sales_amount"] = flt(current["sales_amount"]) + flt(row.get("sales_amount"))

    filtered_items = [row for row in grouped_items.values() if flt(row.get("sold_qty")) > 0]

    query = cstr(search_text).strip().casefold()
    if query:
        filtered_items = [
            row
            for row in filtered_items
            if query in cstr(row.get("item_code")).casefold()
            or query in cstr(row.get("item_name")).casefold()
            or query in cstr(row.get("stock_uom")).casefold()
        ]

    filtered_items.sort(
        key=lambda item: (flt(item.get("sold_qty")), flt(item.get("sales_amount"))),
        reverse=True,
    )

    total_count = len(filtered_items)
    page_offset = max(0, cint(offset))
    page_limit = _coerce_limit(limit, default=10, minimum=1, maximum=100)
    return filtered_items[page_offset : page_offset + page_limit], total_count


def _collect_low_stock_items(warehouses: list[str], threshold: int, limit: int) -> list[dict[str, Any]]:
    if not warehouses:
        return []
    if not frappe.db.exists("DocType", "Bin"):
        return []

    if not frappe.db.has_column("Bin", "actual_qty"):
        return []

    warehouse_filter, warehouse_params = _build_in_filter("bin.warehouse", warehouses)
    if not warehouse_filter:
        return []

    return frappe.db.sql(
        f"""
        select
            bin.item_code as item_code,
            item.item_name as item_name,
            item.stock_uom as stock_uom,
            bin.actual_qty as actual_qty,
            bin.warehouse as warehouse
        from `tabBin` bin
        inner join `tabItem` item on item.name = bin.item_code
        where ifnull(item.disabled, 0) = 0
          and ifnull(item.is_stock_item, 0) = 1
          {warehouse_filter}
          and ifnull(bin.actual_qty, 0) <= %s
        order by bin.actual_qty asc, bin.item_code asc
        limit %s
        """,
        (*warehouse_params, threshold, limit),
        as_dict=True,
    )


def _collect_inventory_status_report(
    profile_names: list[str],
    company: str,
    warehouses: list[str],
    threshold: int,
    date_from: str,
    date_to: str,
    limit: int = 20,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "period": {"from": date_from, "to": date_to},
        "threshold": threshold,
        "summary": {
            "total_items": 0,
            "total_stock_qty": 0.0,
            "low_stock_count": 0,
            "out_of_stock_count": 0,
            "negative_stock_count": 0,
            "slow_moving_count": 0,
            "dead_stock_count": 0,
        },
        "low_stock_items": [],
        "out_of_stock_items": [],
        "negative_stock_items": [],
        "slow_moving_items": [],
        "dead_stock_items": [],
    }

    if not warehouses or not frappe.db.exists("DocType", "Bin"):
        return report
    if not frappe.db.has_column("Bin", "actual_qty"):
        return report

    warehouse_filter, warehouse_params = _build_in_filter("bin.warehouse", warehouses)
    if not warehouse_filter:
        return report

    stock_rows = frappe.db.sql(
        f"""
        select
            bin.item_code as item_code,
            max(item.item_name) as item_name,
            max(item.stock_uom) as stock_uom,
            sum(coalesce(bin.actual_qty, 0)) as actual_qty
        from `tabBin` bin
        inner join `tabItem` item on item.name = bin.item_code
        where ifnull(item.disabled, 0) = 0
          and ifnull(item.is_stock_item, 0) = 1
          {warehouse_filter}
        group by bin.item_code
        """,
        tuple(warehouse_params),
        as_dict=True,
    )

    if not stock_rows:
        return report

    sales_by_item = _collect_item_totals(
        profile_names=profile_names,
        company=company,
        date_from=date_from,
        date_to=date_to,
    )
    period_days = max(1, (getdate(date_to) - getdate(date_from)).days + 1)
    page_limit = _coerce_limit(limit, default=20, minimum=1, maximum=100)

    low_stock_items: list[dict[str, Any]] = []
    out_of_stock_items: list[dict[str, Any]] = []
    negative_stock_items: list[dict[str, Any]] = []
    slow_moving_items: list[dict[str, Any]] = []
    dead_stock_items: list[dict[str, Any]] = []

    total_stock_qty = 0.0
    for row in stock_rows:
        item_code = cstr(row.get("item_code")).strip()
        if not item_code:
            continue
        item_name = cstr(row.get("item_name") or item_code)
        stock_uom = cstr(row.get("stock_uom"))
        actual_qty = flt(row.get("actual_qty"))
        total_stock_qty += actual_qty

        sales_row = sales_by_item.get(item_code, {})
        sold_qty = flt(sales_row.get("sold_qty"))
        sales_amount = flt(sales_row.get("sales_amount"))
        avg_daily_sales = flt(sold_qty / period_days) if period_days > 0 else 0.0
        stock_cover_days = flt(actual_qty / avg_daily_sales) if avg_daily_sales > 0 and actual_qty > 0 else None

        base_entry = {
            "item_code": item_code,
            "item_name": item_name,
            "stock_uom": stock_uom,
            "actual_qty": actual_qty,
            "sold_qty": sold_qty,
            "sales_amount": sales_amount,
            "stock_cover_days": stock_cover_days,
        }

        if actual_qty < 0:
            negative_stock_items.append(base_entry)
        elif abs(actual_qty) <= 0.00001:
            out_of_stock_items.append(base_entry)
        elif actual_qty <= threshold:
            low_stock_items.append(base_entry)

        if actual_qty > 0:
            if abs(sold_qty) <= 0.00001:
                dead_stock_items.append(base_entry)
            elif stock_cover_days is not None and stock_cover_days >= 45:
                slow_moving_items.append(base_entry)

    low_stock_items.sort(key=lambda row: (flt(row.get("actual_qty")), cstr(row.get("item_code"))))
    out_of_stock_items.sort(key=lambda row: cstr(row.get("item_code")))
    negative_stock_items.sort(key=lambda row: (flt(row.get("actual_qty")), cstr(row.get("item_code"))))
    slow_moving_items.sort(
        key=lambda row: (
            flt(row.get("stock_cover_days") or 0),
            flt(row.get("actual_qty")),
        ),
        reverse=True,
    )
    dead_stock_items.sort(
        key=lambda row: (flt(row.get("actual_qty")), cstr(row.get("item_code"))),
        reverse=True,
    )

    report["summary"] = {
        "total_items": len(stock_rows),
        "total_stock_qty": flt(total_stock_qty),
        "low_stock_count": len(low_stock_items),
        "out_of_stock_count": len(out_of_stock_items),
        "negative_stock_count": len(negative_stock_items),
        "slow_moving_count": len(slow_moving_items),
        "dead_stock_count": len(dead_stock_items),
    }
    report["low_stock_items"] = low_stock_items[:page_limit]
    report["out_of_stock_items"] = out_of_stock_items[:page_limit]
    report["negative_stock_items"] = negative_stock_items[:page_limit]
    report["slow_moving_items"] = slow_moving_items[:page_limit]
    report["dead_stock_items"] = dead_stock_items[:page_limit]
    return report


def _classify_stock_movement(
    voucher_type: str,
    qty: float,
    stock_entry_purpose: str = "",
) -> tuple[str, str]:
    normalized_type = cstr(voucher_type).strip().lower()
    normalized_purpose = cstr(stock_entry_purpose).strip().lower()
    direction = "in" if qty >= 0 else "out"

    if normalized_type in {"sales invoice", "pos invoice", "delivery note"}:
        if qty < 0:
            return "sale", "out"
        return "return", "in"

    if normalized_type in {"sales return", "purchase return"}:
        return "return", direction

    if normalized_type == "stock reconciliation":
        return "adjustment", direction

    if normalized_type == "stock entry":
        if "transfer" in normalized_purpose:
            return "transfer", direction
        if any(
            token in normalized_purpose
            for token in ("issue", "receipt", "manufacture", "repack", "scrap", "material")
        ):
            return "adjustment", direction
        return "adjustment", direction

    if normalized_type in {"purchase receipt", "purchase invoice"}:
        return "other", direction

    return "other", direction


def _collect_stock_movement_report(
    company: str,
    warehouses: list[str],
    date_from: str,
    date_to: str,
    limit: int = 50,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "period": {"from": date_from, "to": date_to},
        "summary": {
            "movement_count": 0,
            "sale_out_qty": 0.0,
            "return_in_qty": 0.0,
            "adjustment_in_qty": 0.0,
            "adjustment_out_qty": 0.0,
            "transfer_in_qty": 0.0,
            "transfer_out_qty": 0.0,
            "other_in_qty": 0.0,
            "other_out_qty": 0.0,
            "net_qty": 0.0,
            "net_value": 0.0,
        },
        "day_wise": [],
        "recent_movements": [],
    }

    if not warehouses:
        return report
    if not frappe.db.exists("DocType", "Stock Ledger Entry"):
        return report
    if not frappe.db.has_column("Stock Ledger Entry", "actual_qty"):
        return report
    if not frappe.db.has_column("Stock Ledger Entry", "posting_date"):
        return report
    if not frappe.db.has_column("Stock Ledger Entry", "company"):
        return report
    if not frappe.db.has_column("Stock Ledger Entry", "warehouse"):
        return report

    warehouse_filter, warehouse_params = _build_in_filter("sle.warehouse", warehouses)
    if not warehouse_filter:
        return report

    value_column = (
        "stock_value_difference"
        if frappe.db.has_column("Stock Ledger Entry", "stock_value_difference")
        else None
    )
    value_expression = f"coalesce(sle.{value_column}, 0)" if value_column else "0"

    sle_rows = frappe.db.sql(
        f"""
        select
            sle.posting_date as posting_date,
            sle.voucher_type as voucher_type,
            sle.voucher_no as voucher_no,
            sle.item_code as item_code,
            sle.warehouse as warehouse,
            sle.actual_qty as actual_qty,
            {value_expression} as value_change
        from `tabStock Ledger Entry` sle
        where sle.company = %s
          and sle.posting_date between %s and %s
          {warehouse_filter}
          {_extra_sle_filter("sle")}
        order by sle.posting_date desc, sle.modified desc
        """,
        (company, date_from, date_to, *warehouse_params),
        as_dict=True,
    )

    if not sle_rows:
        return report

    stock_entry_names = sorted(
        {
            cstr(row.get("voucher_no")).strip()
            for row in sle_rows
            if cstr(row.get("voucher_type")).strip() == "Stock Entry"
            and cstr(row.get("voucher_no")).strip()
        }
    )
    stock_entry_purpose_map: dict[str, str] = {}
    if stock_entry_names and frappe.db.exists("DocType", "Stock Entry"):
        fields = ["name"]
        if frappe.db.has_column("Stock Entry", "purpose"):
            fields.append("purpose")
        stock_entry_rows = frappe.get_all(
            "Stock Entry",
            filters={"name": ["in", stock_entry_names]},
            fields=fields,
        )
        stock_entry_purpose_map = {
            cstr(row.get("name")).strip(): cstr(row.get("purpose")).strip()
            for row in stock_entry_rows
            if cstr(row.get("name")).strip()
        }

    item_codes = sorted(
        {
            cstr(row.get("item_code")).strip()
            for row in sle_rows
            if cstr(row.get("item_code")).strip()
        }
    )
    item_name_map: dict[str, str] = {}
    if item_codes and frappe.db.exists("DocType", "Item"):
        item_rows = frappe.get_all(
            "Item",
            filters={"name": ["in", item_codes]},
            fields=["name", "item_name"],
        )
        item_name_map = {
            cstr(row.get("name")).strip(): cstr(row.get("item_name")).strip()
            for row in item_rows
            if cstr(row.get("name")).strip()
        }

    day_buckets: dict[str, dict[str, Any]] = {}
    recent_movements: list[dict[str, Any]] = []
    summary = report["summary"]
    page_limit = _coerce_limit(limit, default=50, minimum=1, maximum=200)

    for row in sle_rows:
        posting_date = cstr(row.get("posting_date")).strip()
        if not posting_date:
            continue
        qty = flt(row.get("actual_qty"))
        value_change = flt(row.get("value_change"))
        voucher_type = cstr(row.get("voucher_type")).strip()
        voucher_no = cstr(row.get("voucher_no")).strip()
        item_code = cstr(row.get("item_code")).strip()
        warehouse = cstr(row.get("warehouse")).strip()

        stock_entry_purpose = stock_entry_purpose_map.get(voucher_no, "")
        category, direction = _classify_stock_movement(voucher_type, qty, stock_entry_purpose)

        day_entry = day_buckets.setdefault(
            posting_date,
            {
                "date": posting_date,
                "movement_count": 0,
                "sale_out_qty": 0.0,
                "return_in_qty": 0.0,
                "adjustment_in_qty": 0.0,
                "adjustment_out_qty": 0.0,
                "transfer_in_qty": 0.0,
                "transfer_out_qty": 0.0,
                "other_in_qty": 0.0,
                "other_out_qty": 0.0,
                "net_qty": 0.0,
                "net_value": 0.0,
            },
        )

        day_entry["movement_count"] += 1
        day_entry["net_qty"] += qty
        day_entry["net_value"] += value_change
        summary["movement_count"] += 1
        summary["net_qty"] += qty
        summary["net_value"] += value_change

        qty_abs = abs(qty)
        if category == "sale" and direction == "out":
            day_entry["sale_out_qty"] += qty_abs
            summary["sale_out_qty"] += qty_abs
        elif category == "return" and direction == "in":
            day_entry["return_in_qty"] += qty_abs
            summary["return_in_qty"] += qty_abs
        elif category == "adjustment":
            if direction == "in":
                day_entry["adjustment_in_qty"] += qty_abs
                summary["adjustment_in_qty"] += qty_abs
            else:
                day_entry["adjustment_out_qty"] += qty_abs
                summary["adjustment_out_qty"] += qty_abs
        elif category == "transfer":
            if direction == "in":
                day_entry["transfer_in_qty"] += qty_abs
                summary["transfer_in_qty"] += qty_abs
            else:
                day_entry["transfer_out_qty"] += qty_abs
                summary["transfer_out_qty"] += qty_abs
        else:
            if direction == "in":
                day_entry["other_in_qty"] += qty_abs
                summary["other_in_qty"] += qty_abs
            else:
                day_entry["other_out_qty"] += qty_abs
                summary["other_out_qty"] += qty_abs

        if len(recent_movements) < page_limit:
            recent_movements.append(
                {
                    "posting_date": posting_date,
                    "voucher_type": voucher_type,
                    "voucher_no": voucher_no,
                    "item_code": item_code,
                    "item_name": item_name_map.get(item_code, "") or item_code,
                    "warehouse": warehouse,
                    "stock_entry_purpose": stock_entry_purpose,
                    "category": category,
                    "direction": direction,
                    "qty": qty,
                    "value_change": value_change,
                }
            )

    report["day_wise"] = sorted(day_buckets.values(), key=lambda row: cstr(row.get("date")))
    report["recent_movements"] = recent_movements
    report["summary"] = {key: flt(value) if isinstance(value, float) else value for key, value in summary.items()}
    report["summary"]["movement_count"] = cint(summary.get("movement_count"))
    return report


def _collect_reorder_purchase_suggestions(
    profile_names: list[str],
    company: str,
    warehouses: list[str],
    threshold: int,
    date_from: str,
    date_to: str,
    limit: int = 25,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "period": {"from": date_from, "to": date_to},
        "summary": {
            "candidate_items": 0,
            "suggestion_count": 0,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
            "total_suggested_qty": 0.0,
            "estimated_purchase_value": 0.0,
        },
        "suggestions": [],
    }

    if not warehouses:
        return report
    if not frappe.db.exists("DocType", "Bin"):
        return report
    if not frappe.db.has_column("Bin", "actual_qty"):
        return report

    warehouse_filter, warehouse_params = _build_in_filter("bin.warehouse", warehouses)
    if not warehouse_filter:
        return report

    valuation_expression = (
        "max(coalesce(item.valuation_rate, 0))"
        if frappe.db.has_column("Item", "valuation_rate")
        else "0"
    )
    stock_rows = frappe.db.sql(
        f"""
        select
            bin.item_code as item_code,
            max(item.item_name) as item_name,
            max(item.stock_uom) as stock_uom,
            sum(coalesce(bin.actual_qty, 0)) as actual_qty,
            {valuation_expression} as estimated_unit_cost
        from `tabBin` bin
        inner join `tabItem` item on item.name = bin.item_code
        where ifnull(item.disabled, 0) = 0
          and ifnull(item.is_stock_item, 0) = 1
          {warehouse_filter}
        group by bin.item_code
        """,
        tuple(warehouse_params),
        as_dict=True,
    )
    if not stock_rows:
        return report

    period_days = max(1, (getdate(date_to) - getdate(date_from)).days + 1)
    item_codes = sorted(
        {
            cstr(row.get("item_code")).strip()
            for row in stock_rows
            if cstr(row.get("item_code")).strip()
        }
    )
    if not item_codes:
        return report

    sales_by_item = _collect_item_totals(
        profile_names=profile_names,
        company=company,
        date_from=date_from,
        date_to=date_to,
    )

    item_fields = ["name", "item_name", "stock_uom"]
    if frappe.db.has_column("Item", "lead_time_days"):
        item_fields.append("lead_time_days")
    if frappe.db.has_column("Item", "default_supplier"):
        item_fields.append("default_supplier")
    elif frappe.db.has_column("Item", "supplier"):
        item_fields.append("supplier")
    item_rows = frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=item_fields,
    )
    item_map = {
        cstr(row.get("name")).strip(): row for row in item_rows if cstr(row.get("name")).strip()
    }

    reorder_map: dict[str, dict[str, float]] = {}
    if frappe.db.exists("DocType", "Item Reorder"):
        reorder_fields = ["parent"]
        has_reorder_level = frappe.db.has_column("Item Reorder", "warehouse_reorder_level")
        has_reorder_qty = frappe.db.has_column("Item Reorder", "warehouse_reorder_qty")
        has_reorder_warehouse = frappe.db.has_column("Item Reorder", "warehouse")
        if has_reorder_level:
            reorder_fields.append("warehouse_reorder_level")
        if has_reorder_qty:
            reorder_fields.append("warehouse_reorder_qty")
        if has_reorder_warehouse:
            reorder_fields.append("warehouse")

        reorder_rows = frappe.get_all(
            "Item Reorder",
            filters={"parent": ["in", item_codes]},
            fields=reorder_fields,
        )
        for row in reorder_rows:
            parent = cstr(row.get("parent")).strip()
            if not parent:
                continue
            row_warehouse = cstr(row.get("warehouse")).strip() if has_reorder_warehouse else ""
            if row_warehouse and row_warehouse not in warehouses:
                continue
            entry = reorder_map.setdefault(parent, {"reorder_level": 0.0, "reorder_qty": 0.0})
            if has_reorder_level:
                entry["reorder_level"] = max(
                    flt(entry.get("reorder_level")),
                    flt(row.get("warehouse_reorder_level")),
                )
            if has_reorder_qty:
                entry["reorder_qty"] = max(
                    flt(entry.get("reorder_qty")),
                    flt(row.get("warehouse_reorder_qty")),
                )

    supplier_map: dict[str, str] = {}
    if frappe.db.exists("DocType", "Item Supplier"):
        supplier_fields = ["parent"]
        if frappe.db.has_column("Item Supplier", "supplier"):
            supplier_fields.append("supplier")
        supplier_rows = frappe.get_all(
            "Item Supplier",
            filters={"parent": ["in", item_codes]},
            fields=supplier_fields,
            order_by="supplier asc",
        )
        for row in supplier_rows:
            parent = cstr(row.get("parent")).strip()
            supplier = cstr(row.get("supplier")).strip()
            if parent and supplier and parent not in supplier_map:
                supplier_map[parent] = supplier

    urgency_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    suggestions: list[dict[str, Any]] = []
    for stock_row in stock_rows:
        item_code = cstr(stock_row.get("item_code")).strip()
        if not item_code:
            continue

        item_meta = item_map.get(item_code, {})
        reorder_meta = reorder_map.get(item_code, {})
        sales_meta = sales_by_item.get(item_code, {})

        current_qty = flt(stock_row.get("actual_qty"))
        sold_qty = max(0.0, flt(sales_meta.get("sold_qty")))
        avg_daily_sales = flt(sold_qty / period_days) if period_days > 0 else 0.0

        lead_time_days = flt(item_meta.get("lead_time_days"))
        if lead_time_days <= 0:
            lead_time_days = 7.0

        reorder_level_config = flt(reorder_meta.get("reorder_level"))
        reorder_qty_config = flt(reorder_meta.get("reorder_qty"))
        demand_during_lead = flt(avg_daily_sales * lead_time_days)
        reorder_level = max(flt(threshold), reorder_level_config, demand_during_lead)

        safety_days = 7.0
        target_stock = reorder_qty_config or flt(avg_daily_sales * (lead_time_days + safety_days))
        target_stock = max(target_stock, reorder_level)

        if current_qty > reorder_level:
            continue

        suggested_qty = max(0.0, flt(target_stock - current_qty))
        if suggested_qty <= 0:
            continue

        if current_qty <= 0:
            urgency = "critical"
        else:
            stock_cover_days = (
                flt(current_qty / avg_daily_sales) if avg_daily_sales > 0 else None
            )
            if stock_cover_days is not None and stock_cover_days < lead_time_days:
                urgency = "high"
            elif current_qty <= threshold:
                urgency = "medium"
            else:
                urgency = "low"

        stock_cover_days = flt(current_qty / avg_daily_sales) if avg_daily_sales > 0 else None
        unit_cost = flt(stock_row.get("estimated_unit_cost"))
        supplier = (
            cstr(item_meta.get("default_supplier")).strip()
            or cstr(item_meta.get("supplier")).strip()
            or supplier_map.get(item_code, "")
        )

        suggestions.append(
            {
                "item_code": item_code,
                "item_name": cstr(item_meta.get("item_name") or stock_row.get("item_name") or item_code),
                "stock_uom": cstr(item_meta.get("stock_uom") or stock_row.get("stock_uom") or ""),
                "current_qty": current_qty,
                "sold_qty": sold_qty,
                "avg_daily_sales": avg_daily_sales,
                "lead_time_days": lead_time_days,
                "reorder_level": reorder_level,
                "target_stock": target_stock,
                "suggested_qty": suggested_qty,
                "stock_cover_days": stock_cover_days,
                "urgency": urgency,
                "supplier": supplier,
                "estimated_unit_cost": unit_cost,
                "estimated_purchase_value": flt(suggested_qty * unit_cost),
            }
        )

    suggestions.sort(
        key=lambda row: (
            urgency_rank.get(cstr(row.get("urgency")).strip(), 99),
            flt(row.get("stock_cover_days")) if row.get("stock_cover_days") is not None else 999999,
            -flt(row.get("suggested_qty")),
        )
    )

    page_limit = _coerce_limit(limit, default=25, minimum=1, maximum=200)
    limited = suggestions[:page_limit]
    summary = report["summary"]
    summary["candidate_items"] = len(stock_rows)
    summary["suggestion_count"] = len(suggestions)
    summary["critical_count"] = sum(1 for row in suggestions if row.get("urgency") == "critical")
    summary["high_count"] = sum(1 for row in suggestions if row.get("urgency") == "high")
    summary["medium_count"] = sum(1 for row in suggestions if row.get("urgency") == "medium")
    summary["low_count"] = sum(1 for row in suggestions if row.get("urgency") == "low")
    summary["total_suggested_qty"] = flt(sum(flt(row.get("suggested_qty")) for row in suggestions))
    summary["estimated_purchase_value"] = flt(
        sum(flt(row.get("estimated_purchase_value")) for row in suggestions)
    )
    report["suggestions"] = limited
    return report


def _collect_supplier_purchase_summary(
    company: str,
    date_from: str,
    date_to: str,
    limit: int,
) -> list[dict[str, Any]]:
    if not frappe.db.exists("DocType", "Purchase Invoice"):
        return []

    amount_field = _pick_first_column("Purchase Invoice", ["base_grand_total", "grand_total"])
    if not amount_field:
        return []

    supplier_name_field = (
        "supplier_name"
        if frappe.db.has_column("Purchase Invoice", "supplier_name")
        else "supplier"
    )

    return frappe.db.sql(
        f"""
        select
            supplier as supplier,
            max({supplier_name_field}) as supplier_name,
            count(name) as purchase_count,
            sum(coalesce({amount_field}, 0)) as purchase_amount,
            max(posting_date) as last_purchase_date
        from `tabPurchase Invoice`
        where docstatus = 1
          and company = %s
          and posting_date between %s and %s
        group by supplier
        order by purchase_amount desc
        limit %s
        """,
        (company, date_from, date_to, limit),
        as_dict=True,
    )


@frappe.whitelist()
def get_dashboard_data(
    pos_profile=None,
    scope=None,
    profile_filter=None,
    low_stock_threshold=None,
    fast_moving_limit: int = 10,
    fast_moving_page: int = 1,
    fast_moving_page_size=None,
    fast_moving_search=None,
    item_sales_limit: int = 20,
    category_report_limit: int = 12,
    inventory_status_limit: int = 20,
    stock_movement_limit: int = 50,
    reorder_suggestion_limit: int = 25,
    supplier_limit: int = 8,
    low_stock_limit: int = 20,
):
    """Return real-time dashboard data for POS Awesome.

    Scope values:
    - all: aggregates all accessible profiles in the same company.
    - current: only current POS profile.
    - specific: selected profile_filter.
    """

    user = frappe.session.user
    current_profile_doc = _resolve_profile(pos_profile)
    current_profile_name = cstr(current_profile_doc.get("name")).strip()
    _check_profile_permission(current_profile_name)

    global_settings = _get_global_dashboard_settings()
    profile_scope_enabled = True
    if frappe.db.has_column("POS Profile", "posa_allow_company_dashboard_scope"):
        profile_scope_enabled = _to_bool_setting(
            current_profile_doc.get("posa_allow_company_dashboard_scope"), True
        )

    allow_all_profiles = _user_can_view_all_profiles(user) and profile_scope_enabled
    requested_scope = _normalize_scope(scope, global_settings["default_scope"], allow_all_profiles)
    profile_filter = cstr(profile_filter).strip()

    requested_fast_moving_page_size = (
        fast_moving_page_size if fast_moving_page_size is not None else fast_moving_limit
    )
    fast_moving_page_size = _coerce_limit(
        requested_fast_moving_page_size, default=10, minimum=1, maximum=100
    )
    fast_moving_page = _coerce_page(fast_moving_page, default=1)
    fast_moving_offset = (fast_moving_page - 1) * fast_moving_page_size
    fast_moving_search = cstr(fast_moving_search).strip()
    supplier_limit = _coerce_limit(supplier_limit, default=8, minimum=1, maximum=25)
    low_stock_limit = _coerce_limit(low_stock_limit, default=20, minimum=1, maximum=100)
    item_sales_limit = _coerce_limit(item_sales_limit, default=20, minimum=1, maximum=100)
    category_report_limit = _coerce_limit(category_report_limit, default=12, minimum=1, maximum=100)
    inventory_status_limit = _coerce_limit(inventory_status_limit, default=20, minimum=1, maximum=100)
    stock_movement_limit = _coerce_limit(stock_movement_limit, default=50, minimum=1, maximum=200)
    reorder_suggestion_limit = _coerce_limit(reorder_suggestion_limit, default=25, minimum=1, maximum=200)

    company = cstr(current_profile_doc.get("company")).strip()
    company_profiles = _get_company_profiles(company)
    profiles_by_name = {profile.get("name"): profile for profile in company_profiles if profile.get("name")}

    assigned_profile_names = _get_assigned_profiles(user, company_profiles)
    if current_profile_name not in assigned_profile_names and not allow_all_profiles:
        assigned_profile_names.append(current_profile_name)

    available_profile_names = (
        sorted(profiles_by_name.keys()) if allow_all_profiles else sorted(set(assigned_profile_names))
    )
    available_profiles = [
        profiles_by_name[name]
        for name in available_profile_names
        if name in profiles_by_name
    ]

    if requested_scope == SCOPE_SPECIFIC:
        target_profile = profile_filter or current_profile_name
        if target_profile not in profiles_by_name:
            frappe.throw(_("POS Profile {0} does not belong to company {1}.").format(target_profile, company))
        if not allow_all_profiles and target_profile not in available_profile_names:
            frappe.throw(
                _("You are not permitted to view dashboard data for POS Profile {0}.").format(target_profile),
                frappe.PermissionError,
            )
        selected_profile_names = [target_profile]
    elif requested_scope == SCOPE_CURRENT:
        selected_profile_names = [current_profile_name]
    else:
        selected_profile_names = available_profile_names or [current_profile_name]

    selected_profiles = [
        profiles_by_name.get(name) for name in selected_profile_names if profiles_by_name.get(name)
    ]
    selected_profiles = [profile for profile in selected_profiles if profile]

    if not selected_profiles:
        current_profile_fallback = profiles_by_name.get(current_profile_name) or current_profile_doc
        if current_profile_fallback and _is_dashboard_enabled(current_profile_fallback):
            selected_profiles = [current_profile_fallback]
            selected_profile_names = [current_profile_name]

    selected_profiles_before_override = list(selected_profiles)
    profile_override_enabled = [
        profile for profile in selected_profiles if _is_dashboard_enabled(profile)
    ]
    selected_profiles = profile_override_enabled
    selected_profile_names = [profile.get("name") for profile in selected_profiles]

    # Global dashboard should not be blocked only because profile-level flags are off
    # for all records in the selected scope. Fall back to scope-selected profiles.
    if not selected_profiles and selected_profiles_before_override and global_settings["enabled"]:
        selected_profiles = selected_profiles_before_override
        selected_profile_names = [
            cstr(profile.get("name")).strip()
            for profile in selected_profiles
            if cstr(profile.get("name")).strip()
        ]

    single_profile = selected_profiles[0] if len(selected_profiles) == 1 else None
    profile_threshold = single_profile.get("posa_low_stock_alert_threshold") if single_profile else None
    threshold_fallback = profile_threshold or global_settings["low_stock_threshold"]
    threshold = _coerce_threshold(low_stock_threshold, threshold_fallback)

    warehouses = [
        cstr(profile.get("warehouse")).strip()
        for profile in selected_profiles
        if cstr(profile.get("warehouse")).strip()
    ]
    if not warehouses:
        default_warehouse = get_default_warehouse(company)
        warehouses = [default_warehouse] if default_warehouse else []

    company_currency = cstr(frappe.db.get_value("Company", company, "default_currency")).strip()
    if single_profile:
        currency = cstr(single_profile.get("currency")).strip() or company_currency
    else:
        currency = company_currency or cstr(current_profile_doc.get("currency")).strip()

    today = getdate(nowdate())
    month_start = today.replace(day=1)
    fast_moving_days = max(1, (today - month_start).days + 1)
    global_enabled = bool(global_settings["enabled"])
    # Keep dashboard operational whenever scoped profiles are available.
    # Global toggle is returned for diagnostics but does not hard-block data.
    enabled = bool(selected_profiles)
    disabled_reason = None
    if not selected_profiles:
        disabled_reason = "no_profiles_in_scope"
    profile_label = single_profile.get("name") if single_profile else None
    warehouse_label = warehouses[0] if len(warehouses) == 1 else _("Multiple Warehouses")

    payload = {
        "enabled": enabled,
        "profile": profile_label,
        "scope": requested_scope,
        "default_scope": global_settings["default_scope"],
        "global_enabled": global_enabled,
        "allow_all_profiles": allow_all_profiles,
        "profile_scope_enabled": profile_scope_enabled,
        "disabled_reason": disabled_reason,
        "selected_profiles": selected_profile_names,
        "available_profiles": [
            {
                "name": profile.get("name"),
                "warehouse": profile.get("warehouse"),
                "currency": profile.get("currency"),
                "dashboard_enabled": profile.get("dashboard_enabled"),
            }
            for profile in available_profiles
        ],
        "company": company,
        "warehouse": warehouse_label,
        "currency": currency,
        "generated_at": now_datetime().isoformat(),
        "date_context": {
            "today": str(today),
            "month_start": str(month_start),
        },
        "sales_overview": {
            "today_sales": 0.0,
            "today_profit": 0.0,
            "monthly_sales": 0.0,
            "monthly_profit": 0.0,
            "profit_method": "invoice_item",
        },
        "daily_sales_summary": {
            "period": {"from": str(today), "to": str(today)},
            "invoice_count": 0,
            "returns_count": 0,
            "gross_sales": 0.0,
            "net_sales": 0.0,
            "returns_amount": 0.0,
            "discount_amount": 0.0,
            "tax_amount": 0.0,
            "opening_amount": 0.0,
            "opening_cash": 0.0,
            "closing_amount": 0.0,
            "closing_cash": 0.0,
            "cash_collections": 0.0,
            "card_online_collections": 0.0,
            "other_collections": 0.0,
            "change_given": 0.0,
            "collections_total": 0.0,
            "expected_cash": 0.0,
            "actual_cash": 0.0,
            "cash_variance": 0.0,
            "average_invoice_value": 0.0,
            "has_closing_snapshot": False,
            "payment_methods": [],
        },
        "sales_trend": {
            "period": {
                "day_from": str(month_start),
                "day_to": str(today),
                "week_from": str(today - timedelta(days=55)),
                "month_from": str(getdate(add_months(today, -5)).replace(day=1)),
                "to": str(today),
            },
            "day_wise": [],
            "week_wise": [],
            "month_wise": [],
            "hourly": [],
            "highlights": {
                "best_day": None,
                "best_hour": None,
                "day_growth_pct": None,
                "week_growth_pct": None,
                "month_growth_pct": None,
            },
        },
        "item_sales_report": {
            "period": {"from": str(month_start), "to": str(today)},
            "items": [],
            "highlights": {
                "best_seller": None,
                "top_margin_item": None,
                "top_discount_item": None,
            },
        },
        "category_brand_variant_report": {
            "period": {"from": str(month_start), "to": str(today)},
            "category_wise": [],
            "brand_wise": [],
            "variant_wise": [],
            "attribute_wise": [],
            "highlights": {
                "top_category": None,
                "top_brand": None,
                "top_variant": None,
            },
        },
        "inventory_status_report": {
            "period": {"from": str(month_start), "to": str(today)},
            "threshold": threshold,
            "summary": {
                "total_items": 0,
                "total_stock_qty": 0.0,
                "low_stock_count": 0,
                "out_of_stock_count": 0,
                "negative_stock_count": 0,
                "slow_moving_count": 0,
                "dead_stock_count": 0,
            },
            "low_stock_items": [],
            "out_of_stock_items": [],
            "negative_stock_items": [],
            "slow_moving_items": [],
            "dead_stock_items": [],
        },
        "stock_movement_report": {
            "period": {"from": str(month_start), "to": str(today)},
            "summary": {
                "movement_count": 0,
                "sale_out_qty": 0.0,
                "return_in_qty": 0.0,
                "adjustment_in_qty": 0.0,
                "adjustment_out_qty": 0.0,
                "transfer_in_qty": 0.0,
                "transfer_out_qty": 0.0,
                "other_in_qty": 0.0,
                "other_out_qty": 0.0,
                "net_qty": 0.0,
                "net_value": 0.0,
            },
            "day_wise": [],
            "recent_movements": [],
        },
        "reorder_purchase_suggestions": {
            "period": {"from": str(month_start), "to": str(today)},
            "summary": {
                "candidate_items": 0,
                "suggestion_count": 0,
                "critical_count": 0,
                "high_count": 0,
                "medium_count": 0,
                "low_count": 0,
                "total_suggested_qty": 0.0,
                "estimated_purchase_value": 0.0,
            },
            "suggestions": [],
        },
        "inventory_insights": {
            "fast_moving_items": [],
            "fast_moving_period": {
                "from": str(month_start),
                "to": str(today),
                "days": fast_moving_days,
            },
            "fast_moving_pagination": {
                "page": fast_moving_page,
                "page_size": fast_moving_page_size,
                "total_count": 0,
                "total_pages": 0,
                "search": fast_moving_search,
            },
            "low_stock_items": [],
            "low_stock_threshold": threshold,
        },
        "supplier_overview": {
            "purchase_summary": [],
            "period": {"from": str(month_start), "to": str(today)},
        },
    }

    if not enabled:
        return payload

    for parent_doctype, child_doctype in _iter_invoice_sources():
        today_stats = _collect_sales_and_profit(
            parent_doctype=parent_doctype,
            child_doctype=child_doctype,
            profile_names=selected_profile_names,
            company=company,
            date_from=str(today),
            date_to=str(today),
        )
        monthly_stats = _collect_sales_and_profit(
            parent_doctype=parent_doctype,
            child_doctype=child_doctype,
            profile_names=selected_profile_names,
            company=company,
            date_from=str(month_start),
            date_to=str(today),
        )
        payload["sales_overview"]["today_sales"] += flt(today_stats.get("sales"))
        payload["sales_overview"]["today_profit"] += flt(today_stats.get("profit"))
        payload["sales_overview"]["monthly_sales"] += flt(monthly_stats.get("sales"))
        payload["sales_overview"]["monthly_profit"] += flt(monthly_stats.get("profit"))
        if (
            today_stats.get("profit_method") == "stock_ledger"
            or monthly_stats.get("profit_method") == "stock_ledger"
        ):
            payload["sales_overview"]["profit_method"] = "stock_ledger"

    payload["daily_sales_summary"] = _collect_daily_sales_summary(
        profile_names=selected_profile_names,
        company=company,
        date_value=str(today),
    )
    payload["sales_trend"] = _collect_sales_trend(
        profile_names=selected_profile_names,
        company=company,
        today=today,
        month_start=month_start,
    )
    payload["item_sales_report"] = _collect_item_sales_report(
        profile_names=selected_profile_names,
        company=company,
        date_from=str(month_start),
        date_to=str(today),
        limit=item_sales_limit,
    )
    payload["category_brand_variant_report"] = _collect_category_brand_variant_report(
        profile_names=selected_profile_names,
        company=company,
        date_from=str(month_start),
        date_to=str(today),
        limit=category_report_limit,
    )
    payload["inventory_status_report"] = _collect_inventory_status_report(
        profile_names=selected_profile_names,
        company=company,
        warehouses=warehouses,
        threshold=threshold,
        date_from=str(month_start),
        date_to=str(today),
        limit=inventory_status_limit,
    )
    payload["stock_movement_report"] = _collect_stock_movement_report(
        company=company,
        warehouses=warehouses,
        date_from=str(month_start),
        date_to=str(today),
        limit=stock_movement_limit,
    )
    payload["reorder_purchase_suggestions"] = _collect_reorder_purchase_suggestions(
        profile_names=selected_profile_names,
        company=company,
        warehouses=warehouses,
        threshold=threshold,
        date_from=str(month_start),
        date_to=str(today),
        limit=reorder_suggestion_limit,
    )

    fast_moving_items, fast_moving_total_count = _collect_fast_moving_items(
        profile_names=selected_profile_names,
        company=company,
        date_from=str(month_start),
        date_to=str(today),
        limit=fast_moving_page_size,
        offset=fast_moving_offset,
        search_text=fast_moving_search,
    )
    payload["inventory_insights"]["fast_moving_items"] = fast_moving_items
    payload["inventory_insights"]["fast_moving_pagination"] = {
        "page": fast_moving_page,
        "page_size": fast_moving_page_size,
        "total_count": fast_moving_total_count,
        "total_pages": int(ceil(fast_moving_total_count / fast_moving_page_size))
        if fast_moving_total_count
        else 0,
        "search": fast_moving_search,
    }
    payload["inventory_insights"]["low_stock_items"] = _collect_low_stock_items(
        warehouses=warehouses,
        threshold=threshold,
        limit=low_stock_limit,
    )
    payload["supplier_overview"]["purchase_summary"] = _collect_supplier_purchase_summary(
        company=company,
        date_from=str(month_start),
        date_to=str(today),
        limit=supplier_limit,
    )

    return payload
