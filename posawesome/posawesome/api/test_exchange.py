import importlib.util
import json
import pathlib
import sys
import types
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_ORIGINAL_MODULES = dict(sys.modules)


def tearDownModule():
    for name in list(sys.modules):
        if name.startswith(("frappe", "posawesome")) and name not in _ORIGINAL_MODULES:
            sys.modules.pop(name, None)
    for name, module in _ORIGINAL_MODULES.items():
        if name.startswith(("frappe", "posawesome")):
            sys.modules[name] = module


class AttrDict(dict):
    __getattr__ = dict.get

    def as_dict(self):
        return AttrDict(self)


def _load_exchange_module():
    frappe = types.ModuleType("frappe")
    frappe._ = lambda text: text
    frappe._dict = lambda value=None: AttrDict(value or {})
    frappe.parse_json = json.loads
    frappe.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe.throw = lambda message, *args, **kwargs: (_ for _ in ()).throw(ValueError(message))
    frappe.db = types.SimpleNamespace(exists=lambda *args, **kwargs: False)
    sys.modules["frappe"] = frappe

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.cint = lambda value: int(value or 0)
    frappe_utils.cstr = lambda value: "" if value is None else str(value)
    frappe_utils.flt = lambda value, *_args, **_kwargs: float(value or 0)
    sys.modules["frappe.utils"] = frappe_utils

    frappe_model = types.ModuleType("frappe.model")
    frappe_document = types.ModuleType("frappe.model.document")
    frappe_document.Document = type("Document", (), {})
    sys.modules["frappe.model"] = frappe_model
    sys.modules["frappe.model.document"] = frappe_document

    creation = types.ModuleType("posawesome.posawesome.api.invoice_processing.creation")
    creation.submit_invoice = lambda *args, **kwargs: None
    sys.modules[creation.__name__] = creation

    pos_access = types.ModuleType("posawesome.posawesome.api.pos_access")
    pos_access.get_authorized_pos_profile = lambda *args, **kwargs: None
    sys.modules[pos_access.__name__] = pos_access

    module_name = "posawesome.posawesome.api.exchange"
    module_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "exchange.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _load_pos_item_exchange_module():
    module_name = "posawesome.posawesome.doctype.pos_item_exchange.pos_item_exchange"
    module_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "doctype"
        / "pos_item_exchange"
        / "pos_item_exchange.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestExchangeValidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exchange = _load_exchange_module()
        cls.exchange_doctype = _load_pos_item_exchange_module()

    def setUp(self):
        self.profile = AttrDict(
            name="Main POS",
            company="Example Co",
            posa_allow_return=1,
            posa_allow_item_exchange=1,
            create_pos_invoice_instead_of_sales_invoice=0,
        )
        self.return_invoice = AttrDict(
            doctype="Sales Invoice",
            company="Example Co",
            pos_profile="Main POS",
            customer="Customer A",
            currency="PKR",
            is_return=1,
            return_against="SINV-0001",
            items=[{"item_code": "OLD", "qty": -1}],
            payments=[{"amount": 0}],
        )
        self.sale_invoice = AttrDict(
            doctype="Sales Invoice",
            company="Example Co",
            pos_profile="Main POS",
            customer="Customer A",
            currency="PKR",
            is_return=0,
            items=[{"item_code": "NEW", "qty": 1}],
            payments=[{"amount": 500}],
        )

    def test_accepts_linked_sales_invoice_exchange(self):
        self.exchange._validate_exchange_payload(
            self.return_invoice,
            self.sale_invoice,
            self.profile,
        )

    def test_rejects_cross_customer_exchange(self):
        self.sale_invoice["customer"] = "Customer B"
        with self.assertRaisesRegex(ValueError, "same customer"):
            self.exchange._validate_exchange_payload(
                self.return_invoice,
                self.sale_invoice,
                self.profile,
            )

    def test_rejects_cash_refund_inside_return_credit(self):
        self.return_invoice["payments"] = [{"amount": -100}]
        with self.assertRaisesRegex(ValueError, "direct cash refund"):
            self.exchange._validate_exchange_payload(
                self.return_invoice,
                self.sale_invoice,
                self.profile,
            )

    def test_rejects_any_nonzero_cash_refund_inside_return_credit(self):
        self.return_invoice["payments"] = [{"amount": -0.0001}]
        with self.assertRaisesRegex(ValueError, "direct cash refund"):
            self.exchange._validate_exchange_payload(
                self.return_invoice,
                self.sale_invoice,
                self.profile,
            )

    def test_rejects_exchange_when_returns_are_disabled(self):
        self.profile["posa_allow_return"] = 0
        with self.assertRaisesRegex(ValueError, "Returns are not enabled"):
            self.exchange._validate_exchange_payload(
                self.return_invoice,
                self.sale_invoice,
                self.profile,
            )

    def test_rejects_pos_invoice_mode_until_reconciliation_is_supported(self):
        self.profile["create_pos_invoice_instead_of_sales_invoice"] = 1
        with self.assertRaisesRegex(ValueError, "requires the POS Profile to create Sales Invoices"):
            self.exchange._validate_exchange_payload(
                self.return_invoice,
                self.sale_invoice,
                self.profile,
            )

    def test_accepts_fully_closed_exchange_settlement(self):
        return_doc = AttrDict(outstanding_amount=0)
        sale_doc = AttrDict(outstanding_amount=0)
        self.exchange._validate_final_settlement(return_doc, sale_doc, 1500, 1600)

    def test_accepts_remaining_customer_credit(self):
        return_doc = AttrDict(outstanding_amount=-400)
        sale_doc = AttrDict(outstanding_amount=0)
        self.exchange._validate_final_settlement(return_doc, sale_doc, 2000, 1600)

    def test_rejects_unpaid_replacement_difference(self):
        return_doc = AttrDict(outstanding_amount=0)
        sale_doc = AttrDict(outstanding_amount=100)
        with self.assertRaisesRegex(ValueError, "did not close correctly"):
            self.exchange._validate_final_settlement(return_doc, sale_doc, 1500, 1600)

    def test_settlement_tolerance_uses_document_currency_precision(self):
        class PrecisionDoc(AttrDict):
            def precision(self, _fieldname):
                return 3

        within_rounding = PrecisionDoc(outstanding_amount=0.0004)
        closed_return = PrecisionDoc(outstanding_amount=0)
        self.exchange._validate_final_settlement(
            closed_return,
            within_rounding,
            50,
            50,
        )

        outside_rounding = PrecisionDoc(outstanding_amount=0.0006)
        with self.assertRaisesRegex(ValueError, "did not close correctly"):
            self.exchange._validate_final_settlement(
                closed_return,
                outside_rounding,
                50,
                50,
            )

    def test_accepts_submitted_return_and_replacement_documents(self):
        return_doc = AttrDict(is_return=1, return_against="SINV-0001")
        sale_doc = AttrDict(is_return=0)
        self.exchange._validate_submitted_exchange_documents(
            return_doc,
            sale_doc,
            "SINV-0001",
        )

    def test_rejects_exchange_when_return_document_is_a_normal_sale(self):
        return_doc = AttrDict(is_return=0, return_against="SINV-0001")
        sale_doc = AttrDict(is_return=0)
        with self.assertRaisesRegex(ValueError, "not created as a return invoice"):
            self.exchange._validate_submitted_exchange_documents(
                return_doc,
                sale_doc,
                "SINV-0001",
            )

    def test_rejects_exchange_when_return_link_is_wrong(self):
        return_doc = AttrDict(is_return=1, return_against="SINV-OTHER")
        sale_doc = AttrDict(is_return=0)
        with self.assertRaisesRegex(ValueError, "not linked"):
            self.exchange._validate_submitted_exchange_documents(
                return_doc,
                sale_doc,
                "SINV-0001",
            )

    def test_existing_exchange_must_match_authorized_pos_profile(self):
        exchange_doc = AttrDict(company="Other Co", pos_profile="Other POS")
        with self.assertRaisesRegex(ValueError, "does not belong"):
            self.exchange._authorize_existing_exchange(exchange_doc, self.profile)

    def test_recovers_completed_exchange_by_idempotency_key(self):
        exchange_doc = AttrDict(
            name="POS-EXCH-00001",
            status="Completed",
            company="Example Co",
            pos_profile="Main POS",
            invoice_type="Sales Invoice",
            return_invoice="SINV-RETURN",
            replacement_invoice="SINV-NEW",
            return_total=50,
            sale_total=50,
            difference_amount=0,
            allocated_amount=50,
            settlement_type="Even Exchange",
        )
        return_doc = AttrDict(name="SINV-RETURN", items=[])
        sale_doc = AttrDict(name="SINV-NEW", items=[])
        frappe = sys.modules["frappe"]
        self.exchange._existing_exchange = lambda request_id: exchange_doc
        self.exchange.get_authorized_pos_profile = lambda *args, **kwargs: self.profile
        frappe.get_doc = lambda doctype, name: (
            return_doc if name == "SINV-RETURN" else sale_doc
        )

        result = self.exchange.get_item_exchange("exchange-request-1", "Main POS")

        self.assertEqual(result["exchange_reference"], "POS-EXCH-00001")
        self.assertEqual(result["exchange_status"], "Completed")
        self.assertEqual(result["return_invoice"], "SINV-RETURN")
        self.assertEqual(result["replacement_invoice"], "SINV-NEW")
        self.assertEqual(result["exchange_summary"]["currency_precision"], 2)

    def test_cancel_exchange_reverses_linked_documents_in_dependency_order(self):
        cancelled = []

        class LinkedDoc(AttrDict):
            def cancel(self):
                cancelled.append((self.doctype, self.name))
                self["docstatus"] = 2

        class ExchangeDoc(AttrDict):
            def check_permission(self, permission_type):
                self["checked_permission"] = permission_type

            def db_set(self, fieldname, value, update_modified=False):
                self[fieldname] = value
                self["update_modified"] = update_modified

        exchange_doc = ExchangeDoc(
            name="POS-EXCH-00001",
            status="Completed",
            invoice_type="Sales Invoice",
            reconciliation_journal="JV-0001",
            replacement_invoice="SINV-NEW",
            return_invoice="SINV-RETURN",
        )
        documents = {
            ("Journal Entry", "JV-0001"): LinkedDoc(
                doctype="Journal Entry",
                name="JV-0001",
                docstatus=1,
                flags=types.SimpleNamespace(ignore_permissions=False),
            ),
            ("Sales Invoice", "SINV-NEW"): LinkedDoc(
                doctype="Sales Invoice",
                name="SINV-NEW",
                docstatus=1,
                flags=types.SimpleNamespace(ignore_permissions=False),
            ),
            ("Sales Invoice", "SINV-RETURN"): LinkedDoc(
                doctype="Sales Invoice",
                name="SINV-RETURN",
                docstatus=1,
                flags=types.SimpleNamespace(ignore_permissions=False),
            ),
        }
        frappe = sys.modules["frappe"]
        frappe.get_doc = lambda doctype, name: (
            exchange_doc
            if (doctype, name) == ("POS Item Exchange", exchange_doc.name)
            else documents[(doctype, name)]
        )
        frappe.db.exists = lambda doctype, name: (doctype, name) in documents
        frappe.db.get_value = lambda doctype, name, fieldname: documents[
            (doctype, name)
        ].get(fieldname)

        result = self.exchange_doctype.cancel_item_exchange(exchange_doc.name)

        self.assertEqual(
            cancelled,
            [
                ("Journal Entry", "JV-0001"),
                ("Sales Invoice", "SINV-NEW"),
                ("Sales Invoice", "SINV-RETURN"),
            ],
        )
        self.assertEqual(exchange_doc.status, "Cancelled")
        self.assertEqual(exchange_doc.checked_permission, "delete")
        self.assertTrue(exchange_doc.update_modified)
        self.assertEqual(result["status"], "Cancelled")
        self.assertTrue(
            all(doc.flags.ignore_permissions for doc in documents.values())
        )

    def test_delete_requires_cancelled_exchange_with_no_submitted_documents(self):
        exchange_doc = AttrDict(
            status="Completed",
            invoice_type="Sales Invoice",
            replacement_invoice="SINV-NEW",
        )
        with self.assertRaisesRegex(ValueError, "Cancel the item exchange"):
            self.exchange_doctype.POSItemExchange.on_trash(exchange_doc)

        exchange_doc["status"] = "Cancelled"
        frappe = sys.modules["frappe"]
        frappe.db.exists = lambda doctype, name: True
        frappe.db.get_value = lambda doctype, name, fieldname: 1
        with self.assertRaisesRegex(ValueError, "linked documents are submitted"):
            self.exchange_doctype.POSItemExchange.on_trash(exchange_doc)

        frappe.db.get_value = lambda doctype, name, fieldname: 2
        self.exchange_doctype.POSItemExchange.on_trash(exchange_doc)


if __name__ == "__main__":
    unittest.main()
