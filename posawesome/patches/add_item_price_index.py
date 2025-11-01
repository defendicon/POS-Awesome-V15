import frappe


def execute():
    try:
        frappe.db.add_index("Item Price", ["price_list", "item_code"], index_name="price_list_item_code")
    except Exception as e:
        frappe.log_error(str(e), "Add Item Price index")
