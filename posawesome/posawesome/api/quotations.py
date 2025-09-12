import json
import frappe
from frappe.utils import getdate


def _map_delivery_dates(data):
    """Ensure mandatory delivery_date fields are populated."""

    def parse_date(value):
        if not value:
            return None
        try:
            return str(getdate(value))
        except Exception:
            return None

    if not data.get("delivery_date") and data.get("posa_delivery_date"):
        parsed = parse_date(data.get("posa_delivery_date"))
        if parsed:
            data["delivery_date"] = parsed

    for item in data.get("items", []):
        if not item.get("delivery_date"):
            delivery = item.get("posa_delivery_date") or data.get("delivery_date")
            parsed = parse_date(delivery)
            if parsed:
                item["delivery_date"] = parsed


@frappe.whitelist()
def update_quotation(data):
    """Create or update a Quotation document."""
    data = json.loads(data)
    _map_delivery_dates(data)
    if data.get("name") and frappe.db.exists("Quotation", data.get("name")):
        doc = frappe.get_doc("Quotation", data.get("name"))
        doc.update(data)
    else:
        doc = frappe.get_doc(data)

    doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    doc.docstatus = 0
    doc.save()
    return doc


@frappe.whitelist()
def submit_quotation(order):
    """Submit quotation document."""
    order = json.loads(order)
    _map_delivery_dates(order)
    if order.get("name") and frappe.db.exists("Quotation", order.get("name")):
        doc = frappe.get_doc("Quotation", order.get("name"))
        doc.update(order)
    else:
        doc = frappe.get_doc(order)

    doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    doc.save()
    doc.submit()

    return {"name": doc.name, "status": doc.docstatus}
