from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

_MODULE_PATH = Path(__file__).with_name("dashboard_support.py")
_MODULE_SPEC = importlib.util.spec_from_file_location("dashboard_support", _MODULE_PATH)
if _MODULE_SPEC is None or _MODULE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load dashboard_support module from {_MODULE_PATH}")

dashboard_support = importlib.util.module_from_spec(_MODULE_SPEC)
sys.modules[_MODULE_SPEC.name] = dashboard_support
_MODULE_SPEC.loader.exec_module(dashboard_support)

DashboardPayloadContext = dashboard_support.DashboardPayloadContext
build_dashboard_payload = dashboard_support.build_dashboard_payload
normalize_dashboard_limits = dashboard_support.normalize_dashboard_limits
resolve_selected_profiles = dashboard_support.resolve_selected_profiles
update_fast_moving_pagination = dashboard_support.update_fast_moving_pagination


def _coerce_limit(value, default, minimum=1, maximum=50):
    coerced = int(value) if value not in (None, "") else default
    if not coerced:
        coerced = default
    return max(minimum, min(int(coerced), maximum))


def _coerce_page(value, default=1, maximum=100000):
    page = int(value) if value not in (None, "") else default
    if not page:
        page = default
    return max(1, min(int(page), maximum))


class TestDashboardSupport(unittest.TestCase):
    def test_normalize_dashboard_limits_uses_page_size_fallbacks(self):
        limits = normalize_dashboard_limits(
            fast_moving_limit=25,
            fast_moving_page=3,
            fast_moving_page_size=None,
            fast_moving_search=" flour ",
            supplier_limit=40,
            low_stock_limit=0,
            item_sales_limit=200,
            category_report_limit=12,
            inventory_status_limit=20,
            stock_movement_limit=20,
            reorder_suggestion_limit=25,
            payment_report_limit=20,
            discount_report_limit=20,
            customer_report_limit=20,
            staff_report_limit=20,
            profitability_report_limit=20,
            branch_report_limit=20,
            tax_report_limit=20,
            coerce_limit=_coerce_limit,
            coerce_page=_coerce_page,
            coerce_text=lambda value: str(value).strip(),
        )

        self.assertEqual(limits.fast_moving_page, 3)
        self.assertEqual(limits.fast_moving_page_size, 25)
        self.assertEqual(limits.fast_moving_offset, 50)
        self.assertEqual(limits.fast_moving_search, "flour")
        self.assertEqual(limits.supplier_limit, 25)
        self.assertEqual(limits.low_stock_limit, 20)
        self.assertEqual(limits.item_sales_limit, 100)

    def test_resolve_selected_profiles_falls_back_to_current_enabled_profile(self):
        current_profile = {
            "name": "POS-1",
            "warehouse": "Main",
            "dashboard_enabled": True,
        }

        selection = resolve_selected_profiles(
            requested_scope="all",
            current_profile_name="POS-1",
            profile_filter="",
            allow_all_profiles=False,
            profiles_by_name={},
            available_profile_names=[],
            current_profile_doc=current_profile,
            is_dashboard_enabled=lambda profile: bool(profile.get("dashboard_enabled")),
        )

        self.assertEqual(selection.selected_profile_names, ["POS-1"])
        self.assertEqual(selection.disabled_reason, None)
        self.assertEqual(selection.available_profiles, [])

    def test_build_dashboard_payload_carries_context_and_updates_fast_moving_pagination(self):
        payload = build_dashboard_payload(
            DashboardPayloadContext(
                enabled=True,
                profile_label="POS-1",
                requested_scope="current",
                default_scope="all",
                global_enabled=True,
                allow_all_profiles=False,
                profile_scope_enabled=True,
                disabled_reason=None,
                selected_profile_names=["POS-1"],
                available_profiles=[
                    {
                        "name": "POS-1",
                        "warehouse": "Main",
                        "currency": "USD",
                        "dashboard_enabled": True,
                    }
                ],
                company="Test Co",
                warehouse_label="Main",
                currency="USD",
                generated_at="2026-03-12T00:00:00",
                report_to_date="2026-03-12",
                month_start="2026-03-01",
                selected_report_month="2026-03",
                threshold=7,
                fast_moving_days=12,
                fast_moving_page=2,
                fast_moving_page_size=15,
                fast_moving_search="rice",
                sales_trend_week_from="2026-01-17",
                sales_trend_month_from="2025-10-01",
            )
        )

        self.assertEqual(payload["inventory_status_report"]["threshold"], 7)
        self.assertEqual(payload["inventory_insights"]["fast_moving_pagination"]["page"], 2)
        self.assertEqual(payload["available_profiles"][0]["name"], "POS-1")

        update_fast_moving_pagination(
            payload,
            page=2,
            page_size=15,
            total_count=31,
            search="rice",
        )

        self.assertEqual(payload["inventory_insights"]["fast_moving_pagination"]["total_pages"], 3)


if __name__ == "__main__":
    unittest.main()
