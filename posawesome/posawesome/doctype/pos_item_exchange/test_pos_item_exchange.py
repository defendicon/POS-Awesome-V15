import inspect

import frappe
from erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation import (
    reconcile_dr_cr_note,
)
from frappe.tests.utils import FrappeTestCase


class TestPOSItemExchangeRuntimeContract(FrappeTestCase):
    def test_system_manager_can_manage_exchange_records(self):
        permissions = frappe.get_meta("POS Item Exchange").permissions
        system_manager = next(
            row for row in permissions if row.role == "System Manager" and row.permlevel == 0
        )

        self.assertEqual(system_manager.read, 1)
        self.assertEqual(system_manager.write, 1)
        self.assertEqual(system_manager.create, 1)
        self.assertEqual(system_manager.delete, 1)

    def test_erpnext_reconciliation_contract_is_supported(self):
        parameters = inspect.signature(reconcile_dr_cr_note).parameters

        self.assertIn("dr_cr_notes", parameters)
        self.assertIn("company", parameters)
