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
			"modified": "2026-04-09T10:06:00",
			"payments": [
				{"mode_of_payment": "Cash"},
				{"mode_of_payment": "Card"},
			],
		}
	)
	sys.modules["frappe"] = frappe_module

	payment_utils_module = types.ModuleType(
		"posawesome.posawesome.api.payment_processing.utils"
	)
	payment_utils_module.get_mode_of_payment_accounts = (
		lambda company, modes: {"Cash": "PKR", "Card": "USD"}
	)
	sys.modules[
		"posawesome.posawesome.api.payment_processing.utils"
	] = payment_utils_module

	api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
	api_utils_module.get_active_pos_profile = lambda user=None: {
		"name": "POS-TEST",
		"company": "Test Co",
		"modified": "2026-04-09T10:06:00",
		"payments": [
			{"mode_of_payment": "Cash"},
			{"mode_of_payment": "Card"},
		],
	}
	sys.modules["posawesome.posawesome.api.utils"] = api_utils_module
	sys.modules["posawesome.posawesome.api.offline_sync.common"] = (
		load_offline_sync_common()
	)


def _load_module():
	module_name = "test_offline_sync_payment_methods_target"
	file_path = (
		REPO_ROOT
		/ "posawesome"
		/ "posawesome"
		/ "api"
		/ "offline_sync"
		/ "payment_methods.py"
	)
	spec = importlib.util.spec_from_file_location(module_name, file_path)
	module = importlib.util.module_from_spec(spec)
	sys.modules[module_name] = module
	spec.loader.exec_module(module)
	return module


class TestOfflineSyncPaymentMethods(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		_install_stubs()
		cls.module = _load_module()

	def test_sync_payment_method_currencies_returns_profile_mapping_snapshot(self):
		response = self.module.sync_payment_method_currencies(
			pos_profile="POS-TEST",
			watermark="2026-04-09T09:00:00",
		)

		self.assertEqual(
			[item["key"] for item in response["changes"]],
			["payment_method_currencies"],
		)
		self.assertEqual(
			response["changes"][0]["data"]["mapping"],
			{"Cash": "PKR", "Card": "USD"},
		)
		self.assertEqual(
			response["changes"][0]["data"]["payment_methods"],
			["Cash", "Card"],
		)
		self.assertEqual(response["deleted"], [])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:06:00")
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)

	def test_sync_payment_method_currencies_uses_watermark(self):
		response = self.module.sync_payment_method_currencies(
			pos_profile="POS-TEST",
			watermark="2026-04-09T10:06:00",
		)

		self.assertEqual(response["changes"], [])
		self.assertEqual(response["deleted"], [])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:06:00")
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)


if __name__ == "__main__":
	unittest.main()
