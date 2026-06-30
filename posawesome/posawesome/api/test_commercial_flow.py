import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class FakeDoc:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        if not hasattr(self, "flags"):
            self.flags = types.SimpleNamespace(ignore_permissions=False)

    def get(self, key, default=None):
        return getattr(self, key, default)

    def as_dict(self):
        return dict(self.__dict__)

    def save(self, *args, **kwargs):
        self.saved = True

    def submit(self):
        self.submitted = True
        self.docstatus = 1


def _install_stubs():
    module_names = [
        "frappe",
        "frappe.utils",
        "posawesome.posawesome.api.invoices",
        "posawesome.posawesome.api.quotations",
        "posawesome.posawesome.api.sales_orders",
        "posawesome.posawesome.api.tax_contracts",
        "posawesome.posawesome.api.erpnext_compat",
        "erpnext.selling.doctype.quotation.quotation",
        "erpnext.selling.doctype.sales_order.sales_order",
        "erpnext.stock.doctype.delivery_note.delivery_note",
    ]
    original_modules = {module_name: sys.modules.get(module_name) for module_name in module_names}

    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    frappe_module.PermissionError = PermissionError
    frappe_module.has_permission = lambda *args, **kwargs: True
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

    invoices_module = types.ModuleType("posawesome.posawesome.api.invoices")
    invoices_module.get_draft_invoices = lambda **kwargs: []
    sys.modules["posawesome.posawesome.api.invoices"] = invoices_module

    quotations_module = types.ModuleType("posawesome.posawesome.api.quotations")
    quotations_module.search_quotations = lambda **kwargs: []
    quotations_module.submit_quotation = lambda payload: {"name": "QTN-0001", "status": 1}
    sys.modules["posawesome.posawesome.api.quotations"] = quotations_module

    sales_orders_module = types.ModuleType("posawesome.posawesome.api.sales_orders")
    sales_orders_module.search_orders = lambda **kwargs: []
    sys.modules["posawesome.posawesome.api.sales_orders"] = sales_orders_module

    erpnext_compat_module = types.ModuleType("posawesome.posawesome.api.erpnext_compat")
    erpnext_compat_module.resolve_make_delivery_note_from_order = lambda: sales_order_mapping_module.make_delivery_note
    erpnext_compat_module.resolve_make_sales_invoice_from_delivery = lambda: delivery_note_mapping_module.make_sales_invoice
    erpnext_compat_module.resolve_make_sales_invoice_from_order = lambda: sales_order_mapping_module.make_sales_invoice
    erpnext_compat_module.resolve_make_sales_invoice_from_quotation = lambda: quotation_mapping_module.make_sales_invoice
    erpnext_compat_module.resolve_make_sales_order_from_quotation = lambda: quotation_mapping_module.make_sales_order
    sys.modules["posawesome.posawesome.api.erpnext_compat"] = erpnext_compat_module

    quotation_mapping_module = types.ModuleType("erpnext.selling.doctype.quotation.quotation")
    quotation_mapping_module.make_sales_order = lambda source_name: FakeDoc(
        doctype="Sales Order",
        name=None,
        customer="Test Customer",
        items=[],
        docstatus=0,
    )
    quotation_mapping_module.make_sales_invoice = lambda source_name: FakeDoc(
        doctype="Sales Invoice",
        name=None,
        customer="Test Customer",
        items=[],
        docstatus=0,
    )
    sys.modules["erpnext.selling.doctype.quotation.quotation"] = quotation_mapping_module

    sales_order_mapping_module = types.ModuleType("erpnext.selling.doctype.sales_order.sales_order")
    sales_order_mapping_module.make_delivery_note = lambda source_name: FakeDoc(
        doctype="Delivery Note",
        name="DN-0001",
        customer="Test Customer",
        items=[],
        docstatus=0,
        status="Draft",
    )
    sales_order_mapping_module.make_sales_invoice = lambda source_name: FakeDoc(
        doctype="Sales Invoice",
        name=None,
        customer="Test Customer",
        items=[],
        docstatus=0,
    )
    sys.modules["erpnext.selling.doctype.sales_order.sales_order"] = sales_order_mapping_module

    delivery_note_mapping_module = types.ModuleType("erpnext.stock.doctype.delivery_note.delivery_note")
    delivery_note_mapping_module.make_sales_invoice = lambda source_name: FakeDoc(
        doctype="Sales Invoice",
        name=None,
        customer="Test Customer",
        items=[],
        docstatus=0,
    )
    sys.modules["erpnext.stock.doctype.delivery_note.delivery_note"] = delivery_note_mapping_module

    return original_modules, frappe_module, invoices_module, quotations_module, sales_orders_module


def _restore_modules(original_modules):
    for module_name, original in original_modules.items():
        if original is None:
            sys.modules.pop(module_name, None)
        else:
            sys.modules[module_name] = original


def _load_module():
    module_name = "posawesome.posawesome.api.commercial_flow"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "commercial_flow.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestCommercialFlowApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (
            cls.original_modules,
            cls.frappe,
            cls.invoices_module,
            cls.quotations_module,
            cls.sales_orders_module,
        ) = _install_stubs()
        cls.module = _load_module()

    @classmethod
    def tearDownClass(cls):
        _restore_modules(cls.original_modules)
        sys.modules.pop("posawesome.posawesome.api.commercial_flow", None)

    def test_list_source_documents_adds_allowed_actions_for_quotes(self):
        self.module.search_quotations = lambda **kwargs: [
            {
                "name": "QTN-0001",
                "company": "Test Company",
                "currency": "PKR",
                "docstatus": 0,
                "status": "Draft",
            },
            {
                "name": "QTN-0002",
                "company": "Test Company",
                "currency": "PKR",
                "docstatus": 1,
                "status": "Submitted",
            },
        ]

        rows = self.module.list_source_documents(
            source="quote",
            company="Test Company",
            currency="PKR",
        )

        self.assertEqual(rows[0]["allowed_actions"], ["quote_edit_draft", "quote_submit"])
        self.assertEqual(rows[1]["allowed_actions"], ["quote_to_order", "quote_to_invoice"])
        self.assertEqual(rows[1]["source_doctype"], "Quotation")

    def test_prepare_document_flow_action_for_quote_to_order_builds_flow_context(self):
        self.frappe.get_doc = lambda doctype, name: FakeDoc(
            doctype=doctype,
            name=name,
            customer="Test Customer",
            status="Submitted",
            docstatus=1,
            items=[],
        )

        prepared = self.module.prepare_document_flow_action(
            action="quote_to_order",
            source_doctype="Quotation",
            source_name="QTN-0002",
        )

        self.assertEqual(prepared["prepared_doc"]["doctype"], "Sales Order")
        self.assertEqual(prepared["flow_context"]["prepared_action"], "quote_to_order")
        self.assertEqual(prepared["flow_context"]["target_doctype"], "Sales Order")
        self.assertEqual(prepared["flow_context"]["source_links"]["quotation"], "QTN-0002")

    def test_prepare_order_to_invoice_preserves_vat_inclusive_tax_contract(self):
        def fake_get_doc(doctype, name):
            return FakeDoc(
                doctype=doctype,
                name=name,
                pos_profile="VAT Inclusive POS",
                customer="Test Customer",
                status="To Bill",
                docstatus=1,
                taxes=[
                    {
                        "charge_type": "On Net Total",
                        "included_in_print_rate": 1,
                    }
                ],
                items=[],
            )

        mapped_invoice = FakeDoc(
            doctype="Sales Invoice",
            name=None,
            customer="Test Customer",
            pos_profile=None,
            docstatus=0,
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
            items=[],
            calculate_taxes_and_totals=lambda: None,
        )

        calculate_calls = []

        def calculate_taxes_and_totals():
            calculate_calls.append(mapped_invoice.taxes[0]["included_in_print_rate"])

        mapped_invoice.calculate_taxes_and_totals = calculate_taxes_and_totals

        self.frappe.get_doc = fake_get_doc
        self.frappe.get_cached_value = (
            lambda doctype, name, fieldname: 1
            if (doctype, name, fieldname)
            == ("POS Profile", "VAT Inclusive POS", "posa_tax_inclusive")
            else None
        )

        original_mapper = self.module._get_mapping_functions
        self.module._get_mapping_functions = lambda: {
            "order_to_invoice": lambda source_name: mapped_invoice
        }
        try:
            prepared = self.module.prepare_document_flow_action(
                action="order_to_invoice",
                source_doctype="Sales Order",
                source_name="SO-0001",
            )
        finally:
            self.module._get_mapping_functions = original_mapper

        self.assertEqual(prepared["prepared_doc"]["pos_profile"], "VAT Inclusive POS")
        self.assertEqual(prepared["prepared_doc"]["taxes"][0]["included_in_print_rate"], 1)
        self.assertEqual(prepared["prepared_doc"]["taxes"][1]["included_in_print_rate"], 0)
        self.assertEqual(calculate_calls, [1])

    def test_prepare_document_flow_action_normalizes_draft_quote_customer(self):
        self.frappe.get_doc = lambda doctype, name: FakeDoc(
            doctype=doctype,
            name=name,
            quotation_to="Customer",
            party_name="CUST-0001",
            customer_name="Customer One",
            status="Draft",
            docstatus=0,
            items=[],
        )

        prepared = self.module.prepare_document_flow_action(
            action="quote_edit_draft",
            source_doctype="Quotation",
            source_name="QTN-0001",
        )

        self.assertEqual(prepared["prepared_doc"]["customer"], "CUST-0001")
        self.assertEqual(prepared["prepared_doc"]["party_name"], "CUST-0001")
        self.assertEqual(prepared["source_record"]["customer"], "CUST-0001")

    def test_commit_document_flow_action_creates_and_submits_delivery_note(self):
        self.frappe.get_doc = lambda doctype, name: FakeDoc(
            doctype=doctype,
            name=name,
            customer="Test Customer",
            status="To Deliver and Bill",
            docstatus=1,
            items=[],
        )

        result = self.module.commit_document_flow_action(
            action="order_to_delivery_note",
            source_doctype="Sales Order",
            source_name="SO-0001",
        )

        self.assertEqual(result["target_doctype"], "Delivery Note")
        self.assertEqual(result["result"]["name"], "DN-0001")
        self.assertEqual(result["result"]["docstatus"], 1)
        self.assertEqual(result["flow_context"]["fulfillment_mode"], "delivery")

    def test_as_dict_ignores_non_callable_as_dict_attribute(self):
        row = {"name": "DN-0002", "as_dict": None, "docstatus": 1}

        payload = self.module._as_dict(row)

        self.assertEqual(payload["name"], "DN-0002")
        self.assertIsNone(payload["as_dict"])


if __name__ == "__main__":
    unittest.main()
