from types import SimpleNamespace
import unittest

from posawesome.posawesome.erpnext_patches.account_defaults import (
    is_pos_transaction,
    patch_selling_controller,
)


class AccountDefaultsPatchTests(unittest.TestCase):
    def test_identifies_pos_transactions(self):
        self.assertTrue(is_pos_transaction(SimpleNamespace(is_pos=1, pos_profile="POS-1")))
        self.assertFalse(is_pos_transaction(SimpleNamespace(is_pos=0, pos_profile="POS-1")))
        self.assertFalse(is_pos_transaction(SimpleNamespace(is_pos=1, pos_profile=None)))

    def test_skips_item_default_writeback_for_pos_transactions(self):
        calls = []

        def original(doc):
            calls.append(doc)

        selling_controller = SimpleNamespace(set_default_income_account_for_item=original)
        patch_selling_controller(selling_controller)

        pos_doc = SimpleNamespace(is_pos=1, pos_profile="POS-1")
        selling_controller.set_default_income_account_for_item(pos_doc)

        self.assertEqual(calls, [])

    def test_keeps_non_pos_writeback_behavior(self):
        calls = []

        def original(doc):
            calls.append(doc)
            return "ok"

        selling_controller = SimpleNamespace(set_default_income_account_for_item=original)
        patch_selling_controller(selling_controller)

        sales_doc = SimpleNamespace(is_pos=0, pos_profile=None)
        result = selling_controller.set_default_income_account_for_item(sales_doc)

        self.assertEqual(result, "ok")
        self.assertEqual(calls, [sales_doc])

    def test_patch_is_idempotent(self):
        def original(doc):
            return doc

        selling_controller = SimpleNamespace(set_default_income_account_for_item=original)
        patch_selling_controller(selling_controller)
        first = selling_controller.set_default_income_account_for_item
        patch_selling_controller(selling_controller)

        self.assertIs(first, selling_controller.set_default_income_account_for_item)


if __name__ == "__main__":
    unittest.main()
