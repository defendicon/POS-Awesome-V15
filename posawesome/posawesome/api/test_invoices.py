import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _install_frappe_stub():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.db = types.SimpleNamespace(
        has_column=lambda *args, **kwargs: False,
        exists=lambda *args, **kwargs: False,
    )
    frappe_module.get_list = lambda *args, **kwargs: []
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.get_cached_value = lambda *args, **kwargs: None
    sys.modules["frappe"] = frappe_module

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.cint = lambda value: int(value or 0)
    sys.modules["frappe.utils"] = frappe_utils

    tax_contracts_name = "posawesome.posawesome.api.tax_contracts"
    tax_contracts_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "tax_contracts.py"
    tax_contracts_spec = importlib.util.spec_from_file_location(tax_contracts_name, tax_contracts_path)
    tax_contracts_module = importlib.util.module_from_spec(tax_contracts_spec)
    sys.modules[tax_contracts_name] = tax_contracts_module
    tax_contracts_spec.loader.exec_module(tax_contracts_module)

    erpnext_sales_order = types.ModuleType("erpnext.selling.doctype.sales_order.sales_order")
    erpnext_sales_order.make_sales_invoice = lambda *args, **kwargs: None
    sys.modules["erpnext.selling.doctype.sales_order.sales_order"] = erpnext_sales_order

    invoice_processing_utils = types.ModuleType("posawesome.posawesome.api.invoice_processing.utils")
    invoice_processing_utils._get_return_validity_settings = lambda *args, **kwargs: (False, 0)
    invoice_processing_utils._build_invoice_remarks = lambda *args, **kwargs: ""
    invoice_processing_utils._set_return_valid_upto = lambda *args, **kwargs: None
    invoice_processing_utils._validate_return_window = lambda *args, **kwargs: None
    invoice_processing_utils.get_latest_rate = lambda *args, **kwargs: (1, "2026-04-04")
    invoice_processing_utils.get_price_list_currency = lambda *args, **kwargs: "PKR"
    invoice_processing_utils.get_available_currencies = lambda *args, **kwargs: ["PKR"]
    sys.modules["posawesome.posawesome.api.invoice_processing.utils"] = invoice_processing_utils

    invoice_processing_stock = types.ModuleType("posawesome.posawesome.api.invoice_processing.stock")
    invoice_processing_stock._strip_client_freebies_from_payload = lambda *args, **kwargs: None
    invoice_processing_stock._validate_stock_on_invoice = lambda *args, **kwargs: None
    invoice_processing_stock._apply_item_name_overrides = lambda *args, **kwargs: None
    invoice_processing_stock._deduplicate_free_items = lambda *args, **kwargs: None
    invoice_processing_stock._merge_duplicate_taxes = lambda *args, **kwargs: None
    invoice_processing_stock._auto_set_return_batches = lambda *args, **kwargs: None
    invoice_processing_stock._collect_stock_errors = lambda *args, **kwargs: []
    invoice_processing_stock._should_block = lambda *args, **kwargs: False
    sys.modules["posawesome.posawesome.api.invoice_processing.stock"] = invoice_processing_stock

    invoice_processing_creation = types.ModuleType("posawesome.posawesome.api.invoice_processing.creation")
    invoice_processing_creation.update_invoice = lambda *args, **kwargs: None
    invoice_processing_creation.submit_invoice = lambda *args, **kwargs: None
    invoice_processing_creation.submit_in_background_job = lambda *args, **kwargs: None
    invoice_processing_creation.repair_invoice_submission = lambda *args, **kwargs: None
    invoice_processing_creation.validate_cart_items = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.invoice_processing.creation"] = invoice_processing_creation

    invoice_processing_returns = types.ModuleType("posawesome.posawesome.api.invoice_processing.returns")
    invoice_processing_returns.search_invoices_for_return = lambda *args, **kwargs: []
    invoice_processing_returns.validate_return_items = lambda *args, **kwargs: None
    invoice_processing_returns.get_invoice_for_return = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.invoice_processing.returns"] = invoice_processing_returns

    invoice_processing_payment = types.ModuleType("posawesome.posawesome.api.invoice_processing.payment")
    invoice_processing_payment._create_change_payment_entries = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.invoice_processing.payment"] = invoice_processing_payment

    invoice_processing_data = types.ModuleType("posawesome.posawesome.api.invoice_processing.data")
    invoice_processing_data.get_last_invoice_rates = lambda *args, **kwargs: []
    sys.modules["posawesome.posawesome.api.invoice_processing.data"] = invoice_processing_data

    utils_module = types.ModuleType("posawesome.posawesome.api.utils")
    utils_module.log_perf_event = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.utils"] = utils_module

    erpnext_compat_module = types.ModuleType("posawesome.posawesome.api.erpnext_compat")
    erpnext_compat_module.resolve_make_sales_invoice_from_order = lambda: erpnext_sales_order.make_sales_invoice
    sys.modules["posawesome.posawesome.api.erpnext_compat"] = erpnext_compat_module


def _load_invoices_module():
    module_name = "posawesome.posawesome.api.invoices"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoices.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestInvoicesApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_frappe_stub()
        cls.invoices = _load_invoices_module()

    def test_get_draft_invoices_keeps_shift_scope_for_cashiers(self):
        captured = {}

        def fake_get_list(doctype, **kwargs):
            captured["doctype"] = doctype
            captured["kwargs"] = kwargs
            return []

        self.invoices.frappe.get_list = fake_get_list
        self.invoices.frappe.db.has_column = lambda doctype, fieldname: False

        self.invoices.get_draft_invoices("POS-OPEN-0001", doctype="Sales Invoice")

        self.assertEqual(captured["doctype"], "Sales Invoice")
        self.assertEqual(
            captured["kwargs"]["filters"],
            {
                "posa_pos_opening_shift": "POS-OPEN-0001",
                "docstatus": 0,
            },
        )

    def test_get_draft_invoices_uses_company_scope_for_supervisors(self):
        captured = {}

        def fake_get_list(doctype, **kwargs):
            captured["doctype"] = doctype
            captured["kwargs"] = kwargs
            return []

        self.invoices.frappe.get_list = fake_get_list
        self.invoices.frappe.db.has_column = lambda doctype, fieldname: False

        self.invoices.get_draft_invoices(
            None,
            doctype="Sales Invoice",
            company="Farooq Chemicals",
            is_supervisor=1,
        )

        self.assertEqual(captured["doctype"], "Sales Invoice")
        self.assertEqual(
            captured["kwargs"]["filters"],
            {
                "company": "Farooq Chemicals",
                "docstatus": 0,
            },
        )

    def test_create_sales_invoice_from_order_preserves_pos_tax_inclusive_flag(self):
        class FakeDoc:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)
                if not hasattr(self, "flags"):
                    self.flags = types.SimpleNamespace(ignore_permissions=False)
                self.methods_run = []

            def get(self, key, default=None):
                return getattr(self, key, default)

            def run_method(self, method):
                self.methods_run.append(method)
                if method == "calculate_taxes_and_totals":
                    self.calculated_with_inclusive = self.taxes[0]["included_in_print_rate"]

        source_order = FakeDoc(
            doctype="Sales Order",
            name="SO-0001",
            pos_profile="VAT Inclusive POS",
            taxes=[
                {
                    "charge_type": "On Net Total",
                    "included_in_print_rate": 1,
                }
            ],
        )
        mapped_invoice = FakeDoc(
            doctype="Sales Invoice",
            pos_profile=None,
            taxes=[
                {
                    "charge_type": "On Net Total",
                    "included_in_print_rate": 0,
                },
                {
                    "charge_type": "Actual",
                    "included_in_print_rate": 1,
                },
            ],
        )

        self.invoices.frappe.db.exists = lambda doctype, name: doctype == "Sales Order" and name == "SO-0001"
        self.invoices.frappe.get_doc = lambda doctype, name: source_order
        self.invoices.frappe.get_cached_value = (
            lambda doctype, name, fieldname: 1
            if (doctype, name, fieldname)
            == ("POS Profile", "VAT Inclusive POS", "posa_tax_inclusive")
            else None
        )
        self.invoices.resolve_make_sales_invoice_from_order = lambda: (lambda name: mapped_invoice)

        result = self.invoices.create_sales_invoice_from_order("SO-0001")

        self.assertEqual(result.pos_profile, "VAT Inclusive POS")
        self.assertEqual(result.taxes[0]["included_in_print_rate"], 1)
        self.assertEqual(result.taxes[1]["included_in_print_rate"], 0)
        self.assertEqual(result.calculated_with_inclusive, 1)

    def test_tax_contract_does_not_normalize_mixed_taxes_without_pos_profile(self):
        class FakeDoc:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)
                self.calculate_calls = 0

            def get(self, key, default=None):
                return getattr(self, key, default)

            def calculate_taxes_and_totals(self):
                self.calculate_calls += 1

        doc = FakeDoc(
            doctype="Sales Invoice",
            pos_profile=None,
            taxes=[
                {
                    "charge_type": "On Net Total",
                    "included_in_print_rate": 1,
                },
                {
                    "charge_type": "On Previous Row Amount",
                    "included_in_print_rate": 0,
                },
            ],
        )

        changed = self.invoices.apply_pos_tax_inclusion_contract(doc)

        self.assertFalse(changed)
        self.assertEqual(doc.taxes[0]["included_in_print_rate"], 1)
        self.assertEqual(doc.taxes[1]["included_in_print_rate"], 0)
        self.assertEqual(doc.calculate_calls, 0)


if __name__ == "__main__":
    unittest.main()
