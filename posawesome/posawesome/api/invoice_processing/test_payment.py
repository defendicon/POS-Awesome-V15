import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


class FakePaymentEntry:
    def __init__(self):
        self.references = []
        self.flags = types.SimpleNamespace(ignore_permissions=False)
        self.saved = False
        self.submitted = False
        self.name = None

    def append(self, fieldname, value):
        target = getattr(self, fieldname)
        target.append(dict(value))
        return target[-1]

    def setup_party_account_field(self):
        return None

    def set_missing_values(self):
        return None

    def set_amounts(self):
        return None

    def save(self):
        if not self.name:
            self.name = f"ACC-PAY-TEST-{id(self)}"
        self.saved = True
        return self

    def submit(self):
        self.submitted = True
        return self


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    sales_invoice_module = types.ModuleType(
        "erpnext.accounts.doctype.sales_invoice.sales_invoice"
    )
    accounts_utils_module = types.ModuleType("erpnext.accounts.utils")
    payment_utils_module = types.ModuleType(
        "posawesome.posawesome.api.payment_processing.utils"
    )

    created_entries = []
    reconcile_calls = []

    class _FrappeDict(dict):
        pass

    frappe_utils.cint = lambda value: int(value or 0)
    frappe_utils.flt = lambda value, precision=None: round(
        float(value or 0), precision or 2
    )
    frappe_utils.getdate = lambda value: value
    frappe_utils.nowdate = lambda: "2026-03-26"

    frappe_module._ = lambda text: text
    frappe_module._dict = _FrappeDict
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    frappe_module.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: "Cash",
    )

    def _new_doc(doctype):
        if doctype != "Payment Entry":
            raise AssertionError(f"Unexpected doctype: {doctype}")
        entry = FakePaymentEntry()
        created_entries.append(entry)
        return entry

    def _get_doc(doctype, name):
        if doctype != "Payment Entry":
            raise AssertionError(f"Unexpected doctype lookup: {doctype}")
        return types.SimpleNamespace(
            doctype="Payment Entry",
            name=name,
            party_type="Customer",
            party="CUST-0001",
            paid_to="Debtors - TC",
            unallocated_amount=410,
            cost_center="Main - TC",
        )

    frappe_module.new_doc = _new_doc
    frappe_module.get_doc = _get_doc
    frappe_module.scrub = lambda value: str(value or "").strip().lower().replace(" ", "_")

    sales_invoice_module.get_bank_cash_account = (
        lambda *_args, **_kwargs: {"account": "Cash"}
    )
    accounts_utils_module.reconcile_against_document = (
        lambda args, *extra, **kwargs: reconcile_calls.append(
            {
                "args": [dict(row) for row in args],
                "extra": extra,
                "kwargs": kwargs,
            }
        )
    )
    payment_utils_module.get_party_account = (
        lambda *_args, **_kwargs: "Debtors - TC"
    )
    payment_utils_module.get_bank_cash_account = (
        lambda *_args, **_kwargs: {"account": "Cash"}
    )

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils
    sys.modules[
        "erpnext.accounts.doctype.sales_invoice.sales_invoice"
    ] = sales_invoice_module
    sys.modules["erpnext.accounts.utils"] = accounts_utils_module
    sys.modules[
        "posawesome.posawesome.api.payment_processing.utils"
    ] = payment_utils_module

    return created_entries, reconcile_calls


def _install_package_stubs():
    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
        "posawesome.posawesome.api.invoice_processing": (
            REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice_processing"
        ),
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


def _load_module():
    module_name = "posawesome.posawesome.api.invoice_processing.payment"
    file_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "api"
        / "invoice_processing"
        / "payment.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class FakeInvoiceDoc:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def get(self, key, default=None):
        return getattr(self, key, default)


class TestCreateChangePaymentEntries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.created_entries, cls.reconcile_calls = _install_stubs()
        _install_package_stubs()
        cls.module = _load_module()

    def setUp(self):
        self.created_entries.clear()
        self.reconcile_calls.clear()

    def test_paid_change_entry_is_created_without_invoice_allocation(self):
        invoice_doc = FakeInvoiceDoc(
            docstatus=1,
            doctype="Sales Invoice",
            name="SINV-0001",
            customer="CUST-0001",
            company="Test Company",
            debit_to="Debtors - TC",
            posting_date="2026-03-26",
            posa_pos_opening_shift="POS-OPEN-0001",
            payments=[
                {
                    "amount": 10,
                    "type": "Bank",
                    "mode_of_payment": "Card",
                    "account": "Card - TC",
                }
            ],
        )

        self.module._create_change_payment_entries(
            invoice_doc,
            {"paid_change": 4, "credit_change": 0},
            pos_profile="Main POS",
            cash_account={"account": "Cash"},
        )

        self.assertEqual(len(self.created_entries), 1)
        entry = self.created_entries[0]
        self.assertEqual(entry.payment_type, "Pay")
        self.assertEqual(entry.paid_amount, 4)
        self.assertEqual(entry.received_amount, 4)
        self.assertEqual(entry.references, [])

    def test_paid_change_entry_reconciles_against_source_receive_payment_entry(self):
        invoice_doc = FakeInvoiceDoc(
            docstatus=1,
            doctype="Sales Invoice",
            name="SINV-0001",
            customer="CUST-0001",
            company="Test Company",
            debit_to="Debtors - TC",
            posting_date="2026-03-26",
            posa_pos_opening_shift="POS-OPEN-0001",
            payments=[
                {
                    "amount": 1000,
                    "type": "Cash",
                    "mode_of_payment": "Cash",
                    "account": "Cash",
                }
            ],
        )

        self.module._create_change_payment_entries(
            invoice_doc,
            {
                "paid_change": 410,
                "credit_change": 0,
                "created_receive_payment_entries": [
                    {
                        "name": "ACC-PAY-RECEIVE-0001",
                        "mode_of_payment": "Cash",
                        "account": "Cash",
                        "unallocated_amount": 410,
                    }
                ],
            },
            pos_profile="Main POS",
            cash_account={"account": "Cash"},
        )

        self.assertEqual(len(self.created_entries), 1)
        entry = self.created_entries[0]
        self.assertEqual(entry.payment_type, "Pay")
        self.assertEqual(entry.references, [])
        self.assertEqual(len(self.reconcile_calls), 1)
        reconcile_args = self.reconcile_calls[0]["args"]
        self.assertEqual(len(reconcile_args), 1)
        self.assertEqual(reconcile_args[0]["voucher_type"], "Payment Entry")
        self.assertEqual(reconcile_args[0]["voucher_no"], "ACC-PAY-RECEIVE-0001")
        self.assertEqual(reconcile_args[0]["against_voucher_type"], "Payment Entry")
        self.assertEqual(reconcile_args[0]["against_voucher"], entry.name)
        self.assertEqual(reconcile_args[0]["allocated_amount"], 410)
        self.assertEqual(reconcile_args[0]["account"], "Debtors - TC")
        self.assertEqual(reconcile_args[0]["party_type"], "Customer")
        self.assertEqual(reconcile_args[0]["party"], "CUST-0001")
        self.assertEqual(reconcile_args[0]["dr_or_cr"], "credit_in_account_currency")

    def test_credit_change_entry_is_created_without_invoice_allocation(self):
        invoice_doc = FakeInvoiceDoc(
            docstatus=1,
            doctype="Sales Invoice",
            name="SINV-0002",
            customer="CUST-0001",
            company="Test Company",
            debit_to="Debtors - TC",
            posting_date="2026-03-26",
            posa_pos_opening_shift="POS-OPEN-0001",
            payments=[
                {
                    "amount": 100,
                    "type": "Bank",
                    "mode_of_payment": "Card",
                    "account": "Card - TC",
                }
            ],
        )

        self.module._create_change_payment_entries(
            invoice_doc,
            {"paid_change": 0, "credit_change": 4},
            pos_profile="Main POS",
            cash_account={"account": "Cash"},
        )

        self.assertEqual(len(self.created_entries), 1)
        entry = self.created_entries[0]
        self.assertEqual(entry.payment_type, "Receive")
        self.assertEqual(entry.paid_amount, 4)
        self.assertEqual(entry.received_amount, 4)
        self.assertEqual(entry.references, [])


if __name__ == "__main__":
    unittest.main()
