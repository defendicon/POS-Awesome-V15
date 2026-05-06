# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and Contributors
# See license.txt
from __future__ import unicode_literals

# import frappe
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.doctype.pos_closing_shift.closing_processing import creation, invoices, overview


class DummyClosingShift:
    def __init__(self, tables=None, company="My Co", pos_profile="POS-PROFILE-1"):
        self.company = company
        self.pos_profile = pos_profile
        self._tables = tables or {}

    def get(self, key, default=None):
        return self._tables.get(key, default)


class AttrDict(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(key)

    def __setattr__(self, key, value):
        self[key] = value


class DummyPaymentEntry:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def get(self, key, default=None):
        return getattr(self, key, default)


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

    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.creation.frappe")
    def test_supplier_payment_reference_does_not_populate_customer_link(self, mock_frappe):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        payment_entry = DummyPaymentEntry(
            name="ACC-PAY-SUP-0001",
            mode_of_payment="Cash",
            paid_amount=50,
            posting_date="2026-05-06",
            party_type="Supplier",
            party="Haji Khalid & Sons",
        )

        row = creation.build_pos_payment_reference(payment_entry)

        self.assertEqual(row.party_type, "Supplier")
        self.assertEqual(row.party, "Haji Khalid & Sons")
        self.assertNotIn("customer", row)

    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.creation.frappe")
    def test_customer_payment_reference_keeps_customer_link(self, mock_frappe):
        mock_frappe._dict.side_effect = lambda value: AttrDict(value)
        payment_entry = DummyPaymentEntry(
            name="ACC-PAY-CUS-0001",
            mode_of_payment="Cash",
            paid_amount=75,
            posting_date="2026-05-06",
            party_type="Customer",
            party="Walk-in Customer",
        )

        row = creation.build_pos_payment_reference(payment_entry)

        self.assertEqual(row.party_type, "Customer")
        self.assertEqual(row.party, "Walk-in Customer")
        self.assertEqual(row.customer, "Walk-in Customer")

    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.invoices.frappe")
    def test_submit_printed_invoices_skips_return_drafts_against_cancelled_invoices(self, mock_frappe):
        class DummyInvoiceDoc:
            def __init__(self, name, is_return=0, return_against=None):
                self.name = name
                self._values = {
                    "is_return": is_return,
                    "return_against": return_against,
                }
                self.submit = Mock()

            def get(self, key, default=None):
                return self._values.get(key, default)

        cancelled_return = DummyInvoiceDoc(
            "SINV-RET-0001",
            is_return=1,
            return_against="ACC-SINV-2026-00222",
        )
        regular_invoice = DummyInvoiceDoc("SINV-0002")

        mock_frappe.get_all.return_value = [
            SimpleNamespace(name="SINV-RET-0001"),
            SimpleNamespace(name="SINV-0002"),
        ]
        mock_frappe.get_doc.side_effect = lambda doctype, name: {
            "SINV-RET-0001": cancelled_return,
            "SINV-0002": regular_invoice,
        }[name]
        mock_frappe.db.get_value.side_effect = lambda doctype, name, field: (
            2 if (doctype, name, field) == ("Sales Invoice", "ACC-SINV-2026-00222", "docstatus") else None
        )

        result = invoices.submit_printed_invoices("POS-OPEN-1", "Sales Invoice")

        cancelled_return.submit.assert_not_called()
        regular_invoice.submit.assert_called_once_with()
        mock_frappe.log_error.assert_called_once()
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].invoice, "SINV-RET-0001")
        self.assertEqual(result[0].return_against, "ACC-SINV-2026-00222")

    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.overview.get_payments_entries")
    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.overview.get_pos_invoices")
    @patch("posawesome.posawesome.doctype.pos_closing_shift.closing_processing.overview.frappe")
    def test_overview_does_not_resubmit_printed_invoices(
        self,
        mock_frappe,
        mock_get_pos_invoices,
        mock_get_payments_entries,
    ):
        mock_frappe.get_doc.return_value = SimpleNamespace(
            doctype="POS Opening Shift",
            name="POS-OPEN-1",
            pos_profile="POS-PROFILE-1",
            company="My Co",
        )
        mock_frappe.get_cached_value.return_value = "USD"
        mock_frappe.db.get_value.side_effect = lambda doctype, name, field: (
            0
            if (doctype, name, field)
            == ("POS Profile", "POS-PROFILE-1", "create_pos_invoice_instead_of_sales_invoice")
            else "Cash"
        )
        mock_get_pos_invoices.return_value = []
        mock_get_payments_entries.return_value = []
        mock_frappe.get_all.return_value = []

        overview.get_closing_shift_overview("POS-OPEN-1")

        mock_get_pos_invoices.assert_called_once_with(
            "POS-OPEN-1",
            "Sales Invoice",
            submit_printed=0,
        )
