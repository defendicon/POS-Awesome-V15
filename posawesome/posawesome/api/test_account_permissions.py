import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _load_module(initial_value):
    frappe_module = types.ModuleType("frappe")
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=initial_value)
    sys.modules["frappe"] = frappe_module

    module_name = "test_account_permissions_target"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "account_permissions.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module, frappe_module


def _load_cash_movement_posting(initial_value, fail_on_submit=False):
    account_permissions, frappe = _load_module(initial_value)
    api_package = types.ModuleType("posawesome.posawesome.api")
    api_package.__path__ = [str(REPO_ROOT / "posawesome" / "posawesome" / "api")]
    sys.modules["posawesome"] = types.ModuleType("posawesome")
    sys.modules["posawesome.posawesome"] = types.ModuleType("posawesome.posawesome")
    sys.modules["posawesome.posawesome.api"] = api_package
    sys.modules["posawesome.posawesome.api.account_permissions"] = account_permissions

    frappe._ = lambda text: text
    frappe.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe.get_cached_value = lambda *args, **kwargs: "Main - TC"
    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.nowdate = lambda: "2026-06-05"
    frappe_utils.flt = lambda value, *args, **kwargs: float(value or 0)
    sys.modules["frappe.utils"] = frappe_utils

    class JournalEntry:
        def __init__(self):
            self.flags = types.SimpleNamespace(ignore_permissions=False)
            self.accounts = []

        def append(self, fieldname, row):
            self.accounts.append(row)

        def save(self):
            return None

        def submit(self):
            if fail_on_submit:
                raise RuntimeError("submit failed")

    frappe.new_doc = lambda doctype: JournalEntry()

    module_name = "test_cash_movement_posting_target"
    file_path = (
        REPO_ROOT / "posawesome" / "posawesome" / "api" / "cash_movement" / "posting.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module, frappe


class TestTemporarilyIgnoreAccountPermission(unittest.TestCase):
    def test_restores_false_after_success(self):
        module, frappe = _load_module(False)

        with module.temporarily_ignore_account_permission():
            self.assertTrue(frappe.flags.ignore_account_permission)

        self.assertFalse(frappe.flags.ignore_account_permission)

    def test_restores_false_after_exception(self):
        module, frappe = _load_module(False)

        with self.assertRaises(RuntimeError):
            with module.temporarily_ignore_account_permission():
                self.assertTrue(frappe.flags.ignore_account_permission)
                raise RuntimeError("submit failed")

        self.assertFalse(frappe.flags.ignore_account_permission)

    def test_preserves_outer_true_value(self):
        module, frappe = _load_module(True)

        with module.temporarily_ignore_account_permission():
            self.assertTrue(frappe.flags.ignore_account_permission)

        self.assertTrue(frappe.flags.ignore_account_permission)

    def test_cash_movement_restores_flag_when_submit_raises(self):
        module, frappe = _load_cash_movement_posting(False, fail_on_submit=True)

        with self.assertRaises(RuntimeError):
            module.create_journal_entry(
                company="Test Company",
                posting_date="2026-06-05",
                movement_type="Expense",
                amount=100,
                source_account="Cash - TC",
                target_account="Expense - TC",
            )

        self.assertFalse(frappe.flags.ignore_account_permission)


if __name__ == "__main__":
    unittest.main()
