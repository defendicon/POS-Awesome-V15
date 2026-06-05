import pathlib
import sys
import types
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))


def _install_import_stubs():
    if "frappe" in sys.modules:
        return

    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    erpnext_setup_utils = types.ModuleType("erpnext.setup.utils")

    frappe_module._ = lambda text: text
    frappe_module._dict = lambda value=None, **kwargs: dict(value or {}, **kwargs)
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.flags = SimpleNamespace(ignore_account_permission=False)
    frappe_module.session = SimpleNamespace(user="test@example.com")
    frappe_module.db = SimpleNamespace()
    frappe_module.get_cached_value = lambda *args, **kwargs: None
    frappe_module.get_all = lambda *args, **kwargs: []
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.new_doc = lambda *args, **kwargs: None
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))

    frappe_utils.nowdate = lambda: "2026-06-05"
    frappe_utils.flt = lambda value, precision=None: round(float(value or 0), precision or 6)
    frappe_utils.getdate = lambda value: value
    erpnext_setup_utils.get_exchange_rate = lambda *args, **kwargs: None

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils
    sys.modules["erpnext.setup.utils"] = erpnext_setup_utils

    payment_utils = types.ModuleType("posawesome.posawesome.api.payment_processing.utils")
    payment_utils.get_bank_cash_account = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.payment_processing.utils"] = payment_utils

    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


_install_import_stubs()

from posawesome.posawesome.api.cash_movement import posting, queries, service, validation


class FakeJournalEntry:
    def __init__(self):
        self.name = "ACC-JV-TEST-0001"
        self.accounts = []
        self.flags = SimpleNamespace()

    def append(self, fieldname, row):
        getattr(self, fieldname).append(row)

    def save(self):
        return None

    def submit(self):
        return None


class TestCashMovementPosting(unittest.TestCase):
    def _create_journal_entry(self, account_currencies, exchange_rates, amount=2800):
        journal_entry = FakeJournalEntry()

        def get_cached_value(doctype, name, fieldname):
            if doctype == "Company" and fieldname == "default_currency":
                return "PKR"
            if doctype == "Company" and fieldname == "cost_center":
                return "Main - TC"
            if doctype == "Account" and fieldname == "account_currency":
                return account_currencies[name]
            return None

        with (
            patch.object(posting.frappe, "get_cached_value", side_effect=get_cached_value),
            patch.object(posting.frappe, "new_doc", return_value=journal_entry),
            patch.object(
                posting,
                "get_exchange_rate",
                side_effect=lambda source, target, date: exchange_rates.get((source, target)),
            ),
            patch.object(posting, "temporarily_ignore_account_permission", return_value=nullcontext()),
        ):
            result = posting.create_journal_entry(
                company="Test Company",
                posting_date="2026-06-05",
                movement_type="Deposit",
                amount=amount,
                source_account="POS Cash - TC",
                target_account="Back Office Cash - TC",
            )

        self.assertEqual(result, journal_entry.name)
        return journal_entry

    def test_same_currency_rows_include_currency_and_base_amounts(self):
        journal_entry = self._create_journal_entry(
            {
                "POS Cash - TC": "PKR",
                "Back Office Cash - TC": "PKR",
            },
            {},
        )

        self.assertEqual(journal_entry.multi_currency, 0)
        debit_row, credit_row = journal_entry.accounts
        self.assertEqual(debit_row["account_currency"], "PKR")
        self.assertEqual(debit_row["exchange_rate"], 1)
        self.assertEqual(debit_row["debit_in_account_currency"], 2800)
        self.assertEqual(debit_row["debit"], 2800)
        self.assertEqual(credit_row["account_currency"], "PKR")
        self.assertEqual(credit_row["exchange_rate"], 1)
        self.assertEqual(credit_row["credit_in_account_currency"], 2800)
        self.assertEqual(credit_row["credit"], 2800)

    def test_foreign_account_rows_use_dated_rates_and_balance_in_company_currency(self):
        journal_entry = self._create_journal_entry(
            {
                "POS Cash - TC": "USD",
                "Back Office Cash - TC": "EUR",
            },
            {
                ("USD", "PKR"): 280,
                ("EUR", "PKR"): 350,
            },
        )

        self.assertEqual(journal_entry.multi_currency, 1)
        debit_row, credit_row = journal_entry.accounts
        self.assertEqual(debit_row["account_currency"], "EUR")
        self.assertEqual(debit_row["exchange_rate"], 350)
        self.assertEqual(debit_row["debit_in_account_currency"], 8)
        self.assertEqual(debit_row["debit"], 2800)
        self.assertEqual(credit_row["account_currency"], "USD")
        self.assertEqual(credit_row["exchange_rate"], 280)
        self.assertEqual(credit_row["credit_in_account_currency"], 10)
        self.assertEqual(credit_row["credit"], 2800)
        self.assertTrue(journal_entry.flags.ignore_exchange_rate)

    def test_foreign_source_to_company_currency_target_uses_dated_rate(self):
        journal_entry = self._create_journal_entry(
            {
                "POS Cash - TC": "USD",
                "Back Office Cash - TC": "PKR",
            },
            {
                ("USD", "PKR"): 280,
            },
        )

        self.assertEqual(journal_entry.multi_currency, 1)
        debit_row, credit_row = journal_entry.accounts
        self.assertEqual(debit_row["debit_in_account_currency"], 2800)
        self.assertEqual(debit_row["exchange_rate"], 1)
        self.assertEqual(credit_row["credit_in_account_currency"], 10)
        self.assertEqual(credit_row["exchange_rate"], 280)
        self.assertEqual(debit_row["debit"], credit_row["credit"])

    @patch.object(posting.frappe, "throw", side_effect=Exception("missing rate"))
    @patch.object(posting, "get_exchange_rate", return_value=None)
    @patch.object(posting.frappe, "get_cached_value")
    def test_foreign_account_without_rate_fails_clearly(
        self,
        mock_get_cached_value,
        _mock_get_exchange_rate,
        mock_throw,
    ):
        mock_get_cached_value.side_effect = lambda doctype, name, fieldname: (
            "PKR"
            if doctype == "Company" and fieldname == "default_currency"
            else "USD"
            if doctype == "Account"
            else "Main - TC"
        )

        with self.assertRaisesRegex(Exception, "missing rate"):
            posting.create_journal_entry(
                company="Test Company",
                posting_date="2026-06-05",
                movement_type="Deposit",
                amount=2800,
                source_account="POS Cash - TC",
                target_account="Back Office Cash - TC",
            )

        mock_throw.assert_called_once()


class TestCashMovementValidation(unittest.TestCase):
    @patch("posawesome.posawesome.api.cash_movement.validation.frappe")
    def test_duplicate_client_request_returns_existing_doc(self, mock_frappe):
        existing_doc = SimpleNamespace(name="POS-CM-.26.-00001")
        mock_frappe.db.get_value.return_value = existing_doc.name
        mock_frappe.get_doc.return_value = existing_doc

        result = validation.ensure_no_duplicate_client_request("dup-1")

        self.assertEqual(result, existing_doc)
        mock_frappe.db.get_value.assert_called_once_with(
            "POS Cash Movement",
            {"client_request_id": "dup-1"},
            "name",
        )
        mock_frappe.get_doc.assert_called_once_with("POS Cash Movement", existing_doc.name)

    @patch("posawesome.posawesome.api.cash_movement.validation.frappe")
    def test_validate_account_company_rejects_missing_account(self, mock_frappe):
        mock_frappe.db.exists.return_value = False
        mock_frappe.throw.side_effect = Exception("invalid")

        with self.assertRaises(Exception):
            validation.validate_account_company("UNKNOWN", "My Co", "Target account")

        mock_frappe.throw.assert_called_once()

    @patch("posawesome.posawesome.api.cash_movement.validation.frappe")
    def test_validate_account_company_rejects_mismatched_company(self, mock_frappe):
        mock_frappe.db.exists.return_value = True
        mock_frappe.db.get_value.return_value = "Other Co"
        mock_frappe.throw.side_effect = Exception("mismatch")

        with self.assertRaises(Exception):
            validation.validate_account_company("ACC-1", "My Co", "Target account")

        mock_frappe.throw.assert_called_once()


class TestCashMovementService(unittest.TestCase):
    @patch("posawesome.posawesome.api.cash_movement.service.parse_payload")
    @patch("posawesome.posawesome.api.cash_movement.service.get_opening_shift")
    @patch("posawesome.posawesome.api.cash_movement.service.get_pos_profile")
    @patch("posawesome.posawesome.api.cash_movement.service.validate_company_consistency")
    @patch("posawesome.posawesome.api.cash_movement.service.ensure_feature_enabled")
    @patch("posawesome.posawesome.api.cash_movement.service.ensure_movement_allowed")
    @patch("posawesome.posawesome.api.cash_movement.service.validate_amount")
    @patch("posawesome.posawesome.api.cash_movement.service.validate_remarks")
    @patch("posawesome.posawesome.api.cash_movement.service.ensure_no_duplicate_client_request")
    @patch("posawesome.posawesome.api.cash_movement.service.resolve_source_cash_account")
    @patch("posawesome.posawesome.api.cash_movement.service.resolve_target_account")
    @patch("posawesome.posawesome.api.cash_movement.service.validate_account_company")
    @patch("posawesome.posawesome.api.cash_movement.service.create_journal_entry")
    @patch("posawesome.posawesome.api.cash_movement.service.frappe")
    def test_create_cash_movement_returns_existing_when_client_request_replayed(
        self,
        mock_frappe,
        mock_create_journal_entry,
        mock_validate_account_company,
        mock_resolve_target_account,
        mock_resolve_source_cash_account,
        mock_ensure_no_duplicate_client_request,
        mock_validate_remarks,
        mock_validate_amount,
        mock_ensure_movement_allowed,
        mock_ensure_feature_enabled,
        mock_validate_company_consistency,
        mock_get_pos_profile,
        mock_get_opening_shift,
        mock_parse_payload,
    ):
        opening_shift = SimpleNamespace(name="POS-OPEN-1", pos_profile="POS-PROFILE-1")
        profile_doc = SimpleNamespace(name="POS-PROFILE-1", company="My Co", get=lambda _k: None)
        existing = SimpleNamespace(as_dict=lambda: {"name": "POS-CM-.26.-00002"})

        mock_parse_payload.return_value = {"pos_opening_shift": "POS-OPEN-1", "client_request_id": "req-1"}
        mock_get_opening_shift.return_value = opening_shift
        mock_get_pos_profile.return_value = profile_doc
        mock_validate_amount.return_value = 100
        mock_ensure_no_duplicate_client_request.return_value = existing
        mock_frappe.session.user = "cashier@example.com"

        result = service._create_cash_movement({"x": 1}, "Expense")

        self.assertEqual(result, {"name": "POS-CM-.26.-00002"})
        mock_create_journal_entry.assert_not_called()
        mock_resolve_source_cash_account.assert_not_called()
        mock_resolve_target_account.assert_not_called()
        mock_validate_account_company.assert_not_called()

    @patch("posawesome.posawesome.api.cash_movement.service._create_cash_movement")
    @patch("posawesome.posawesome.api.cash_movement.service.ensure_owner_or_manager")
    @patch("posawesome.posawesome.api.cash_movement.service.frappe")
    def test_duplicate_cash_movement_supports_posting_date(
        self,
        mock_frappe,
        mock_ensure_owner_or_manager,
        mock_create_cash_movement,
    ):
        source_doc = SimpleNamespace(
            docstatus=2,
            pos_profile="POS-PROFILE-1",
            pos_opening_shift="POS-OPEN-1",
            amount=250,
            against_name="Walk-in Customer",
            source_account="POS Cash - MC",
            remarks="Re-enter cancelled move",
            movement_type="Expense",
            expense_account="Expenses - MC",
            target_account="Expenses - MC",
        )
        source_doc.get = lambda key, default=None: getattr(source_doc, key, default)
        mock_frappe.get_doc.return_value = source_doc
        mock_create_cash_movement.return_value = {"name": "POS-CM-.26.-00009"}

        result = service.duplicate_cash_movement("POS-CM-.26.-00001", posting_date="2026-02-17")

        self.assertEqual(result, {"name": "POS-CM-.26.-00009"})
        mock_ensure_owner_or_manager.assert_called_once_with(source_doc)
        mock_create_cash_movement.assert_called_once_with(
            {
                "pos_profile": "POS-PROFILE-1",
                "pos_opening_shift": "POS-OPEN-1",
                "amount": 250,
                "against_name": "Walk-in Customer",
                "source_account": "POS Cash - MC",
                "remarks": "Re-enter cancelled move",
                "expense_account": "Expenses - MC",
                "posting_date": "2026-02-17",
            },
            "Expense",
        )


class TestCashMovementQueries(unittest.TestCase):
    @patch("posawesome.posawesome.api.cash_movement.queries.frappe.get_all")
    def test_get_shift_movements_maps_status_to_docstatus(self, mock_get_all):
        mock_get_all.return_value = []

        queries.get_shift_movements("POS-OPEN-1", status="cancelled")

        _, kwargs = mock_get_all.call_args
        self.assertEqual(kwargs["filters"]["docstatus"], 2)
        self.assertEqual(kwargs["filters"]["pos_opening_shift"], "POS-OPEN-1")

    @patch("posawesome.posawesome.api.cash_movement.queries.frappe.get_all")
    def test_get_shift_movements_without_status_returns_all_docstatuses(self, mock_get_all):
        mock_get_all.return_value = []

        queries.get_shift_movements("POS-OPEN-1", status="")

        _, kwargs = mock_get_all.call_args
        self.assertNotIn("docstatus", kwargs["filters"])
        self.assertIn("against_name", kwargs["fields"])

    @patch("posawesome.posawesome.api.cash_movement.queries.frappe.get_all")
    def test_get_shift_movements_applies_text_search_or_filters(self, mock_get_all):
        mock_get_all.return_value = []

        queries.get_shift_movements("POS-OPEN-1", search_text="walk")

        _, kwargs = mock_get_all.call_args
        self.assertIn("or_filters", kwargs)
        self.assertTrue(kwargs["or_filters"])
        self.assertFalse(any("posting_date" in row for row in kwargs["or_filters"]))


if __name__ == "__main__":
    unittest.main()
