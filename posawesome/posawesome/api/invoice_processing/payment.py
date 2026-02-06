import frappe
from frappe import _
from frappe.utils import (
    cint,
    flt,
    getdate,
    nowdate,
)
from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
from posawesome.posawesome.api.payment_processing.utils import get_party_account
from posawesome.posawesome.api.payment_processing.utils import get_bank_cash_account as get_bank_account_processing

def _create_change_payment_entries(invoice_doc, data, pos_profile=None, cash_account=None):
    """Create change-related Payment Entries after the invoice is submitted."""

    credit_change_amount = flt(data.get("credit_change"))
    paid_change_amount = flt(data.get("paid_change"))

    def _invert_sign(amount):
        """Flip the sign of the provided amount (positive->negative and vice-versa)."""

        return -1 * flt(amount)

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
    if _using_only_configured_cash_mode():
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

        advance_payment_entry.append(
            "references",
            {
                "reference_doctype": invoice_doc.doctype,
                "reference_name": invoice_doc.name,
                "allocated_amount": _invert_sign(credit_change_amount),
            },
        )

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

        change_payment_entry.append(
            "references",
            {
                "reference_doctype": invoice_doc.doctype,
                "reference_name": invoice_doc.name,
                "allocated_amount": _invert_sign(paid_change_amount),
            },
        )

        change_payment_entry.setup_party_account_field()
        change_payment_entry.set_missing_values()
        change_payment_entry.set_amounts()

        change_payment_entry.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        change_payment_entry.save()
        change_payment_entry.submit()
