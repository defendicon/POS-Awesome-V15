import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


FIELDS_BY_DOCTYPE = {
    "Sales Invoice": {
        "fieldname": "gift_card_redemptions",
        "label": "Gift Card Redemptions",
        "fieldtype": "Table",
        "options": "POS Gift Card Redemption",
        "insert_after": "posa_coupons",
        "read_only": 1,
    },
    "POS Invoice": {
        "fieldname": "gift_card_redemptions",
        "label": "Gift Card Redemptions",
        "fieldtype": "Table",
        "options": "POS Gift Card Redemption",
        "insert_after": "posa_coupons",
        "read_only": 1,
    },
}


def execute():
    for doctype, field in FIELDS_BY_DOCTYPE.items():
        custom_field_name = f"{doctype}-{field['fieldname']}"
        if not frappe.db.exists("Custom Field", custom_field_name):
            create_custom_field(doctype, field)
        else:
            frappe.db.set_value(
                "Custom Field",
                custom_field_name,
                {
                    "label": field["label"],
                    "fieldtype": field["fieldtype"],
                    "options": field["options"],
                    "insert_after": field["insert_after"],
                    "read_only": field["read_only"],
                },
                update_modified=False,
            )
        frappe.clear_cache(doctype=doctype)
