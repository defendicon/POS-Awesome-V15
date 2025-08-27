import frappe


def execute():
    try:
        frappe.db.sql(
            """
                        ALTER TABLE `tabItem`
                        ADD FULLTEXT INDEX item_name_description_ft (item_name, description)
                        """
        )
    except Exception as e:
        frappe.log_error(str(e), "Add Item fulltext index")
