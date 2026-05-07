import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _install_frappe_stub():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.session = types.SimpleNamespace(user="cashier@example.com")
    frappe_module._dict = lambda value=None, **kwargs: types.SimpleNamespace(**(value or {}), **kwargs)
    frappe_module.get_all = lambda *args, **kwargs: []
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.get_roles = lambda user=None: []
    sys.modules["frappe"] = frappe_module


def _load_employees_module():
    module_name = "posawesome.posawesome.api.employees"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "employees.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestEmployeesApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_frappe_stub()
        cls.employees = _load_employees_module()

    def test_get_terminal_employees_returns_profile_users_with_current_flag(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.frappe.get_roles = lambda user=None: []
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [
                {"user": "cashier@example.com"},
                {"user": "backup@example.com"},
            ]
            if doctype == "POS Profile User"
            else [
                {
                    "name": "cashier@example.com",
                    "full_name": "Main Cashier",
                    "enabled": 1,
                    "posa_is_pos_supervisor": 1,
                },
                {
                    "name": "backup@example.com",
                    "full_name": "Backup Cashier",
                    "enabled": 1,
                    "posa_is_pos_supervisor": 0,
                },
            ]
        )

        result = self.employees.get_terminal_employees("Main POS")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["user"], "cashier@example.com")
        self.assertTrue(result[0]["is_current"])
        self.assertTrue(result[0]["is_supervisor"])
        self.assertEqual(result[1]["full_name"], "Backup Cashier")
        self.assertFalse(result[1]["is_current"])
        self.assertFalse(result[1]["is_supervisor"])

    def test_get_terminal_employees_marks_supervisor_from_user_role(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.frappe.get_roles = lambda user=None: (
            ["Sales User", "POS Awesome Supervisor"] if user == "cashier@example.com" else ["Sales User"]
        )
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [
                {"user": "cashier@example.com"},
                {"user": "backup@example.com"},
            ]
            if doctype == "POS Profile User"
            else [
                {
                    "name": "cashier@example.com",
                    "full_name": "Main Cashier",
                    "enabled": 1,
                },
                {
                    "name": "backup@example.com",
                    "full_name": "Backup Cashier",
                    "enabled": 1,
                },
            ]
        )

        result = self.employees.get_terminal_employees("Main POS")

        self.assertTrue(result[0]["is_supervisor"])
        self.assertFalse(result[1]["is_supervisor"])

    def test_verify_terminal_employee_pin_accepts_valid_terminal_member(self):
        self.employees.frappe.get_roles = lambda user=None: []

        class FakeUserDoc:
            def __init__(self):
                self.name = "backup@example.com"
                self.full_name = "Backup Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 0
                self.flags = types.SimpleNamespace()

            def get_password(self, fieldname):
                self.last_password_field = fieldname
                return "1234"

        def fake_get_all(doctype, **kwargs):
            if doctype == "POS Profile User":
                return [{"user": "backup@example.com"}]
            if doctype == "User":
                return [{"name": "backup@example.com", "full_name": "Backup Cashier", "enabled": 1}]
            return []

        self.employees.frappe.get_all = fake_get_all
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        result = self.employees.verify_terminal_employee_pin(
            "Main POS",
            "backup@example.com",
            "1234",
        )

        self.assertEqual(result["user"], "backup@example.com")
        self.assertEqual(result["full_name"], "Backup Cashier")
        self.assertFalse(result["is_supervisor"])

    def test_get_cashier_pin_status_reports_existing_pin(self):
        self.employees.frappe.get_roles = lambda user=None: ["POS Awesome Supervisor"]

        class FakeUserDoc:
            def __init__(self):
                self.name = "cashier@example.com"
                self.full_name = "Main Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 1

            def get_password(self, fieldname):
                self.last_password_field = fieldname
                return "4321"

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        result = self.employees.get_cashier_pin_status("Main POS", "cashier@example.com")

        self.assertTrue(result["has_pin"])
        self.assertTrue(result["is_supervisor"])

    def test_save_cashier_pin_updates_password_field(self):
        self.employees.frappe.get_roles = lambda user=None: []

        class FakeUserDoc:
            def __init__(self):
                self.name = "cashier@example.com"
                self.full_name = "Main Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 0
                self.flags = types.SimpleNamespace()
                self.saved = False
                self.saved_value = None

            def get_password(self, fieldname):
                return ""

            def set(self, fieldname, value):
                self.saved_field = fieldname
                self.saved_value = value

            def save(self, ignore_permissions=False):
                self.saved = ignore_permissions

        user_doc = FakeUserDoc()
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: user_doc

        result = self.employees.save_cashier_pin(
            "Main POS",
            "cashier@example.com",
            "5678",
        )

        self.assertEqual(user_doc.saved_field, "posa_pos_pin")
        self.assertEqual(user_doc.saved_value, "5678")
        self.assertTrue(user_doc.saved)
        self.assertTrue(result["has_pin"])

    def test_save_cashier_pin_requires_current_pin_when_one_exists(self):
        self.employees.frappe.get_roles = lambda user=None: []

        class FakeUserDoc:
            def __init__(self):
                self.name = "cashier@example.com"
                self.full_name = "Main Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 0
                self.flags = types.SimpleNamespace()

            def get_password(self, fieldname):
                return "4321"

            def set(self, fieldname, value):
                raise AssertionError("PIN should not be updated when current PIN is invalid")

            def save(self, ignore_permissions=False):
                raise AssertionError("User doc should not save when current PIN is invalid")

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        with self.assertRaisesRegex(Exception, "Current PIN is incorrect."):
            self.employees.save_cashier_pin(
                "Main POS",
                "cashier@example.com",
                "5678",
                "0000",
            )


if __name__ == "__main__":
    unittest.main()
