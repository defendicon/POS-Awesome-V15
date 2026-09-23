# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

from posawesome.posawesome.api.payment_entry import create_payment_entry
from posawesome.posawesome.api.pos_access import (
    assert_document_in_pos_profile,
    get_authorized_pos_profile,
    require_pos_profile_feature,
)
from posawesome.posawesome.api.tax_contracts import apply_pos_tax_inclusion_contract


def _payment_entry_job(order_name, payments):
    """Background task to create payment entries."""
    so_doc = frappe.get_doc("Sales Order", order_name)
    _create_payment_entries(so_doc, payments)


@frappe.whitelist()
def search_orders(company, currency, order_name=None):
    filters = {
        "billing_status": ["in", ["Not Billed", "Partly Billed"]],
        "docstatus": 1,
        "company": company,
        "currency": currency,
    }
    if order_name:
        filters["name"] = ["like", f"%{order_name}%"]
    orders_list = frappe.get_list(
        "Sales Order",
        filters=filters,
        fields=[
            "name",
            "transaction_date",
            "customer",
            "customer_name",
            "currency",
            "grand_total",
            "status",
            "docstatus",
            "owner",
            "modified",
            "modified_by",
        ],
        limit_page_length=0,
        order_by="modified desc",
    )
    return orders_list


def _map_delivery_dates(data):
    """Ensure mandatory delivery_date fields are populated."""

    def parse_date(value):
        if not value:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            if normalized.lower() in {"invalid date", "nan", "none", "null", "undefined"}:
                return None
            value = normalized
        try:
            return str(getdate(value))
        except Exception:
            return None

    # Map order level delivery date with robust fallback.
    order_delivery_date = (
        parse_date(data.get("delivery_date"))
        or parse_date(data.get("posa_delivery_date"))
        or parse_date(data.get("transaction_date"))
        or parse_date(data.get("posting_date"))
        or str(getdate(nowdate()))
    )
    data["delivery_date"] = order_delivery_date

    # Map item level delivery dates
    for item in data.get("items", []):
        if not isinstance(item, dict):
            continue

        item_delivery = (
            parse_date(item.get("delivery_date"))
            or parse_date(item.get("posa_delivery_date"))
            or order_delivery_date
        )
        if item_delivery:
            item["delivery_date"] = item_delivery
            item.setdefault("posa_delivery_date", item_delivery)


def _authorized_sales_order_payload(value):
    data = json.loads(value) if isinstance(value, str) else value
    if not isinstance(data, dict):
        frappe.throw("Invalid Sales Order payload")
    data = dict(data)

    profile = get_authorized_pos_profile(data.get("pos_profile"), company=data.get("company"))
    require_pos_profile_feature(
        profile,
        ("posa_allow_sales_order", "posa_create_only_sales_order"),
        "Sales Order creation",
    )
    data["doctype"] = "Sales Order"
    data["company"] = profile.get("company")
    data["pos_profile"] = profile.get("name")
    _validate_sales_order_payments(data.get("payments"), profile)
    return data, profile


def _validate_sales_order_payments(payments, profile):
    if payments in (None, ""):
        return
    if not isinstance(payments, list):
        frappe.throw(_("Sales Order payments must be a list."))

    allowed_payment_methods = {
        row.get("mode_of_payment")
        for row in (profile.get("payments") or [])
        if hasattr(row, "get") and row.get("mode_of_payment")
    }
    for payment in payments:
        if not hasattr(payment, "get"):
            frappe.throw(_("Invalid Sales Order payment row."))
        mode_of_payment = payment.get("mode_of_payment")
        if not mode_of_payment or mode_of_payment not in allowed_payment_methods:
            frappe.throw(
                _("Payment method {0} is not available in this POS Profile.").format(mode_of_payment or ""),
                frappe.PermissionError,
            )
        if flt(payment.get("amount")) < 0:
            frappe.throw(_("Sales Order payment amount cannot be negative."))


def _get_sales_order(data, profile):
    name = data.get("name")
    if name and frappe.db.exists("Sales Order", name):
        doc = frappe.get_doc("Sales Order", name)
        assert_document_in_pos_profile(doc, profile)
        doc.update(data)
        return doc
    return frappe.get_doc(data)


@frappe.whitelist()
def update_sales_order(data):
    """Create or update a Sales Order document."""
    data, profile = _authorized_sales_order_payload(data)
    _map_delivery_dates(data)
    so_doc = _get_sales_order(data, profile)

    so_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    so_doc.docstatus = 0
    apply_pos_tax_inclusion_contract(so_doc)
    so_doc.save()
    return so_doc


def _create_payment_entries(so_doc, payments):
    """Create payment entries referencing the sales order."""
    for pay in payments or []:
        if not pay.get("amount"):
            continue

        # Create payment entry using helper to ensure exchange rates are set
        pe = create_payment_entry(
            company=so_doc.company,
            customer=so_doc.customer,
            amount=pay.get("amount"),
            currency=pay.get("currency") or so_doc.currency,
            mode_of_payment=pay.get("mode_of_payment"),
            reference_no=so_doc.get("posa_pos_opening_shift"),
            reference_date=nowdate(),
            posting_date=nowdate(),
            submit=0,
        )

        # Link payment entry to the sales order
        pe.append(
            "references",
            {
                "allocated_amount": pay.get("amount"),
                "reference_doctype": "Sales Order",
                "reference_name": so_doc.name,
            },
        )

        pe.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        pe.save()
        pe.submit()


@frappe.whitelist()
def submit_sales_order(order):
    """Submit sales order and create payment entries."""
    order, profile = _authorized_sales_order_payload(order)
    _map_delivery_dates(order)
    so_doc = _get_sales_order(order, profile)

    payments = order.get("payments")

    so_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    apply_pos_tax_inclusion_contract(so_doc)
    so_doc.save()
    so_doc.submit()

    if payments:
        frappe.enqueue(
            "posawesome.posawesome.api.sales_orders._payment_entry_job",
            queue="short",
            order_name=so_doc.name,
            payments=payments,
        )

    # Payment entries run in the background to speed up checkout

    return {"name": so_doc.name, "status": so_doc.docstatus}
