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


def _is_dashboard_enabled(profile_doc: dict[str, Any]) -> bool:
    if not frappe.db.has_column("POS Profile", "posa_enable_awesome_dashboard"):
        return True

    value = profile_doc.get("posa_enable_awesome_dashboard")
    if value in (None, ""):
        return True
    return bool(cint(value))


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
    profile_name: str,
    company: str,
    date_from: str,
    date_to: str,
) -> dict[str, float]:
    total_sales = 0.0
    total_sales_for_profit = 0.0
    total_profit = 0.0
    profit_method = "invoice_item"

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
              and inv.pos_profile = %s
              and inv.posting_date between %s and %s
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (company, profile_name, date_from, date_to),
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
              and inv.pos_profile = %s
              and inv.posting_date between %s and %s
              {_extra_sle_filter("sle")}
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (parent_doctype, company, profile_name, date_from, date_to),
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
              and inv.pos_profile = %s
              and inv.posting_date between %s and %s
              {_extra_parent_filter(parent_doctype, "inv")}
            """,
            (company, profile_name, date_from, date_to),
            as_dict=True,
        )
        total_profit = flt((profit_row[0] or {}).get("total_profit"))

    return {
        "sales": total_sales,
        "profit": total_profit,
        "profit_method": profit_method,
    }


def _collect_fast_moving_items(
    profile_name: str,
    company: str,
    date_from: str,
    date_to: str,
    limit: int,
) -> list[dict[str, Any]]:
    grouped_items: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "item_code": "",
            "item_name": "",
            "stock_uom": "",
            "sold_qty": 0.0,
            "sales_amount": 0.0,
        }
    )

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
              and inv.pos_profile = %s
              and inv.posting_date between %s and %s
              {_extra_parent_filter(parent_doctype, "inv")}
            group by item.item_code
            """,
            (company, profile_name, date_from, date_to),
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


def _collect_low_stock_items(warehouse: str | None, threshold: int, limit: int) -> list[dict[str, Any]]:
    if not warehouse:
        return []
    if not frappe.db.exists("DocType", "Bin"):
        return []

    if not frappe.db.has_column("Bin", "actual_qty"):
        return []

    return frappe.db.sql(
        """
        select
            bin.item_code as item_code,
            item.item_name as item_name,
            item.stock_uom as stock_uom,
            bin.actual_qty as actual_qty,
            bin.warehouse as warehouse
        from `tabBin` bin
        inner join `tabItem` item on item.name = bin.item_code
        where bin.warehouse = %s
          and ifnull(item.disabled, 0) = 0
          and ifnull(item.is_stock_item, 0) = 1
          and ifnull(bin.actual_qty, 0) <= %s
        order by bin.actual_qty asc, bin.item_code asc
        limit %s
        """,
        (warehouse, threshold, limit),
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
    low_stock_threshold=None,
    fast_moving_limit: int = 10,
    supplier_limit: int = 8,
    low_stock_limit: int = 20,
):
    """Return real-time dashboard data for the active POS profile."""

    profile_doc = _resolve_profile(pos_profile)
    profile_name = cstr(profile_doc.get("name")).strip()
    _check_profile_permission(profile_name)

    enabled = _is_dashboard_enabled(profile_doc)
    profile_threshold = profile_doc.get("posa_low_stock_alert_threshold")
    threshold = _coerce_threshold(low_stock_threshold, profile_threshold)

    fast_moving_limit = _coerce_limit(fast_moving_limit, default=10, minimum=1, maximum=25)
    supplier_limit = _coerce_limit(supplier_limit, default=8, minimum=1, maximum=25)
    low_stock_limit = _coerce_limit(low_stock_limit, default=20, minimum=1, maximum=100)

    company = cstr(profile_doc.get("company")).strip()
    warehouse = cstr(profile_doc.get("warehouse")).strip() or get_default_warehouse(company)
    currency = cstr(profile_doc.get("currency")).strip()

    today = getdate(nowdate())
    month_start = today.replace(day=1)

    payload = {
        "enabled": enabled,
        "profile": profile_name,
        "company": company,
        "warehouse": warehouse,
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
            profile_name=profile_name,
            company=company,
            date_from=str(today),
            date_to=str(today),
        )
        monthly_stats = _collect_sales_and_profit(
            parent_doctype=parent_doctype,
            child_doctype=child_doctype,
            profile_name=profile_name,
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
        profile_name=profile_name,
        company=company,
        date_from=str(month_start),
        date_to=str(today),
        limit=fast_moving_limit,
    )
    payload["inventory_insights"]["low_stock_items"] = _collect_low_stock_items(
        warehouse=warehouse,
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
