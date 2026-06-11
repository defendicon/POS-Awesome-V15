import importlib.util
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


ITEM_PRICE_ROWS = [
    {
        "name": "IP-001",
        "price_list": "Retail",
        "item_code": "ITEM-001",
        "uom": "Nos",
        "currency": "PKR",
        "customer": None,
        "price_list_rate": 100,
        "valid_from": "2026-01-01",
        "valid_upto": None,
        "modified": "2026-06-01T10:00:00",
    },
    {
        "name": "IP-002",
        "price_list": "Export",
        "item_code": "ITEM-001",
        "uom": "Box",
        "currency": "USD",
        "customer": "CUST-001",
        "price_list_rate": 15,
        "valid_from": "2026-01-01",
        "valid_upto": "2026-12-31",
        "modified": "2026-06-01T10:01:00",
    },
    {
        "name": "IP-003",
        "price_list": "Buying",
        "item_code": "ITEM-002",
        "uom": "Nos",
        "currency": "PKR",
        "customer": None,
        "price_list_rate": 80,
        "valid_from": None,
        "valid_upto": None,
        "modified": "2026-06-01T10:02:00",
    },
]


def _install_stubs():
    install_offline_sync_package_stubs()

    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.get_cached_doc = lambda doctype, name: AttrDict(
        {
            "name": name,
            "company": "Test Co",
            "selling_price_list": "Retail",
        }
    )

    def fake_get_all(doctype, **kwargs):
        if doctype == "Price List":
            return [
                {"name": "Retail", "selling": 1},
                {"name": "Export", "selling": 1},
            ]
        if doctype == "Item Price":
            filters = kwargs.get("filters") or {}
            rows = [
                row
                for row in ITEM_PRICE_ROWS
                if row["price_list"] in set(filters.get("price_list", ("in", []))[1])
            ]
            modified_filter = filters.get("modified")
            if modified_filter:
                rows = [row for row in rows if row["modified"] > modified_filter[1]]
            start = kwargs.get("start") or 0
            limit = kwargs.get("limit_page_length") or len(rows)
            return [AttrDict(row) for row in rows[start : start + limit]]
        if doctype == "Deleted Document":
            return [
                AttrDict(
                    {
                        "deleted_name": "IP-DELETED",
                        "creation": "2026-06-01T10:03:00",
                    }
                )
            ]
        return []

    frappe_module.get_all = fake_get_all
    sys.modules["frappe"] = frappe_module

    api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
    api_utils_module.get_active_pos_profile = lambda user=None: {
        "name": "POS-TEST",
        "company": "Test Co",
        "selling_price_list": "Retail",
    }
    sys.modules["posawesome.posawesome.api.utils"] = api_utils_module
    sys.modules["posawesome.posawesome.api.offline_sync.common"] = load_offline_sync_common()


def _load_module():
    module_name = "test_offline_sync_item_prices_target"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "offline_sync" / "item_prices.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestOfflineSyncItemPrices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_stubs()
        cls.module = _load_module()

    def test_syncs_all_selling_price_lists_with_uom_currency_customer_and_validity(self):
        response = self.module.sync_item_prices(
            pos_profile="POS-TEST",
            watermark="2026-05-31T00:00:00",
            limit=10,
        )

        self.assertEqual(
            [row["key"] for row in response["changes"]],
            ["item_price::IP-001", "item_price::IP-002"],
        )
        self.assertEqual(response["changes"][1]["data"]["uom"], "Box")
        self.assertEqual(response["changes"][1]["data"]["currency"], "USD")
        self.assertEqual(response["changes"][1]["data"]["customer"], "CUST-001")
        self.assertEqual(response["changes"][1]["data"]["valid_upto"], "2026-12-31")
        self.assertEqual(response["deleted"], [{"key": "item_price::IP-DELETED"}])
        self.assertEqual(response["scope"]["price_lists"], ["Export", "Retail"])
        self.assertEqual(response["next_watermark"], "2026-06-01T10:03:00")

    def test_paginates_without_advancing_the_watermark_until_the_final_page(self):
        first = self.module.sync_item_prices(
            pos_profile="POS-TEST",
            watermark=None,
            offset=0,
            limit=1,
        )
        second = self.module.sync_item_prices(
            pos_profile="POS-TEST",
            watermark=None,
            offset=1,
            limit=1,
        )

        self.assertTrue(first["has_more"])
        self.assertEqual(first["next_offset"], 1)
        self.assertIsNone(first["next_watermark"])
        self.assertFalse(second["has_more"])
        self.assertEqual(second["next_watermark"], "2026-06-01T10:01:00")


if __name__ == "__main__":
    unittest.main()
