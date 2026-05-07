import frappe
from frappe import _
from frappe.utils import nowdate
from posawesome.posawesome.api.payment_processing.utils import get_party_account, get_bank_cash_account


def create_direct_journal_entry(
    company,
    customer,
    invoices_list,
    payment_amount,
    bank_account=None,
    mode_of_payment=None,
):
    """Create a journal entry directly to handle payment allocation and bypass payment entry reconciliation issues"""
    try:
        frappe.log_error(
            f"Creating direct journal entry for {customer} with amount {payment_amount}",
            "Direct JE Debug",
        )

        # Get today's date
        today = nowdate()

        # Get receivable account
        receivable_account = get_party_account("Customer", customer, company)
        frappe.log_error(f"Using receivable account: {receivable_account}", "Direct JE Debug")

        if not receivable_account:
            frappe.log_error("Receivable account not found, trying default", "Direct JE Debug")
            receivable_account = frappe.get_cached_value("Company", company, "default_receivable_account")

        if not receivable_account:
            frappe.throw(
                f"Account not found for customer {customer} in company {company}. Please set up default receivable account."
            )

        # If bank_account is not provided, try to get it from mode_of_payment
        if not bank_account:
            frappe.log_error(
                f"Bank account not provided, trying mode_of_payment: {mode_of_payment}",
                "Direct JE Debug",
            )
            if mode_of_payment:
                # Get mode of payment account for this company
                payment_account = frappe.get_value(
                    "Mode of Payment Account",
                    {"parent": mode_of_payment, "company": company},
                    "default_account",
                )

                if payment_account:
                    bank_account = payment_account
                    frappe.log_error(
                        f"Found payment account from mode_of_payment: {bank_account}",
                        "Direct JE Debug",
                    )
                else:
                    # Use bank/cash account
                    bank = get_bank_cash_account(company, mode_of_payment)
                    if bank and bank.get("account"):
                        bank_account = bank.get("account")
                        frappe.log_error(
                            f"Found bank account from get_bank_cash_account: {bank_account}",
                            "Direct JE Debug",
                        )

            # If still no bank account, use cash account as fallback
            if not bank_account:
                frappe.log_error("No bank account found, using Cash account", "Direct JE Debug")
                cash_account = frappe.get_value(
                    "Mode of Payment Account",
                    {"parent": "Cash", "company": company},
                    "default_account",
                )

                if cash_account:
                    bank_account = cash_account
                else:
                    # Final fallback - try to get company's default cash account
                    bank_account = frappe.get_value("Company", company, "default_cash_account")

                frappe.log_error(f"Using fallback cash account: {bank_account}", "Direct JE Debug")

        if not bank_account:
            frappe.throw(
                "Could not determine bank/cash account for payment. Please set default cash account for company."
            )

        frappe.log_error(f"Final bank/cash account: {bank_account}", "Direct JE Debug")

        # Create Journal Entry
        je = frappe.new_doc("Journal Entry")
        je.voucher_type = "Journal Entry"
        je.company = company
        je.posting_date = today
        je.user_remark = f"Payment received from {customer}"

        # Debit Bank/Cash
        je.append(
            "accounts",
            {
                "account": bank_account,
                "debit_in_account_currency": payment_amount,
                "credit_in_account_currency": 0,
                "party_type": "",
                "party": "",
                "cost_center": frappe.get_cached_value("Company", company, "cost_center"),
            },
        )

        # Credit Customer (Receivable)
        credit_row = je.append(
            "accounts",
            {
                "account": receivable_account,
                "debit_in_account_currency": 0,
                "credit_in_account_currency": payment_amount,
                "party_type": "Customer",
                "party": customer,
                "cost_center": frappe.get_cached_value("Company", company, "cost_center"),
            },
        )

        je.save(ignore_permissions=True)
        try:
            frappe.flags.ignore_permissions = True
            je.submit()
        finally:
            frappe.flags.ignore_permissions = False

        frappe.log_error(f"Created Journal Entry: {je.name}", "Direct JE Debug")

        return je.name

    except Exception as e:
        frappe.log_error(f"Error creating direct journal entry: {str(e)}", "Direct JE Error")
        frappe.throw(f"Failed to create journal entry: {str(e)}")


def create_pos_exchange_gain_loss_journal(
    company,
    posting_date,
    party_type,
    party,
    party_account,
    gain_loss_account,
    exc_gain_loss,
    dr_or_cr,
    reverse_dr_or_cr,
    ref1_dt,
    ref1_dn,
    ref1_detail_no,
    ref2_dt,
    ref2_dn,
    ref2_detail_no,
    cost_center,
    dimensions,
    project=None,
):
    """
    Create Exchange Gain/Loss JE with correct account_currency amounts.

    Fixes ERPNext core behavior where *_in_account_currency is set to 0 even when
    the account currency matches the company currency. GL entries inherit values
    from JE rows at submit time, so we must set correct values BEFORE submit.

    Args:
        company: Company name
        posting_date: Posting date for the JE
        party_type: Party type (e.g., "Customer")
        party: Party name
        party_account: Party account (receivable/payable)
        gain_loss_account: Exchange Gain/Loss account
        exc_gain_loss: Exchange gain/loss amount (positive number)
        dr_or_cr: "debit" or "credit" for party account
        reverse_dr_or_cr: Opposite of dr_or_cr
        ref1_dt: Reference doctype for party account (e.g., "Sales Invoice")
        ref1_dn: Reference name for party account
        ref1_detail_no: Reference detail number (idx) for party account
        ref2_dt: Reference doctype for gain/loss account (e.g., "Payment Entry")
        ref2_dn: Reference name for gain/loss account
        ref2_detail_no: Reference detail number (idx) for gain/loss account
        cost_center: Cost center
        dimensions: Accounting dimensions dict or None
        project: Project name or None

    Returns:
        str: Journal Entry name
    """
    import erpnext
    from erpnext.accounts.doctype.account.account import get_account_currency

    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Exchange Gain Or Loss"
    je.company = company
    je.posting_date = posting_date or nowdate()
    je.multi_currency = 1
    je.is_system_generated = True

    company_currency = frappe.get_cached_value("Company", company, "default_currency")
    party_account_currency = get_account_currency(party_account)
    gain_loss_account_currency = get_account_currency(gain_loss_account)

    if gain_loss_account_currency != company_currency:
        frappe.throw(
            _("Exchange Gain/Loss account {0} must be in company currency {1}").format(
                gain_loss_account, company_currency
            )
        )

    default_cost_center = cost_center or erpnext.get_default_cost_center(company)

    # Party account row - FIX: set _in_account_currency to match company currency
    party_row = {
        "account": party_account,
        "party_type": party_type,
        "party": party,
        "account_currency": party_account_currency,
        "exchange_rate": 1,
        "cost_center": default_cost_center,
        "project": project,
        "reference_type": ref1_dt,
        "reference_name": ref1_dn,
        "reference_detail_no": ref1_detail_no,
        dr_or_cr: abs(exc_gain_loss),
        dr_or_cr + "_in_account_currency": abs(exc_gain_loss),
    }
    if dimensions:
        party_row.update(dimensions)
    je.append("accounts", party_row)

    # Gain/loss account row - FIX: set _in_account_currency to match company currency
    gl_row = {
        "account": gain_loss_account,
        "account_currency": gain_loss_account_currency,
        "exchange_rate": 1,
        "cost_center": default_cost_center,
        "project": project,
        "reference_type": ref2_dt,
        "reference_name": ref2_dn,
        "reference_detail_no": ref2_detail_no,
        reverse_dr_or_cr: abs(exc_gain_loss),
        reverse_dr_or_cr + "_in_account_currency": abs(exc_gain_loss),
    }
    if dimensions:
        gl_row.update(dimensions)
    je.append("accounts", gl_row)

    je.save(ignore_permissions=True)
    try:
        frappe.flags.ignore_permissions = True
        je.submit()
    finally:
        frappe.flags.ignore_permissions = False
    return je.name
