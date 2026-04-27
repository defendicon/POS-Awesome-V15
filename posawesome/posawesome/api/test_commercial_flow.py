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

    def save(self):
        self.saved = True

    def submit(self):
        self.submitted = True
        self.docstatus = 1


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    frappe_module.get_list = lambda *args, **kwargs: []
    frappe_module.get_doc = lambda *args, **kwargs: None
    sys.modules["frappe"] = frappe_module

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.cint = lambda value: int(value or 0)
    sys.modules["frappe.utils"] = frappe_utils

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

    return frappe_module, invoices_module, quotations_module, sales_orders_module


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
        cls.frappe, cls.invoices_module, cls.quotations_module, cls.sales_orders_module = _install_stubs()
        cls.module = _load_module()

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
