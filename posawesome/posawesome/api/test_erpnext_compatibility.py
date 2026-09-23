import inspect
import unittest


class TestERPNextCompatibility(unittest.TestCase):
    def test_supported_erpnext_major_and_reconciliation_contract(self):
        try:
            import erpnext
            from erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation import (
                reconcile_dr_cr_note,
            )
            from erpnext.accounts.utils import reconcile_against_document
        except ImportError as exc:
            self.skipTest(f"ERPNext runtime is not installed: {exc}")

        version = str(getattr(erpnext, "__version__", ""))
        major = int(version.split(".", 1)[0]) if version else None
        self.assertIn(major, {15, 16}, f"Unsupported ERPNext runtime: {version or 'unknown'}")

        credit_note_parameters = list(inspect.signature(reconcile_dr_cr_note).parameters)
        self.assertGreaterEqual(len(credit_note_parameters), 2)
        self.assertEqual(credit_note_parameters[:2], ["dr_cr_notes", "company"])

        document_parameters = list(inspect.signature(reconcile_against_document).parameters)
        self.assertTrue(document_parameters)
        self.assertEqual(document_parameters[0], "args")


if __name__ == "__main__":
    unittest.main()
