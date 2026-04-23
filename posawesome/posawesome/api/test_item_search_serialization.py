import importlib.util
import json
import pathlib
import sys
import types
import unittest
from datetime import datetime

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda value: value
    frappe_module.as_json = lambda value: json.dumps(value, default=str)
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.get_all = lambda *args, **kwargs: []
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    sys.modules["frappe"] = frappe_module

    frappe_utils = types.ModuleType("frappe.utils")
    frappe_utils.cint = int
    frappe_utils.cstr = str
    frappe_utils.get_datetime = lambda value: value
    sys.modules["frappe.utils"] = frappe_utils

    frappe_cache = types.ModuleType("frappe.utils.caching")
    frappe_cache.redis_cache = lambda ttl=None: (lambda fn: fn)
    sys.modules["frappe.utils.caching"] = frappe_cache

    fetchers = types.ModuleType("posawesome.posawesome.api.item_fetchers")
    fetchers.ItemDetailAggregator = object
    sys.modules["posawesome.posawesome.api.item_fetchers"] = fetchers

    utils = types.ModuleType("posawesome.posawesome.api.utils")
    utils.HAS_VARIANTS_EXCLUSION = []
    utils.expand_item_groups = lambda *args, **kwargs: []
    utils.get_active_pos_profile = lambda *args, **kwargs: {}
    utils.get_item_groups = lambda *args, **kwargs: []
    utils._ensure_pos_profile = lambda value: value
    utils.log_perf_event = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.utils"] = utils

    barcode = types.ModuleType("posawesome.posawesome.api.item_processing.barcode")
    barcode.search_serial_or_batch_or_barcode_number = lambda *args, **kwargs: None
    sys.modules["posawesome.posawesome.api.item_processing.barcode"] = barcode

    details = types.ModuleType("posawesome.posawesome.api.item_processing.details")
    details.get_items_details = lambda *args, **kwargs: []
    sys.modules["posawesome.posawesome.api.item_processing.details"] = details


def _load_module():
    module_name = "test_item_search_serialization_target"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "item_processing" / "search.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestItemSearchSerialization(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_stubs()
        cls.module = _load_module()

    def test_run_item_query_serializes_datetime_rows_for_details(self):
        serialized_payloads = []

        def fake_get_all(*args, **kwargs):
            if fake_get_all.calls == 0:
                fake_get_all.calls += 1
                return [
                    {
                        "item_code": "ITEM-001",
                        "item_name": "Item 001",
                        "modified": datetime(2026, 4, 23, 10, 30, 0),
                    }
                ]
            return []

        fake_get_all.calls = 0

        def fake_get_items_details(pos_profile_json, items_json, **kwargs):
            serialized_payloads.append(items_json)
            return [{"item_code": "ITEM-001"}]

        self.module.frappe.get_all = fake_get_all
        self.module.get_items_details = fake_get_items_details
        self.module._build_attribute_maps = lambda *args, **kwargs: ({}, {})
        self.module._shape_item_row = lambda item, detail, plan, **kwargs: item
        self.module._matches_search_words = lambda *args, **kwargs: True

        plan = self.module.SearchPlan(
            filters={},
            or_filters=[],
            fields=["item_code", "item_name", "modified"],
            limit_page_length=1,
            limit_start=0,
            order_by="item_name asc",
            page_size=1,
            initial_page_start=0,
            item_code_for_search=None,
            search_words=[],
            normalized_search_value="",
            word_filter_active=False,
            include_description=False,
            include_image=False,
            posa_display_items_in_stock=False,
            posa_show_template_items=False,
        )

        result = self.module._run_item_query({}, None, None, plan)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["item_code"], "ITEM-001")
        self.assertEqual(len(serialized_payloads), 1)
        self.assertIn("2026-04-23 10:30:00", serialized_payloads[0])


if __name__ == "__main__":
    unittest.main()
