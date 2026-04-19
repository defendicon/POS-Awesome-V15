import frappe
import erpnext
from frappe import _
from frappe.utils import nowdate, flt
from erpnext.accounts.party import get_party_account
from erpnext.accounts.utils import get_account_currency
from erpnext.setup.utils import get_exchange_rate
from erpnext.accounts.doctype.bank_account.bank_account import get_party_bank_account
from posawesome.posawesome.api.idempotency import doctype_supports_client_request_id
from posawesome.posawesome.api.payment_processing.utils import (
    get_bank_cash_account,
    set_paid_amount_and_received_amount
)

def create_payment_entry(
    company,
    amount,
    currency,
    mode_of_payment,
    customer=None,
    party=None,
    party_type="Customer",
    payment_type="Receive",
    exchange_rate=None,
    reference_date=None,
    reference_no=None,
    posting_date=None,
    cost_center=None,
    submit=0,
    client_request_id=None,
):
    date = nowdate() if not posting_date else posting_date
    party = party or customer

    # Cache commonly used values
    company_doc = frappe.get_cached_doc("Company", company)
    company_currency = company_doc.default_currency
    letter_head = company_doc.default_letter_head

    # Get party account and currency in one call
    party_account = get_party_account(party_type, party, company)
    party_account_currency = get_account_currency(party_account)

    if party_account_currency != currency:
        frappe.throw(
            _(
                "Currency is not correct, party account currency is {party_account_currency} and transaction currency is {currency}"
            ).format(party_account_currency=party_account_currency, currency=currency)
        )
    # Get bank details in one call
    bank = get_bank_cash_account(company, mode_of_payment)

    # Get exchange rate
    if exchange_rate and flt(exchange_rate) > 0:
        conversion_rate = flt(exchange_rate)
    else:
        conversion_rate = get_exchange_rate(currency, company_currency, date, "for_selling")

    # Calculate amounts
    paid_amount, received_amount = set_paid_amount_and_received_amount(
        party_account_currency, bank, amount, payment_type, None, conversion_rate
    )

    # Create payment entry with minimal db calls
    pe = frappe.new_doc("Payment Entry")
    pe.payment_type = payment_type
    pe.company = company
    pe.cost_center = cost_center or erpnext.get_default_cost_center(company)
    pe.posting_date = date
    pe.mode_of_payment = mode_of_payment
    pe.party_type = party_type
    pe.party = party
    pe.paid_from = party_account if payment_type == "Receive" else bank.account
    pe.paid_to = party_account if payment_type == "Pay" else bank.account
    pe.paid_from_account_currency = (
        party_account_currency if payment_type == "Receive" else bank.account_currency
    )
    pe.paid_to_account_currency = party_account_currency if payment_type == "Pay" else bank.account_currency
    pe.paid_amount = paid_amount
    pe.received_amount = received_amount
    pe.letter_head = letter_head
    pe.reference_date = reference_date
    pe.reference_no = reference_no
    if client_request_id and doctype_supports_client_request_id("Payment Entry"):
        pe.posa_client_request_id = client_request_id

    # Set bank account if available
    if pe.party_type in ["Customer", "Supplier"]:
        bank_account = get_party_bank_account(pe.party_type, pe.party)
        if bank_account:
            pe.bank_account = bank_account
            pe.set_bank_account_data()

    # Set required fields
    pe.setup_party_account_field()
    pe.set_missing_values()

    if exchange_rate and flt(exchange_rate) > 0:
        pe.source_exchange_rate = flt(exchange_rate)
        pe.target_exchange_rate = flt(exchange_rate)
        frappe.logger().info(f"Set custom exchange rate: {exchange_rate}")


    if party_account and bank:
        pe.set_amounts()

    # Insert and submit in one go if needed
    pe.insert(ignore_permissions=True)
    if submit:
        pe.submit()

    return pe
