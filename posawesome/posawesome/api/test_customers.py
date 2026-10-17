import importlib.util
import json
import pathlib
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import Mock


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
CUSTOMERS_API_PATH = REPO_ROOT / "posawesome" / "posawesome" / "api" / "customers.py"


class AttrDict(dict):
    __getattr__ = dict.get


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils_module = types.ModuleType("frappe.utils")
    frappe_caching_module = types.ModuleType("frappe.utils.caching")
    erpnext_loyalty_module = types.ModuleType(
        "erpnext.accounts.doctype.loyalty_program.loyalty_program"
    )
    api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
    stored_value_module = types.ModuleType("posawesome.posawesome.api.stored_value")

    state = {
        "loyalty_detail_calls": 0,
        "get_all_calls": [],
    }

    def get_all(doctype, **kwargs):
        state["get_all_calls"].append((doctype, kwargs))
        if doctype == "Customer":
            return [
                AttrDict(
                    {
                        "name": "CUST-001",
                        "modified": "2026-05-21 10:00:00",
                        "customer_name": "Alpha Customer",
                        "loyalty_program": "Retail Loyalty",
                        "default_price_list": "Standard Selling",
                    }
                )
            ]
        return []

    def get_loyalty_program_details_with_points(*args, **kwargs):
        state["loyalty_detail_calls"] += 1
        raise AssertionError("Bulk customer sync must not fetch loyalty point balances")

    frappe_module._ = lambda text: text
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.get_all = get_all
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.get_value = lambda *args, **kwargs: None
    frappe_module.db = SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
        count=lambda *args, **kwargs: 0,
        escape=lambda value: f"'{value}'",
    )

    frappe_utils_module.nowdate = lambda: "2026-05-21"
    frappe_utils_module.flt = lambda value=0, precision=None: float(value or 0)
    frappe_utils_module.cstr = lambda value="": "" if value is None else str(value)
    frappe_utils_module.get_datetime = lambda value: value
    frappe_caching_module.redis_cache = lambda ttl=None: (lambda fn: fn)
    erpnext_loyalty_module.get_loyalty_program_details_with_points = (
        get_loyalty_program_details_with_points
    )
    api_utils_module.assert_pos_profile_write_allowed = lambda *args, **kwargs: None
    api_utils_module.fetch_sales_person_names = lambda *args, **kwargs: []
    stored_value_module.get_stored_value_summary = lambda *args, **kwargs: {}

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils_module
    sys.modules["frappe.utils.caching"] = frappe_caching_module
    sys.modules[
        "erpnext.accounts.doctype.loyalty_program.loyalty_program"
    ] = erpnext_loyalty_module
    sys.modules["posawesome.posawesome.api.utils"] = api_utils_module
    sys.modules["posawesome.posawesome.api.stored_value"] = stored_value_module

    return state


def _load_module():
    module_name = "posawesome.posawesome.api.customers"
    spec = importlib.util.spec_from_file_location(module_name, CUSTOMERS_API_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestCustomersApi(unittest.TestCase):
    def setUp(self):
        self._orig_sys_modules = sys.modules.copy()
        self.state = _install_stubs()
        self.module = _load_module()

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._orig_sys_modules)

    def test_customer_list_does_not_fetch_loyalty_balances_per_customer(self):
        rows = self.module.get_customer_names(
            json.dumps({"name": "POS-TEST"}),
            limit=1000,
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "CUST-001")
        self.assertEqual(rows[0]["loyalty_program"], "Retail Loyalty")
        self.assertNotIn("loyalty_points", rows[0])
        self.assertNotIn("conversion_factor", rows[0])
        self.assertEqual(self.state["loyalty_detail_calls"], 0)

    def test_duplicate_customer_lookup_reports_matching_fields(self):
        def get_all(doctype, **kwargs):
            filters = kwargs.get("filters", {})
            if doctype != "Customer":
                return []
            if filters.get("mobile_no") == "+92 300 1234567":
                return [
                    AttrDict(
                        name="CUST-EXISTING",
                        customer_name="Existing Customer",
                        mobile_no="+92 300 1234567",
                        email_id="existing@example.com",
                        tax_id="TIN-1",
                    )
                ]
            if filters.get("email_id") == "existing@example.com":
                return [
                    AttrDict(
                        name="CUST-EXISTING",
                        customer_name="Existing Customer",
                        mobile_no="+92 300 1234567",
                        email_id="existing@example.com",
                        tax_id="TIN-1",
                    )
                ]
            return []

        self.module.frappe.get_all = get_all
        matches = self.module._find_duplicate_customer_records(
            customer_name="Different Name",
            mobile_no="+92 300 1234567",
            email_id="Existing@Example.com",
            allow_duplicate_names=True,
        )

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["name"], "CUST-EXISTING")
        self.assertEqual(matches[0]["matching_fields"], ["mobile_no", "email_id"])

    def test_mobile_search_matches_local_and_country_code_formats(self):
        self.assertTrue(
            self.module._mobile_matches_search("+92 300-1234567", "03001234567")
        )
        self.assertFalse(
            self.module._mobile_matches_search("+92 300-1234567", "03111234567")
        )

    def test_server_mobile_search_respects_profile_filters_and_normalizes_numbers(self):
        def get_all(doctype, **kwargs):
            if doctype != "Customer":
                return []
            self.assertEqual(kwargs["filters"]["disabled"], 0)
            self.assertEqual(
                kwargs["filters"]["customer_group"], ["in", ["Retail"]]
            )
            self.assertIn(
                ["mobile_no", "like", "%4567%"],
                kwargs["or_filters"],
            )
            return [
                AttrDict(
                    name="CUST-EXISTING",
                    customer_name="Existing Customer",
                    mobile_no="+92 300-1234567",
                ),
                AttrDict(
                    name="CUST-OTHER",
                    customer_name="Other Customer",
                    mobile_no="+92 311-1234567",
                ),
            ]

        self.module.frappe.get_all = get_all
        self.module.get_customer_groups = lambda profile: ["Retail"]
        matches = self.module.search_customers(
            json.dumps({"name": "POS-TEST"}), "03001234567"
        )

        self.assertEqual([match["name"] for match in matches], ["CUST-EXISTING"])

    def test_server_search_finds_normalized_tax_id(self):
        def get_all(doctype, **kwargs):
            if doctype != "Customer":
                return []
            self.assertIn(
                ["tax_id", "like", "%6789%"],
                kwargs["or_filters"],
            )
            return [
                AttrDict(
                    name="CUST-TAX",
                    customer_name="Tax Customer",
                    mobile_no=None,
                    tax_id="12-345 6789",
                )
            ]

        self.module.frappe.get_all = get_all
        matches = self.module.search_customers(
            json.dumps({"name": "POS-TEST"}), "123456789"
        )

        self.assertEqual([match["name"] for match in matches], ["CUST-TAX"])


class TestCustomerBalance(unittest.TestCase):
    def setUp(self):
        self._orig_sys_modules = sys.modules.copy()
        _install_stubs()
        self.module = _load_module()
        self.module.frappe.db.get_value = Mock(return_value="Test Customer")
        self.module.frappe.log_error = Mock()
        self.module.frappe.get_traceback = lambda: "synthetic traceback"
        party = types.ModuleType("erpnext.accounts.party")
        self.dashboard = Mock()
        party.get_dashboard_info = self.dashboard
        sys.modules["erpnext.accounts.party"] = party

    def tearDown(self):
        sys.modules.clear()
        sys.modules.update(self._orig_sys_modules)

    def test_unavailable_native_summary_does_not_disclose_customer_name(self):
        self.dashboard.return_value = None

        result = self.module.get_customer_balance("CUST-A", "Company A")

        self.assertEqual(result, {
            "balance": None, "customer_name": None, "currency": None,
        })
        self.dashboard.assert_called_once_with("Customer", "CUST-A")
        self.module.frappe.log_error.assert_not_called()

    def test_native_zero_positive_and_negative_balances_are_preserved(self):
        for balance in (0, 125.5, -42.25):
            with self.subTest(balance=balance):
                self.dashboard.return_value = [
                    {"company": "Other Company", "total_unpaid": 999, "currency": "EUR"},
                    {"company": "Company A", "total_unpaid": balance, "currency": "USD"},
                ]
                self.assertEqual(
                    self.module.get_customer_balance("CUST-A", "Company A"),
                    {"balance": balance, "customer_name": "Test Customer", "currency": "USD"},
                )

    def test_missing_company_summary_is_unavailable(self):
        for summary in ([], [{"company": "Other Company", "total_unpaid": 999}]):
            with self.subTest(summary=summary):
                self.dashboard.return_value = summary
                self.assertEqual(
                    self.module.get_customer_balance("CUST-A", "Company A"),
                    {"balance": None, "customer_name": "Test Customer", "currency": None},
                )
        self.module.frappe.log_error.assert_not_called()

    def test_missing_company_balance_is_not_an_explicit_zero(self):
        self.dashboard.return_value = [{"company": "Company A", "currency": "USD"}]
        self.assertEqual(
            self.module.get_customer_balance("CUST-A", "Company A"),
            {"balance": None, "customer_name": "Test Customer", "currency": "USD"},
        )

    def test_unexpected_native_failure_is_logged_and_unavailable(self):
        self.dashboard.side_effect = RuntimeError("synthetic failure")
        self.assertEqual(
            self.module.get_customer_balance("CUST-A", "Company A"),
            {"balance": None, "customer_name": None, "currency": None},
        )
        self.module.frappe.log_error.assert_called_once()

    def test_no_customer_is_unavailable_without_querying_native_summary(self):
        self.assertEqual(
            self.module.get_customer_balance(None, "Company A"),
            {"balance": None, "customer_name": None, "currency": None},
        )
        self.dashboard.assert_not_called()


if __name__ == "__main__":
    unittest.main()
