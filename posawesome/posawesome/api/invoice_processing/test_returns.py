import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
_ORIGINAL_MODULES = dict(sys.modules)


def tearDownModule():
    managed_prefixes = ("frappe", "posawesome")
    for name in list(sys.modules):
        if name.startswith(managed_prefixes) and name not in _ORIGINAL_MODULES:
            sys.modules.pop(name, None)
    for name, module in _ORIGINAL_MODULES.items():
        if name.startswith(managed_prefixes):
            sys.modules[name] = module


def _install_framework_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
    )
    frappe_module.get_all = lambda *args, **kwargs: []
    frappe_module.get_cached_doc = lambda *args, **kwargs: None
    frappe_module.get_meta = lambda *args, **kwargs: types.SimpleNamespace(
        get_field=lambda fieldname: None
    )
    sys.modules["frappe"] = frappe_module

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.cint = lambda value: int(value or 0)
    frappe_utils.flt = lambda value, *_args, **_kwargs: float(value or 0)
    frappe_utils.getdate = lambda value: value
    frappe_utils.nowdate = lambda: "2026-07-28"
    sys.modules["frappe.utils"] = frappe_utils

    return frappe_module


def _install_dependency_stubs():
    processing_utils = types.ModuleType("posawesome.posawesome.api.invoice_processing.utils")
    processing_utils._get_return_validity_settings = lambda *_args, **_kwargs: (False, 0)
    sys.modules["posawesome.posawesome.api.invoice_processing.utils"] = processing_utils

    api_utils = types.ModuleType("posawesome.posawesome.api.utils")
    api_utils.log_perf_event = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.utils"] = api_utils


def _install_package_stubs():
    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
        "posawesome.posawesome.api.invoice_processing": (
            REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice_processing"
        ),
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


def _load_returns_module():
    module_name = "posawesome.posawesome.api.invoice_processing.returns"
    file_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "api"
        / "invoice_processing"
        / "returns.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestReturnInvoiceQueries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        cls.returns = _load_returns_module()

    def test_refundable_cash_uses_frappe_query_builder_aggregate_field_syntax(self):
        captured = {}
        self.returns.frappe.db.get_value = lambda *args, **kwargs: {
            "grand_total": 100,
            "outstanding_amount": 20,
        }

        def fake_get_all(doctype, **kwargs):
            captured["fields"] = kwargs.get("fields")
            for field in captured["fields"]:
                if isinstance(field, str) and "(" in field:
                    raise AssertionError("SQL functions are not allowed as strings in SELECT")
            return [{"total": -25}]

        self.returns.frappe.get_all = fake_get_all

        refundable = self.returns.compute_original_refundable_cash(
            "Sales Invoice",
            "SINV-0001",
        )

        self.assertEqual(captured["fields"], [{"SUM": "grand_total", "as": "total"}])
        self.assertEqual(refundable, 55)


if __name__ == "__main__":
    unittest.main()
