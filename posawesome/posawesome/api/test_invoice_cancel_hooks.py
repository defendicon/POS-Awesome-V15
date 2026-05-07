import importlib.util
import pathlib
import sys
import types
import unittest
from types import SimpleNamespace


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
HOOKS_PATH = REPO_ROOT / "posawesome" / "hooks.py"
INVOICE_API_PATH = REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice.py"
INVOICES_API_PATH = REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoices.py"


def _install_invoice_api_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils_module = types.ModuleType("frappe.utils")
    frappe_model_module = types.ModuleType("frappe.model")
    frappe_mapper_module = types.ModuleType("frappe.model.mapper")
    utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")
    payments_module = types.ModuleType("posawesome.posawesome.api.payments")
    delivery_charges_module = types.ModuleType(
        "posawesome.posawesome.doctype.delivery_charges.delivery_charges"
    )
    pos_coupon_module = types.ModuleType("posawesome.posawesome.doctype.pos_coupon.pos_coupon")

    state = {
        "get_all_calls": [],
        "delete_doc_calls": [],
        "ledger_names": [],
    }

    def get_all(*args, **kwargs):
        state["get_all_calls"].append((args, kwargs))
        return list(state["ledger_names"])

    def delete_doc(*args, **kwargs):
        state["delete_doc_calls"].append((args, kwargs))

    frappe_module._ = lambda text: text
    frappe_module.get_all = get_all
    frappe_module.delete_doc = delete_doc
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.get_value = lambda *args, **kwargs: None
    frappe_module.msgprint = lambda *args, **kwargs: None
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.log_error = lambda *args, **kwargs: None
    frappe_module.get_traceback = lambda: "traceback"
    frappe_module.db = SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
        exists=lambda *args, **kwargs: False,
    )

    frappe_utils_module.add_days = lambda date, days: date
    frappe_utils_module.flt = lambda value, precision=None: float(value or 0)
    frappe_utils_module.get_url_to_form = lambda doctype, name: f"/app/{doctype}/{name}"
    frappe_module.utils = frappe_utils_module

    frappe_mapper_module.get_mapped_doc = lambda *args, **kwargs: None
    utilities_module.get_company_domain = lambda company: None
    payments_module.get_posawesome_credit_redeem_remark = lambda invoice_name: f"redeem {invoice_name}"
    delivery_charges_module.get_applicable_delivery_charges = lambda *args, **kwargs: []
    pos_coupon_module.update_coupon_code_count = lambda *args, **kwargs: None

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils_module
    sys.modules["frappe.model"] = frappe_model_module
    sys.modules["frappe.model.mapper"] = frappe_mapper_module
    sys.modules["posawesome.posawesome.api.utilities"] = utilities_module
    sys.modules["posawesome.posawesome.api.payments"] = payments_module
    sys.modules[
        "posawesome.posawesome.doctype.delivery_charges.delivery_charges"
    ] = delivery_charges_module
    sys.modules["posawesome.posawesome.doctype.pos_coupon.pos_coupon"] = pos_coupon_module

    return state


def _load_invoice_api_module():
    module_name = "posawesome.posawesome.api.invoice"
    spec = importlib.util.spec_from_file_location(module_name, INVOICE_API_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestInvoiceCancelHooks(unittest.TestCase):
    def test_sales_invoice_cancel_hook_restores_gift_cards(self):
        hooks = HOOKS_PATH.read_text()

        self.assertIn('"Sales Invoice": {', hooks)
        self.assertIn('"on_cancel": "posawesome.posawesome.api.invoice.on_cancel"', hooks)

    def test_pos_invoice_cancel_hook_restores_gift_cards(self):
        hooks = HOOKS_PATH.read_text()

        self.assertIn('"POS Invoice": {', hooks)
        self.assertIn('"on_cancel": "posawesome.posawesome.api.invoice.on_cancel"', hooks)

    def test_cancel_hook_deletes_matching_submission_ledger_entries(self):
        state = _install_invoice_api_stubs()
        invoice_api = _load_invoice_api_module()
        state["ledger_names"] = ["ledger-1", "ledger-2"]
        called = {"credit": False, "gift_cards": False}

        invoice_api.cancel_posawesome_credit_journal_entries = lambda doc: called.update(credit=True)
        invoice_api.restore_posawesome_gift_card_redemptions = lambda doc: called.update(gift_cards=True)

        invoice_api.on_cancel(SimpleNamespace(doctype="Sales Invoice", name="SINV-0001"), None)

        self.assertTrue(called["credit"])
        self.assertTrue(called["gift_cards"])
        self.assertEqual(
            state["get_all_calls"][0],
            (
                ("POS Invoice Submission Ledger",),
                {
                    "filters": {
                        "document_type": "Sales Invoice",
                        "invoice_name": "SINV-0001",
                    },
                    "pluck": "name",
                },
            ),
        )
        self.assertEqual(
            state["delete_doc_calls"],
            [
                (
                    ("POS Invoice Submission Ledger", "ledger-1"),
                    {"force": True, "ignore_permissions": True},
                ),
                (
                    ("POS Invoice Submission Ledger", "ledger-2"),
                    {"force": True, "ignore_permissions": True},
                ),
            ],
        )

    def test_submission_ledger_cleanup_ignores_missing_invoice_identity(self):
        state = _install_invoice_api_stubs()
        invoice_api = _load_invoice_api_module()

        invoice_api.delete_invoice_submission_ledger_entries_for_invoice(None, "SINV-0001")
        invoice_api.delete_invoice_submission_ledger_entries_for_invoice("Sales Invoice", None)

        self.assertEqual(state["get_all_calls"], [])
        self.assertEqual(state["delete_doc_calls"], [])

    def test_delete_invoice_api_cleans_submission_ledger_after_delete(self):
        source = INVOICES_API_PATH.read_text()

        self.assertIn(
            "delete_invoice_submission_ledger_entries_for_invoice(doctype, invoice)",
            source,
        )


if __name__ == "__main__":
    unittest.main()
