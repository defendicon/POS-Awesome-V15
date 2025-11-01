# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate


@frappe.whitelist()
def create_stock_entry(stock_entry_data):
	"""
	Create a Stock Entry document with minimal fields
	
	Args:
		stock_entry_data: dict containing stock entry details
			- stock_entry_type: Stock Entry Type (required)
			- company: Company (required)
			- from_warehouse: Source Warehouse (optional)
			- to_warehouse: Target Warehouse (optional)
			- items: List of items with item_code, qty, s_warehouse, t_warehouse
			- remarks: Additional remarks (optional)
	
	Returns:
		dict: Created Stock Entry document
	"""
	try:
		# Parse the stock_entry_data if it's a string
		if isinstance(stock_entry_data, str):
			import json
			stock_entry_data = json.loads(stock_entry_data)
		
		# Validate required fields
		if not stock_entry_data.get("stock_entry_type"):
			frappe.throw(_("Stock Entry Type is required"))
		
		if not stock_entry_data.get("company"):
			frappe.throw(_("Company is required"))
		
		if not stock_entry_data.get("items") or len(stock_entry_data.get("items")) == 0:
			frappe.throw(_("At least one item is required"))
		
		# Get the purpose from Stock Entry Type
		stock_entry_type_doc = frappe.get_doc("Stock Entry Type", stock_entry_data.get("stock_entry_type"))
		purpose = stock_entry_type_doc.purpose
		
		# Create Stock Entry document
		stock_entry = frappe.new_doc("Stock Entry")
		stock_entry.stock_entry_type = stock_entry_data.get("stock_entry_type")
		stock_entry.purpose = purpose
		stock_entry.company = stock_entry_data.get("company")
		stock_entry.posting_date = nowdate()
		stock_entry.set_posting_time = 0
		
		# Set warehouses if provided
		if stock_entry_data.get("from_warehouse"):
			stock_entry.from_warehouse = stock_entry_data.get("from_warehouse")
		
		if stock_entry_data.get("to_warehouse"):
			stock_entry.to_warehouse = stock_entry_data.get("to_warehouse")
		
		# Set remarks if provided
		if stock_entry_data.get("remarks"):
			stock_entry.remarks = stock_entry_data.get("remarks")
		
		# Add items
		for item_data in stock_entry_data.get("items"):
			if not item_data.get("item_code"):
				continue
			
			item_row = stock_entry.append("items", {})
			item_row.item_code = item_data.get("item_code")
			item_row.qty = item_data.get("qty", 1)
			
			# Get item details
			item_doc = frappe.get_cached_doc("Item", item_data.get("item_code"))
			item_row.uom = item_data.get("uom") or item_doc.stock_uom
			
			# Set source warehouse (s_warehouse)
			if item_data.get("s_warehouse"):
				item_row.s_warehouse = item_data.get("s_warehouse")
			elif stock_entry_data.get("from_warehouse"):
				item_row.s_warehouse = stock_entry_data.get("from_warehouse")
			
			# Set target warehouse (t_warehouse)
			if item_data.get("t_warehouse"):
				item_row.t_warehouse = item_data.get("t_warehouse")
			elif stock_entry_data.get("to_warehouse"):
				item_row.t_warehouse = stock_entry_data.get("to_warehouse")
			
			# Validate at least one warehouse is set
			if not item_row.s_warehouse and not item_row.t_warehouse:
				frappe.throw(_("Either Source Warehouse or Target Warehouse must be specified for item {0}").format(item_row.item_code))
		
		# Insert the document
		stock_entry.insert(ignore_permissions=False)
		
		# Optionally submit the document
		# stock_entry.submit()
		
		frappe.db.commit()
		
		return {
			"name": stock_entry.name,
			"status": "success",
			"message": _("Stock Entry {0} created successfully").format(stock_entry.name)
		}
	
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), _("Stock Entry Creation Error"))
		frappe.throw(_("Failed to create Stock Entry: {0}").format(str(e)))

