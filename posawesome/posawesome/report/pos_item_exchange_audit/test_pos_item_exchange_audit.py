import importlib.util
import json
import pathlib
import sys
import types
import unittest
from datetime import date, datetime, timedelta


REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
REPORT_PATH = pathlib.Path(__file__).with_name("pos_item_exchange_audit.py")
REPORT_JSON_PATH = pathlib.Path(__file__).with_name("pos_item_exchange_audit.json")
WORKSPACE_PATH = (
    REPO_ROOT
    / "posawesome"
    / "posawesome"
    / "workspace"
    / "pos_awesome"
    / "pos_awesome.json"
)
PATCHES_PATH = REPO_ROOT / "posawesome" / "patches.txt"
MODULE_CONFIG_PATH = REPO_ROOT / "posawesome" / "config" / "pos_awesome.py"
README_PATH = REPO_ROOT / "README.md"
_ORIGINAL_MODULES = dict(sys.modules)


class AttrDict(dict):
    __getattr__ = dict.get


def _date(value):
    if isinstance(value, (date, datetime)):
        return value.date() if isinstance(value, datetime) else value
    return datetime.strptime(str(value), "%Y-%m-%d").date()


def _load_report_module(rows=None, permitted=True):
    frappe = types.ModuleType("frappe")
    frappe._ = lambda text: text
    frappe._dict = lambda value=None: AttrDict(value or {})
    frappe.PermissionError = PermissionError
    frappe.has_permission = lambda *args, **kwargs: permitted
    frappe.throw = lambda message, *args, **kwargs: (_ for _ in ()).throw(ValueError(message))
    frappe.get_list_calls = []

    def get_list(*args, **kwargs):
        frappe.get_list_calls.append((args, kwargs))
        return [AttrDict(row) for row in (rows or [])]

    frappe.get_list = get_list
    sys.modules["frappe"] = frappe

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.add_days = lambda value, days: _date(value) + timedelta(days=days)
    frappe_utils.flt = lambda value, *_args, **_kwargs: float(value or 0)
    frappe_utils.getdate = _date
    sys.modules["frappe.utils"] = frappe_utils

    module_name = "posawesome_test_item_exchange_audit"
    spec = importlib.util.spec_from_file_location(module_name, REPORT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module, frappe


def tearDownModule():
    for name in list(sys.modules):
        if name in {"frappe", "frappe.utils", "posawesome_test_item_exchange_audit"}:
            if name in _ORIGINAL_MODULES:
                sys.modules[name] = _ORIGINAL_MODULES[name]
            else:
                sys.modules.pop(name, None)


class TestPOSItemExchangeAudit(unittest.TestCase):
    def test_execute_applies_scope_filters_and_includes_full_to_date(self):
        module, frappe = _load_report_module(
            rows=[
                {
                    "name": "POS-EXCH-00001",
                    "status": "Completed",
                    "currency": "PKR",
                    "return_total": 100,
                    "sale_total": 150,
                    "difference_amount": 50,
                    "settlement_type": "Customer Payment",
                }
            ]
        )

        columns, data, message, chart, summary = module.execute(
            {
                "from_date": "2026-09-01",
                "to_date": "2026-09-22",
                "company": "Example Co",
                "cashier": "cashier@example.com",
            }
        )

        query = frappe.get_list_calls[0][1]
        self.assertIn(["company", "=", "Example Co"], query["filters"])
        self.assertIn(["owner", "=", "cashier@example.com"], query["filters"])
        self.assertIn(["creation", ">=", "2026-09-01"], query["filters"])
        self.assertIn(["creation", "<", date(2026, 9, 23)], query["filters"])
        self.assertEqual(query["order_by"], "creation desc")
        self.assertTrue(columns)
        self.assertEqual(len(data), 1)
        self.assertIsNone(message)
        self.assertEqual(chart["type"], "donut")
        self.assertEqual(summary[0]["value"], 1)

    def test_summary_uses_completed_rows_and_does_not_mix_currencies(self):
        module, _frappe = _load_report_module()
        single_currency = module._prepare_rows(
            [
                AttrDict(
                    status="Completed",
                    settlement_type="Customer Payment",
                    currency="PKR",
                    return_total=100,
                    sale_total=150,
                    difference_amount=50,
                ),
                AttrDict(
                    status="Cancelled",
                    settlement_type="Even Exchange",
                    currency="PKR",
                    return_total=900,
                    sale_total=900,
                    difference_amount=0,
                ),
            ]
        )

        summary = module._get_report_summary(single_currency)

        self.assertEqual([row["value"] for row in summary[:3]], [2, 1, 1])
        self.assertEqual(summary[3]["value"], 100)
        self.assertEqual(summary[4]["value"], 150)
        self.assertEqual(summary[5]["value"], 50)
        self.assertEqual(summary[6]["value"], 0)
        chart = module._get_chart(single_currency)
        self.assertEqual(chart["data"]["datasets"][0]["values"], [1, 0, 0])

        mixed_currency = single_currency[:1] + [
            AttrDict(status="Completed", currency="USD", return_total=10, sale_total=20, difference_amount=10)
        ]
        mixed_currency = module._prepare_rows(mixed_currency)
        self.assertEqual(len(module._get_report_summary(mixed_currency)), 3)

    def test_rejects_invalid_date_range_and_missing_permission(self):
        module, _frappe = _load_report_module()
        with self.assertRaisesRegex(ValueError, "From Date cannot be after To Date"):
            module.execute({"from_date": "2026-09-23", "to_date": "2026-09-22"})

        module, _frappe = _load_report_module(permitted=False)
        with self.assertRaisesRegex(ValueError, "Not permitted"):
            module.execute({})

    def test_standard_report_and_workspace_are_exposed(self):
        report = json.loads(REPORT_JSON_PATH.read_text(encoding="utf-8"))
        workspace = json.loads(WORKSPACE_PATH.read_text(encoding="utf-8"))
        content = json.loads(workspace["content"])

        self.assertEqual(report["report_type"], "Script Report")
        self.assertEqual(report["ref_doctype"], "POS Item Exchange")
        self.assertTrue(
            any(link.get("link_to") == "POS Item Exchange Audit" for link in workspace["links"])
        )
        self.assertTrue(
            any((block.get("data") or {}).get("card_name") == "Item Exchange" for block in content)
        )
        patches = PATCHES_PATH.read_text(encoding="utf-8").splitlines()
        patch_name = "posawesome.patches.add_item_exchange_report_to_workspace"
        self.assertEqual(patches[0], "[pre_model_sync]")
        self.assertIn(patch_name, patches)
        self.assertLess(patches.index("[post_model_sync]"), patches.index(patch_name))
        self.assertIn(
            '"name": "POS Item Exchange Audit"',
            MODULE_CONFIG_PATH.read_text(encoding="utf-8"),
        )
        readme = README_PATH.read_text(encoding="utf-8")
        self.assertIn("### Item Exchange", readme)
        self.assertIn("Item Exchange Audit", readme)


if __name__ == "__main__":
    unittest.main()
