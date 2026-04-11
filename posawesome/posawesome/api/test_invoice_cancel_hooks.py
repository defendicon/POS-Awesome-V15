import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
HOOKS_PATH = REPO_ROOT / "posawesome" / "hooks.py"


class TestInvoiceCancelHooks(unittest.TestCase):
    def test_sales_invoice_cancel_hook_restores_gift_cards(self):
        hooks = HOOKS_PATH.read_text()

        self.assertIn('"Sales Invoice": {', hooks)
        self.assertIn('"on_cancel": "posawesome.posawesome.api.cart.on_cancel"', hooks)

    def test_pos_invoice_cancel_hook_restores_gift_cards(self):
        hooks = HOOKS_PATH.read_text()

        self.assertIn('"POS Invoice": {', hooks)
        self.assertIn('"on_cancel": "posawesome.posawesome.api.cart.on_cancel"', hooks)


if __name__ == "__main__":
    unittest.main()
