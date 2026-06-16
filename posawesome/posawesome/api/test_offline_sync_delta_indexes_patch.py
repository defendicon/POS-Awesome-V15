import importlib.util
import pathlib
import sys
import types
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
PATCHES_PATH = REPO_ROOT / "posawesome" / "patches.txt"
PATCH_PATH = REPO_ROOT / "posawesome" / "patches" / "add_offline_sync_delta_indexes.py"
PATCH_MODULE = "posawesome.patches.add_offline_sync_delta_indexes"


class FakeDB:
    def __init__(self):
        self.indexes = []

    def add_index(self, doctype, fields, index_name=None):
        self.indexes.append((doctype, tuple(fields), index_name))


def load_patch_module(fake_frappe):
    original_frappe = sys.modules.get("frappe")
    sys.modules["frappe"] = fake_frappe
    try:
        spec = importlib.util.spec_from_file_location(
            "test_offline_sync_delta_indexes_patch_target",
            PATCH_PATH,
        )
        if spec is None or spec.loader is None:
            raise ImportError("Unable to load offline sync delta indexes patch")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if original_frappe is None:
            sys.modules.pop("frappe", None)
        else:
            sys.modules["frappe"] = original_frappe


class TestOfflineSyncDeltaIndexesPatch(unittest.TestCase):
    def test_migration_chain_includes_offline_sync_delta_indexes(self):
        patches = PATCHES_PATH.read_text().splitlines()

        self.assertIn(PATCH_MODULE, patches)

    def test_patch_adds_delta_query_indexes(self):
        fake_frappe = types.SimpleNamespace(
            db=FakeDB(),
            log_error=lambda *args, **kwargs: None,
        )
        module = load_patch_module(fake_frappe)

        module.execute()

        expected = [
            (doctype, tuple(fields), index_name)
            for doctype, fields, index_name in module.SYNC_DELTA_INDEXES
        ]
        self.assertEqual(fake_frappe.db.indexes, expected)
        self.assertIn(
            (
                "Customer",
                ("disabled", "customer_group", "modified", "name"),
                "disabled_group_modified_name",
            ),
            fake_frappe.db.indexes,
        )
        self.assertIn(
            (
                "Item Price",
                ("price_list", "modified", "name"),
                "price_list_modified_name",
            ),
            fake_frappe.db.indexes,
        )


if __name__ == "__main__":
    unittest.main()
