import frappe
from frappe import _
from frappe.utils import (
    cint,
    flt,
    getdate,
    nowdate,
)
from erpnext.accounts.utils import reconcile_against_document
from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
from posawesome.posawesome.api.payment_processing.utils import get_party_account
from posawesome.posawesome.api.payment_processing.utils import get_bank_cash_account as get_bank_account_processing

def _create_change_payment_entries(
    invoice_doc, data, pos_profile=None, cash_account=None, receive_entries=None
):
    """Create change-related Payment Entries after the invoice is submitted."""

    credit_change_amount = flt(data.get("credit_change"))
    paid_change_amount = flt(data.get("paid_change"))

    if credit_change_amount <= 0 and paid_change_amount <= 0:
        return

    if invoice_doc.docstatus != 1:
        frappe.throw(
            _("{0} {1} must be submitted before creating change payment entries.").format(
                invoice_doc.doctype, invoice_doc.name
            )
        )

    configured_cash_mode_of_payment = None
    if pos_profile:
        configured_cash_mode_of_payment = frappe.db.get_value(
            "POS Profile", pos_profile, "posa_cash_mode_of_payment"
        )

    cash_mode_of_payment = configured_cash_mode_of_payment
    if not cash_mode_of_payment:
        for payment in invoice_doc.payments:
            if payment.get("type") == "Cash" and payment.get("mode_of_payment"):
                cash_mode_of_payment = payment.get("mode_of_payment")
                break

    if not cash_mode_of_payment:
        cash_mode_of_payment = "Cash"

    resolved_cash_account = cash_account
    if not resolved_cash_account and cash_mode_of_payment:
        # Use get_bank_cash_account from erpnext or our processing utility?
        # The original code imported get_bank_cash_account from erpnext.accounts.doctype.sales_invoice.sales_invoice
        # But we also have one in posawesome.api.payment_processing.utils
        # Let's use the one from erpnext as in original code
        resolved_cash_account = get_bank_cash_account(cash_mode_of_payment, invoice_doc.company)

    if not resolved_cash_account:
        resolved_cash_account = {
            "account": frappe.get_value("Company", invoice_doc.company, "default_cash_account")
        }

    cash_account_name = (
        resolved_cash_account.get("account")
        if isinstance(resolved_cash_account, (dict, frappe._dict))
        else resolved_cash_account
    )
    if not cash_account_name:
        frappe.throw(_("Unable to determine cash account for change payment entry."))

    party_account = invoice_doc.get("debit_to")
    if not party_account and invoice_doc.get("customer"):
        party_account = get_party_account("Customer", invoice_doc.get("customer"), invoice_doc.get("company"))
    if not party_account:
        frappe.throw(_("Unable to determine customer receivable account for change payment entry."))

    posting_date = invoice_doc.get("posting_date") or nowdate()
    reference_no = invoice_doc.get("posa_pos_opening_shift")
    created_receive_payment_entries = receive_entries or data.get("created_receive_payment_entries") or []

    def _normalized_text(value):
        return str(value or "").strip().lower()

    def _doc_value(doc, key, default=None):
        if hasattr(doc, "get"):
            value = doc.get(key, default)
            if value is not None:
                return value
        return getattr(doc, key, default)

    def _get_matching_receive_payment_entry(required_amount):
        if required_amount <= 0:
            return None

        cash_mode_lower = _normalized_text(cash_mode_of_payment)
        cash_account_lower = _normalized_text(cash_account_name)

        fallback_candidate = None
        for row in reversed(created_receive_payment_entries):
            unallocated_amount = flt(row.get("unallocated_amount"))
            if unallocated_amount < required_amount:
                continue

            if (
                _normalized_text(row.get("mode_of_payment")) == cash_mode_lower
                and _normalized_text(row.get("account")) == cash_account_lower
            ):
                return row

            if fallback_candidate is None:
                fallback_candidate = row

        return fallback_candidate

    def _reconcile_change_against_receive_payment_entry(source_payment_entry_name, change_payment_entry):
        if not source_payment_entry_name or not change_payment_entry:
            return

        source_payment_entry = frappe.get_doc("Payment Entry", source_payment_entry_name)
        source_unallocated_amount = flt(_doc_value(source_payment_entry, "unallocated_amount"))
        change_unallocated_amount = flt(_doc_value(change_payment_entry, "unallocated_amount")) or flt(
            _doc_value(change_payment_entry, "paid_amount")
        )
        allocated_amount = min(source_unallocated_amount, change_unallocated_amount)

        if allocated_amount <= 0:
            return

        dr_or_cr = (
            "credit_in_account_currency"
            if _doc_value(source_payment_entry, "party_type") == "Customer"
            else "debit_in_account_currency"
        )

        reconcile_against_document(
            [
                frappe._dict(
                    {
                        "voucher_type": "Payment Entry",
                        "voucher_no": _doc_value(source_payment_entry, "name"),
                        "voucher_detail_no": None,
                        "against_voucher_type": "Payment Entry",
                        "against_voucher": _doc_value(change_payment_entry, "name"),
                        "account": _doc_value(source_payment_entry, "paid_to") or party_account,
                        "exchange_rate": 1,
                        "party_type": _doc_value(source_payment_entry, "party_type") or "Customer",
                        "party": _doc_value(source_payment_entry, "party") or invoice_doc.get("customer"),
                        "is_advance": 0,
                        "dr_or_cr": dr_or_cr,
                        "unreconciled_amount": source_unallocated_amount,
                        "unadjusted_amount": source_unallocated_amount,
                        "allocated_amount": allocated_amount,
                        "difference_amount": 0,
                        "cost_center": _doc_value(source_payment_entry, "cost_center"),
                    }
                )
            ]
        )

    def _reconcile_change_against_invoice(change_payment_entry):
        if not change_payment_entry or not invoice_doc.get("name"):
            return

        allocated_amount = flt(_doc_value(change_payment_entry, "paid_amount"))
        if allocated_amount <= 0:
            return

        reconcile_against_document(
            [
                frappe._dict(
                    {
                        "voucher_type": "Payment Entry",
                        "voucher_no": _doc_value(change_payment_entry, "name"),
                        "voucher_detail_no": None,
                        "against_voucher_type": invoice_doc.get("doctype") or "Sales Invoice",
                        "against_voucher": invoice_doc.get("name"),
                        "account": _doc_value(change_payment_entry, "paid_from") or cash_account_name,
                        "party_type": "Customer",
                        "party": invoice_doc.get("customer"),
                        "dr_or_cr": "credit_in_account_currency",
                        "unreconciled_amount": allocated_amount,
                        "unadjusted_amount": allocated_amount,
                        "allocated_amount": allocated_amount,
                        "grand_total": allocated_amount,
                        "outstanding_amount": allocated_amount,
                        "exchange_rate": 1,
                        "is_advance": 0,
                        "difference_amount": 0,
                        "cost_center": _doc_value(change_payment_entry, "cost_center"),
                    }
                )
            ]
        )

    def _using_only_configured_cash_mode():
        """Return True when every paid row matches the configured cash mode and account."""

        if not cash_mode_of_payment or not cash_account_name:
            return False

        cash_mode_lower = str(cash_mode_of_payment).strip().lower()
        cash_account_lower = str(cash_account_name).strip().lower()
        paid_rows = [row for row in invoice_doc.payments if flt(row.get("amount")) > 0]
        if not paid_rows:
            return False

        saw_configured_cash_row = False

        for row in paid_rows:
            mode_lower = str(row.get("mode_of_payment") or "").strip().lower()

            if mode_lower != cash_mode_lower:
                # Any different paid mode means we should not skip overpayment handling
                return False

            row_account_lower = str(row.get("account") or "").strip().lower()
            if row_account_lower != cash_account_lower:
                # Different account from the configured cash mode should trigger overpayment handling
                return False

            saw_configured_cash_row = True

        return saw_configured_cash_row

    # If every payment row uses the configured cash mode, skip overpayment handling
    # and let the regular cash change flow apply.
    if _using_only_configured_cash_mode() and not created_receive_payment_entries:
        return

    if credit_change_amount > 0:
        advance_payment_entry = frappe.new_doc("Payment Entry")
        advance_payment_entry.payment_type = "Receive"
        advance_payment_entry.mode_of_payment = (
            configured_cash_mode_of_payment or cash_mode_of_payment or "Cash"
        )
        advance_payment_entry.party_type = "Customer"
        advance_payment_entry.party = invoice_doc.get("customer")
        advance_payment_entry.company = invoice_doc.get("company")
        advance_payment_entry.posting_date = posting_date
        advance_payment_entry.paid_from = cash_account_name
        advance_payment_entry.paid_to = party_account
        advance_payment_entry.paid_amount = credit_change_amount
        advance_payment_entry.received_amount = credit_change_amount
        advance_payment_entry.difference_amount = 0
        advance_payment_entry.reference_no = reference_no
        advance_payment_entry.reference_date = posting_date

        advance_payment_entry.setup_party_account_field()
        advance_payment_entry.set_missing_values()
        advance_payment_entry.set_amounts()
        advance_payment_entry.paid_amount = credit_change_amount
        advance_payment_entry.received_amount = credit_change_amount

        if reference_no:
            advance_payment_entry.reference_no = reference_no
            advance_payment_entry.reference_date = posting_date

        advance_payment_entry.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        advance_payment_entry.save()
        advance_payment_entry.submit()

    if paid_change_amount > 0:
        source_receive_payment_entry = _get_matching_receive_payment_entry(paid_change_amount)
        change_payment_entry = frappe.new_doc("Payment Entry")
        change_payment_entry.payment_type = "Pay"
        change_payment_entry.mode_of_payment = (
            configured_cash_mode_of_payment or cash_mode_of_payment or "Cash"
        )
        change_payment_entry.party_type = "Customer"
        change_payment_entry.party = invoice_doc.get("customer")
        change_payment_entry.company = invoice_doc.get("company")
        change_payment_entry.posting_date = posting_date
        change_payment_entry.paid_from = cash_account_name
        change_payment_entry.paid_to = party_account
        change_payment_entry.paid_amount = paid_change_amount
        change_payment_entry.received_amount = paid_change_amount
        change_payment_entry.difference_amount = 0

        if reference_no:
            change_payment_entry.reference_no = reference_no
            change_payment_entry.reference_date = posting_date

        change_payment_entry.setup_party_account_field()
        change_payment_entry.set_missing_values()
        change_payment_entry.set_amounts()

        change_payment_entry.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        change_payment_entry.save()
        change_payment_entry.submit()

        if source_receive_payment_entry:
            _reconcile_change_against_receive_payment_entry(
                source_receive_payment_entry.get("name"),
                change_payment_entry,
            )
        else:
            _reconcile_change_against_invoice(change_payment_entry)
