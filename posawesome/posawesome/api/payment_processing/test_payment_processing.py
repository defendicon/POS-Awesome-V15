import json
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


class AttrDict(dict):
    __getattr__ = dict.get


class FakePaymentEntry:
    def __init__(self, name="ACC-PAY-TEST-0001", paid_amount=0):
        self.name = name
        self.paid_amount = paid_amount
        self.amount = paid_amount
        self.references = []
        self.total_allocated_amount = None
        self.unallocated_amount = None
        self.difference_amount = None
        self.saved = False
        self.submitted = False

    def append(self, fieldname, value):
        if fieldname == "references":
            self.references.append(value)

    def save(self, ignore_permissions=False):
        self.saved = ignore_permissions

    def submit(self):
        self.submitted = True

    def get(self, key, default=None):
        return getattr(self, key, default)


def _install_framework_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.nowdate = lambda: "2026-03-13"
    frappe_utils.getdate = lambda value: value
    frappe_utils.flt = lambda value, precision=None: float(value or 0)
    frappe_utils.fmt_money = lambda value, currency=None: f"{currency or ''} {value}".strip()
    frappe_utils.cint = lambda value: int(value or 0)

    frappe_module._ = lambda text: text
    frappe_module._dict = lambda value: AttrDict(value)
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.log_error = lambda *args, **kwargs: None
    frappe_module.logger = lambda: types.SimpleNamespace(info=lambda *args, **kwargs: None)
    frappe_module.msgprint = lambda *args, **kwargs: None
    frappe_module.get_cached_value = lambda *args, **kwargs: None
    frappe_module.get_list = lambda *args, **kwargs: []
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.get_cached_doc = lambda *args, **kwargs: None
    frappe_module.new_doc = lambda *args, **kwargs: None
    frappe_module.db = types.SimpleNamespace(sql=lambda *args, **kwargs: [], get_value=lambda *args, **kwargs: None)
    frappe_module.utils = frappe_utils

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils

    erpnext_module = types.ModuleType("erpnext")
    erpnext_module.get_default_cost_center = lambda company: "Main - TC"
    sys.modules["erpnext"] = erpnext_module

    accounts_party = types.ModuleType("erpnext.accounts.party")
    accounts_party.get_party_account = lambda *args, **kwargs: "Debtors - TC"
    sys.modules["erpnext.accounts.party"] = accounts_party

    accounts_utils = types.ModuleType("erpnext.accounts.utils")
    accounts_utils.get_outstanding_invoices = lambda *args, **kwargs: []
    accounts_utils.reconcile_against_document = lambda *args, **kwargs: None
    accounts_utils.get_account_currency = lambda *args, **kwargs: "USD"
    sys.modules["erpnext.accounts.utils"] = accounts_utils

    setup_utils = types.ModuleType("erpnext.setup.utils")
    setup_utils.get_exchange_rate = lambda *args, **kwargs: 1
    sys.modules["erpnext.setup.utils"] = setup_utils

    bank_account_module = types.ModuleType("erpnext.accounts.doctype.bank_account.bank_account")
    bank_account_module.get_party_bank_account = lambda *args, **kwargs: None
    sys.modules["erpnext.accounts.doctype.bank_account.bank_account"] = bank_account_module

    journal_entry_module = types.ModuleType("erpnext.accounts.doctype.journal_entry.journal_entry")
    journal_entry_module.get_default_bank_cash_account = (
        lambda company, account_type, mode_of_payment=None, account=None: types.SimpleNamespace(
            account="Cash - TC",
            account_currency="USD",
            get=lambda key, default=None: getattr(
                types.SimpleNamespace(account="Cash - TC", account_currency="USD"), key, default
            ),
        )
    )
    sys.modules["erpnext.accounts.doctype.journal_entry.journal_entry"] = journal_entry_module

    payment_reconciliation_module = types.ModuleType(
        "erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation"
    )
    payment_reconciliation_module.reconcile_dr_cr_note = lambda *args, **kwargs: None
    sys.modules[
        "erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation"
    ] = payment_reconciliation_module

    accounts_controller_module = types.ModuleType("erpnext.controllers.accounts_controller")
    accounts_controller_module.get_advance_payment_entries_for_regional = lambda *args, **kwargs: []
    sys.modules["erpnext.controllers.accounts_controller"] = accounts_controller_module

    mpesa_module = types.ModuleType("posawesome.posawesome.api.m_pesa")
    mpesa_module.submit_mpesa_payment = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.m_pesa"] = mpesa_module


def _install_package_stubs():
    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
        "posawesome.posawesome.api.payment_processing": (
            REPO_ROOT / "posawesome" / "posawesome" / "api" / "payment_processing"
        ),
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


def _load_module(module_name, file_path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestPosPaymentProcessing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_framework_stubs()
        _install_package_stubs()
        payment_processing_dir = REPO_ROOT / "posawesome" / "posawesome" / "api" / "payment_processing"
        _load_module(
            "posawesome.posawesome.api.payment_processing.utils",
            payment_processing_dir / "utils.py",
        )
        _load_module(
            "posawesome.posawesome.api.payment_processing.creation",
            payment_processing_dir / "creation.py",
        )
        cls.data = _load_module(
            "posawesome.posawesome.api.payment_processing.data",
            payment_processing_dir / "data.py",
        )
        cls.processor = _load_module(
            "posawesome.posawesome.api.payment_processing.processor",
            payment_processing_dir / "processor.py",
        )

    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_keeps_new_payment_unallocated_without_selected_invoices(
        self,
        mock_frappe,
        mock_create_payment_entry,
    ):
        fake_payment_entry = FakePaymentEntry(paid_amount=100)
        mock_create_payment_entry.return_value = fake_payment_entry
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()

        payload = {
            "customer": "Customer 727",
            "company": "Test Company",
            "currency": "USD",
            "pos_profile_name": "Main POS",
            "pos_opening_shift_name": "POS-OPEN-0001",
            "selected_invoices": [],
            "selected_payments": [],
            "selected_mpesa_payments": [],
            "payment_methods": [{"mode_of_payment": "Cash", "amount": 100}],
            "total_selected_invoices": 0,
            "total_selected_payments": 0,
            "total_selected_mpesa_payments": 0,
            "total_payment_methods": 100,
            "exchange_rate": None,
            "pos_profile": {
                "posa_use_pos_awesome_payments": 1,
                "posa_allow_make_new_payments": 1,
                "posa_allow_reconcile_payments": 1,
                "posa_allow_mpesa_reconcile_payments": 0,
                "cost_center": "Main - TC",
            },
        }

        self.processor.process_pos_payment(json.dumps(payload))

        self.assertEqual(fake_payment_entry.references, [])
        self.assertEqual(fake_payment_entry.total_allocated_amount, 0)
        self.assertEqual(fake_payment_entry.unallocated_amount, 100)
        self.assertEqual(fake_payment_entry.difference_amount, 100)

    @patch("posawesome.posawesome.api.payment_processing.data.frappe")
    def test_get_customer_payments_made_as_outstanding_returns_pay_type_entries(
        self,
        mock_frappe,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.get_list.return_value = [
            {
                "name": "ACC-PAY-2025-00484",
                "customer_name": "Customer 727",
                "posting_date": "2026-03-02",
                "paid_amount": 50,
                "received_amount": 50,
                "unallocated_amount": 50,
                "mode_of_payment": "Cash",
                "currency": "USD",
                "account": "Debtors - TC",
            }
        ]

        rows = self.data._get_customer_payments_made_as_outstanding(
            customer="Customer 727",
            company="Test Company",
            currency="USD",
            include_all_currencies=True,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("voucher_type"), "Payment Entry")
        self.assertEqual(rows[0].get("voucher_no"), "ACC-PAY-2025-00484")


if __name__ == "__main__":
    unittest.main()
