import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class FakeChildRow(dict):
    def update(self, other=None, **kwargs):
        if other:
            super().update(other)
        if kwargs:
            super().update(kwargs)
        return self


class FakePaymentEntry:
    def __init__(self):
        self.references = []
        self.flags = types.SimpleNamespace(ignore_permissions=False)

    def update(self, other=None, **kwargs):
        if other:
            for key, value in other.items():
                setattr(self, key, value)
        for key, value in kwargs.items():
            setattr(self, key, value)
        return self

    def append(self, fieldname, value):
        row = FakeChildRow()
        if isinstance(value, dict):
            row.update(value)
        getattr(self, fieldname).append(row)
        return row

    def setup_party_account_field(self):
        return None

    def set_missing_values(self):
        return None

    def set_amounts(self):
        return None

    def save(self):
        return None

    def submit(self):
        return None


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    accounts_party = types.ModuleType("erpnext.accounts.party")
    payment_request_module = types.ModuleType(
        "erpnext.accounts.doctype.payment_request.payment_request"
    )
    utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")

    created_docs = []

    frappe_utils.nowdate = lambda: "2026-03-26"
    frappe_utils.flt = lambda value, precision=None: round(
        float(value or 0), precision or 2
    )

    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    frappe_module.get_value = lambda *args, **kwargs: "Main - CC"
    frappe_module.db = types.SimpleNamespace(get_value=lambda *args, **kwargs: None)

    def _make_payment_entry():
        doc = FakePaymentEntry()
        created_docs.append(doc)
        return doc

    frappe_module.new_doc = lambda doctype: _make_payment_entry()

    def _get_doc(payload):
        doc = _make_payment_entry()
        if isinstance(payload, dict):
            doc.update(payload)
        return doc

    frappe_module.get_doc = _get_doc

    accounts_party.get_party_bank_account = lambda *args, **kwargs: None
    payment_request_module.get_dummy_message = lambda *_args, **_kwargs: ""
    payment_request_module.get_existing_payment_request_amount = (
        lambda *_args, **_kwargs: 0
    )
    utilities_module.ensure_child_doctype = lambda *_args, **_kwargs: None

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils
    sys.modules["erpnext.accounts.party"] = accounts_party
    sys.modules[
        "erpnext.accounts.doctype.payment_request.payment_request"
    ] = payment_request_module
    sys.modules["posawesome.posawesome.api.utilities"] = utilities_module

    return created_docs


def _load_payments_module():
    module_name = "posawesome.posawesome.api.payments"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "payments.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestRedeemingCustomerCredit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.created_docs = _install_stubs()
        cls.payments_module = _load_payments_module()

    def setUp(self):
        self.created_docs.clear()

    def test_advance_credit_overpayment_keeps_full_received_amount_and_allocates_only_due(self):
        invoice_doc = types.SimpleNamespace(
            customer="CUST-0001",
            debit_to="Debtors - TC",
            company="Test Company",
            pos_profile="Main POS",
            posa_pos_opening_shift="POS-OPEN-0001",
            name="SINV-0001",
        )
        data = {
            "redeemed_customer_credit": 50,
            "customer_credit_dict": [
                {
                    "type": "Advance",
                    "credit_origin": "ACC-PAY-0001",
                    "credit_to_redeem": 50,
                }
            ],
            "due_date": "2026-03-26",
        }
        payments = [
            types.SimpleNamespace(
                amount=10,
                account="Cash - TC",
                mode_of_payment="Cash",
            )
        ]

        self.payments_module.redeeming_customer_credit(
            invoice_doc=invoice_doc,
            data=data,
            is_payment_entry=1,
            total_cash=6,
            cash_account={"account": "Cash - TC"},
            payments=payments,
        )

        self.assertEqual(len(self.created_docs), 1)
        payment_entry = self.created_docs[0]
        self.assertEqual(payment_entry.paid_amount, 10)
        self.assertEqual(payment_entry.received_amount, 10)
        self.assertEqual(len(payment_entry.references), 1)
        self.assertEqual(payment_entry.references[0]["allocated_amount"], 6)


if __name__ == "__main__":
    unittest.main()
