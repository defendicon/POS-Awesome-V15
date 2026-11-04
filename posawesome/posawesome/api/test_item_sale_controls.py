import importlib.util
import pathlib
import sys
import types
import unittest
from contextlib import contextmanager
from unittest.mock import Mock, patch

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class FakeMeta:
    def has_field(self, fieldname):
        return fieldname in {
            "retailmind_locked_for_sale",
            "retailmind_non_discountable",
            "retailmind_controlled_item",
            "retailmind_short_name",
            "buying_price_list",
        }


def _install_frappe_stub():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.PermissionError = PermissionError
    frappe_module.throw = lambda message, exception=None: (_ for _ in ()).throw(
        (exception or Exception)(message)
    )
    frappe_module.get_meta = lambda doctype: FakeMeta()
    frappe_module.get_all = lambda *args, **kwargs: []
    frappe_module.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
        get_single_value=lambda *args, **kwargs: None,
        exists=lambda *args, **kwargs: False,
    )
    sys.modules["frappe"] = frappe_module

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.flt = lambda value, precision=None: float(value or 0)
    frappe_utils.cint = lambda value: int(value or 0)
    frappe_utils.cstr = lambda value: str(value or "")
    frappe_utils.nowdate = lambda: "2026-07-17"
    sys.modules["frappe.utils"] = frappe_utils

    return frappe_module


def _load_module():
    module_name = "posawesome.posawesome.api.item_sale_controls"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "item_sale_controls.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestItemSaleControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe = _install_frappe_stub()
        cls.controls = _load_module()

    def setUp(self):
        self.frappe.get_all = lambda *args, **kwargs: []
        self.frappe.db.get_value = lambda *args, **kwargs: None
        self.frappe.db.get_single_value = lambda *args, **kwargs: None
        self.frappe.db.exists = lambda *args, **kwargs: False

    def _install_buying_price(self, rate=12.75, uom="Nos", currency="PKR"):
        self.frappe.db.get_single_value = lambda *args, **kwargs: "Standard Buying"
        self.frappe.db.get_value = lambda doctype, *args, **kwargs: (
            currency if doctype == "Price List" else None
        )

        def get_all(doctype, *args, **kwargs):
            if doctype == "Item Price":
                return [
                    {
                        "name": "IP-LOW-NOS",
                        "item_code": "LOW",
                        "price_list": "Standard Buying",
                        "price_list_rate": rate,
                        "currency": currency,
                        "uom": uom,
                        "valid_from": "2026-01-01",
                    }
                ]
            if doctype == "Item":
                return [{"item_code": "LOW", "stock_uom": "Nos"}]
            if doctype == "UOM Conversion Detail":
                return []
            return []

        self.frappe.get_all = get_all

    def test_locked_item_blocks_sale(self):
        self.frappe.get_all = lambda *args, **kwargs: [
            {
                "item_code": "LOCKED",
                "item_name": "Locked Item",
                "retailmind_locked_for_sale": 1,
                "retailmind_non_discountable": 0,
            }
        ]

        errors = self.controls.collect_item_sale_control_errors(
            [{"item_code": "LOCKED", "item_name": "Locked Item", "qty": 1}]
        )

        self.assertEqual(errors[0]["reason"], "locked_for_sale")
        self.assertEqual(errors[0]["policy"], "block")

    def test_non_discountable_item_blocks_line_discount(self):
        self.frappe.get_all = lambda *args, **kwargs: [
            {
                "item_code": "NO-DISC",
                "item_name": "No Discount",
                "retailmind_locked_for_sale": 0,
                "retailmind_non_discountable": 1,
            }
        ]

        errors = self.controls.collect_item_sale_control_errors(
            [
                {
                    "item_code": "NO-DISC",
                    "item_name": "No Discount",
                    "discount_percentage": 5,
                }
            ]
        )

        self.assertEqual(errors[0]["reason"], "non_discountable")
        self.assertEqual(errors[0]["policy"], "block")

    def test_non_discountable_item_allows_zero_discount(self):
        self.frappe.get_all = lambda *args, **kwargs: [
            {
                "item_code": "NO-DISC",
                "item_name": "No Discount",
                "retailmind_locked_for_sale": 0,
                "retailmind_non_discountable": 1,
            }
        ]

        errors = self.controls.collect_item_sale_control_errors(
            [{"item_code": "NO-DISC", "item_name": "No Discount"}]
        )

        self.assertEqual(errors, [])

    def test_database_buying_price_blocks_sale(self):
        self._install_buying_price()
        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Cost",
                    "qty": 1,
                    "rate": 10,
                    "uom": "Nos",
                }
            ]
        )

        self.assertEqual(errors[0]["reason"], "below_buying_price")
        self.assertEqual(errors[0]["policy"], "block")

    def test_buying_price_sale_control_queries_price_list_when_row_has_no_trade_price(self):
        self._install_buying_price()

        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Cost",
                    "qty": 1,
                    "rate": 10,
                    "uom": "Nos",
                }
            ]
        )

        self.assertEqual(errors[0]["reason"], "below_buying_price")

    def test_client_trade_price_cannot_lower_database_floor(self):
        self._install_buying_price(rate=12.75)

        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Cost",
                    "qty": 1,
                    "rate": 10,
                    "uom": "Nos",
                    "trade_price": 1,
                    "buying_rate": 1,
                }
            ]
        )

        self.assertEqual(errors[0]["buying_rate"], 12.75)

    def test_stock_uom_price_is_converted_for_selected_uom(self):
        self._install_buying_price(rate=12.75, uom="Nos")
        original_get_all = self.frappe.get_all

        def get_all(doctype, *args, **kwargs):
            if doctype == "UOM Conversion Detail":
                return [
                    {
                        "parent": "LOW",
                        "uom": "Box",
                        "conversion_factor": 10,
                    }
                ]
            return original_get_all(doctype, *args, **kwargs)

        self.frappe.get_all = get_all

        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Cost",
                    "qty": 1,
                    "rate": 100,
                    "uom": "Box",
                }
            ]
        )

        self.assertEqual(errors[0]["buying_rate"], 127.5)

    def test_exact_selected_uom_price_wins_without_conversion(self):
        self._install_buying_price(rate=120, uom="Box")
        original_get_all = self.frappe.get_all

        def get_all(doctype, *args, **kwargs):
            if doctype == "UOM Conversion Detail":
                return [
                    {
                        "parent": "LOW",
                        "uom": "Box",
                        "conversion_factor": 10,
                    }
                ]
            return original_get_all(doctype, *args, **kwargs)

        self.frappe.get_all = get_all

        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Cost",
                    "qty": 1,
                    "rate": 115,
                    "uom": "Box",
                }
            ]
        )

        self.assertEqual(errors[0]["buying_rate"], 120)

    def test_buying_floor_is_converted_to_invoice_currency(self):
        self._install_buying_price(rate=12.75, currency="USD")
        self.frappe.db.get_value = lambda doctype, *args, **kwargs: {
            "Price List": "USD",
            "Company": "PKR",
        }.get(doctype)
        erpnext_module = types.ModuleType("erpnext")
        erpnext_setup = types.ModuleType("erpnext.setup")
        erpnext_utils = types.ModuleType("erpnext.setup.utils")
        erpnext_utils.get_exchange_rate = lambda *args, **kwargs: 280
        sys.modules["erpnext"] = erpnext_module
        sys.modules["erpnext.setup"] = erpnext_setup
        sys.modules["erpnext.setup.utils"] = erpnext_utils

        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Cost",
                    "qty": 1,
                    "rate": 3500,
                    "uom": "Nos",
                }
            ],
            invoice_doc={
                "company": "Test Company",
                "currency": "PKR",
                "conversion_rate": 1,
                "posting_date": "2026-07-17",
            },
        )

        self.assertEqual(errors[0]["buying_rate"], 3570)

    def test_sale_floor_policy_defaults_preserve_hard_block(self):
        policy = self.controls.resolve_sale_floor_policy("Main POS")

        self.assertTrue(policy["enabled"])
        self.assertEqual(policy["action"], "Block")
        self.assertEqual(policy["missing_cost_action"], "Allow")

    def test_minimum_margin_raises_permitted_floor(self):
        self._install_buying_price(rate=100)

        errors = self.controls.collect_below_buying_price_errors(
            [
                {
                    "item_code": "LOW",
                    "item_name": "Below Margin",
                    "qty": 1,
                    "rate": 104,
                    "uom": "Nos",
                }
            ],
            policy={
                "enabled": True,
                "action": "Block",
                "minimum_margin_percentage": 5,
                "missing_cost_action": "Allow",
            },
        )

        self.assertEqual(errors[0]["minimum_selling_rate"], 105)

    def test_invoice_level_discount_is_included_in_floor_check(self):
        self._install_buying_price(rate=100)

        errors = self.controls.collect_below_buying_price_errors(
            [{"item_code": "LOW", "qty": 1, "rate": 105, "uom": "Nos"}],
            invoice_doc={"additional_discount_percentage": 10},
        )

        self.assertAlmostEqual(errors[0]["selling_rate"], 94.5)

    def test_missing_cost_can_be_configured_to_block(self):
        errors = self.controls.collect_below_buying_price_errors(
            [{"item_code": "NO-COST", "item_name": "No Cost", "qty": 1, "rate": 10}],
            policy={
                "enabled": True,
                "action": "Block",
                "minimum_margin_percentage": 0,
                "missing_cost_action": "Block",
            },
        )

        self.assertEqual(errors[0]["reason"], "missing_buying_price")

    def test_missing_cost_block_cannot_be_downgraded_to_warning(self):
        invoice = {"items": [{"item_code": "NO-COST", "qty": 1, "rate": 10}]}
        missing_error = {
            "item_code": "NO-COST",
            "reason": "missing_buying_price",
            "message": "missing buying floor",
        }

        with (
            patch.object(self.controls, "collect_item_sale_control_errors", return_value=[]),
            patch.object(
                self.controls,
                "collect_below_buying_price_errors",
                return_value=[missing_error],
            ),
            patch.object(
                self.controls,
                "resolve_sale_floor_policy",
                return_value={"enabled": True, "action": "Warning Only"},
            ),
        ):
            with self.assertRaisesRegex(Exception, "missing buying floor"):
                self.controls.validate_invoice_item_sale_controls(invoice)

    def test_pos_supervisor_override_records_server_authorized_actor_and_details(self):
        invoice = {
            "items": [{"item_code": "LOW", "qty": 1, "rate": 90}],
            "pos_profile": "Main POS",
            "posa_below_cost_override": 1,
            "posa_below_cost_override_reason": "Approved clearance",
        }
        floor_error = {
            "item_code": "LOW",
            "selling_rate": 90,
            "buying_rate": 100,
            "minimum_selling_rate": 100,
            "minimum_margin_percentage": 0,
            "buying_price_uom": "Nos",
            "buying_price_currency": "PKR",
            "message": "below floor",
        }

        with (
            patch.object(self.controls, "collect_item_sale_control_errors", return_value=[]),
            patch.object(
                self.controls,
                "collect_below_buying_price_errors",
                return_value=[floor_error],
            ),
            patch.object(
                self.controls,
                "resolve_sale_floor_policy",
                return_value={"enabled": True, "action": "POS Supervisor Override"},
            ),
            patch.object(
                self.controls,
                "_authorize_below_cost_override",
                return_value="supervisor@example.com",
            ),
        ):
            self.controls.validate_invoice_item_sale_controls(invoice)

        self.assertEqual(invoice["posa_below_cost_override_by"], "supervisor@example.com")
        self.assertIn('"item_code":"LOW"', invoice["posa_below_cost_override_details"])

    def test_general_manager_cannot_authorize_below_cost_override(self):
        employees = types.ModuleType("posawesome.posawesome.api.employees")
        employees._get_user_doc = lambda user: types.SimpleNamespace(name=user)
        employees._is_pos_supervisor = lambda user_doc: False
        pos_access = types.ModuleType("posawesome.posawesome.api.pos_access")
        pos_access.get_authenticated_pos_user = lambda: "manager@example.com"
        terminal_state = types.ModuleType("posawesome.posawesome.api.terminal_state")
        terminal_state.get_active_terminal_cashier = lambda profile: "manager@example.com"

        with patch.dict(
            sys.modules,
            {
                "posawesome.posawesome.api.employees": employees,
                "posawesome.posawesome.api.pos_access": pos_access,
                "posawesome.posawesome.api.terminal_state": terminal_state,
            },
        ):
            with self.assertRaisesRegex(PermissionError, "POS supervisor"):
                self.controls._authorize_below_cost_override("Main POS")

    @contextmanager
    def _supervisor_policy(self, action="POS Supervisor Override", extra_errors=()):
        with (
            patch.object(self.controls, "collect_item_sale_control_errors", return_value=[]),
            patch.object(
                self.controls,
                "collect_below_buying_price_errors",
                side_effect=lambda *args, **kwargs: [
                    {"reason": "below_buying_price", "message": "below floor"},
                    *extra_errors,
                ],
            ),
            patch.object(
                self.controls,
                "resolve_sale_floor_policy",
                return_value={"enabled": True, "action": action},
            ),
        ):
            yield

    def test_pending_draft_can_reach_payment_but_cannot_submit_without_approval(self):
        for doctype in ("Sales Invoice", "POS Invoice"):
            with self.subTest(doctype=doctype), self._supervisor_policy():
                # Keep the same flags, as Frappe does on save followed by submit.
                values = {"doctype": doctype, "docstatus": 0, "pos_profile": "Main POS"}
                values.update(posa_below_cost_override_by="forged", posa_below_cost_override_details="forged")
                invoice = types.SimpleNamespace(flags=types.SimpleNamespace(), get=values.get)
                invoice.set = lambda key, value: values.__setitem__(key, value)

                self.controls.validate_pos_invoice_item_sale_controls(invoice)

                self.assertFalse(getattr(invoice.flags, "posa_item_sale_controls_validated", False))
                self.assertIsNone(values["posa_below_cost_override_by"])
                self.assertIsNone(values["posa_below_cost_override_details"])
                # Submission APIs must enforce approval while docstatus is still 0.
                with self.assertRaisesRegex(Exception, "requires a POS supervisor override"):
                    self.controls.validate_invoice_item_sale_controls(invoice)
                values["docstatus"] = 1
                with self.assertRaisesRegex(Exception, "requires a POS supervisor override"):
                    self.controls.validate_pos_invoice_item_sale_controls(invoice)

    def test_pending_draft_does_not_bypass_other_sale_controls(self):
        invoice = {"doctype": "Sales Invoice", "docstatus": 0, "pos_profile": "Main POS"}
        with self._supervisor_policy(action="Block"):
            with self.assertRaisesRegex(Exception, "below floor"):
                self.controls.validate_pos_invoice_item_sale_controls(invoice)
        with self._supervisor_policy(
            extra_errors=[
                {"reason": "missing_buying_price", "message": "missing buying floor"},
            ]
        ):
            with self.assertRaisesRegex(Exception, "missing buying floor"):
                self.controls.validate_pos_invoice_item_sale_controls(invoice)
        for reason in ("locked_for_sale", "non_discountable"):
            with (
                self.subTest(reason=reason),
                self._supervisor_policy(),
                patch.object(
                    self.controls,
                    "collect_item_sale_control_errors",
                    return_value=[{"reason": reason, "message": reason}],
                ),
            ):
                with self.assertRaisesRegex(Exception, reason):
                    self.controls.validate_pos_invoice_item_sale_controls(invoice)

    def test_explicit_override_still_requires_reason_and_authorization_on_draft(self):
        invoice = {
            "doctype": "POS Invoice",
            "docstatus": 0,
            "pos_profile": "Main POS",
            "posa_below_cost_override": 1,
        }
        with self._supervisor_policy():
            with self.assertRaisesRegex(Exception, "reason is required"):
                self.controls.validate_pos_invoice_item_sale_controls(invoice)
            invoice["posa_below_cost_override_reason"] = "Approved clearance"
            with patch.object(
                self.controls,
                "_authorize_below_cost_override",
                side_effect=PermissionError("POS supervisor required"),
            ):
                with self.assertRaisesRegex(PermissionError, "POS supervisor"):
                    self.controls.validate_pos_invoice_item_sale_controls(invoice)
            with patch.object(
                self.controls,
                "_authorize_below_cost_override",
                return_value="supervisor@example.com",
            ):
                self.controls.validate_pos_invoice_item_sale_controls(invoice)
                self.assertEqual(invoice["posa_below_cost_override_by"], "supervisor@example.com")
                self.assertTrue(invoice["posa_below_cost_override_details"])
                invoice["docstatus"] = 1
                self.controls.validate_pos_invoice_item_sale_controls(invoice)

    def test_pos_invoice_hook_delegates_to_sale_control_validation(self):
        validator = Mock()
        invoice = {"doctype": "Sales Invoice", "is_pos": 1, "items": []}

        with patch.object(
            self.controls,
            "validate_invoice_item_sale_controls",
            validator,
        ):
            self.controls.validate_pos_invoice_item_sale_controls(invoice)

        validator.assert_called_once_with(invoice, require_override=False)

    def test_successful_validation_is_not_repeated_for_the_same_document(self):
        item_validator = Mock(return_value=[])
        price_validator = Mock(return_value=[])
        invoice = types.SimpleNamespace(
            flags=types.SimpleNamespace(),
            get=lambda key: [] if key == "items" else None,
        )

        with (
            patch.object(
                self.controls,
                "collect_item_sale_control_errors",
                item_validator,
            ),
            patch.object(
                self.controls,
                "collect_below_buying_price_errors",
                price_validator,
            ),
        ):
            self.controls.validate_invoice_item_sale_controls(invoice)
            self.controls.validate_invoice_item_sale_controls(invoice)

        item_validator.assert_called_once()
        price_validator.assert_called_once()

    def test_non_pos_sales_invoice_skips_pos_sale_controls(self):
        validator = Mock()
        invoice = {"doctype": "Sales Invoice", "is_pos": 0, "items": []}

        with patch.object(
            self.controls,
            "validate_invoice_item_sale_controls",
            validator,
        ):
            self.controls.validate_pos_invoice_item_sale_controls(invoice)

        validator.assert_not_called()


if __name__ == "__main__":
    unittest.main()
