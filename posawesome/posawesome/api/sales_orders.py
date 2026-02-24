# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cstr, getdate, nowdate

from posawesome.posawesome.api.payment_entry import create_payment_entry
from posawesome.posawesome.api.utils import get_active_pos_profile

MAX_ORDER_ITEMS = 500
MAX_ORDER_SEARCH_LIMIT = 200
MAX_ORDER_SEARCH_TEXT = 140


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


@contextmanager
def _account_permission_override():
    previous_ignore_account_permission = frappe.flags.get("ignore_account_permission")
    frappe.flags.ignore_account_permission = True
    try:
        yield
    finally:
        frappe.flags.ignore_account_permission = previous_ignore_account_permission


def _ensure_pos_profile_access(profile_name):
    profile_name = cstr(profile_name).strip()
    if not profile_name:
        frappe.throw(_("POS Profile is required for sales order operations."))

    if not frappe.db.exists("POS Profile", profile_name):
        frappe.throw(_("POS Profile {0} was not found.").format(profile_name))

    profile_doc = frappe.get_doc("POS Profile", profile_name)
    if profile_doc.disabled:
        frappe.throw(_("POS Profile {0} is disabled.").format(profile_doc.name))

    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": profile_doc.name, "user": frappe.session.user},
    )
    has_explicit_assignments = frappe.db.exists("POS Profile User", {"parent": profile_doc.name})
    if has_explicit_assignments and not has_access and not _can_manage_all_pos_profiles():
        frappe.throw(_("You are not assigned to POS Profile {0}.").format(profile_doc.name))

    return profile_doc


def _extract_payload(raw_payload):
    if isinstance(raw_payload, str):
        try:
            return json.loads(raw_payload)
        except Exception:
            frappe.throw(_("Invalid sales order payload."))
    if isinstance(raw_payload, dict):
        return raw_payload
    frappe.throw(_("Invalid sales order payload."))


def _safe_text(value, max_len=MAX_ORDER_SEARCH_TEXT):
    return cstr(value or "").strip()[:max_len]


def _safe_limit(value, default=50):
    try:
        parsed = int(value or default)
    except Exception:
        parsed = default
    return min(max(parsed, 1), MAX_ORDER_SEARCH_LIMIT)


def _resolve_profile_name(pos_profile):
    if isinstance(pos_profile, dict):
        return cstr(
            pos_profile.get("name")
            or pos_profile.get("pos_profile")
            or pos_profile.get("profile")
        ).strip()

    if isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if not raw_value:
            return ""
        try:
            decoded = json.loads(raw_value)
        except Exception:
            decoded = raw_value

        if isinstance(decoded, dict):
            return _resolve_profile_name(decoded)
        return cstr(decoded).strip()

    return ""


def _resolve_profile_from_opening_shift(data):
    if not isinstance(data, dict):
        return ""

    shift_name = cstr(
        data.get("pos_opening_shift_name")
        or data.get("pos_opening_shift")
        or data.get("posa_pos_opening_shift")
    ).strip()
    if not shift_name:
        return ""

    return cstr(frappe.db.get_value("POS Opening Shift", shift_name, "pos_profile")).strip()


def _assert_items_limit(data):
    if not isinstance(data, dict):
        return
    items = data.get("items")
    if items is None:
        return
    if not isinstance(items, list):
        frappe.throw(_("Sales order items must be a list."))
    if len(items) > MAX_ORDER_ITEMS:
        frappe.throw(_("Too many sales order items in one request."))


def _resolve_payload_profile_name(data, existing_doc=None):
    profile_name = _resolve_profile_name(data.get("pos_profile"))
    if not profile_name and existing_doc:
        profile_name = _resolve_profile_name(existing_doc.get("pos_profile"))
    if not profile_name:
        profile_name = _resolve_profile_from_opening_shift(data)
    if not profile_name:
        profile_name = _resolve_profile_name(get_active_pos_profile())
    return cstr(profile_name).strip()


def _enforce_order_access(data, existing_doc=None):
    profile_name = _resolve_payload_profile_name(data, existing_doc)
    profile_doc = _ensure_pos_profile_access(profile_name)
    if isinstance(data, dict):
        data["pos_profile"] = profile_doc.name

    if existing_doc and existing_doc.get("pos_profile") != profile_doc.name:
        frappe.throw(_("You cannot change POS Profile on an existing Sales Order."))

    return profile_doc


def _assert_company_access(company):
    if _can_manage_all_pos_profiles() or frappe.has_permission("Sales Order", "read"):
        return

    profile_names = frappe.get_all(
        "POS Profile User",
        filters={"user": frappe.session.user},
        pluck="parent",
    )
    if not profile_names:
        frappe.throw(_("You are not allowed to access sales orders for this company."))

    allowed_companies = {
        row.company
        for row in frappe.get_all(
            "POS Profile",
            filters={"name": ["in", profile_names]},
            fields=["company"],
        )
        if row.company
    }
    if company not in allowed_companies:
        frappe.throw(_("You are not allowed to access sales orders for company {0}.").format(company))


def _payment_entry_job(order_name, payments):
    """Background task to create payment entries."""
    so_doc = frappe.get_doc("Sales Order", order_name)
    _create_payment_entries(so_doc, payments)


@frappe.whitelist()
def search_orders(company, currency, order_name=None, limit=50):
    company = _safe_text(company, 140)
    currency = _safe_text(currency, 10)
    order_name = _safe_text(order_name, MAX_ORDER_SEARCH_TEXT)
    limit = _safe_limit(limit, default=50)
    if not company or not currency:
        return []

    _assert_company_access(company)
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
        limit_page_length=limit,
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
    _assert_items_limit(data)
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
    so_doc.docstatus = 0
    with _account_permission_override():
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
        with _account_permission_override():
            pe.save()
            pe.submit()


@frappe.whitelist()
def submit_sales_order(order):
    """Submit sales order and create payment entries."""
    order = _extract_payload(order)
    _assert_items_limit(order)
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
    with _account_permission_override():
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
