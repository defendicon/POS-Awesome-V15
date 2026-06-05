import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class AttrDict(dict):
    __getattr__ = dict.get


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.get_cached_value = lambda *args, **kwargs: 0
    sys.modules["frappe"] = frappe_module

    frappe_model = types.ModuleType("frappe.model")
    frappe_mapper = types.ModuleType("frappe.model.mapper")
    frappe_mapper.get_mapped_doc = lambda *args, **kwargs: None
    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.add_days = lambda value, days: value
    frappe_utils.flt = lambda value, *args, **kwargs: float(value or 0)
    sys.modules["frappe.model"] = frappe_model
    sys.modules["frappe.model.mapper"] = frappe_mapper
    sys.modules["frappe.utils"] = frappe_utils

    utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")
    utilities_module.get_company_domain = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.utilities"] = utilities_module

    payments_module = types.ModuleType("posawesome.posawesome.api.payments")
    payments_module.get_posawesome_credit_redeem_remark = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.payments"] = payments_module

    delivery_module = types.ModuleType(
        "posawesome.posawesome.doctype.delivery_charges.delivery_charges"
    )
    delivery_module.get_applicable_delivery_charges = lambda *args, **kwargs: None
    sys.modules[
        "posawesome.posawesome.doctype.delivery_charges.delivery_charges"
    ] = delivery_module

    coupon_module = types.ModuleType("posawesome.posawesome.doctype.pos_coupon.pos_coupon")
    coupon_module.update_coupon_code_count = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.doctype.pos_coupon.pos_coupon"] = coupon_module


def _load_module():
    module_name = "test_invoice_tax_inclusive_target"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class InvoiceDoc(AttrDict):
    def __init__(self, taxes):
        super().__init__(pos_profile="POS-TEST", taxes=taxes)
        self.calculate_calls = 0

    def calculate_taxes_and_totals(self):
        self.calculate_calls += 1


class TestApplyTaxInclusive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_stubs()
        cls.module = _load_module()

    def test_enabled_profile_includes_non_actual_tax_but_excludes_actual_tax(self):
        self.module.frappe.get_cached_value = lambda *args, **kwargs: 1
        percentage_tax = AttrDict(charge_type="On Net Total", included_in_print_rate=0)
        actual_tax = AttrDict(charge_type="Actual", included_in_print_rate=1)
        doc = InvoiceDoc([percentage_tax, actual_tax])

        self.module.apply_tax_inclusive(doc)

        self.assertEqual(percentage_tax.included_in_print_rate, 1)
        self.assertEqual(actual_tax.included_in_print_rate, 0)
        self.assertEqual(doc.calculate_calls, 1)

    def test_disabled_profile_excludes_non_actual_tax(self):
        self.module.frappe.get_cached_value = lambda *args, **kwargs: 0
        percentage_tax = AttrDict(charge_type="On Net Total", included_in_print_rate=1)
        doc = InvoiceDoc([percentage_tax])

        self.module.apply_tax_inclusive(doc)

        self.assertEqual(percentage_tax.included_in_print_rate, 0)
        self.assertEqual(doc.calculate_calls, 1)


if __name__ == "__main__":
    unittest.main()
