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

	def fake_get_all(doctype, **kwargs):
		if doctype == "Currency":
			return [
				{"name": "PKR", "enabled": 1, "modified": "2026-04-09T10:00:00"},
				{"name": "USD", "enabled": 1, "modified": "2026-04-09T10:02:00"},
				{"name": "EUR", "enabled": 0, "modified": "2026-04-09T10:03:00"},
			]
		if doctype == "Currency Exchange":
			return [{"modified": "2026-04-09T10:04:00"}]
		return []

	frappe_module.get_all = fake_get_all
	frappe_module.get_cached_doc = lambda doctype, name: AttrDict(
		{
			"name": name,
			"company": "Test Co",
			"currency": "PKR",
			"selling_price_list": "Retail",
			"modified": "2026-04-09T10:01:00",
		}
	)
	sys.modules["frappe"] = frappe_module

	invoice_utils_module = types.ModuleType(
		"posawesome.posawesome.api.invoice_processing.utils"
	)
	invoice_utils_module.get_available_currencies = lambda: [
		{"name": "PKR"},
		{"name": "USD"},
	]
	invoice_utils_module.get_latest_rate = lambda from_currency, to_currency: (
		279.5,
		"2026-04-09",
	)
	invoice_utils_module.get_price_list_currency = lambda price_list: "PKR"
	sys.modules[
		"posawesome.posawesome.api.invoice_processing.utils"
	] = invoice_utils_module

	api_utils_module = types.ModuleType("posawesome.posawesome.api.utils")
	api_utils_module.get_active_pos_profile = lambda user=None: {
		"name": "POS-TEST",
		"company": "Test Co",
		"currency": "PKR",
		"selling_price_list": "Retail",
		"modified": "2026-04-09T10:01:00",
	}
	sys.modules["posawesome.posawesome.api.utils"] = api_utils_module
	sys.modules["posawesome.posawesome.api.offline_sync.common"] = (
		load_offline_sync_common()
	)


def _load_module():
	module_name = "test_offline_sync_currencies_target"
	file_path = (
		REPO_ROOT
		/ "posawesome"
		/ "posawesome"
		/ "api"
		/ "offline_sync"
		/ "currencies.py"
	)
	spec = importlib.util.spec_from_file_location(module_name, file_path)
	module = importlib.util.module_from_spec(spec)
	sys.modules[module_name] = module
	spec.loader.exec_module(module)
	return module


class TestOfflineSyncCurrencies(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		_install_stubs()
		cls.module = _load_module()

	def test_sync_currency_scope_returns_enabled_currencies_pairs_and_deletes(self):
		response = self.module.sync_currency_scope(
			pos_profile="POS-TEST",
			watermark="2026-04-09T09:59:00",
			currency_pairs='[{"from_currency":"USD","to_currency":"PKR"}]',
		)

		self.assertEqual(
			[item["key"] for item in response["changes"]],
			["currency_options", "exchange_rate::USD::PKR"],
		)
		self.assertEqual(
			response["changes"][0]["data"],
			[{"name": "PKR"}, {"name": "USD"}],
		)
		self.assertEqual(
			response["changes"][1]["data"]["exchange_rate"], 279.5
		)
		self.assertEqual(
			response["deleted"],
			[{"key": "currency::EUR"}],
		)
		self.assertEqual(response["next_watermark"], "2026-04-09T10:04:00")
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)

	def test_sync_currency_scope_skips_unchanged_results_for_current_watermark(self):
		response = self.module.sync_currency_scope(
			pos_profile="POS-TEST",
			watermark="2026-04-09T10:04:00",
			currency_pairs='[{"from_currency":"USD","to_currency":"PKR"}]',
		)

		self.assertEqual(response["changes"], [])
		self.assertEqual(response["deleted"], [])
		self.assertEqual(response["next_watermark"], "2026-04-09T10:04:00")
		self.assertEqual(response["schema_version"], self.module.SYNC_SCHEMA_VERSION)
		self.assertIn("next_watermark", response)
		self.assertIn("has_more", response)


if __name__ == "__main__":
	unittest.main()
