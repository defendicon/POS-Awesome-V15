import frappe


def execute():
    if not frappe.db.exists("Custom Field", "Sales Invoice Reference-pos_invoice"):
        frappe.get_doc(
            {
                "doctype": "Custom Field",
                "dt": "Sales Invoice Reference",
                "fieldname": "pos_invoice",
                "fieldtype": "Link",
                "label": "POS Invoice",
                "options": "POS Invoice",
                "insert_after": "sales_invoice",
                "in_list_view": 1,
            }
        ).insert()

    if not frappe.db.exists("Property Setter", "Sales Invoice Reference-sales_invoice-reqd"):
        frappe.get_doc(
            {
                "doctype": "Property Setter",
                "doctype_or_field": "DocField",
                "doc_type": "Sales Invoice Reference",
                "field_name": "sales_invoice",
                "property": "reqd",
                "property_type": "Check",
                "value": "0",
            }
        ).insert()
