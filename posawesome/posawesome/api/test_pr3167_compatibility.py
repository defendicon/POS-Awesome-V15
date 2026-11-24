"""Standalone regressions for the imported bundle and closing-table fixes."""

import ast
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[2]


class Row(dict):
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__

    def precision(self, _field):
        return 3


class BundleBatchTests(unittest.TestCase):
    def setUp(self):
        self.frappe = SimpleNamespace(
            get_cached_value=Mock(return_value=True),
            throw=Mock(side_effect=lambda message: self.fail_batch(message)),
        )
        source = ast.parse((ROOT / "posawesome/api/utilities.py").read_text(encoding="utf-8"))
        functions = [
            node for node in source.body
            if isinstance(node, ast.FunctionDef)
            and node.name in {"_get_available_batches", "set_batch_nos_for_bundels"}
        ]
        self.namespace = {
            "frappe": self.frappe,
            "flt": lambda value, precision=None: round(float(value or 0), precision or 9),
            "_": lambda value: value,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), "utilities.py", "exec"), self.namespace)
        self.available = Mock(return_value=[("SMALL", 2), ("ENOUGH", 12)])
        self.namespace["_get_available_batches"] = self.available
        self.select = self.namespace["set_batch_nos_for_bundels"]

    @staticmethod
    def fail_batch(message):
        raise ValueError(message)

    def row(self, **values):
        return Row(
            item_code="COMPONENT", warehouse="Profile Warehouse", stock_qty=5,
            idx=1, meta=SimpleNamespace(has_field=lambda _field: True), **values,
        )

    def test_selects_first_batch_covering_stock_uom_quantity(self):
        row = self.row()
        doc = Row(packed_items=[row], posting_date="2026-11-23", posting_time="12:00:00")
        self.select(doc, "warehouse", throw=True)
        self.assertEqual(row.batch_no, "ENOUGH")
        self.assertEqual(row.use_serial_batch_fields, 1)
        self.available.assert_called_once_with(doc, "COMPONENT", "Profile Warehouse")

    def test_preserves_explicit_batch_and_rejects_insufficient_quantity(self):
        row = self.row(batch_no="ENOUGH")
        self.select(Row(packed_items=[row]), "warehouse", throw=True)
        self.assertEqual(row.batch_no, "ENOUGH")
        row.batch_no = "SMALL"
        with self.assertRaisesRegex(ValueError, "only 2 qty"):
            self.select(Row(packed_items=[row]), "warehouse", throw=True)

    def test_no_available_batch_respects_throw_option(self):
        self.available.return_value = []
        row = self.row()
        self.select(Row(packed_items=[row]), "warehouse")
        self.assertIsNone(row.batch_no)
        with self.assertRaisesRegex(ValueError, "No batch"):
            self.select(Row(packed_items=[row]), "warehouse", throw=True)

    def test_skips_returns_existing_bundles_and_non_batch_items(self):
        for row in [self.row(serial_and_batch_bundle="SABB-001"), self.row()]:
            row.stock_qty = -5
            self.select(Row(packed_items=[row]), "warehouse", throw=True)
        self.select(Row(packed_items=[self.row(serial_and_batch_bundle="SABB-001")]), "warehouse")
        self.frappe.get_cached_value.return_value = False
        self.select(Row(packed_items=[self.row()]), "warehouse")
        self.select(Row(), "warehouse")
        self.available.assert_not_called()

    def test_availability_aggregates_batch_rows_and_passes_sale_time(self):
        tree = ast.parse((ROOT / "posawesome/api/utilities.py").read_text(encoding="utf-8"))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_get_available_batches")
        exec(compile(ast.Module(body=[function], type_ignores=[]), "utilities.py", "exec"), self.namespace)
        module_name = "erpnext.stock.doctype.batch.batch"
        module = ModuleType(module_name)
        module.get_batch_qty = Mock(return_value=[
            Row(batch_no="B1", qty=2), Row(batch_no="B1", qty=3), Row(batch_no="B2", qty=8),
        ])
        doc = Row(posting_date="2026-11-23", posting_time="10:00:00")
        with patch.dict(sys.modules, {module_name: module}):
            result = self.namespace["_get_available_batches"](doc, "COMPONENT", "WH")
        self.assertEqual(result, [("B1", 5), ("B2", 8)])
        module.get_batch_qty.assert_called_once_with(
            item_code="COMPONENT", warehouse="WH", posting_date="2026-11-23", posting_time="10:00:00",
        )


class ReferenceOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.frappe = ModuleType("frappe")
        self.frappe.db = Mock()
        self.frappe.db.exists.return_value = True
        self.frappe.db.get_value.side_effect = lambda _dt, _name, field: {"module": "POSAwesome", "custom": 0}[field]
        self.frappe.reload_doc = Mock()
        self.frappe.clear_cache = Mock()
        self.frappe.get_doc = Mock()
        path = ROOT / "patches/restore_erpnext_sales_invoice_reference.py"
        spec = importlib.util.spec_from_file_location("reference_ownership", path)
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"frappe": self.frappe}):
            spec.loader.exec_module(self.module)

    def test_v16_transfers_metadata_and_reloads_core_without_touching_rows(self):
        with patch.object(self.module.importlib.util, "find_spec", return_value=object()):
            self.module.execute()
        self.frappe.db.set_value.assert_called_once_with(
            "DocType", "Sales Invoice Reference", {"module": "Accounts", "custom": 0}, update_modified=False,
        )
        self.frappe.reload_doc.assert_called_once_with("accounts", "doctype", "sales_invoice_reference", force=True)
        self.frappe.get_doc.assert_not_called()

    def test_v16_already_owned_definition_is_not_rewritten_each_migrate(self):
        self.frappe.db.get_value.side_effect = lambda _dt, _name, field: {"module": "Accounts", "custom": 0}[field]
        with patch.object(self.module.importlib.util, "find_spec", return_value=object()):
            self.module.execute()
        self.frappe.db.set_value.assert_not_called()
        self.frappe.reload_doc.assert_not_called()

    def test_v15_existing_child_becomes_custom_and_keeps_unrelated_fields(self):
        doc = Mock(custom=0)
        doc.fields = [Row(fieldname="sales_invoice"), Row(fieldname="transaction_currency"), Row(fieldname="transaction_amount"), Row(fieldname="my_custom_note")]
        self.frappe.get_doc.return_value = doc
        with patch.object(self.module.importlib.util, "find_spec", return_value=None):
            self.module.execute()
        self.assertEqual(doc.custom, 1)
        doc.set.assert_called_once_with("fields", [doc.fields[0], doc.fields[3]])
        doc.save.assert_called_once_with(ignore_permissions=True)
        self.frappe.reload_doc.assert_not_called()

    def test_v15_fresh_install_creates_legacy_child_before_custom_field_fixtures(self):
        self.frappe.db.exists.return_value = False
        error = ModuleNotFoundError(name="erpnext.accounts.doctype.sales_invoice_reference")
        with patch.object(self.module.importlib.util, "find_spec", side_effect=error):
            self.module.execute()
        schema = self.frappe.get_doc.call_args.args[0]
        self.assertEqual(schema["name"], "Sales Invoice Reference")
        self.assertEqual(schema["custom"], 1)
        self.assertTrue(schema["istable"])
        self.assertNotIn("transaction_currency", [field["fieldname"] for field in schema["fields"]])
        self.frappe.get_doc.return_value.insert.assert_called_once_with(ignore_permissions=True)

    def test_v15_existing_custom_definition_is_idempotent(self):
        doc = Mock(custom=1)
        doc.fields = [Row(fieldname="sales_invoice")]
        self.frappe.get_doc.return_value = doc
        with patch.object(self.module.importlib.util, "find_spec", return_value=None):
            self.module.execute()
        doc.save.assert_not_called()

    def test_broken_erpnext_import_is_not_silently_ignored(self):
        with patch.object(self.module.importlib.util, "find_spec", side_effect=ModuleNotFoundError(name="erpnext")):
            with self.assertRaises(ModuleNotFoundError):
                self.module.execute()


if __name__ == "__main__":
    unittest.main()
