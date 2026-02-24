import json

import frappe
from frappe import _
from frappe.utils import cstr
from frappe.utils import getdate

MAX_QUOTATION_ITEMS = 500


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _ensure_pos_profile_access(profile_name):
    profile_name = cstr(profile_name).strip()
    if not profile_name:
        frappe.throw(_("POS Profile is required for quotation operations."))

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
        try:
            return json.loads(raw_payload)
        except Exception:
            frappe.throw(_("Invalid quotation payload."))
    if isinstance(raw_payload, dict):
        return raw_payload
    frappe.throw(_("Invalid quotation payload."))


def _assert_items_limit(data):
    if not isinstance(data, dict):
        return
    items = data.get("items")
    if items is None:
        return
    if not isinstance(items, list):
        frappe.throw(_("Quotation items must be a list."))
    if len(items) > MAX_QUOTATION_ITEMS:
        frappe.throw(_("Too many quotation items in one request."))


def _resolve_payload_profile_name(data, existing_doc=None):
    if isinstance(data.get("pos_profile"), dict):
        profile_name = data.get("pos_profile", {}).get("name")
    else:
        profile_name = data.get("pos_profile")
    if not profile_name and existing_doc:
        profile_name = existing_doc.get("pos_profile")
    return cstr(profile_name).strip()


def _enforce_quotation_access(data, existing_doc=None):
    profile_name = _resolve_payload_profile_name(data, existing_doc)
    profile_doc = _ensure_pos_profile_access(profile_name)

    if existing_doc and existing_doc.get("pos_profile") != profile_doc.name:
        frappe.throw(_("You cannot change POS Profile on an existing Quotation."))

    return profile_doc


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


@frappe.whitelist()
def update_quotation(data):
    """Create or update a Quotation document."""
    data = _extract_payload(data)
    _assert_items_limit(data)
    if cstr(data.get("doctype") or "Quotation").strip() != "Quotation":
        data["doctype"] = "Quotation"
    _map_delivery_dates(data)
    _ensure_customer_fields(data)
    if data.get("name") and frappe.db.exists("Quotation", data.get("name")):
        doc = frappe.get_doc("Quotation", data.get("name"))
        _enforce_quotation_access(data, doc)
        doc.update(data)
    else:
        _enforce_quotation_access(data)
        doc = frappe.get_doc(data)

    doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    doc.docstatus = 0
    doc.save()
    return doc


@frappe.whitelist()
def submit_quotation(order):
    """Submit quotation document."""
    order = _extract_payload(order)
    _assert_items_limit(order)
    if cstr(order.get("doctype") or "Quotation").strip() != "Quotation":
        order["doctype"] = "Quotation"
    _map_delivery_dates(order)
    _ensure_customer_fields(order)
    if order.get("name") and frappe.db.exists("Quotation", order.get("name")):
        doc = frappe.get_doc("Quotation", order.get("name"))
        _enforce_quotation_access(order, doc)
        doc.update(order)
    else:
        _enforce_quotation_access(order)
        doc = frappe.get_doc(order)

    doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    doc.save()
    doc.submit()

    return {"name": doc.name, "status": doc.docstatus}
