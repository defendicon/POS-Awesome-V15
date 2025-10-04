import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from posawesome.posawesome.api.items import get_items


class TestNumericItemCodes(FrappeTestCase):
    def setUp(self):
        items = [
            ("ALPHA-TEST", "Alpha"),
            ("BETA-TEST", "Beta"),
            ("002", "Gamma"),
            ("LARGE-BLUE-WIDGET", "Large Blue Plastic Widget"),
        ]
        for code, name in items:
            if frappe.db.exists("Item", code):
                item = frappe.get_doc("Item", code)
                item.item_name = name
                item.is_sales_item = 1
                item.is_fixed_asset = 0
                item.save(ignore_permissions=True)
            else:
                frappe.get_doc(
                    {
                        "doctype": "Item",
                        "item_code": code,
                        "item_name": name,
                        "stock_uom": "Nos",
                        "is_stock_item": 0,
                        "item_group": "All Item Groups",
                        "is_sales_item": 1,
                        "is_fixed_asset": 0,
                    }
                ).insert(ignore_permissions=True, ignore_mandatory=True)

    def test_numeric_code_appears_without_search(self):
        pos_profile = json.dumps({"name": "TestProfile"})
        with patch("posawesome.posawesome.api.items.get_items_details", return_value=[]):
            first_page = get_items(pos_profile, limit=2)
            last_name = first_page[-1]["item_name"]
            second_page = get_items(pos_profile, limit=2, start_after=last_name)
        codes = [i["item_code"] for i in second_page]
        self.assertIn("002", codes)

    def test_word_order_insensitive_search_returns_item(self):
        pos_profile = json.dumps(
            {
                "name": "TestProfileOrder",
                "posa_use_limit_search": 1,
                "posa_search_serial_no": 0,
                "posa_search_batch_no": 0,
            }
        )

        mock_detail = {
            "item_code": "LARGE-BLUE-WIDGET",
            "item_barcode": [],
            "item_uoms": [],
            "actual_qty": 0,
            "has_batch_no": 0,
            "has_serial_no": 0,
            "batch_no_data": [],
            "serial_no_data": [],
            "rate": 0,
            "price_list_rate": 0,
            "currency": "INR",
            "price_list_currency": "INR",
            "plc_conversion_rate": 1,
            "conversion_rate": 1,
        }

        with patch("posawesome.posawesome.api.items.get_items_details", return_value=[mock_detail]):
            results = get_items(pos_profile, search_value="Blue Large", limit=20)

        codes = [row["item_code"] for row in results]
        self.assertIn("LARGE-BLUE-WIDGET", codes)
