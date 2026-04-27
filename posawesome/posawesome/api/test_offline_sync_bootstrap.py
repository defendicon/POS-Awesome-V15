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
			"selling_price_list": "Retail",
			"modified": "2026-04-09T10:05:00",
		}
	)
	frappe_module.get_all = lambda doctype, **kwargs: [
		{"name": "Retail", "modified": "2026-04-09T10:03:00"},
		{"name": "Wholesale", "modified": "2026-04-09T10:02:00"},
	]
	sys.modules["frappe"] = frappe_module

	utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")
	utilities_module.get_pos_profile_tax_inclusive = lambda profile_name: 1
	utilities_module.get_selling_price_lists = lambda: [
		{"name": "Retail"},
		{"name": "Wholesale"},
	]
	sys.modules["posawesome.posawesome.api.utilities"] = utilities_module

	invoice_utils_module = types.ModuleType(
		"posawesome.posawesome.api.invoice_processing.utils"
	)
	invoice_utils_module.get_price_list_currency = lambda price_list: "PKR"
	sys.modules[
		"posawesome.posawesome.api.invoice_processing.utils"
	] = invoice_utils_module

	api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
	api_utils_module.get_active_pos_profile = lambda user=None: {
		"name": "POS-TEST",
		"company": "Test Co",
		"selling_price_list": "Retail",
		"modified": "2026-04-09T10:05:00",
	}
	sys.modules["posawesome.posawesome.api.utils"] = api_utils_module
	sys.modules["posawesome.posawesome.api.offline_sync.common"] = (
		load_offline_sync_common()
	)


def _load_module():
	module_name = "test_offline_sync_bootstrap_target"
	file_path = (
		REPO_ROOT
		/ "posawesome"
		/ "posawesome"
		/ "api"
		/ "offline_sync"
		/ "bootstrap.py"
	)
	spec = importlib.util.spec_from_file_location(module_name, file_path)
	module = importlib.util.module_from_spec(spec)
	sys.modules[module_name] = module
	spec.loader.exec_module(module)
	return module


class TestOfflineSyncBootstrap(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		_install_stubs()
		cls.module = _load_module()

	def test_sync_bootstrap_config_returns_bootstrap_and_price_list_meta_changes(self):
		response = self.module.sync_bootstrap_config(
			pos_profile="POS-TEST",
			watermark="2026-04-09T09:59:00",
		)

		self.assertEqual(
			[item["key"] for item in response["changes"]],
			["bootstrap_config", "price_list_meta"],
		)
		self.assertEqual(response["changes"][0]["data"]["tax_inclusive"], 1)
		self.assertEqual(
			response["changes"][1]["data"]["selected_price_list"], "Retail"
		)
		self.assertEqual(response["changes"][1]["data"]["price_list_currency"], "PKR")
		self.assertEqual(response["deleted"], [])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:05:00")
		self.assertFalse(response["has_more"])
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)

	def test_sync_bootstrap_config_uses_watermark_to_skip_unchanged_records(self):
		response = self.module.sync_bootstrap_config(
			pos_profile="POS-TEST",
			watermark="2026-04-09T10:05:00",
		)

		self.assertEqual(response["changes"], [])
		self.assertEqual(response["deleted"], [])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:05:00")
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)

	def test_sync_bootstrap_config_requires_full_resync_on_schema_mismatch(self):
		response = self.module.sync_bootstrap_config(
			pos_profile="POS-TEST",
			schema_version="legacy-schema",
		)

		self.assertTrue(response["full_resync_required"])
		self.assertEqual(response["changes"], [])
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)


if __name__ == "__main__":
	unittest.main()
