"""
Adds the ₦↔Kg auto-calculator custom fields to sales item child doctypes.

Target child doctypes:
    - Sales Invoice Item
    - POS Invoice Item
    - Quotation Item
    - Sales Order Item

Two new fields per child doctype:
    1. posa_kg_qty       — total Kg in the row (Float, computed: qty * weight_per_unit)
    2. posa_rate_per_kg  — price per Kg of stock UOM (Currency, computed: rate / weight_per_unit)

These fields are computed bidirectionally from qty/rate via JS (desk forms)
and Vue (POS Awesome). The Item.weight_per_unit + Item.weight_uom=Kg is the
source-of-truth that drives the conversion.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


TARGET_CHILD_DOCTYPES = (
    "Sales Invoice Item",
    "POS Invoice Item",
    "Quotation Item",
    "Sales Order Item",
)


def execute():
    for doctype in TARGET_CHILD_DOCTYPES:
        _add_kg_qty_field(doctype)
        _add_rate_per_kg_field(doctype)


def _add_kg_qty_field(doctype: str):
    fieldname = "posa_kg_qty"
    full_name = f"{doctype}-{fieldname}"
    if frappe.db.exists("Custom Field", full_name):
        return

    create_custom_field(
        doctype,
        {
            "fieldname": fieldname,
            "label": "Kg Qty",
            "fieldtype": "Float",
            "precision": "3",
            "insert_after": "qty",
            "description": "Total weight in Kg = qty × Item.weight_per_unit (when weight_uom = Kg)",
            "in_list_view": 0,
            "no_copy": 0,
            "print_hide": 1,
            "allow_on_submit": 0,
        },
    )


def _add_rate_per_kg_field(doctype: str):
    fieldname = "posa_rate_per_kg"
    full_name = f"{doctype}-{fieldname}"
    if frappe.db.exists("Custom Field", full_name):
        return

    create_custom_field(
        doctype,
        {
            "fieldname": fieldname,
            "label": "Rate / Kg",
            "fieldtype": "Currency",
            "options": "currency",
            "insert_after": "rate",
            "description": "Price per Kg = rate ÷ Item.weight_per_unit (when weight_uom = Kg)",
            "in_list_view": 0,
            "no_copy": 0,
            "print_hide": 1,
            "allow_on_submit": 0,
        },
    )
