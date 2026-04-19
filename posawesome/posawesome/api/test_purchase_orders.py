import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _install_stubs():
	posawesome_pkg = types.ModuleType("posawesome")
	posawesome_pkg.__path__ = [str(REPO_ROOT / "posawesome")]
	sys.modules.setdefault("posawesome", posawesome_pkg)

	posawesome_inner_pkg = types.ModuleType("posawesome.posawesome")
	posawesome_inner_pkg.__path__ = [str(REPO_ROOT / "posawesome" / "posawesome")]
	sys.modules.setdefault("posawesome.posawesome", posawesome_inner_pkg)

	posawesome_api_pkg = types.ModuleType("posawesome.posawesome.api")
	posawesome_api_pkg.__path__ = [str(REPO_ROOT / "posawesome" / "posawesome" / "api")]
	sys.modules.setdefault("posawesome.posawesome.api", posawesome_api_pkg)

	frappe_module = types.ModuleType("frappe")
	frappe_module._ = lambda text: text
	frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
	frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
	frappe_module.get_doc = lambda *args, **kwargs: None
	frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)

	class _Db:
		def __init__(self):
			self.sql_calls = []

		def get_single_value(self, doctype, fieldname):
			if doctype == "Buying Settings" and fieldname == "buying_price_list":
				return "Standard Buying"
			return None

		def get_value(self, doctype, filters, fieldname=None):
			if doctype == "Price List" and filters == "Standard Buying" and fieldname == "currency":
				return "PKR"
			if doctype == "Price List" and isinstance(filters, dict) and fieldname == "name":
				return None
			if doctype == "Supplier" and fieldname == "default_price_list":
				return None
			if doctype == "Price List" and fieldname == "buying":
				return 1
			return None

		def exists(self, doctype, name):
			return doctype == "Supplier" and name == "SUP-001"

		def sql(self, query, params=None, as_dict=False):
			self.sql_calls.append((query, params, as_dict))
			if "FROM `tabPurchase Invoice Item`" not in query:
				return []
			if params and len(params) > 1 and params[1] == "SUP-001":
				return [
					{
						"item_code": "ITEM-001",
						"rate": 44,
						"uom": "Nos",
						"currency": "PKR",
						"invoice": "PINV-SUP-1",
						"posting_date": "2026-04-17",
						"supplier": "SUP-001",
					}
				]
			return [
				{
					"item_code": "ITEM-001",
					"rate": 41,
					"uom": "Nos",
					"currency": "PKR",
					"invoice": "PINV-ANY-1",
					"posting_date": "2026-04-16",
					"supplier": "SUP-XYZ",
				}
			]

	def fake_get_all(doctype, filters=None, fields=None, **kwargs):
		if doctype == "Item Price":
			raise AssertionError("Item Price lookups should use frappe.get_list")
		return []

	def fake_get_list(doctype, filters=None, fields=None, **kwargs):
		if doctype == "Item Price":
			return []
		return []

	frappe_module.db = _Db()
	frappe_module.get_all = fake_get_all
	frappe_module.get_list = fake_get_list
	sys.modules["frappe"] = frappe_module

	frappe_utils = types.ModuleType("frappe.utils")
	frappe_utils.cint = int
	frappe_utils.flt = float
	frappe_utils.nowdate = lambda: "2026-04-17"
	frappe_utils.getdate = lambda value=None: value
	sys.modules["frappe.utils"] = frappe_utils

	erpnext_accounts_party = types.ModuleType("erpnext.accounts.party")
	erpnext_accounts_party.get_party_account = lambda *args, **kwargs: "Creditors - TC"
	sys.modules["erpnext.accounts.party"] = erpnext_accounts_party

	utils_module = types.ModuleType("posawesome.posawesome.api.utils")
	utils_module.get_active_pos_profile = lambda: {
		"name": "POS-TEST",
		"warehouse": "Stores - TC",
		"company": "Test Co",
	}
	utils_module.get_default_warehouse = lambda company=None: "Stores - TC"
	sys.modules["posawesome.posawesome.api.utils"] = utils_module


def _load_module():
	module_name = "posawesome.posawesome.api.purchase_orders"
	file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "purchase_orders.py"
	spec = importlib.util.spec_from_file_location(module_name, file_path)
	module = importlib.util.module_from_spec(spec)
	sys.modules[module_name] = module
	spec.loader.exec_module(module)
	return module


class TestPurchaseOrdersApi(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.orig_sys_modules = sys.modules.copy()
		_install_stubs()
		cls.module = _load_module()

	@classmethod
	def tearDownClass(cls):
		cls.module = None
		sys.modules.clear()
		sys.modules.update(cls.orig_sys_modules)

	def test_get_last_buying_rate_works_without_supplier(self):
		result = self.module.get_last_buying_rate(None, ["ITEM-001"])

		self.assertEqual(result["ITEM-001"]["rate"], 41)
		self.assertEqual(result["ITEM-001"]["source"], "last_invoice")
		self.assertEqual(result["ITEM-001"]["invoice"], "PINV-ANY-1")
		self.assertEqual(result["ITEM-001"]["supplier"], "SUP-XYZ")

	def test_get_last_buying_rate_prefers_supplier_specific_history(self):
		self.module.frappe.db.sql_calls.clear()

		result = self.module.get_last_buying_rate("SUP-001", ["ITEM-001"])

		self.assertEqual(result["ITEM-001"]["rate"], 44)
		self.assertEqual(result["ITEM-001"]["invoice"], "PINV-SUP-1")
		self.assertEqual(result["ITEM-001"]["supplier"], "SUP-001")
		purchase_invoice_sql = next(
			call for call in self.module.frappe.db.sql_calls if "FROM `tabPurchase Invoice Item`" in call[0]
		)
		self.assertIn("ROW_NUMBER() OVER", purchase_invoice_sql[0])

	def test_get_last_buying_rate_wraps_json_scalar_item_code_before_tuple_lookup(self):
		self.module.frappe.db.sql_calls.clear()

		result = self.module.get_last_buying_rate(None, '"ITEM-001"')

		self.assertEqual(result["ITEM-001"]["rate"], 41)
		purchase_invoice_sql = next(
			call for call in self.module.frappe.db.sql_calls if "FROM `tabPurchase Invoice Item`" in call[0]
		)
		self.assertEqual(purchase_invoice_sql[1][0], ("ITEM-001",))

	def test_get_last_buying_rate_ignores_invalid_decoded_item_code_shapes(self):
		self.module.frappe.db.sql_calls.clear()

		result = self.module.get_last_buying_rate(None, '{"bad": "shape"}')

		self.assertEqual(result, {})
		self.assertFalse(
			any("FROM `tabPurchase Invoice Item`" in call[0] for call in self.module.frappe.db.sql_calls)
		)


if __name__ == "__main__":
	unittest.main()
