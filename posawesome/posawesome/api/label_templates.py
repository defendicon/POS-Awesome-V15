# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

"""API for Barcode Label Template CRUD."""

import frappe
from frappe import _


@frappe.whitelist()
def get_label_templates(label_size=None):
    """Return list of barcode label templates."""
    filters = {"disabled": 0}
    if label_size:
        filters["label_size"] = label_size
    templates = frappe.get_all(
        "Barcode Label Template",
        filters=filters,
        fields=["name", "title", "label_size", "description", "modified", "thumbnail"],
        order_by="modified desc",
    )
    return templates


@frappe.whitelist()
def get_label_template_detail(name):
    """Return full template including layout_json."""
    if not name:
        frappe.throw(_("Template name is required"))
    doc = frappe.get_doc("Barcode Label Template", name)
    return {
        "name": doc.name,
        "title": doc.title,
        "label_size": doc.label_size,
        "description": doc.description,
        "layout_json": doc.layout_json,
        "modified": doc.modified,
        "thumbnail": doc.thumbnail,
    }


@frappe.whitelist()
def save_label_template(title, label_size, layout_json, description=None, name=None):
    """Create or update a barcode label template."""
    if not title or not label_size or not layout_json:
        frappe.throw(_("Title, label size, and layout JSON are required"))

    parsed = frappe.parse_json(layout_json)
    if not isinstance(parsed, list):
        frappe.throw(_("Layout JSON must be a JSON array"))

    if name:
        doc = frappe.get_doc("Barcode Label Template", name)
        doc.title = title
        doc.label_size = label_size
        doc.layout_json = layout_json
        if description is not None:
            doc.description = description
        doc.save()
    else:
        doc = frappe.get_doc({
            "doctype": "Barcode Label Template",
            "title": title,
            "label_size": label_size,
            "layout_json": layout_json,
            "description": description or "",
        })
        doc.insert()

    return {
        "name": doc.name,
        "title": doc.title,
        "label_size": doc.label_size,
    }


@frappe.whitelist()
def delete_label_template(name):
    """Delete a barcode label template."""
    if not name:
        frappe.throw(_("Template name is required"))
    frappe.delete_doc("Barcode Label Template", name)
    return {"success": True}


@frappe.whitelist()
def get_shipping_addresses(company, customer=None, delivery_note=None, sales_invoice=None):
    """Return ship-from and ship-to addresses for shipping label generation."""
    if not company:
        frappe.throw(_("Company is required"))

    ship_from = _get_company_address(company)

    ship_to = None
    address_name = None

    if delivery_note:
        address_name = frappe.db.get_value(
            "Delivery Note", delivery_note, "shipping_address_name"
        )
        if not address_name:
            address_name = frappe.db.get_value(
                "Delivery Note", delivery_note, "customer_address"
            )
    elif sales_invoice:
        address_name = frappe.db.get_value(
            "Sales Invoice", sales_invoice, "shipping_address_name"
        )
        if not address_name:
            address_name = frappe.db.get_value(
                "Sales Invoice", sales_invoice, "customer_address"
            )
    elif customer:
        addresses = frappe.get_all(
            "Address",
            filters=[
                ["Dynamic Link", "link_doctype", "=", "Customer"],
                ["Dynamic Link", "link_name", "=", customer],
                ["disabled", "=", 0],
            ],
            fields=["name"],
            order_by="is_primary_address desc, modified desc",
            limit=1,
        )
        if addresses:
            address_name = addresses[0]["name"]

    if address_name:
        ship_to = _format_address(address_name, "to")

    return {
        "ship_from": ship_from,
        "ship_to": ship_to,
    }


def _get_company_address(company):
    """Get primary address for a company."""
    address_name = frappe.db.get_value(
        "Address",
        filters=[
            ["Dynamic Link", "link_doctype", "=", "Company"],
            ["Dynamic Link", "link_name", "=", company],
            ["is_primary_address", "=", 1],
            ["disabled", "=", 0],
        ],
    )
    if not address_name:
        address_name = frappe.db.get_value(
            "Address",
            filters=[
                ["Dynamic Link", "link_doctype", "=", "Company"],
                ["Dynamic Link", "link_name", "=", company],
                ["disabled", "=", 0],
            ],
        )
    return _format_address(address_name, "from") if address_name else None


def _format_address(address_name, role):
    """Extract and format address fields into a dict."""
    addr = frappe.get_doc("Address", address_name)
    parts = [
        addr.address_line1,
        addr.address_line2,
        addr.city,
        addr.state,
        addr.pincode,
        addr.country,
    ]
    lines = [p for p in parts if p]

    return {
        "name": addr.name,
        "role": role,
        "address_title": addr.address_title or addr.name,
        "lines": lines,
        "full": "\n".join(lines),
        "email_id": addr.email_id,
        "phone": addr.phone,
        "country": addr.country or "",
        "pincode": addr.pincode or "",
        "city": addr.city or "",
        "state": addr.state or "",
    }
