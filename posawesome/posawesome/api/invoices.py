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

@frappe.whitelist()
def get_draft_invoices(
    pos_opening_shift=None,
    doctype="Sales Invoice",
    limit_page_length=0,
    company=None,
    pos_profile=None,
    cashier=None,
    is_supervisor=0,
):
    started_at = time.perf_counter()
    try:
        limit_page_length = int(limit_page_length or 0)
    except (TypeError, ValueError):
        limit_page_length = 0
    if limit_page_length < 0:
        limit_page_length = 0

    supervisor_scope = int(is_supervisor or 0)
    filters = {
        "docstatus": 0,
    }
    if supervisor_scope and company:
        filters["company"] = company
        if pos_profile:
            filters["pos_profile"] = pos_profile
        if cashier:
            filters["owner"] = cashier
    else:
        filters["posa_pos_opening_shift"] = pos_opening_shift
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
            "pos_profile",
            "owner",
            "modified_by",
        ],
        limit_page_length=limit_page_length,
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

    frappe.delete_doc(doctype, invoice, force=1)
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
        frappe.delete_doc("Sales Invoice", sales_invoice, force=1)
    return True


@frappe.whitelist()
def update_invoice_from_order(data):
    """Backward-compatible facade used by order-to-invoice flow."""

    return update_invoice(data)
