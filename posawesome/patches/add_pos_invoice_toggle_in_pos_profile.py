import frappe


def execute():
    if not frappe.db.exists(
        "Custom Field", "POS Profile-create_pos_invoice_instead_of_sales_invoice"
    ):
        frappe.get_doc(
            {
                "doctype": "Custom Field",
                "dt": "POS Profile",
                "fieldname": "create_pos_invoice_instead_of_sales_invoice",
                "fieldtype": "Check",
                "label": "Create POS Invoice instead of Sales Invoice",
                "insert_after": "posa_show_custom_name_marker_on_print",
            }
        ).insert()

