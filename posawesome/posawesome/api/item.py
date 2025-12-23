# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def create_item(item_data):
	"""
	Create an Item document with minimal fields
	
	Args:
		item_data: dict containing item details
			- item_code: Item Code (required)
			- item_name: Item Name (optional, defaults to item_code)
			- barcode: Barcode (optional)
			- item_group: Item Group (required)
			- stock_uom: Stock UOM (required)
			- description: Description (optional)
			- standard_rate: Standard Rate (optional)
			- opening_stock: Opening Stock (optional)
			- brand: Brand (optional)
			- valuation_rate: Valuation Rate (optional)
			- is_stock_item: Is Stock Item (default: 1)
			- is_sales_item: Is Sales Item (default: 1)
			- is_purchase_item: Is Purchase Item (default: 1)
	
	Returns:
		dict: Created Item document
	"""
	try:
		# Parse the item_data if it's a string
		if isinstance(item_data, str):
			import json
			item_data = json.loads(item_data)
		
		# Validate required fields
		if not item_data.get("item_code"):
			frappe.throw(_("Item Code is required"))
		
		if not item_data.get("item_group"):
			frappe.throw(_("Item Group is required"))
		
		if not item_data.get("stock_uom"):
			frappe.throw(_("Stock UOM is required"))
		
		# Check if item already exists
		if frappe.db.exists("Item", item_data.get("item_code")):
			frappe.throw(_("Item {0} already exists").format(item_data.get("item_code")))
		
		# Create Item document
		item = frappe.new_doc("Item")
		item.item_code = item_data.get("item_code")
		item.item_name = item_data.get("item_name") or item_data.get("item_code")
		item.item_group = item_data.get("item_group")
		item.stock_uom = item_data.get("stock_uom")
		
		# Optional fields
		if item_data.get("description"):
			item.description = item_data.get("description")
		
		if item_data.get("standard_rate"):
			item.standard_rate = item_data.get("standard_rate")
		
		if item_data.get("opening_stock"):
			item.opening_stock = item_data.get("opening_stock")
		
		if item_data.get("brand"):
			item.brand = item_data.get("brand")
		
		if item_data.get("valuation_rate"):
			item.valuation_rate = item_data.get("valuation_rate")
		
		# Boolean fields
		item.is_stock_item = item_data.get("is_stock_item", 1)
		item.is_sales_item = item_data.get("is_sales_item", 1)
		item.is_purchase_item = item_data.get("is_purchase_item", 1)
		
		# Insert the document
		item.insert(ignore_permissions=False)
		
		# Add barcode as a child table entry if provided
		if item_data.get("barcode"):
			barcode_doc = frappe.new_doc("Item Barcode")
			barcode_doc.parent = item.name
			barcode_doc.parenttype = "Item"
			barcode_doc.parentfield = "barcodes"
			barcode_doc.barcode = item_data.get("barcode")
			barcode_doc.barcode_type = ""
			barcode_doc.insert(ignore_permissions=False)
		
		frappe.db.commit()
		
		return {
			"name": item.name,
			"status": "success",
			"message": _("Item {0} created successfully").format(item.name)
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), _("Item Creation Error"))
		frappe.throw(_("Failed to create Item: {0}").format(str(e)))

