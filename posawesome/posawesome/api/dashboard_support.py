from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from typing import Any, Callable


@dataclass(frozen=True)
class DashboardLimits:
    fast_moving_page: int
    fast_moving_page_size: int
    fast_moving_offset: int
    fast_moving_search: str
    supplier_limit: int
    low_stock_limit: int
    item_sales_limit: int
    category_report_limit: int
    inventory_status_limit: int
    stock_movement_limit: int
    reorder_suggestion_limit: int
    payment_report_limit: int
    discount_report_limit: int
    customer_report_limit: int
    staff_report_limit: int
    profitability_report_limit: int
    branch_report_limit: int
    tax_report_limit: int


@dataclass(frozen=True)
class SelectedProfiles:
    available_profiles: list[dict[str, Any]]
    available_profile_names: list[str]
    selected_profiles: list[dict[str, Any]]
    selected_profile_names: list[str]
    selected_profiles_before_override: list[dict[str, Any]]
    disabled_reason: str | None


@dataclass(frozen=True)
class DashboardPayloadContext:
    enabled: bool
    profile_label: str | None
    requested_scope: str
    default_scope: str
    global_enabled: bool
    allow_all_profiles: bool
    profile_scope_enabled: bool
    disabled_reason: str | None
    selected_profile_names: list[str]
    available_profiles: list[dict[str, Any]]
    company: str
    warehouse_label: str
    currency: str
    generated_at: str
    report_to_date: str
    month_start: str
    selected_report_month: str
    threshold: int
    fast_moving_days: int
    fast_moving_page: int
    fast_moving_page_size: int
    fast_moving_search: str
    sales_trend_week_from: str
    sales_trend_month_from: str


def normalize_dashboard_limits(
    *,
    fast_moving_limit: Any,
    fast_moving_page: Any,
    fast_moving_page_size: Any,
    fast_moving_search: Any,
    supplier_limit: Any,
    low_stock_limit: Any,
    item_sales_limit: Any,
    category_report_limit: Any,
    inventory_status_limit: Any,
    stock_movement_limit: Any,
    reorder_suggestion_limit: Any,
    payment_report_limit: Any,
    discount_report_limit: Any,
    customer_report_limit: Any,
    staff_report_limit: Any,
    profitability_report_limit: Any,
    branch_report_limit: Any,
    tax_report_limit: Any,
    coerce_limit: Callable[..., int],
    coerce_page: Callable[..., int],
    coerce_text: Callable[[Any], str],
) -> DashboardLimits:
    requested_fast_moving_page_size = (
        fast_moving_page_size if fast_moving_page_size is not None else fast_moving_limit
    )
    normalized_fast_moving_page_size = coerce_limit(
        requested_fast_moving_page_size, default=10, minimum=1, maximum=100
    )
    normalized_fast_moving_page = coerce_page(fast_moving_page, default=1)

    return DashboardLimits(
        fast_moving_page=normalized_fast_moving_page,
        fast_moving_page_size=normalized_fast_moving_page_size,
        fast_moving_offset=(normalized_fast_moving_page - 1) * normalized_fast_moving_page_size,
        fast_moving_search=coerce_text(fast_moving_search),
        supplier_limit=coerce_limit(supplier_limit, default=8, minimum=1, maximum=25),
        low_stock_limit=coerce_limit(low_stock_limit, default=20, minimum=1, maximum=100),
        item_sales_limit=coerce_limit(item_sales_limit, default=20, minimum=1, maximum=100),
        category_report_limit=coerce_limit(category_report_limit, default=12, minimum=1, maximum=100),
        inventory_status_limit=coerce_limit(inventory_status_limit, default=20, minimum=1, maximum=100),
        stock_movement_limit=coerce_limit(stock_movement_limit, default=50, minimum=1, maximum=200),
        reorder_suggestion_limit=coerce_limit(reorder_suggestion_limit, default=25, minimum=1, maximum=200),
        payment_report_limit=coerce_limit(payment_report_limit, default=20, minimum=1, maximum=200),
        discount_report_limit=coerce_limit(discount_report_limit, default=20, minimum=1, maximum=200),
        customer_report_limit=coerce_limit(customer_report_limit, default=20, minimum=1, maximum=200),
        staff_report_limit=coerce_limit(staff_report_limit, default=20, minimum=1, maximum=200),
        profitability_report_limit=coerce_limit(
            profitability_report_limit, default=20, minimum=1, maximum=200
        ),
        branch_report_limit=coerce_limit(branch_report_limit, default=20, minimum=1, maximum=200),
        tax_report_limit=coerce_limit(tax_report_limit, default=20, minimum=1, maximum=200),
    )


def resolve_selected_profiles(
    *,
    requested_scope: str,
    current_profile_name: str,
    profile_filter: str,
    allow_all_profiles: bool,
    profiles_by_name: dict[str, dict[str, Any]],
    available_profile_names: list[str],
    current_profile_doc: dict[str, Any],
    is_dashboard_enabled: Callable[[dict[str, Any]], bool],
) -> SelectedProfiles:
    available_profiles = [
        profiles_by_name[name]
        for name in available_profile_names
        if name in profiles_by_name
    ]

    if requested_scope == "specific":
        target_profile = profile_filter or current_profile_name
        selected_profile_names = [target_profile]
    elif requested_scope == "current":
        selected_profile_names = [current_profile_name]
    else:
        selected_profile_names = available_profile_names or [current_profile_name]

    selected_profiles = [
        profiles_by_name.get(name) for name in selected_profile_names if profiles_by_name.get(name)
    ]
    selected_profiles = [profile for profile in selected_profiles if profile]

    if not selected_profiles:
        current_profile_fallback = profiles_by_name.get(current_profile_name) or current_profile_doc
        if current_profile_fallback and is_dashboard_enabled(current_profile_fallback):
            selected_profiles = [current_profile_fallback]
            selected_profile_names = [current_profile_name]

    selected_profiles_before_override = list(selected_profiles)
    selected_profiles = [
        profile for profile in selected_profiles if is_dashboard_enabled(profile)
    ]
    selected_profile_names = [
        profile.get("name") for profile in selected_profiles if profile.get("name")
    ]

    disabled_reason = None
    if not selected_profiles:
        disabled_reason = (
            "profile_disabled"
            if selected_profiles_before_override
            else "no_profiles_in_scope"
        )

    return SelectedProfiles(
        available_profiles=available_profiles,
        available_profile_names=available_profile_names,
        selected_profiles=selected_profiles,
        selected_profile_names=selected_profile_names,
        selected_profiles_before_override=selected_profiles_before_override,
        disabled_reason=disabled_reason,
    )


def build_dashboard_payload(context: DashboardPayloadContext) -> dict[str, Any]:
    return {
        "enabled": context.enabled,
        "profile": context.profile_label,
        "scope": context.requested_scope,
        "default_scope": context.default_scope,
        "global_enabled": context.global_enabled,
        "allow_all_profiles": context.allow_all_profiles,
        "profile_scope_enabled": context.profile_scope_enabled,
        "disabled_reason": context.disabled_reason,
        "selected_profiles": context.selected_profile_names,
        "available_profiles": [
            {
                "name": profile.get("name"),
                "warehouse": profile.get("warehouse"),
                "currency": profile.get("currency"),
                "dashboard_enabled": profile.get("dashboard_enabled"),
            }
            for profile in context.available_profiles
        ],
        "company": context.company,
        "warehouse": context.warehouse_label,
        "currency": context.currency,
        "generated_at": context.generated_at,
        "date_context": {
            "today": context.report_to_date,
            "month_start": context.month_start,
            "report_month": context.selected_report_month,
        },
        "sales_overview": {
            "today_sales": 0.0,
            "today_profit": 0.0,
            "monthly_sales": 0.0,
            "monthly_profit": 0.0,
            "profit_method": "invoice_item",
        },
        "daily_sales_summary": {
            "period": {"from": context.report_to_date, "to": context.report_to_date},
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
        "monthly_sales_summary": {
            "period": {"from": context.month_start, "to": context.report_to_date},
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
        "payment_method_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "totals": {
                "invoice_count": 0,
                "split_invoice_count": 0,
                "pending_invoice_count": 0,
                "partial_invoice_count": 0,
                "unpaid_invoice_count": 0,
                "pending_amount": 0.0,
                "paid_amount": 0.0,
                "collected_amount": 0.0,
                "cash_amount": 0.0,
                "card_online_amount": 0.0,
                "other_amount": 0.0,
            },
            "method_wise": [],
            "category_wise": [],
            "day_wise": [],
        },
        "discount_void_return_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "totals": {
                "discount_amount": 0.0,
                "discounted_invoice_count": 0,
                "return_count": 0,
                "return_amount": 0.0,
                "void_count": 0,
                "void_amount": 0.0,
            },
            "cashier_wise": [],
            "top_return_items": [],
            "day_wise": [],
        },
        "customer_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "summary": {
                "customer_count": 0,
                "repeat_customer_count": 0,
                "repeat_customer_rate_pct": 0.0,
                "invoice_count": 0,
                "sales_amount": 0.0,
                "average_basket_size": 0.0,
                "average_purchase_frequency_days": None,
            },
            "top_customers": [],
            "repeat_customers": [],
            "recent_customers": [],
        },
        "staff_performance_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "summary": {
                "cashier_count": 0,
                "invoice_count": 0,
                "sales_amount": 0.0,
                "items_sold": 0.0,
                "average_bill": 0.0,
                "average_items_per_invoice": 0.0,
                "return_count": 0,
                "return_amount": 0.0,
                "discount_amount": 0.0,
                "void_count": 0,
                "void_amount": 0.0,
            },
            "cashier_wise": [],
            "top_by_invoices": [],
            "risk_activity": [],
        },
        "profitability_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "summary": {
                "invoice_count": 0,
                "return_invoice_count": 0,
                "item_line_count": 0,
                "revenue": 0.0,
                "cogs": 0.0,
                "gross_profit": 0.0,
                "gross_margin_pct": None,
                "average_invoice_profit": 0.0,
            },
            "item_wise": [],
            "category_wise": [],
            "day_wise": [],
            "highlights": {
                "top_profit_item": None,
                "lowest_margin_item": None,
            },
        },
        "branch_location_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "summary": {
                "location_count": 0,
                "total_invoices": 0,
                "total_sales": 0.0,
                "total_profit": 0.0,
                "total_stock_qty": 0.0,
                "low_stock_total": 0,
                "cashier_count": 0,
            },
            "location_wise": [],
            "top_items_by_location": [],
        },
        "tax_charges_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "totals": {
                "invoice_count": 0,
                "return_invoice_count": 0,
                "taxable_amount": 0.0,
                "invoice_total": 0.0,
                "tax_amount": 0.0,
                "service_charge_amount": 0.0,
                "fee_amount": 0.0,
                "other_charge_amount": 0.0,
                "round_off_amount": 0.0,
                "invoice_adjustment_amount": 0.0,
                "total_charge_amount": 0.0,
            },
            "tax_heads": [],
            "charge_heads": [],
            "day_wise": [],
            "highlights": {
                "top_tax_head": None,
                "top_charge_head": None,
            },
        },
        "sales_trend": {
            "period": {
                "day_from": context.month_start,
                "day_to": context.report_to_date,
                "week_from": context.sales_trend_week_from,
                "month_from": context.sales_trend_month_from,
                "to": context.report_to_date,
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
            "period": {"from": context.month_start, "to": context.report_to_date},
            "items": [],
            "highlights": {
                "best_seller": None,
                "top_margin_item": None,
                "top_discount_item": None,
            },
        },
        "category_brand_variant_report": {
            "period": {"from": context.month_start, "to": context.report_to_date},
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
            "period": {"from": context.month_start, "to": context.report_to_date},
            "threshold": context.threshold,
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
            "period": {"from": context.month_start, "to": context.report_to_date},
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
            "period": {"from": context.month_start, "to": context.report_to_date},
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
                "from": context.month_start,
                "to": context.report_to_date,
                "days": context.fast_moving_days,
            },
            "fast_moving_pagination": {
                "page": context.fast_moving_page,
                "page_size": context.fast_moving_page_size,
                "total_count": 0,
                "total_pages": 0,
                "search": context.fast_moving_search,
            },
            "low_stock_items": [],
            "low_stock_threshold": context.threshold,
        },
        "supplier_overview": {
            "period": {"from": context.month_start, "to": context.report_to_date},
            "summary": {
                "supplier_count": 0,
                "purchase_count": 0,
                "purchase_amount": 0.0,
                "paid_amount": 0.0,
                "pending_amount": 0.0,
                "avg_invoice_value": 0.0,
                "pending_ratio_pct": 0.0,
            },
            "purchase_summary": [],
            "risk_suppliers": [],
            "day_wise": [],
            "highlights": {
                "top_supplier": None,
                "top_pending_supplier": None,
            },
        },
    }


def update_fast_moving_pagination(
    payload: dict[str, Any],
    *,
    page: int,
    page_size: int,
    total_count: int,
    search: str,
) -> None:
    payload["inventory_insights"]["fast_moving_pagination"] = {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "total_pages": int(ceil(total_count / page_size)) if total_count else 0,
        "search": search,
    }
