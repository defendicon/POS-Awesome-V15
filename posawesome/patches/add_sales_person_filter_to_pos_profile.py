import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


def execute():
    if not frappe.db.exists("DocType", "POSA Sales Person Filter"):
        doc = frappe.get_doc(
            {
                "doctype": "DocType",
                "name": "POSA Sales Person Filter",
                "module": "POSAwesome",
                "istable": 1,
                "fields": [
                    {
                        "fieldname": "sales_person",
                        "label": "Sales Person",
                        "fieldtype": "Link",
                        "options": "Sales Person",
                        "in_list_view": 1,
                        "reqd": 1,
                    }
                ],
            }
        )
        doc.insert()

    if not frappe.db.exists("Custom Field", "POS Profile-posa_sales_persons"):
        create_custom_field(
            "POS Profile",
            {
                "fieldname": "posa_sales_persons",
                "label": "Allowed Sales Persons",
                "fieldtype": "Table",
                "options": "POSA Sales Person Filter",
                "insert_after": "create_pos_invoice_instead_of_sales_invoice",
            },
        )
