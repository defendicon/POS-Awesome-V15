# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and Contributors
# See license.txt
from __future__ import unicode_literals

# import frappe
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.doctype.pos_closing_shift.closing_processing import overview


class DummyClosingShift:
    def __init__(self, tables=None, company="My Co", pos_profile="POS-PROFILE-1"):
        self.company = company
        self.pos_profile = pos_profile
        self._tables = tables or {}

    def get(self, key, default=None):
        return self._tables.get(key, default)


class TestPOSClosingShift(unittest.TestCase):
    def _make_doc(self, data):
        doc = Mock()
        doc.get.side_effect = lambda key, default=None: data.get(key, default)
        doc.check_permission = Mock()
        return doc

    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.overview.frappe")
    def test_reconciliation_checks_invoice_read_permission(self, mock_frappe):
        invoice_doc = self._make_doc(
            {
                "currency": "USD",
                "conversion_rate": 1,
                "grand_total": 100,
                "net_total": 90,
                "payments": [],
                "change_amount": 0,
            }
        )

        closing_shift_doc = DummyClosingShift(
            tables={
                "pos_transactions": [{"sales_invoice": "SINV-0001"}],
                "pos_payments": [],
                "payment_reconciliation": [
                    SimpleNamespace(
                        mode_of_payment="Cash",
                        opening_amount=0,
                        expected_amount=0,
                        difference=0,
                    )
                ],
            }
        )

        mock_frappe.get_cached_value.return_value = "USD"
        mock_frappe.db.get_value.return_value = "Cash"
        mock_frappe.db.exists.return_value = True
        mock_frappe.get_cached_doc.return_value = invoice_doc
        mock_frappe._dict.side_effect = lambda d: d
        mock_frappe.render_template.return_value = "<html/>"

        overview.get_payment_reconciliation_details(closing_shift_doc)

        invoice_doc.check_permission.assert_called_once_with("read")

    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.overview.frappe")
    def test_reconciliation_checks_payment_entry_read_permission(self, mock_frappe):
        payment_doc = self._make_doc(
            {
                "payment_type": "Receive",
                "paid_from_account_currency": "USD",
                "base_paid_amount": 25,
                "paid_amount": 25,
                "mode_of_payment": "Cash",
            }
        )

        closing_shift_doc = DummyClosingShift(
            tables={
                "pos_transactions": [],
                "pos_payments": [{"payment_entry": "ACC-PAY-0001", "mode_of_payment": "Cash"}],
                "payment_reconciliation": [
                    SimpleNamespace(
                        mode_of_payment="Cash",
                        opening_amount=0,
                        expected_amount=25,
                        difference=0,
                    )
                ],
            }
        )

        mock_frappe.get_cached_value.return_value = "USD"
        mock_frappe.db.get_value.return_value = "Cash"
        mock_frappe.db.exists.return_value = True
        mock_frappe.get_cached_doc.return_value = payment_doc
        mock_frappe._dict.side_effect = lambda d: d
        mock_frappe.render_template.return_value = "<html/>"

        overview.get_payment_reconciliation_details(closing_shift_doc)

        payment_doc.check_permission.assert_called_once_with("read")
