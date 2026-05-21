import importlib.util
import json
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(
    0,
    str(REPO_ROOT / "posawesome" / "posawesome" / "api" / "test_support"),
)

from offline_sync_harness import (
    install_offline_sync_package_stubs,
    load_offline_sync_common,
)


class AttrDict(dict):
    __getattr__ = dict.get

    def as_dict(self):
        return dict(self)


def _install_stubs():
    install_offline_sync_package_stubs()

    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.DoesNotExistError = Exception
    frappe_module.get_cached_doc = lambda doctype, name: AttrDict(
        {
            "name": name,
            "customer_groups": [{"customer_group": "Retail"}],
            "modified": "2026-04-09T10:02:00",
        }
    )

    def fake_get_all(doctype, **kwargs):
        if doctype == "Customer":
            return [
                {
                    "name": "CUST-REMOVED",
                    "modified": "2026-04-09T10:07:00",
                    "disabled": 1,
                    "customer_group": "Retail",
                },
            ]
        return []

    frappe_module.get_all = fake_get_all
    sys.modules["frappe"] = frappe_module

    api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
    api_utils_module.get_active_pos_profile = lambda user=None: {
        "name": "POS-TEST",
        "customer_groups": [{"customer_group": "Retail"}],
        "modified": "2026-04-09T10:02:00",
    }
    sys.modules["posawesome.posawesome.api.utils"] = api_utils_module
    sys.modules["posawesome.posawesome.api.offline_sync.common"] = load_offline_sync_common()

    customers_module = types.ModuleType("posawesome.posawesome.api.customers")
    customers_module.get_customer_groups = lambda pos_profile: ["Retail"]

    def fake_get_customer_names(pos_profile, limit=None, offset=None, start_after=None, modified_after=None):
        decoded_profile = json.loads(pos_profile)
        profile_id = decoded_profile.get("name") if isinstance(decoded_profile, dict) else None
        return [
            {
                "name": "CUST-001",
                "customer_name": "Alpha Customer",
                "mobile_no": "123",
                "modified": "2026-04-09T10:04:00",
                "pos_profile_id": profile_id,
            },
            {
                "name": "CUST-002",
                "customer_name": "Beta Customer",
                "mobile_no": "456",
                "loyalty_program": "Retail Loyalty",
                "modified": "2026-04-09T10:05:00",
                "pos_profile_id": profile_id,
            },
            {
                "name": "CUST-003",
                "customer_name": "Gamma Customer",
                "mobile_no": "789",
                "modified": "2026-04-09T10:06:00",
                "pos_profile_id": profile_id,
            },
        ][:limit]

    customers_module.get_customer_names = fake_get_customer_names
    sys.modules["posawesome.posawesome.api.customers"] = customers_module


def _load_module():
    module_name = "test_offline_sync_customers_target"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "offline_sync" / "customers.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _load_common_module():
    return sys.modules["posawesome.posawesome.api.offline_sync.common"]


class TestOfflineSyncCustomers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_stubs()
        cls.module = _load_module()

    def test_sync_customers_returns_delta_changes_and_disabled_deletes(self):
        response = self.module.sync_customers(
            pos_profile="POS-TEST",
            watermark="2026-04-09T09:59:00",
            limit=5,
        )

        self.assertEqual(
            [item["key"] for item in response["changes"]],
            ["customer::CUST-001", "customer::CUST-002", "customer::CUST-003"],
        )
        self.assertEqual(response["changes"][1]["data"]["customer_name"], "Beta Customer")
        self.assertNotIn("loyalty_points", response["changes"][1]["data"])
        self.assertNotIn("conversion_factor", response["changes"][1]["data"])
        self.assertEqual(response["deleted"], [{"key": "customer::CUST-REMOVED"}])
        self.assertEqual(response["next_watermark"], "2026-04-09T10:07:00")
        self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
        self.assertIn("next_watermark", response)
        self.assertIn("has_more", response)

    def test_sync_customers_paginates_initial_page_without_watermark(self):
        response = self.module.sync_customers(
            pos_profile="POS-TEST",
            watermark=None,
            limit=2,
        )

        self.assertEqual(
            [item["key"] for item in response["changes"]],
            ["customer::CUST-001", "customer::CUST-002"],
        )
        self.assertTrue(response["has_more"])
        self.assertEqual(response["deleted"], [])
        self.assertEqual(response["next_watermark"], "2026-04-09T10:05:00")
        self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
        self.assertIn("next_watermark", response)
        self.assertIn("has_more", response)

    def test_sync_customers_resolves_string_pos_profile_via_cached_doc(self):
        response = self.module.sync_customers(
            pos_profile="POS-TEST",
            watermark=None,
            limit=1,
        )

        self.assertEqual(response["changes"][0]["key"], "customer::CUST-001")
        self.assertEqual(response["changes"][0]["data"]["pos_profile_id"], "POS-TEST")

    def test_common_module_normalize_timestamp_matches_customers_behavior(self):
        common = _load_common_module()

        self.assertEqual(
            common._normalize_timestamp(" 2026-04-09T10:05:00 "),
            "2026-04-09T10:05:00",
        )


if __name__ == "__main__":
    unittest.main()
