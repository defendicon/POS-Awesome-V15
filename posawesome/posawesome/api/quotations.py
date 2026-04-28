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


def _ensure_customer_fields(data):
    if not isinstance(data, dict):
        return

    if data.get("doctype") != "Quotation":
        return

    customer = data.get("customer") or data.get("party_name")
    if customer:
        data["customer"] = customer
        data["party_name"] = customer
        data.setdefault("customer_name", customer)

    data.setdefault("quotation_to", "Customer")


def _normalize_quotation_row(row):
    customer = row.get("customer") or row.get("party_name") or row.get("customer_name")
    row["customer"] = customer
    row["party_name"] = customer
    row["customer_name"] = row.get("customer_name") or customer
    row["status"] = row.get("status") or ("Submitted" if int(row.get("docstatus") or 0) == 1 else "Draft")
    return row


@frappe.whitelist()
def search_quotations(
    company,
    currency,
    quotation_name=None,
    include_draft=1,
    include_submitted=1,
):
    docstatus_filters = []
    if int(include_draft or 0):
        docstatus_filters.append(0)
    if int(include_submitted or 0):
        docstatus_filters.append(1)

    if not docstatus_filters:
        return []

    filters = {
        "company": company,
        "currency": currency,
        "docstatus": ["in", docstatus_filters],
        "quotation_to": "Customer",
    }

    or_filters = []
    if quotation_name:
        search_value = f"%{quotation_name}%"
        or_filters = [
            ["name", "like", search_value],
            ["party_name", "like", search_value],
            ["customer_name", "like", search_value],
            ["currency", "like", search_value],
        ]

    quotations = frappe.get_list(
        "Quotation",
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name",
            "company",
            "currency",
            "transaction_date",
            "grand_total",
            "party_name",
            "customer_name",
            "docstatus",
            "status",
            "owner",
            "modified",
            "modified_by",
        ],
        limit_page_length=0,
        order_by="modified desc",
    )

    return [_normalize_quotation_row(dict(row)) for row in quotations]


@frappe.whitelist()
def update_quotation(data):
    """Create or update a Quotation document."""
    data = json.loads(data)
    _map_delivery_dates(data)
    _ensure_customer_fields(data)
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
    _ensure_customer_fields(order)
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
