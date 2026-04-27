import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class AttrDict(dict):
	__getattr__ = dict.get


def _install_stubs():
	frappe_module = types.ModuleType("frappe")
	frappe_module._dict = lambda value=None: AttrDict(value or {})
	frappe_module.get_all = lambda *args, **kwargs: []
	frappe_module.get_cached_value = lambda *args, **kwargs: None
	frappe_module.get_value = lambda *args, **kwargs: None
	frappe_module.log_error = lambda *args, **kwargs: None

	class _Db:
		def has_column(self, doctype, fieldname):
			if doctype == "Item" and fieldname in {"valuation_rate", "default_bom"}:
				return True
			if doctype == "BOM" and fieldname in {
				"base_total_cost",
				"total_cost",
				"raw_material_cost",
				"operating_cost",
				"quantity",
			}:
				return True
			return False

		def get_value(self, doctype, name, fieldname=None):
			if doctype == "Company" and fieldname == "default_currency":
				return "PKR"
			return None

	frappe_module.db = _Db()
	frappe_qb = types.SimpleNamespace(from_=lambda *args, **kwargs: None)
	frappe_module.qb = frappe_qb
	sys.modules["frappe"] = frappe_module

	frappe_qb_module = types.ModuleType("frappe.query_builder")
	frappe_qb_module.DocType = lambda name: name
	sys.modules["frappe.query_builder"] = frappe_qb_module

	frappe_qb_functions = types.ModuleType("frappe.query_builder.functions")
	frappe_qb_functions.Sum = lambda field: field
	sys.modules["frappe.query_builder.functions"] = frappe_qb_functions

	frappe_utils = types.ModuleType("frappe.utils")
	frappe_utils.cint = int
	frappe_utils.flt = float
	frappe_utils.nowdate = lambda: "2026-04-17"
	sys.modules["frappe.utils"] = frappe_utils

	frappe_cache = types.ModuleType("frappe.utils.caching")
	frappe_cache.redis_cache = lambda ttl=None: (lambda fn: fn)
	sys.modules["frappe.utils.caching"] = frappe_cache

	erpnext_utils = types.ModuleType("erpnext.setup.utils")
	erpnext_utils.get_exchange_rate = lambda *args, **kwargs: 1
	sys.modules["erpnext.setup.utils"] = erpnext_utils


def _load_module():
	module_name = "test_item_fetchers_target"
	file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "item_fetchers.py"
	spec = importlib.util.spec_from_file_location(module_name, file_path)
	module = importlib.util.module_from_spec(spec)
	sys.modules[module_name] = module
	spec.loader.exec_module(module)
	return module


class TestItemFetchers(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		_install_stubs()
		cls.module = _load_module()

	def test_get_bom_costs_prefers_item_default_bom(self):
		meta_rows = [
			AttrDict({"name": "ITEM-001", "default_bom": "BOM-DEFAULT"}),
			AttrDict({"name": "ITEM-002", "default_bom": None}),
		]

		default_rows = [
			AttrDict(
				{
					"name": "BOM-DEFAULT",
					"item": "ITEM-001",
					"is_active": 1,
					"docstatus": 1,
					"is_default": 0,
					"quantity": 2,
					"base_total_cost": 50,
				}
			)
		]
		fallback_rows = [
			AttrDict(
				{
					"name": "BOM-FALLBACK",
					"item": "ITEM-002",
					"is_active": 1,
					"docstatus": 1,
					"is_default": 1,
					"quantity": 5,
					"base_total_cost": 200,
				}
			)
		]

		self.module.frappe.get_all = lambda doctype, filters=None, **kwargs: (
			default_rows if filters and filters.get("name") else fallback_rows
		)

		result = self.module.get_bom_costs(meta_rows)

		self.assertEqual(result["ITEM-001"]["bom"], "BOM-DEFAULT")
		self.assertEqual(result["ITEM-001"]["rate"], 25.0)
		self.assertEqual(result["ITEM-002"]["bom"], "BOM-FALLBACK")
		self.assertEqual(result["ITEM-002"]["rate"], 40.0)

	def test_merge_item_row_exposes_bom_cost_metadata(self):
		lookup = self.module.ItemLookupData(
			price_map={},
			stock_map={},
			meta_map={"ITEM-001": AttrDict({"name": "ITEM-001", "stock_uom": "Nos"})},
			uom_map={},
			barcode_map={},
			batch_map={},
			serial_map={},
			bom_map={"ITEM-001": {"rate": 33, "bom": "BOM-ITEM-001", "source": "bom"}},
		)

		row = self.module.merge_item_row(
			{"item_code": "ITEM-001"},
			lookup,
			"PKR",
			1,
		)

		self.assertEqual(row["manufacturing_cost"], 33)
		self.assertEqual(row["manufacturing_cost_source"], "bom")
		self.assertEqual(row["manufacturing_bom"], "BOM-ITEM-001")

	def test_fetch_barcodes_includes_standard_uom_field(self):
		calls = []

		def fake_get_all(doctype, **kwargs):
			calls.append((doctype, kwargs))
			return [AttrDict({"parent": "ITEM-001", "barcode": "BOX-001", "uom": "Box", "posa_uom": None})]

		self.module.frappe.get_all = fake_get_all

		rows = self.module._fetch_barcodes(("ITEM-001",))

		self.assertEqual(rows[0].uom, "Box")
		self.assertEqual(calls[0][0], "Item Barcode")
		self.assertIn("uom", calls[0][1]["fields"])


if __name__ == "__main__":
	unittest.main()
