import frappe
from frappe import _
from frappe.utils import cint, cstr

from posawesome.posawesome.doctype.pos_closing_shift.closing_processing.invoices import (
    submit_printed_invoices,
)


VALID_INVOICE_DOCTYPES = {"Sales Invoice", "POS Invoice"}
MANAGER_ROLES = {"System Manager", "Administrator"}
MAX_PAGE_LENGTH = 200


def _is_manager():
    return bool(MANAGER_ROLES.intersection(set(frappe.get_roles() or [])))


def _ensure_opening_shift_access(pos_opening_shift, require_owner=False):
    opening_shift_name = cstr(pos_opening_shift).strip()
    if not opening_shift_name:
        frappe.throw(_("POS Opening Shift is required."))

    opening_shift_doc = frappe.get_doc("POS Opening Shift", opening_shift_name)
    session_user = cstr(frappe.session.user).strip()
    shift_user = cstr(opening_shift_doc.user).strip()
    assigned_to_profile = bool(
        frappe.db.exists(
            "POS Profile User",
            {"parent": opening_shift_doc.pos_profile, "user": frappe.session.user},
        )
    )

    if require_owner:
        if shift_user != session_user and not _is_manager():
            frappe.throw(_("You are not allowed to manage this POS Opening Shift."))
    elif shift_user != session_user and not assigned_to_profile and not _is_manager():
        frappe.throw(_("You are not allowed to access this POS Opening Shift."))

    return opening_shift_doc


@frappe.whitelist()
def get_cashiers(doctype, txt, searchfield, start, page_len, filters):
    filters = filters or {}
    parent_profile = cstr(filters.get("parent")).strip()
    if not parent_profile:
        return []

    if not _is_manager() and not frappe.db.exists(
        "POS Profile User",
        {"parent": parent_profile, "user": frappe.session.user},
    ):
        frappe.throw(_("You are not allowed to view cashiers for this POS Profile."))

    start = max(cint(start), 0)
    page_len = min(max(cint(page_len or 20), 1), MAX_PAGE_LENGTH)
    txt = cstr(txt).strip()

    user_filters = {"parent": parent_profile}
    if txt:
        user_filters["user"] = ["like", f"%{txt}%"]

    cashiers_list = frappe.get_all(
        "POS Profile User",
        filters=user_filters,
        fields=["user"],
        limit_start=start,
        limit_page_length=page_len,
        order_by="user asc",
    )
    result = []
    for cashier in cashiers_list:
        user_email = frappe.get_value("User", cashier.user, "email")
        if user_email:
            result.append([cashier.user, f"{cashier.user} ({user_email})"])
    return result


@frappe.whitelist()
def get_pos_invoices(pos_opening_shift, doctype=None):
    opening_shift_doc = _ensure_opening_shift_access(pos_opening_shift)

    if not doctype:
        use_pos_invoice = frappe.db.get_value(
            "POS Profile",
            opening_shift_doc.pos_profile,
            "create_pos_invoice_instead_of_sales_invoice",
        )
        doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"

    doctype = cstr(doctype).strip()
    if doctype not in VALID_INVOICE_DOCTYPES:
        frappe.throw(_("Invalid invoice doctype for closing shift processing."))

    submit_printed_invoices(opening_shift_doc.name, doctype)

    invoice_filters = {
        "docstatus": 1,
        "posa_pos_opening_shift": opening_shift_doc.name,
    }
    if doctype == "POS Invoice":
        invoice_filters["consolidated_invoice"] = ["in", ("", None)]

    invoice_rows = frappe.get_all(
        doctype,
        filters=invoice_filters,
        fields=["name"],
        order_by="posting_date asc, name asc",
    )

    data = []
    for row in invoice_rows:
        invoice_doc = frappe.get_doc(doctype, row.name)
        if not _is_manager():
            invoice_doc.check_permission("read")
        data.append(invoice_doc.as_dict())

    return data


@frappe.whitelist()
def get_payments_entries(pos_opening_shift):
    opening_shift_doc = _ensure_opening_shift_access(pos_opening_shift)

    return frappe.get_all(
        "Payment Entry",
        filters={
            "docstatus": 1,
            "reference_no": opening_shift_doc.name,
            "payment_type": ["in", ["Receive", "Pay"]],
        },
        fields=[
            "name",
            "mode_of_payment",
            "paid_amount",
            "base_paid_amount",
            "paid_from_account_currency",
            "paid_to_account_currency",
            "target_exchange_rate",
            "reference_no",
            "posting_date",
            "party",
            "payment_type",
        ],
    )
