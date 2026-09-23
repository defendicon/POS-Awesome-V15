from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

from posawesome.posawesome.api.invoice_processing.creation import submit_invoice
from posawesome.posawesome.api.pos_access import get_authorized_pos_profile


EXCHANGE_DOCTYPE = "POS Item Exchange"
SUPPORTED_INVOICE_DOCTYPE = "Sales Invoice"


def _as_dict(value):
    if isinstance(value, str):
        value = frappe.parse_json(value)
    if value is None:
        return {}
    return frappe._dict(value)


def _document_total(doc):
    return abs(flt(doc.get("rounded_total") or doc.get("grand_total")))


def _payment_total(doc):
    return sum(flt(row.get("amount")) for row in (doc.get("payments") or []))


def _document_precision(doc, fieldname, fallback=2):
    try:
        value = doc.precision(fieldname)
    except (AttributeError, TypeError):
        value = None
    return max(cint(fallback if value is None else value), 0)


def _settlement_tolerance(return_doc, sale_doc):
    precision = max(
        _document_precision(return_doc, "outstanding_amount"),
        _document_precision(sale_doc, "outstanding_amount"),
    )
    return (0.5 / (10**precision)) + 1e-9


def _validate_exchange_payload(return_invoice, sale_invoice, profile):
    if not cint(profile.get("posa_allow_return")):
        frappe.throw(_("Returns are not enabled in POS Profile {0}.").format(profile.name))

    if not cint(profile.get("posa_allow_item_exchange")):
        frappe.throw(_("Item Exchange is not enabled in POS Profile {0}.").format(profile.name))

    if cint(profile.get("create_pos_invoice_instead_of_sales_invoice")):
        frappe.throw(
            _("Item Exchange currently requires the POS Profile to create Sales Invoices.")
        )

    for label, doc in ((_("Return Invoice"), return_invoice), (_("Replacement Invoice"), sale_invoice)):
        if cstr(doc.get("doctype") or SUPPORTED_INVOICE_DOCTYPE) != SUPPORTED_INVOICE_DOCTYPE:
            frappe.throw(_("{0} must be a Sales Invoice.").format(label))
        if cstr(doc.get("company")) != cstr(profile.company):
            frappe.throw(_("{0} company must match the POS Profile.").format(label))
        if cstr(doc.get("pos_profile")) != cstr(profile.name):
            frappe.throw(_("{0} must use POS Profile {1}.").format(label, profile.name))

    if not cint(return_invoice.get("is_return")) or not return_invoice.get("return_against"):
        frappe.throw(_("A return against the original invoice is required for an exchange."))
    if cint(sale_invoice.get("is_return")):
        frappe.throw(_("The replacement invoice cannot be a return invoice."))
    if cstr(return_invoice.get("customer")) != cstr(sale_invoice.get("customer")):
        frappe.throw(_("Return and replacement invoices must use the same customer."))
    if cstr(return_invoice.get("currency")) != cstr(sale_invoice.get("currency")):
        frappe.throw(_("Return and replacement invoices must use the same currency."))
    if not return_invoice.get("items") or not sale_invoice.get("items"):
        frappe.throw(_("Both returned items and replacement items are required."))
    if any(flt(row.get("qty")) >= 0 for row in return_invoice.get("items")):
        frappe.throw(_("Every return item quantity must be negative."))
    if any(flt(row.get("qty")) <= 0 for row in sale_invoice.get("items")):
        frappe.throw(_("Every replacement item quantity must be positive."))
    if _payment_total(return_invoice) != 0:
        frappe.throw(_("Exchange return credit cannot contain a direct cash refund."))


def _validate_original_invoice(return_invoice, profile):
    original = frappe.get_doc(SUPPORTED_INVOICE_DOCTYPE, return_invoice.return_against)
    original.check_permission("read")
    if cint(original.docstatus) != 1 or cint(original.get("is_return")):
        frappe.throw(_("The original exchange invoice must be a submitted sale."))
    for fieldname, label in (
        ("company", _("company")),
        ("customer", _("customer")),
        ("currency", _("currency")),
    ):
        if cstr(original.get(fieldname)) != cstr(return_invoice.get(fieldname)):
            frappe.throw(_("Original and return invoice {0} must match.").format(label))
    if cstr(original.company) != cstr(profile.company):
        frappe.throw(_("The original invoice does not belong to the POS Profile company."))
    return original


def _existing_exchange(client_request_id):
    if not client_request_id or not frappe.db.exists("DocType", EXCHANGE_DOCTYPE):
        return None
    name = frappe.db.get_value(
        EXCHANGE_DOCTYPE,
        {"client_request_id": client_request_id},
        "name",
    )
    return frappe.get_doc(EXCHANGE_DOCTYPE, name) if name else None


def _public_result(exchange_doc, return_doc, sale_doc):
    result = sale_doc.as_dict()
    result.update(
        {
            "exchange_reference": exchange_doc.name,
            "exchange_status": exchange_doc.status,
            "return_invoice": return_doc.name,
            "replacement_invoice": sale_doc.name,
            "return_invoice_doc": return_doc.as_dict(),
            "exchange_summary": {
                "return_total": flt(exchange_doc.return_total),
                "sale_total": flt(exchange_doc.sale_total),
                "difference_amount": flt(exchange_doc.difference_amount),
                "allocated_amount": flt(exchange_doc.allocated_amount),
                "settlement_type": exchange_doc.settlement_type,
                "currency_precision": _document_precision(sale_doc, "grand_total"),
            },
        }
    )
    return result


def _authorize_existing_exchange(exchange_doc, profile):
    if cstr(exchange_doc.company) != cstr(profile.company) or cstr(
        exchange_doc.pos_profile
    ) != cstr(profile.name):
        frappe.throw(_("The item exchange does not belong to the selected POS Profile."))


@frappe.whitelist()
def get_item_exchange(client_request_id, pos_profile=None):
    client_request_id = cstr(client_request_id).strip()
    if not client_request_id:
        return None

    exchange_doc = _existing_exchange(client_request_id)
    if not exchange_doc:
        return None

    profile = get_authorized_pos_profile(
        pos_profile or exchange_doc.pos_profile,
        company=exchange_doc.company,
    )
    _authorize_existing_exchange(exchange_doc, profile)
    return_doc = frappe.get_doc(exchange_doc.invoice_type, exchange_doc.return_invoice)
    sale_doc = frappe.get_doc(exchange_doc.invoice_type, exchange_doc.replacement_invoice)
    return _public_result(exchange_doc, return_doc, sale_doc)


def _reconcile_credit_note(return_doc, sale_doc, amount, profile):
    if flt(amount) <= 0:
        return None

    from erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation import (
        reconcile_dr_cr_note,
    )

    account = sale_doc.get("debit_to")
    if not account or account != return_doc.get("debit_to"):
        frappe.throw(_("Return and replacement invoices must use the same receivable account."))

    account_currency = frappe.get_cached_value("Account", account, "account_currency")
    cost_center = (
        sale_doc.get("cost_center")
        or next((row.get("cost_center") for row in sale_doc.get("items") or [] if row.get("cost_center")), None)
        or profile.get("cost_center")
    )
    entry = frappe._dict(
        {
            "voucher_type": SUPPORTED_INVOICE_DOCTYPE,
            "voucher_no": return_doc.name,
            "voucher_detail_no": None,
            "against_voucher_type": SUPPORTED_INVOICE_DOCTYPE,
            "against_voucher": sale_doc.name,
            "account": account,
            "exchange_rate": flt(return_doc.get("conversion_rate") or 1),
            "party_type": "Customer",
            "party": sale_doc.customer,
            "dr_or_cr": "credit_in_account_currency",
            "unreconciled_amount": abs(flt(return_doc.outstanding_amount)),
            "unadjusted_amount": abs(flt(return_doc.outstanding_amount)),
            "allocated_amount": flt(amount),
            "difference_amount": 0,
            "difference_account": None,
            "difference_posting_date": sale_doc.posting_date,
            "debit_or_credit_note_posting_date": return_doc.posting_date,
            "currency": account_currency or sale_doc.currency,
            "cost_center": cost_center,
        }
    )
    reconcile_dr_cr_note([entry], sale_doc.company)
    rows = frappe.get_all(
        "Journal Entry Account",
        filters={
            "docstatus": 1,
            "reference_type": SUPPORTED_INVOICE_DOCTYPE,
            "reference_name": ["in", [return_doc.name, sale_doc.name]],
        },
        fields=["parent", "reference_name"],
        order_by="creation desc",
    )
    references_by_parent = {}
    for row in rows:
        references_by_parent.setdefault(row.parent, set()).add(row.reference_name)
    return next(
        (
            parent
            for parent, references in references_by_parent.items()
            if {return_doc.name, sale_doc.name}.issubset(references)
        ),
        None,
    )


def _validate_final_settlement(return_doc, sale_doc, return_total, sale_total):
    tolerance = _settlement_tolerance(return_doc, sale_doc)
    expected_return_outstanding = -max(flt(return_total) - flt(sale_total), 0)
    actual_return_outstanding = flt(return_doc.outstanding_amount)
    actual_sale_outstanding = flt(sale_doc.outstanding_amount)

    if (
        abs(actual_sale_outstanding) > tolerance
        or abs(actual_return_outstanding - expected_return_outstanding) > tolerance
    ):
        frappe.throw(
            _(
                "Exchange settlement did not close correctly. Replacement outstanding is {0} "
                "and return credit outstanding is {1}."
            ).format(actual_sale_outstanding, actual_return_outstanding)
        )


def _validate_submitted_exchange_documents(return_doc, sale_doc, expected_return_against):
    if not cint(return_doc.get("is_return")):
        frappe.throw(_("Exchange return document was not created as a return invoice."))
    if cstr(return_doc.get("return_against")) != cstr(expected_return_against):
        frappe.throw(_("Exchange return invoice is not linked to the selected original invoice."))
    if cint(sale_doc.get("is_return")):
        frappe.throw(_("Exchange replacement document was incorrectly created as a return invoice."))


@frappe.whitelist()
def submit_item_exchange(
    return_invoice,
    sale_invoice,
    data=None,
    pos_profile=None,
    client_request_id=None,
):
    """Submit a return and replacement sale, then allocate the credit atomically."""

    client_request_id = cstr(client_request_id).strip()
    if not client_request_id:
        frappe.throw(_("Exchange request ID is required."))

    return_payload = _as_dict(return_invoice)
    sale_payload = _as_dict(sale_invoice)
    submission_data = _as_dict(data)
    profile = get_authorized_pos_profile(
        pos_profile,
        company=sale_payload.get("company"),
    )

    existing = _existing_exchange(client_request_id)
    if existing:
        _authorize_existing_exchange(existing, profile)
        return_doc = frappe.get_doc(existing.invoice_type, existing.return_invoice)
        sale_doc = frappe.get_doc(existing.invoice_type, existing.replacement_invoice)
        return _public_result(existing, return_doc, sale_doc)

    _validate_exchange_payload(return_payload, sale_payload, profile)
    _validate_original_invoice(return_payload, profile)

    # Client-only settlement hints are never written to ERPNext documents.
    for fieldname in ("posa_exchange_credit", "posa_exchange_request_id"):
        sale_payload.pop(fieldname, None)

    return_data = frappe._dict(
        {
            "total_change": 0,
            "paid_change": 0,
            "credit_change": 0,
            "is_credit_sale": 1,
            "is_write_off_change": 0,
            "write_off_amount": 0,
            "redeemed_customer_credit": 0,
            "customer_credit_dict": [],
            "gift_card_redemptions": [],
            "is_cashback": 0,
        }
    )
    return_payload["posa_client_request_id"] = f"{client_request_id}-return"
    return_data["client_request_id"] = return_payload["posa_client_request_id"]
    sale_payload["posa_client_request_id"] = cstr(
        sale_payload.get("posa_client_request_id") or f"{client_request_id}-sale"
    )
    submission_data["client_request_id"] = sale_payload["posa_client_request_id"]

    return_result = submit_invoice(
        json.dumps(return_payload),
        json.dumps(return_data),
        submit_in_background=False,
    )
    sale_result = submit_invoice(
        json.dumps(sale_payload),
        json.dumps(submission_data),
        submit_in_background=False,
    )
    return_doc = frappe.get_doc(return_result["doctype"], return_result["name"])
    sale_doc = frappe.get_doc(sale_result["doctype"], sale_result["name"])

    if cint(return_doc.docstatus) != 1 or cint(sale_doc.docstatus) != 1:
        frappe.throw(_("Both exchange invoices must be submitted synchronously."))

    _validate_submitted_exchange_documents(
        return_doc,
        sale_doc,
        return_payload.get("return_against"),
    )

    return_doc.reload()
    sale_doc.reload()
    return_total = _document_total(return_doc)
    sale_total = _document_total(sale_doc)
    allocation = min(abs(flt(return_doc.outstanding_amount)), max(flt(sale_doc.outstanding_amount), 0))
    expected_allocation = min(return_total, sale_total)
    if abs(allocation - expected_allocation) > _settlement_tolerance(return_doc, sale_doc):
        frappe.throw(
            _(
                "Exchange settlement is incomplete. The replacement invoice must collect only the net difference."
            )
        )

    reconciliation_journal = _reconcile_credit_note(return_doc, sale_doc, allocation, profile)
    return_doc.reload()
    sale_doc.reload()
    _validate_final_settlement(return_doc, sale_doc, return_total, sale_total)

    difference = flt(sale_total - return_total)
    settlement_type = "Customer Payment" if difference > 0 else "Customer Credit" if difference < 0 else "Even Exchange"
    exchange_doc = frappe.get_doc(
        {
            "doctype": EXCHANGE_DOCTYPE,
            "client_request_id": client_request_id,
            "status": "Completed",
            "company": sale_doc.company,
            "pos_profile": profile.name,
            "pos_opening_shift": sale_doc.get("posa_pos_opening_shift"),
            "customer": sale_doc.customer,
            "invoice_type": SUPPORTED_INVOICE_DOCTYPE,
            "original_invoice": return_doc.return_against,
            "return_invoice": return_doc.name,
            "replacement_invoice": sale_doc.name,
            "currency": sale_doc.currency,
            "return_total": return_total,
            "sale_total": sale_total,
            "difference_amount": difference,
            "allocated_amount": allocation,
            "settlement_type": settlement_type,
            "reconciliation_journal": reconciliation_journal,
        }
    )
    exchange_doc.insert(ignore_permissions=True)
    return _public_result(exchange_doc, return_doc, sale_doc)
