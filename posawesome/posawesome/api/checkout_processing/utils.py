import frappe
from erpnext.accounts.doctype.journal_entry.journal_entry import get_default_bank_cash_account

def get_party_account(party_type, party, company):
    try:
        # First try to get from Party Account
        account = frappe.get_cached_value(
            "Party Account",
            {"parenttype": party_type, "parent": party, "company": company},
            "account",
        )

        if not account:
            # Try to get default account from company
            account = frappe.get_cached_value(
                "Company",
                company,
                ("default_receivable_account" if party_type == "Customer" else "default_payable_account"),
            )

        if not account:
            frappe.log_error(
                f"No account found for {party_type} {party} in company {company}",
                "POS Account Error",
            )

        return account
    except Exception as e:
        frappe.log_error(f"Error getting party account: {str(e)}")
        return None

def get_bank_cash_account(company, mode_of_payment, bank_account=None):
    bank = get_default_bank_cash_account(
        company, "Bank", mode_of_payment=mode_of_payment, account=bank_account
    )

    if not bank:
        bank = get_default_bank_cash_account(
            company, "Cash", mode_of_payment=mode_of_payment, account=bank_account
        )

    return bank

def set_paid_amount_and_received_amount(
    party_account_currency,
    bank,
    outstanding_amount,
    payment_type,
    bank_amount,
    conversion_rate,
):
    paid_amount = received_amount = 0
    if party_account_currency == bank.account_currency:
        paid_amount = received_amount = abs(outstanding_amount)
    elif payment_type == "Receive":
        paid_amount = abs(outstanding_amount)
        if bank_amount:
            received_amount = bank_amount
        else:
            received_amount = paid_amount * conversion_rate

    else:
        received_amount = abs(outstanding_amount)
        if bank_amount:
            paid_amount = bank_amount
        else:
            # if party account currency and bank currency is different then populate paid amount as well
            paid_amount = received_amount * conversion_rate

    return paid_amount, received_amount

@frappe.whitelist()
def get_mode_of_payment_accounts(company, mode_of_payments):
    import json
    if isinstance(mode_of_payments, str):
        mode_of_payments = json.loads(mode_of_payments)
    
    currency_map = {}
    for mode in mode_of_payments:
        account = get_bank_cash_account(company, mode)
        if account:
            currency_map[mode] = account.get("account_currency")
    return currency_map
