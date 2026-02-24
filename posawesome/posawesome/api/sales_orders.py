# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cstr, getdate, nowdate

from posawesome.posawesome.api.payment_entry import create_payment_entry


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _ensure_pos_profile_access(profile_name):
    profile_name = cstr(profile_name).strip()
    if not profile_name:
        frappe.throw(_("POS Profile is required for sales order operations."))

    profile_doc = frappe.get_doc("POS Profile", profile_name)
    if profile_doc.disabled:
        frappe.throw(_("POS Profile {0} is disabled.").format(profile_doc.name))

    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": profile_doc.name, "user": frappe.session.user},
    )
    if not has_access and not _can_manage_all_pos_profiles():
        frappe.throw(_("You are not assigned to POS Profile {0}.").format(profile_doc.name))

    return profile_doc


def _extract_payload(raw_payload):
    if isinstance(raw_payload, str):
        return json.loads(raw_payload)
    if isinstance(raw_payload, dict):
        return raw_payload
    frappe.throw(_("Invalid sales order payload."))


def _resolve_payload_profile_name(data, existing_doc=None):
    if isinstance(data.get("pos_profile"), dict):
        profile_name = data.get("pos_profile", {}).get("name")
    else:
        profile_name = data.get("pos_profile")
    if not profile_name and existing_doc:
        profile_name = existing_doc.get("pos_profile")
    return cstr(profile_name).strip()


def _enforce_order_access(data, existing_doc=None):
    profile_name = _resolve_payload_profile_name(data, existing_doc)
    profile_doc = _ensure_pos_profile_access(profile_name)

    if existing_doc and existing_doc.get("pos_profile") != profile_doc.name:
        frappe.throw(_("You cannot change POS Profile on an existing Sales Order."))

    return profile_doc


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
        fields=["name"],
        limit_page_length=0,
        order_by="customer",
    )
    data = []
    for order in orders_list:
        data.append(frappe.get_doc("Sales Order", order["name"]))
    return data


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


@frappe.whitelist()
def update_sales_order(data):
    """Create or update a Sales Order document."""
    data = _extract_payload(data)
    if cstr(data.get("doctype") or "Sales Order").strip() != "Sales Order":
        data["doctype"] = "Sales Order"
    _map_delivery_dates(data)
    if data.get("name") and frappe.db.exists("Sales Order", data.get("name")):
        so_doc = frappe.get_doc("Sales Order", data.get("name"))
        _enforce_order_access(data, so_doc)
        so_doc.update(data)
    else:
        _enforce_order_access(data)
        so_doc = frappe.get_doc(data)

    so_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    so_doc.docstatus = 0
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
    order = _extract_payload(order)
    if cstr(order.get("doctype") or "Sales Order").strip() != "Sales Order":
        order["doctype"] = "Sales Order"
    _map_delivery_dates(order)
    if order.get("name") and frappe.db.exists("Sales Order", order.get("name")):
        so_doc = frappe.get_doc("Sales Order", order.get("name"))
        _enforce_order_access(order, so_doc)
        so_doc.update(order)
    else:
        _enforce_order_access(order)
        so_doc = frappe.get_doc(order)

    payments = order.get("payments")

    so_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
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
