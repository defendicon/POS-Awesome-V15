import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.doctype.pos_closing_shift.closing_processing import creation, overview


class DummyClosingShift:
    def __init__(self):
        self.pos_opening_shift = None
        self.period_start_date = None
        self.period_end_date = None
        self.pos_profile = None
        self.user = None
        self.company = None
        self.grand_total = 0
        self.net_total = 0
        self.total_quantity = 0
        self.tables = {}

    def set(self, key, value):
        self.tables[key] = value


class TestClosingShiftCashMovementIntegration(unittest.TestCase):
    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.creation.get_payments_entries")
    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.creation.get_pos_invoices")
    @patch(
        "posawesome.posawesome.doctype.pos_closing_shift.closing_processing.creation.submit_printed_invoices"
    )
    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.creation.frappe")
    def test_make_closing_shift_deducts_cash_movements_from_cash_expected(
        self,
        mock_frappe,
        mock_submit_printed_invoices,
        mock_get_pos_invoices,
        mock_get_payments_entries,
    ):
        mock_submit_printed_invoices.return_value = []
        mock_get_pos_invoices.return_value = []
        mock_get_payments_entries.return_value = []
        mock_frappe.get_cached_value.return_value = "USD"
        mock_frappe.get_value.return_value = "Cash"
        mock_frappe.get_all.return_value = [{"amount": 20}]
        mock_frappe.utils.get_datetime.return_value = "2026-02-11 10:00:00"
        closing_doc = DummyClosingShift()
        mock_frappe.new_doc.return_value = closing_doc
        mock_frappe._dict.side_effect = lambda d: SimpleNamespace(**d)

        opening_shift = {
            "name": "POS-OPEN-1",
            "period_start_date": "2026-02-11 08:00:00",
            "pos_profile": "POS-PROFILE-1",
            "user": "cashier@example.com",
            "company": "My Co",
            "balance_details": [{"mode_of_payment": "Cash", "amount": 50}],
        }

        result = creation.make_closing_shift_from_opening(json.dumps(opening_shift))

        self.assertEqual(result["closing_shift"], closing_doc)
        self.assertEqual(result["skipped_printed_invoices"], [])
        payment_rows = closing_doc.tables.get("payment_reconciliation") or []
        self.assertEqual(len(payment_rows), 1)
        row = payment_rows[0]
        self.assertEqual(row.mode_of_payment, "Cash")
        self.assertEqual(row.opening_amount, 50)
        self.assertEqual(row.expected_amount, 30)

    def test_overview_includes_cash_movements_and_adjusts_cash_expected(self):
        orig_get_pos_invoices = overview.get_pos_invoices
        orig_get_payments_entries = overview.get_payments_entries
        orig_frappe_get_doc = overview.frappe.get_doc
        orig_frappe_get_cached_value = overview.frappe.get_cached_value
        orig_frappe_db_get_value = overview.frappe.db.get_value
        orig_frappe_get_all = overview.frappe.get_all

        try:
            overview.get_pos_invoices = Mock(return_value=[])
            overview.get_payments_entries = Mock(return_value=[])
            overview.frappe.get_doc = Mock(return_value=SimpleNamespace(
                doctype="POS Opening Shift",
                name="POS-OPEN-1",
                pos_profile="POS-PROFILE-1",
                company="My Co",
            ))
            overview.frappe.get_cached_value = Mock(return_value="USD")
            overview.frappe.db.get_value = Mock(side_effect=lambda dt, name, field: (
                0 if field == "create_pos_invoice_instead_of_sales_invoice" else "Cash"
            ))
            overview.frappe.get_all = Mock(return_value=[
                {"movement_type": "Expense", "amount": 35},
                {"movement_type": "Deposit", "amount": 15},
            ])

            result = overview.get_closing_shift_overview("POS-OPEN-1")

            self.assertEqual(result["cash_movements"]["count"], 2)
            self.assertEqual(result["cash_movements"]["company_currency_total"], 50)
            self.assertEqual(result["cash_expected"]["company_currency_total"], -50)
            by_type = {row["movement_type"]: row["total"] for row in result["cash_movements"]["by_type"]}
            self.assertEqual(by_type["Expense"], 35)
            self.assertEqual(by_type["Deposit"], 15)
        finally:
            overview.get_pos_invoices = orig_get_pos_invoices
            overview.get_payments_entries = orig_get_payments_entries
            overview.frappe.get_doc = orig_frappe_get_doc
            overview.frappe.get_cached_value = orig_frappe_get_cached_value
            overview.frappe.db.get_value = orig_frappe_db_get_value
            overview.frappe.get_all = orig_frappe_get_all


if __name__ == "__main__":
    unittest.main()
