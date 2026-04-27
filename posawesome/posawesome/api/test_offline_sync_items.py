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
			"warehouse": "Stores - TC",
			"selling_price_list": "Retail",
			"modified": "2026-04-09T10:05:00",
		}
	)

	def fake_get_all(doctype, **kwargs):
		if doctype == "Item":
			return [
				{
					"item_code": "ITEM-REMOVED",
					"modified": "2026-04-09T10:06:00",
					"disabled": 1,
					"is_sales_item": 1,
					"is_fixed_asset": 0,
					"item_group": "Products",
					"variant_of": None,
				},
			]
		return []

	frappe_module.get_all = fake_get_all
	sys.modules["frappe"] = frappe_module

	api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
	api_utils_module.get_active_pos_profile = lambda user=None: {
		"name": "POS-TEST",
		"company": "Test Co",
		"warehouse": "Stores - TC",
		"selling_price_list": "Retail",
		"modified": "2026-04-09T10:05:00",
	}
	api_utils_module.expand_item_groups = lambda groups: list(groups or [])
	api_utils_module.get_item_groups = lambda pos_profile: ["Products"]
	sys.modules["posawesome.posawesome.api.utils"] = api_utils_module

	items_module = types.ModuleType("posawesome.posawesome.api.items")
	items_module.get_delta_items = (
		lambda pos_profile, modified_after=None, price_list=None, customer=None, limit=200: [
			{
				"item_code": "ITEM-001",
				"item_name": "Alpha",
				"modified": "2026-04-09T10:04:00",
				"price_list_rate": 10,
				"actual_qty": 5,
			},
			{
				"item_code": "ITEM-002",
				"item_name": "Beta",
				"modified": "2026-04-09T10:05:00",
				"price_list_rate": 20,
				"actual_qty": 8,
			},
		][:limit]
	)
	items_module.get_items = (
		lambda pos_profile, price_list=None, item_group="", search_value="", customer=None, start_after=None, limit=200, **kwargs: [
			{
				"item_code": "ITEM-001",
				"item_name": "Alpha",
				"modified": "2026-04-09T10:04:00",
				"price_list_rate": 10,
				"actual_qty": 5,
			},
			{
				"item_code": "ITEM-002",
				"item_name": "Beta",
				"modified": "2026-04-09T10:05:00",
				"price_list_rate": 20,
				"actual_qty": 8,
			},
			{
				"item_code": "ITEM-003",
				"item_name": "Gamma",
				"modified": "2026-04-09T10:06:00",
				"price_list_rate": 30,
				"actual_qty": 2,
			},
		][:limit]
	)
	sys.modules["posawesome.posawesome.api.items"] = items_module
	sys.modules["posawesome.posawesome.api.offline_sync.common"] = (
		load_offline_sync_common()
	)


def _load_module():
	module_name = "test_offline_sync_items_target"
	file_path = (
		REPO_ROOT
		/ "posawesome"
		/ "posawesome"
		/ "api"
		/ "offline_sync"
		/ "items.py"
	)
	spec = importlib.util.spec_from_file_location(module_name, file_path)
	module = importlib.util.module_from_spec(spec)
	sys.modules[module_name] = module
	spec.loader.exec_module(module)
	return module


class TestOfflineSyncItems(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		_install_stubs()
		cls.module = _load_module()

	def test_sync_items_returns_delta_changes_and_scoped_deletes(self):
		response = self.module.sync_items(
			pos_profile="POS-TEST",
			watermark="2026-04-09T09:59:00",
			limit=5,
		)

		self.assertEqual(
			[item["key"] for item in response["changes"]],
			["item::ITEM-001", "item::ITEM-002"],
		)
		self.assertEqual(response["changes"][0]["data"]["price_list_rate"], 10)
		self.assertEqual(response["deleted"], [{"key": "item::ITEM-REMOVED"}])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:06:00")
		self.assertFalse(response["has_more"])
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)

	def test_sync_items_uses_initial_page_pagination_without_watermark(self):
		response = self.module.sync_items(
			pos_profile="POS-TEST",
			watermark=None,
			limit=2,
		)

		self.assertEqual(
			[item["key"] for item in response["changes"]],
			["item::ITEM-001", "item::ITEM-002"],
		)
		self.assertEqual(response["deleted"], [])
		self.assertTrue(response["has_more"])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:05:00")
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)


if __name__ == "__main__":
	unittest.main()
