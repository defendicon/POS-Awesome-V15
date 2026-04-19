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
        cls.reconciliation = _load_module(
            "posawesome.posawesome.api.payment_processing.reconciliation",
            payment_processing_dir / "reconciliation.py",
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

    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_uses_payload_posting_date_for_new_entries(
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
            "posting_date": "2026-03-29",
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

        mock_create_payment_entry.assert_called_once()
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["posting_date"],
            "2026-03-29",
        )
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["reference_date"],
            "2026-03-29",
        )

    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_passes_supplier_pay_context_to_creation(
        self,
        mock_frappe,
        mock_create_payment_entry,
    ):
        fake_payment_entry = FakePaymentEntry(paid_amount=250)
        mock_create_payment_entry.return_value = fake_payment_entry
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()

        payload = {
            "customer": "Supp-001",
            "party": "Supp-001",
            "party_type": "Supplier",
            "payment_type": "Pay",
            "company": "Test Company",
            "currency": "USD",
            "pos_profile_name": "Main POS",
            "pos_opening_shift_name": "POS-OPEN-0001",
            "posting_date": "2026-03-30",
            "selected_invoices": [],
            "selected_payments": [],
            "selected_mpesa_payments": [],
            "payment_methods": [{"mode_of_payment": "Bank", "amount": 250}],
            "total_selected_invoices": 0,
            "total_selected_payments": 0,
            "total_selected_mpesa_payments": 0,
            "total_payment_methods": 250,
            "exchange_rate": None,
            "pos_profile": {
                "posa_use_pos_awesome_payments": 1,
                "posa_allow_make_new_payments": 1,
                "posa_allow_reconcile_payments": 0,
                "posa_allow_mpesa_reconcile_payments": 0,
                "cost_center": "Main - TC",
            },
        }

        self.processor.process_pos_payment(json.dumps(payload))

        mock_create_payment_entry.assert_called_once()
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["party_type"],
            "Supplier",
        )
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["payment_type"],
            "Pay",
        )
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["party"],
            "Supp-001",
        )

    @patch(
        "posawesome.posawesome.api.payment_processing.processor.find_payment_entries_by_client_request_id"
    )
    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_returns_existing_entries_for_same_client_request_id(
        self,
        mock_frappe,
        mock_create_payment_entry,
        mock_find_existing_entries,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_find_existing_entries.return_value = [
            {
                "name": "ACC-PAY-IDEMP-0001",
                "paid_amount": 100,
                "received_amount": 100,
                "posting_date": "2026-03-30",
                "mode_of_payment": "Cash",
                "party": "Customer 727",
                "party_type": "Customer",
                "docstatus": 1,
                "posa_client_request_id": "pay-fixed-001",
            }
        ]

        result = self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-fixed-001",
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
                    "pos_profile": {
                        "posa_use_pos_awesome_payments": 1,
                        "posa_allow_make_new_payments": 1,
                        "posa_allow_reconcile_payments": 0,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertTrue(result["replayed"])
        self.assertEqual(result["new_payments_entry"][0]["name"], "ACC-PAY-IDEMP-0001")
        mock_create_payment_entry.assert_not_called()

    @patch(
        "posawesome.posawesome.api.payment_processing.processor.find_payment_entries_by_client_request_id"
    )
    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_finishes_partial_replay_before_returning_cached_result(
        self,
        mock_frappe,
        mock_create_payment_entry,
        mock_find_existing_entries,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()
        mock_find_existing_entries.return_value = [
            {
                "name": "ACC-PAY-IDEMP-0001",
                "paid_amount": 100,
                "received_amount": 100,
                "posting_date": "2026-03-30",
                "mode_of_payment": "Cash",
                "party": "Customer 727",
                "party_type": "Customer",
                "docstatus": 1,
                "posa_client_request_id": "pay-fixed-001",
            }
        ]
        mock_create_payment_entry.return_value = FakePaymentEntry(
            name="ACC-PAY-IDEMP-0002",
            paid_amount=50,
        )

        result = self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-fixed-001",
                    "customer": "Customer 727",
                    "company": "Test Company",
                    "currency": "USD",
                    "pos_profile_name": "Main POS",
                    "pos_opening_shift_name": "POS-OPEN-0001",
                    "selected_invoices": [],
                    "selected_payments": [],
                    "selected_mpesa_payments": [],
                    "payment_methods": [
                        {"mode_of_payment": "Cash", "amount": 100},
                        {"mode_of_payment": "Card", "amount": 50},
                    ],
                    "total_selected_invoices": 0,
                    "total_selected_payments": 0,
                    "total_selected_mpesa_payments": 0,
                    "total_payment_methods": 150,
                    "pos_profile": {
                        "posa_use_pos_awesome_payments": 1,
                        "posa_allow_make_new_payments": 1,
                        "posa_allow_reconcile_payments": 0,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertNotIn("replayed", result)
        mock_create_payment_entry.assert_called_once()
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["mode_of_payment"],
            "Card",
        )
        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["amount"],
            50,
        )
        self.assertEqual(
            [entry.get("name") for entry in result["all_payments_entry"]],
            ["ACC-PAY-IDEMP-0001", "ACC-PAY-IDEMP-0002"],
        )

    @patch(
        "posawesome.posawesome.api.payment_processing.processor.find_payment_entries_by_client_request_id"
    )
    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_rejects_retries_when_matching_draft_entries_exist(
        self,
        mock_frappe,
        mock_create_payment_entry,
        mock_find_existing_entries,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.throw.side_effect = lambda message: (_ for _ in ()).throw(Exception(message))
        mock_find_existing_entries.return_value = [
            {
                "name": "ACC-PAY-IDEMP-DRAFT-0001",
                "paid_amount": 100,
                "received_amount": 100,
                "posting_date": "2026-03-30",
                "mode_of_payment": "Cash",
                "party": "Customer 727",
                "party_type": "Customer",
                "docstatus": 0,
                "posa_client_request_id": "pay-fixed-draft-001",
            }
        ]

        with self.assertRaisesRegex(Exception, "draft Payment Entry records pending review"):
            self.processor.process_pos_payment(
                json.dumps(
                    {
                        "client_request_id": "pay-fixed-draft-001",
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
                        "pos_profile": {
                            "posa_use_pos_awesome_payments": 1,
                            "posa_allow_make_new_payments": 1,
                            "posa_allow_reconcile_payments": 0,
                            "posa_allow_mpesa_reconcile_payments": 0,
                            "cost_center": "Main - TC",
                        },
                    }
                )
            )

        mock_create_payment_entry.assert_not_called()

    @patch(
        "posawesome.posawesome.api.payment_processing.processor.find_payment_entries_by_client_request_id"
    )
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_keeps_first_time_reconciliation_validation_active(
        self,
        mock_frappe,
        mock_find_existing_entries,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()
        mock_find_existing_entries.return_value = []
        mock_frappe.get_doc.side_effect = lambda doctype, name: AttrDict(
            {
                "doctype": doctype,
                "name": name,
                "unallocated_amount": 0,
                "paid_from": "Cash - TC",
                "cost_center": "Main - TC",
            }
        )

        result = self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-first-pass-001",
                    "customer": "Customer 727",
                    "company": "Test Company",
                    "currency": "USD",
                    "pos_profile_name": "Main POS",
                    "pos_opening_shift_name": "POS-OPEN-0001",
                    "selected_invoices": [],
                    "selected_payments": [{"name": "ACC-PAY-0009", "voucher_type": "Payment Entry"}],
                    "selected_mpesa_payments": [],
                    "payment_methods": [],
                    "total_selected_invoices": 0,
                    "total_selected_payments": 1,
                    "total_selected_mpesa_payments": 0,
                    "total_payment_methods": 0,
                    "pos_profile": {
                        "posa_use_pos_awesome_payments": 1,
                        "posa_allow_make_new_payments": 0,
                        "posa_allow_reconcile_payments": 1,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertIn(
            "Payment ACC-PAY-0009 is already fully allocated",
            result["errors"],
        )

    @patch(
        "posawesome.posawesome.api.payment_processing.processor.find_payment_entries_by_client_request_id"
    )
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_replay_preserves_completed_reconciliation_summary(
        self,
        mock_frappe,
        mock_find_existing_entries,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()
        mock_find_existing_entries.return_value = [
            {
                "name": "ACC-PAY-IDEMP-0001",
                "paid_amount": 100,
                "received_amount": 100,
                "posting_date": "2026-03-30",
                "mode_of_payment": "Cash",
                "party": "Customer 727",
                "party_type": "Customer",
                "docstatus": 1,
                "posa_client_request_id": "pay-fixed-005",
            }
        ]
        mock_frappe.get_doc.side_effect = lambda doctype, name: AttrDict(
            {
                "doctype": doctype,
                "name": name,
                "unallocated_amount": 0,
                "paid_amount": 60,
                "posting_date": "2026-03-30",
                "party": "Customer 727",
                "party_type": "Customer",
                "docstatus": 1,
            }
        )

        result = self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-fixed-005",
                    "customer": "Customer 727",
                    "company": "Test Company",
                    "currency": "USD",
                    "pos_profile_name": "Main POS",
                    "pos_opening_shift_name": "POS-OPEN-0001",
                    "selected_invoices": [],
                    "selected_payments": [
                        {
                            "name": "ACC-PAY-RECON-0001",
                            "voucher_type": "Payment Entry",
                            "unallocated_amount": 60,
                        }
                    ],
                    "selected_mpesa_payments": [],
                    "payment_methods": [{"mode_of_payment": "Cash", "amount": 100}],
                    "total_selected_invoices": 0,
                    "total_selected_payments": 1,
                    "total_selected_mpesa_payments": 0,
                    "total_payment_methods": 100,
                    "pos_profile": {
                        "posa_use_pos_awesome_payments": 1,
                        "posa_allow_make_new_payments": 1,
                        "posa_allow_reconcile_payments": 1,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertTrue(result["replayed"])
        self.assertEqual(
            result["reconciled_payments"],
            [{"payment_entry": "ACC-PAY-RECON-0001", "allocated_amount": 60}],
        )
        self.assertTrue(all(isinstance(entry, dict) for entry in result["all_payments_entry"]))

    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_passes_client_request_id_to_new_payment_entries(
        self,
        mock_frappe,
        mock_create_payment_entry,
    ):
        fake_payment_entry = FakePaymentEntry(paid_amount=100)
        mock_create_payment_entry.return_value = fake_payment_entry
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()
        mock_frappe.get_list.return_value = []

        self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-fixed-002",
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
                        "posa_allow_reconcile_payments": 0,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["client_request_id"],
            "pay-fixed-002",
        )

    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_skips_replay_lookup_when_custom_field_is_missing(
        self,
        mock_frappe,
        mock_create_payment_entry,
    ):
        fake_payment_entry = FakePaymentEntry(paid_amount=100)
        mock_create_payment_entry.return_value = fake_payment_entry
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()
        mock_frappe.db = types.SimpleNamespace(
            has_column=lambda doctype, fieldname: False,
            sql=lambda *args, **kwargs: [],
            get_value=lambda *args, **kwargs: None,
        )

        self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-fixed-003",
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
                        "posa_allow_reconcile_payments": 0,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["client_request_id"],
            "pay-fixed-003",
        )

    @patch("posawesome.posawesome.api.payment_processing.processor.create_payment_entry")
    @patch("posawesome.posawesome.api.payment_processing.processor.frappe")
    def test_process_pos_payment_does_not_query_missing_client_request_column(
        self,
        mock_frappe,
        mock_create_payment_entry,
    ):
        fake_payment_entry = FakePaymentEntry(paid_amount=100)
        mock_create_payment_entry.return_value = fake_payment_entry
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.log_error = Mock()
        mock_frappe.msgprint = Mock()
        mock_frappe.db = types.SimpleNamespace(
            has_column=lambda doctype, fieldname: False,
            sql=lambda *args, **kwargs: [],
            get_value=lambda *args, **kwargs: None,
        )
        mock_frappe.get_list.side_effect = AssertionError(
            "replay lookup should be skipped when the field is missing"
        )

        self.processor.process_pos_payment(
            json.dumps(
                {
                    "client_request_id": "pay-fixed-004",
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
                        "posa_allow_reconcile_payments": 0,
                        "posa_allow_mpesa_reconcile_payments": 0,
                        "cost_center": "Main - TC",
                    },
                }
            )
        )

        self.assertEqual(
            mock_create_payment_entry.call_args.kwargs["client_request_id"],
            "pay-fixed-004",
        )

    @patch(
        "posawesome.posawesome.api.payment_processing.data.get_advance_payment_entries_for_regional"
    )
    @patch("posawesome.posawesome.api.payment_processing.data.get_party_account")
    @patch("posawesome.posawesome.api.payment_processing.data.frappe")
    def test_get_unallocated_payments_excludes_pay_type_customer_entries(
        self,
        mock_frappe,
        mock_get_party_account,
        mock_regional_entries,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.get_cached_value.return_value = "Customer 727"
        mock_get_party_account.return_value = "Debtors - TC"
        mock_regional_entries.return_value = []
        mock_frappe.db.sql.return_value = []
        mock_frappe.get_list.side_effect = [[], []]

        rows = self.data.get_unallocated_payments(
            customer="Customer 727",
            company="Test Company",
            currency="USD",
            include_all_currencies=True,
        )

        self.assertEqual(rows, [])
        self.assertGreaterEqual(mock_frappe.get_list.call_count, 1)
        payment_entry_calls = [
            call
            for call in mock_frappe.get_list.call_args_list
            if call.args and call.args[0] == "Payment Entry"
        ]
        self.assertGreaterEqual(len(payment_entry_calls), 1)
        for call in payment_entry_calls:
            self.assertEqual(call.kwargs["filters"]["payment_type"], "Receive")

    @patch(
        "posawesome.posawesome.api.payment_processing.data.get_erpnext_outstanding_invoices",
        side_effect=AssertionError("legacy outstanding helper should not be called"),
        create=True,
    )
    @patch("posawesome.posawesome.api.payment_processing.data.get_party_account")
    @patch("posawesome.posawesome.api.payment_processing.data.frappe")
    def test_get_outstanding_invoices_queries_only_open_sales_invoices(
        self,
        mock_frappe,
        mock_get_party_account,
        mock_legacy_helper,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.get_cached_value.return_value = "Customer 727"
        mock_get_party_account.return_value = "Debtors - TC"

        def fake_get_list(doctype, filters=None, fields=None, order_by=None, **kwargs):
            self.assertEqual(doctype, "Sales Invoice")
            self.assertEqual(filters["customer"], "Customer 727")
            self.assertEqual(filters["company"], "Test Company")
            self.assertEqual(filters["docstatus"], 1)
            self.assertEqual(filters["outstanding_amount"], (">", 0))
            self.assertEqual(filters["currency"], "USD")
            self.assertEqual(filters["pos_profile"], "Main POS")
            self.assertIn("outstanding_amount", fields)
            self.assertEqual(order_by, "posting_date desc, name desc")
            return [
                AttrDict(
                    {
                        "name": "SINV-OPEN-0001",
                        "posting_date": "2026-03-12",
                        "due_date": "2026-03-15",
                        "outstanding_amount": 125,
                        "base_rounded_total": 125,
                        "grand_total": 125,
                        "currency": "USD",
                        "pos_profile": "Main POS",
                        "customer_name": "Customer 727",
                    }
                )
            ]

        mock_frappe.get_list.side_effect = fake_get_list

        rows = self.data.get_outstanding_invoices(
            customer="Customer 727",
            company="Test Company",
            currency="USD",
            pos_profile="Main POS",
            include_all_currencies=False,
        )

        self.assertEqual(
            [(row.get("voucher_type"), row.get("voucher_no")) for row in rows],
            [("Sales Invoice", "SINV-OPEN-0001")],
        )
        self.assertEqual(rows[0].get("outstanding_amount"), 125)
        self.assertEqual(rows[0].get("customer_name"), "Customer 727")
        mock_legacy_helper.assert_not_called()

    @patch("posawesome.posawesome.api.payment_processing.data.frappe")
    def test_get_outstanding_invoices_queries_purchase_invoices_for_supplier_mode(
        self,
        mock_frappe,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.get_cached_value.return_value = "Supplier ABC"

        def fake_get_list(doctype, filters=None, fields=None, order_by=None, **kwargs):
            self.assertEqual(doctype, "Purchase Invoice")
            self.assertEqual(filters["supplier"], "SUPP-0001")
            self.assertEqual(filters["company"], "Test Company")
            self.assertEqual(filters["docstatus"], 1)
            self.assertEqual(filters["outstanding_amount"], (">", 0))
            self.assertEqual(filters["currency"], "USD")
            self.assertIn("outstanding_amount", fields)
            self.assertEqual(order_by, "posting_date desc, name desc")
            return [
                AttrDict(
                    {
                        "name": "PINV-OPEN-0001",
                        "posting_date": "2026-03-18",
                        "due_date": "2026-03-22",
                        "outstanding_amount": 340,
                        "rounded_total": 340,
                        "grand_total": 340,
                        "currency": "USD",
                        "supplier_name": "Supplier ABC",
                    }
                )
            ]

        mock_frappe.get_list.side_effect = fake_get_list

        rows = self.data.get_outstanding_invoices(
            customer="SUPP-0001",
            company="Test Company",
            currency="USD",
            include_all_currencies=False,
            party_type="Supplier",
        )

        self.assertEqual(
            [(row.get("voucher_type"), row.get("voucher_no")) for row in rows],
            [("Purchase Invoice", "PINV-OPEN-0001")],
        )
        self.assertEqual(rows[0].get("customer_name"), "Supplier ABC")
        self.assertEqual(rows[0].get("party_name"), "Supplier ABC")
        self.assertEqual(rows[0].get("party_type"), "Supplier")

    @patch("posawesome.posawesome.api.payment_processing.data.get_party_account")
    @patch("posawesome.posawesome.api.payment_processing.data.frappe")
    def test_get_unallocated_payments_queries_supplier_payments_in_supplier_mode(
        self,
        mock_frappe,
        mock_get_party_account,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.get_cached_value.return_value = "Supplier ABC"
        mock_get_party_account.return_value = "Creditors - TC"

        def fake_get_list(doctype, filters=None, fields=None, order_by=None, **kwargs):
            self.assertEqual(doctype, "Payment Entry")
            self.assertEqual(filters["party"], "SUPP-0001")
            self.assertEqual(filters["company"], "Test Company")
            self.assertEqual(filters["party_type"], "Supplier")
            self.assertEqual(filters["payment_type"], "Pay")
            self.assertEqual(filters["paid_to_account_currency"], "USD")
            self.assertEqual(order_by, "posting_date asc")
            return [
                AttrDict(
                    {
                        "name": "ACC-PAY-0009",
                        "paid_amount": 150,
                        "customer_name": "Supplier ABC",
                        "received_amount": 150,
                        "posting_date": "2026-03-16",
                        "unallocated_amount": 150,
                        "mode_of_payment": "Bank",
                        "currency": "USD",
                        "account": "Creditors - TC",
                    }
                )
            ]

        mock_frappe.get_list.side_effect = fake_get_list

        rows = self.data.get_unallocated_payments(
            customer="SUPP-0001",
            company="Test Company",
            currency="USD",
            include_all_currencies=False,
            party_type="Supplier",
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].get("voucher_type"), "Payment Entry")
        self.assertEqual(rows[0].get("customer_name"), "Supplier ABC")
        self.assertEqual(rows[0].get("party_name"), "Supplier ABC")
        self.assertEqual(rows[0].get("party_type"), "Supplier")

    @patch("posawesome.posawesome.api.payment_processing.reconciliation.reconcile_against_document")
    @patch("posawesome.posawesome.api.payment_processing.reconciliation.frappe")
    @patch("posawesome.posawesome.api.payment_processing.reconciliation.get_unallocated_payments")
    @patch("posawesome.posawesome.api.payment_processing.reconciliation.get_outstanding_invoices")
    def test_auto_reconcile_customer_invoices_uses_supplier_semantics_when_requested(
        self,
        mock_get_outstanding_invoices,
        mock_get_unallocated_payments,
        mock_frappe,
        mock_reconcile_against_document,
    ):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        mock_frappe.get_doc.return_value = AttrDict(
            {
                "paid_to": "Creditors - TC",
                "cost_center": "Main - TC",
                "get": lambda key, default=None: {
                    "unallocated_amount": 200,
                }.get(key, default),
            }
        )

        mock_get_outstanding_invoices.return_value = [
            AttrDict(
                {
                    "voucher_no": "PINV-0001",
                    "voucher_type": "Purchase Invoice",
                    "posting_date": "2026-03-10",
                    "outstanding_amount": 200,
                }
            )
        ]
        mock_get_unallocated_payments.return_value = [
            AttrDict(
                {
                    "name": "ACC-PAY-0010",
                    "voucher_type": "Payment Entry",
                    "posting_date": "2026-03-11",
                    "unallocated_amount": 200,
                    "account": "Creditors - TC",
                }
            )
        ]

        result = self.reconciliation.auto_reconcile_customer_invoices(
            customer="SUPP-0001",
            company="Test Company",
            currency="USD",
            party_type="Supplier",
        )

        self.assertEqual(result["total_allocated"], 200)
        mock_reconcile_against_document.assert_called_once()
        reconcile_row = mock_reconcile_against_document.call_args.args[0][0]
        self.assertEqual(reconcile_row["party_type"], "Supplier")
        self.assertEqual(reconcile_row["dr_or_cr"], "debit_in_account_currency")
        self.assertEqual(reconcile_row["against_voucher_type"], "Purchase Invoice")


if __name__ == "__main__":
    unittest.main()
