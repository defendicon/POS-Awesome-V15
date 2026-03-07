from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, now_datetime, nowdate

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


def _collect_fast_moving_items(
    profile_names: list[str],
    company: str,
    date_from: str,
    date_to: str,
    limit: int,
) -> list[dict[str, Any]]:
    if not profile_names:
        return []

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
    filtered_items.sort(
        key=lambda item: (flt(item.get("sold_qty")), flt(item.get("sales_amount"))),
        reverse=True,
    )

    return filtered_items[:limit]


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

    fast_moving_limit = _coerce_limit(fast_moving_limit, default=10, minimum=1, maximum=25)
    supplier_limit = _coerce_limit(supplier_limit, default=8, minimum=1, maximum=25)
    low_stock_limit = _coerce_limit(low_stock_limit, default=20, minimum=1, maximum=100)

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
        "inventory_insights": {
            "fast_moving_items": [],
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

    payload["inventory_insights"]["fast_moving_items"] = _collect_fast_moving_items(
        profile_names=selected_profile_names,
        company=company,
        date_from=str(month_start),
        date_to=str(today),
        limit=fast_moving_limit,
    )
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
