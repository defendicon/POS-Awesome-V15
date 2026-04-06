import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
HOOKS_PATH = REPO_ROOT / "posawesome" / "hooks.py"
PATCHES_PATH = REPO_ROOT / "posawesome" / "patches.txt"
PATCH_MODULE = "posawesome.patches.add_gift_card_invoice_redemption_fields"
PATCH_PATH = f"{PATCH_MODULE}.execute"


class TestGiftCardInvoiceFieldRegistration(unittest.TestCase):
    def test_hooks_export_invoice_redemption_fields(self):
        hooks = HOOKS_PATH.read_text()

        self.assertIn("Sales Invoice-gift_card_redemptions", hooks)
        self.assertIn("POS Invoice-gift_card_redemptions", hooks)

    def test_migration_chain_runs_invoice_redemption_field_patch(self):
        hooks = HOOKS_PATH.read_text()
        patches = PATCHES_PATH.read_text().splitlines()

        self.assertIn(PATCH_PATH, hooks)
        self.assertIn(PATCH_MODULE, patches)


if __name__ == "__main__":
    unittest.main()
