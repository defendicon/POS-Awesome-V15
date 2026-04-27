import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


class AttrDict(dict):
    __getattr__ = dict.get


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.DoesNotExistError = Exception
    frappe_module.log_error = lambda *args, **kwargs: None
    frappe_module.get_cached_doc = lambda *args, **kwargs: None
    frappe_module.get_all = lambda *args, **kwargs: []
    sys.modules["frappe"] = frappe_module

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.cint = int
    frappe_utils.cstr = str
    frappe_utils.flt = float
    sys.modules["frappe.utils"] = frappe_utils


def _load_module():
    module_name = "test_barcode_target"
    file_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "api"
        / "item_processing"
        / "barcode.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestBarcodeProcessing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_stubs()
        cls.module = _load_module()

    def test_get_items_from_barcode_uses_standard_uom_when_posa_uom_empty(self):
        calls = []

        class Db:
            def get_value(self, doctype, filters, fields=None, as_dict=False):
                calls.append((doctype, filters, fields, as_dict))
                if doctype == "Item Barcode":
                    return AttrDict(
                        {
                            "item_code": "ITEM-001",
                            "uom": "Box",
                            "posa_uom": None,
                        }
                    )
                if doctype == "Item Price":
                    return 120
                return None

        self.module.frappe.db = Db()
        self.module.frappe.get_cached_doc = lambda doctype, name: AttrDict(
            {"name": name, "item_name": "Item 001", "stock_uom": "Nos"}
        )
        self.module._parse_scale_barcode_data = lambda barcode: None

        result = self.module.get_items_from_barcode(
            "Standard Selling",
            "USD",
            "BOX-001",
        )

        self.assertEqual(result["uom"], "Box")
        self.assertIn("uom", calls[0][2])


if __name__ == "__main__":
    unittest.main()
