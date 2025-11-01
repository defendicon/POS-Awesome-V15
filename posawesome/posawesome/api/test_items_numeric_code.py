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
