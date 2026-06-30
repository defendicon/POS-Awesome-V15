import json
import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURES_PATH = REPO_ROOT / "posawesome" / "fixtures" / "custom_field.json"


def _load_custom_field(name):
    fields = json.loads(FIXTURES_PATH.read_text())
    return next((field for field in fields if field.get("name") == name), None)


class TestCustomerCreditInvoiceFields(unittest.TestCase):
    def test_sales_invoice_customer_credit_fields_are_printable(self):
        used = _load_custom_field("Sales Invoice-posa_redeemed_customer_credit")
        remaining = _load_custom_field("Sales Invoice-posa_remaining_customer_credit_balance")

        self.assertIsNotNone(used)
        self.assertIsNotNone(remaining)
        self.assertEqual(used["fieldtype"], "Currency")
        self.assertEqual(remaining["fieldtype"], "Currency")
        self.assertEqual(used["read_only"], 1)
        self.assertEqual(remaining["read_only"], 1)
        self.assertEqual(used["no_copy"], 1)
        self.assertEqual(remaining["no_copy"], 1)
        self.assertEqual(used.get("print_hide_if_no_value"), 1)
        self.assertEqual(remaining.get("print_hide_if_no_value"), 1)
        self.assertEqual(used["insert_after"], "payments")
        self.assertEqual(remaining["insert_after"], "posa_redeemed_customer_credit")


if __name__ == "__main__":
    unittest.main()
