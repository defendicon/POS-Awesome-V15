import importlib.util
import pathlib
import sys
import types
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class FakeProfile:
    def __init__(self, name="POS-1", company="Test Co", **flags):
        self.name = name
        self.company = company
        for key, value in flags.items():
            setattr(self, key, value)

    def get(self, key, default=None):
        return getattr(self, key, default)


def _install_frappe_stub():
    frappe_module = types.ModuleType("frappe")
    profiles = {}

    def throw(message):
        raise Exception(message)

    def exists(doctype, name):
        return doctype == "POS Profile" and name in profiles

    def get_cached_doc(doctype, name):
        if doctype == "POS Profile" and name in profiles:
            return profiles[name]
        raise Exception(f"{doctype} {name} not found")

    frappe_module._ = lambda text: text
    frappe_module.throw = throw
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.session = types.SimpleNamespace(user="cashier@example.com")
    frappe_module.db = types.SimpleNamespace(exists=exists)
    frappe_module.get_cached_doc = get_cached_doc
    frappe_module._profiles = profiles
    sys.modules["frappe"] = frappe_module
    return frappe_module


def _load_utils_module():
    module_name = "posawesome_pos_authorization_utils_under_test"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "utils.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestPosProfileWriteAuthorization(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.orig_sys_modules = sys.modules.copy()
        cls.frappe = _install_frappe_stub()
        cls.utils = _load_utils_module()

    @classmethod
    def tearDownClass(cls):
        sys.modules.clear()
        sys.modules.update(cls.orig_sys_modules)

    def setUp(self):
        self.frappe.session.user = "cashier@example.com"
        self.frappe._profiles.clear()
        self.frappe._profiles["POS-1"] = FakeProfile(
            name="POS-1",
            company="Test Co",
            posa_allow_test_action=1,
            posa_disabled_test_action=0,
        )

    def test_guest_user_is_blocked(self):
        self.frappe.session.user = "Guest"

        with self.assertRaisesRegex(Exception, "Guest users are not allowed"):
            self.utils.assert_pos_profile_write_allowed("POS-1")

    def test_missing_pos_profile_is_blocked_when_required(self):
        with self.assertRaisesRegex(Exception, "POS Profile is required"):
            self.utils.assert_pos_profile_write_allowed(None, action_flag="posa_allow_test_action")

    def test_disabled_pos_profile_flag_blocks_action(self):
        with self.assertRaisesRegex(Exception, "does not allow this action"):
            self.utils.assert_pos_profile_write_allowed(
                "POS-1",
                action_flag="posa_disabled_test_action",
            )

    def test_enabled_pos_profile_flag_allows_action(self):
        profile = self.utils.assert_pos_profile_write_allowed(
            "POS-1",
            action_flag="posa_allow_test_action",
        )

        self.assertEqual(profile.name, "POS-1")

    def test_company_mismatch_is_blocked(self):
        with self.assertRaisesRegex(Exception, "is not allowed to write for company"):
            self.utils.assert_pos_profile_write_allowed("POS-1", company="Other Co")

    def test_valid_profile_company_and_action_passes(self):
        profile = self.utils.assert_pos_profile_write_allowed(
            "POS-1",
            company="Test Co",
            action_flag="posa_allow_test_action",
        )

        self.assertEqual(profile.name, "POS-1")
        self.assertEqual(profile.company, "Test Co")


if __name__ == "__main__":
    unittest.main()
