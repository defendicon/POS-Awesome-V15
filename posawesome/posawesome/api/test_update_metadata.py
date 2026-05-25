import importlib.util
import pathlib
import sys
import types
import unittest


API_DIR = pathlib.Path(__file__).resolve().parent


def _install_stubs():
    posawesome_module = types.ModuleType("posawesome")
    posawesome_module.__version__ = "15.29.3"
    posawesome_module.__path__ = [str(API_DIR.parents[1])]
    sys.modules["posawesome"] = posawesome_module

    posawesome_inner_module = types.ModuleType("posawesome.posawesome")
    posawesome_inner_module.__path__ = [str(API_DIR.parent)]
    sys.modules["posawesome.posawesome"] = posawesome_inner_module

    api_package_module = types.ModuleType("posawesome.posawesome.api")
    api_package_module.__path__ = [str(API_DIR)]
    sys.modules["posawesome.posawesome.api"] = api_package_module

    frappe_module = types.ModuleType("frappe")
    frappe_module.utils = types.ModuleType("frappe.utils")
    frappe_module.utils.__path__ = []
    frappe_module.utils.cstr = lambda value: "" if value is None else str(value)
    frappe_module.utils.add_to_date = lambda *args, **kwargs: None
    frappe_module.utils.get_datetime = lambda *args, **kwargs: None
    frappe_module._ = lambda text: text
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_module.utils

    frappecloud_module = types.ModuleType("frappe.utils.frappecloud")
    frappecloud_module.on_frappecloud = lambda: False
    sys.modules["frappe.utils.frappecloud"] = frappecloud_module

    api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
    api_utils_module.get_item_groups = lambda *args, **kwargs: []
    api_utils_module.fetch_sales_person_names = lambda *args, **kwargs: []
    sys.modules["posawesome.posawesome.api.utils"] = api_utils_module

    package_utils_module = types.ModuleType("posawesome.utils")
    package_utils_module.get_build_version = lambda: "test-build"
    sys.modules["posawesome.utils"] = package_utils_module


def _load_utilities_module():
    module_name = "posawesome.posawesome.api.utilities"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, API_DIR / "utilities.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _load_update_notifications_module():
    module_name = "posawesome.posawesome.api.update_notifications"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, API_DIR / "update_notifications.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestUpdateMetadata(unittest.TestCase):
    def setUp(self):
        _install_stubs()
        self.utilities = _load_utilities_module()
        self.update_notifications = _load_update_notifications_module()

    def test_release_url_uses_v15_repository_and_plain_tag(self):
        self.assertEqual(
            self.utilities._build_release_url("v15.29.3"),
            "https://github.com/defendicon/POS-Awesome-V15/releases/tag/15.29.3",
        )

    def test_update_metadata_uses_canonical_repository(self):
        metadata = self.utilities._get_update_metadata()

        self.assertEqual(
            metadata["repo_url"],
            "https://github.com/defendicon/POS-Awesome-V15",
        )
        self.assertTrue(metadata["release_url"].startswith(metadata["repo_url"]))
        self.assertNotIn("/defendicon/posawesome/", metadata["release_url"])

    def test_frappe_update_popup_url_uses_posawesome_v15_repo(self):
        app = types.SimpleNamespace(
            app_name="posawesome",
            org_name="defendicon",
            available_version="15.29.3",
        )

        self.assertEqual(
            self.update_notifications._get_release_url(app),
            "https://github.com/defendicon/POS-Awesome-V15/releases/tag/15.29.3",
        )

    def test_frappe_update_popup_keeps_core_v_tag_behavior_for_other_apps(self):
        app = types.SimpleNamespace(
            app_name="erpnext",
            org_name="frappe",
            available_version="15.29.3",
        )

        self.assertEqual(
            self.update_notifications._get_release_url(app),
            "https://github.com/frappe/erpnext/releases/tag/v15.29.3",
        )


if __name__ == "__main__":
    unittest.main()
