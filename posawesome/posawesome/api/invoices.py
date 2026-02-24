# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

"""Public invoice API facade backed by `invoice_processing` modules."""

import frappe
import time
from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
from posawesome.posawesome.api.invoice_processing.utils import (
    _get_return_validity_settings,
    _build_invoice_remarks,
    _set_return_valid_upto,
    _validate_return_window,
    get_latest_rate,
    get_price_list_currency,
    get_available_currencies
)
from posawesome.posawesome.api.invoice_processing.stock import (
    _strip_client_freebies_from_payload,
    _validate_stock_on_invoice,
    _apply_item_name_overrides,
    _deduplicate_free_items,
    _merge_duplicate_taxes,
    _auto_set_return_batches,
    _collect_stock_errors,
    _should_block
)
from posawesome.posawesome.api.invoice_processing.creation import (
    update_invoice,
    submit_invoice,
    submit_in_background_job,
    validate_cart_items
)
from posawesome.posawesome.api.invoice_processing.returns import (
    search_invoices_for_return,
    validate_return_items,
    get_invoice_for_return,
)
from posawesome.posawesome.api.invoice_processing.payment import (
    _create_change_payment_entries
)
from posawesome.posawesome.api.invoice_processing.data import (
    get_last_invoice_rates
)
from posawesome.posawesome.api.utils import log_perf_event


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _assert_shift_access(pos_opening_shift):
    shift_user = frappe.db.get_value("POS Opening Shift", pos_opening_shift, "user")
    if not shift_user:
        frappe.throw(frappe._("POS Opening Shift {0} was not found.").format(pos_opening_shift))
    if shift_user != frappe.session.user and not _can_manage_all_pos_profiles():
        frappe.throw(frappe._("You are not allowed to access this shift."))


def _assert_pos_profile_access(profile_name):
    if not profile_name:
        return
    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": profile_name, "user": frappe.session.user},
    )
    has_explicit_assignments = frappe.db.exists("POS Profile User", {"parent": profile_name})
    if has_explicit_assignments and not has_access and not _can_manage_all_pos_profiles():
        frappe.throw(frappe._("You are not assigned to POS Profile {0}.").format(profile_name))


def _assert_delete_access(doctype, invoice_name):
    doc = frappe.get_doc(doctype, invoice_name)
    if doc.docstatus != 0:
        frappe.throw(frappe._("Only draft invoices can be deleted."))

    if frappe.has_permission(doctype, "delete", invoice_name):
        return doc
    if _can_manage_all_pos_profiles():
        return doc

    shift_name = doc.get("posa_pos_opening_shift")
    if shift_name:
        shift_user = frappe.db.get_value("POS Opening Shift", shift_name, "user")
        if shift_user == frappe.session.user:
            return doc

    if doc.owner == frappe.session.user:
        return doc

    frappe.throw(frappe._("You are not allowed to delete this invoice."))


@frappe.whitelist()
def get_draft_invoices(pos_opening_shift, doctype="Sales Invoice"):
    started_at = time.perf_counter()
    _assert_shift_access(pos_opening_shift)
    filters = {
        "posa_pos_opening_shift": pos_opening_shift,
        "docstatus": 0,
    }
    if frappe.db.has_column(doctype, "posa_is_printed"):
        filters["posa_is_printed"] = 0

    invoices_list = frappe.get_list(
        doctype,
        filters=filters,
        fields=[
            "name",
            "customer",
            "customer_name",
            "posting_date",
            "posting_time",
            "grand_total",
            "currency",
        ],
        limit_page_length=0,
        order_by="modified desc",
    )
    for invoice in invoices_list:
        invoice["doctype"] = doctype
    log_perf_event(
        "get_draft_invoices",
        started_at,
        doctype=doctype,
        rows=len(invoices_list),
    )
    return invoices_list


@frappe.whitelist()
def get_draft_invoice_doc(invoice_name, doctype="Sales Invoice"):
    started_at = time.perf_counter()
    doc = frappe.get_cached_doc(doctype, invoice_name)
    if doc.docstatus != 0:
        frappe.throw(frappe._("Only draft invoices can be opened from POS draft API."))
    shift_name = doc.get("posa_pos_opening_shift")
    if shift_name:
        _assert_shift_access(shift_name)
    else:
        _assert_pos_profile_access(doc.get("pos_profile"))
    log_perf_event(
        "get_draft_invoice_doc",
        started_at,
        doctype=doctype,
        invoice=invoice_name,
        items=len(getattr(doc, "items", []) or []),
    )
    return doc

@frappe.whitelist()
def delete_invoice(invoice):
    from frappe import _
    doctype = "Sales Invoice"
    if frappe.db.exists("POS Invoice", invoice):
        doctype = "POS Invoice"
    elif not frappe.db.exists("Sales Invoice", invoice):
        frappe.throw(_("Invoice {0} does not exist").format(invoice))

    if frappe.db.has_column(doctype, "posa_is_printed") and frappe.get_value(
        doctype, invoice, "posa_is_printed"
    ):
        frappe.throw(_("This invoice {0} cannot be deleted").format(invoice))

    _assert_delete_access(doctype, invoice)
    frappe.delete_doc(doctype, invoice)
    return _("Invoice {0} Deleted").format(invoice)


@frappe.whitelist()
def fetch_exchange_rate_pair(from_currency, to_currency):
    """Return exchange rate payload expected by POS multi-currency UI."""

    if not from_currency or not to_currency:
        frappe.throw("from_currency and to_currency are required")

    if from_currency == to_currency:
        from frappe.utils import nowdate

        return {
            "exchange_rate": 1,
            "date": nowdate(),
        }

    exchange_rate, rate_date = get_latest_rate(from_currency, to_currency)
    return {
        "exchange_rate": exchange_rate,
        "date": rate_date,
    }


@frappe.whitelist()
def create_sales_invoice_from_order(sales_order):
    """Backward-compatible facade for legacy frontend method path."""

    if not sales_order:
        frappe.throw("sales_order is required")

    if not frappe.db.exists("Sales Order", sales_order):
        frappe.throw(f"Sales Order {sales_order} does not exist")

    order_doc = frappe.get_doc("Sales Order", sales_order)
    _assert_pos_profile_access(order_doc.get("pos_profile"))
    if (
        not order_doc.get("pos_profile")
        and not frappe.has_permission("Sales Order", "read", sales_order)
        and not _can_manage_all_pos_profiles()
    ):
        frappe.throw(frappe._("You are not allowed to access Sales Order {0}.").format(sales_order))

    invoice_doc = make_sales_invoice(sales_order)
    invoice_doc.flags.ignore_permissions = True
    invoice_doc.run_method("set_missing_values")
    invoice_doc.run_method("calculate_taxes_and_totals")
    return invoice_doc


@frappe.whitelist()
def delete_sales_invoice(sales_invoice):
    """Backward-compatible facade for legacy frontend method path."""

    if not sales_invoice:
        frappe.throw("sales_invoice is required")

    if frappe.db.exists("Sales Invoice", sales_invoice):
        _assert_delete_access("Sales Invoice", sales_invoice)
        frappe.delete_doc("Sales Invoice", sales_invoice)
    return True


@frappe.whitelist()
def update_invoice_from_order(data):
    """Backward-compatible facade used by order-to-invoice flow."""

    return update_invoice(data)
