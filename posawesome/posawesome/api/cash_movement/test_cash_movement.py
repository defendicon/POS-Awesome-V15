import unittest
from types import SimpleNamespace
from unittest.mock import patch

from posawesome.posawesome.api.cash_movement import queries, service, validation


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


if __name__ == "__main__":
    unittest.main()
