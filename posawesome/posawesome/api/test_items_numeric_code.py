import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from posawesome.posawesome.api.items import get_items


class TestNumericItemCodes(FrappeTestCase):
    def _upsert_item(self, item_code, item_name, **extra_fields):
        if frappe.db.exists("Item", item_code):
            item = frappe.get_doc("Item", item_code)
            item.item_name = item_name
            for field_name, field_value in extra_fields.items():
                item.set(field_name, field_value)
            item.save(ignore_permissions=True)
            return

        payload = {
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "stock_uom": "Nos",
            "item_group": "All Item Groups",
            "is_sales_item": 1,
            "is_fixed_asset": 0,
        }
        payload.update(extra_fields)
        frappe.get_doc(payload).insert(ignore_permissions=True, ignore_mandatory=True)

    def setUp(self):
        items = [
            ("ALPHA-TEST", "Alpha"),
            ("BETA-TEST", "Beta"),
            ("002", "Gamma"),
        ]
        for code, name in items:
            self._upsert_item(code, name, is_stock_item=0)

    def test_numeric_code_appears_without_search(self):
        pos_profile = json.dumps({"name": "TestProfile"})
        with patch("posawesome.posawesome.api.items.get_items_details", return_value=[]):
            first_page = get_items(pos_profile, limit=2)
            self.assertTrue(first_page)
            last_name = first_page[-1]["item_name"]
            second_page = get_items(pos_profile, limit=2, start_after=last_name)
        codes = [i["item_code"] for i in second_page]
        self.assertIn("002", codes)

    def test_item_search_with_whitespace(self):
        # Create an item with a barcode
        item_code = "TEST-ITEM-123"
        barcode = "123456789"

        if not frappe.db.exists("Item", item_code):
            self._upsert_item(
                item_code,
                "Test Item Whitespace",
                barcodes=[{"barcode": barcode}],
            )

        pos_profile = json.dumps({"name": "TestProfile"})

        # Search with leading/trailing whitespace
        items = get_items(pos_profile, search_value=f"  {barcode}  ")

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["item_code"], item_code)
