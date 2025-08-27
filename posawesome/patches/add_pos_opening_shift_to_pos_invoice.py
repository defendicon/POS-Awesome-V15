import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
    if not frappe.db.exists("Custom Field", "POS Invoice-posa_pos_opening_shift"):
        create_custom_field(
            "POS Invoice",
            {
                "fieldname": "posa_pos_opening_shift",
                "label": "POS Shift",
                "fieldtype": "Data",
                "insert_after": "pos_profile",
                "read_only": 1,
                "print_hide": 1,
                "no_copy": 1,
                "in_standard_filter": 1,
            },
        )
        make_property_setter(
            "POS Invoice",
            "posa_pos_opening_shift",
            "no_copy",
            1,
            "Check",
        )

    if not frappe.db.exists("Custom Field", "POS Invoice-posa_is_printed"):
        create_custom_field(
            "POS Invoice",
            {
                "fieldname": "posa_is_printed",
                "label": "Printed",
                "fieldtype": "Check",
                "insert_after": "posa_pos_opening_shift",
                "read_only": 1,
                "in_standard_filter": 1,
            },
        )

