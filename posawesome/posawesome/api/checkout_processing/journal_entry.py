import frappe
from frappe.utils import nowdate
from posawesome.posawesome.api.checkout_processing.utils import (
    get_party_account,
    get_bank_cash_account
)

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
        je.submit()

        frappe.log_error(f"Created Journal Entry: {je.name}", "Direct JE Debug")

        return je.name

    except Exception as e:
        frappe.log_error(f"Error creating direct journal entry: {str(e)}", "Direct JE Error")
        frappe.throw(f"Failed to create journal entry: {str(e)}")
