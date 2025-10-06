import json

import frappe
from frappe import _


@frappe.whitelist()
def get_bundle_components(bundles):
	"""Return component items for Product Bundles.

	Args:
	    bundles (str | list): JSON string or list of bundle item codes.

	Returns:
	    dict: mapping of bundle_code -> list of components dicts with
	    item_code, qty, uom, is_batch, is_serial.
	"""
	if isinstance(bundles, str):
		bundles = json.loads(bundles)

	result = {}
	for code in bundles or []:
		if not frappe.db.exists("Product Bundle", code):
			result[code] = []
			continue
		bundle = frappe.get_doc("Product Bundle", code)

		components = []
		for row in bundle.items:
			item = frappe.db.get_value(
				"Item",
				row.item_code,
				["has_batch_no", "has_serial_no", "stock_uom"],
				as_dict=True,
			)
			uom = row.uom or (item.stock_uom if item else None)
			components.append(
				{
					"item_code": row.item_code,
					"qty": row.qty,
					"uom": uom,
					"is_batch": item.has_batch_no if item else 0,
					"is_serial": item.has_serial_no if item else 0,
				}
			)
		result[code] = components

	return result
