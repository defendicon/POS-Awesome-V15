import frappe
import erpnext
from frappe import _
from frappe.utils import getdate, nowdate, flt
from erpnext.accounts.party import get_party_account
from erpnext.accounts.utils import get_account_currency
from erpnext.setup.utils import get_exchange_rate
from erpnext.accounts.doctype.bank_account.bank_account import get_party_bank_account
from posawesome.posawesome.api.payment_processing.utils import (
    get_bank_cash_account,
    set_paid_amount_and_received_amount
)

def create_payment_entry(
    company,
    customer,
    amount,
    currency,
    mode_of_payment,
    exchange_rate=None,
    reference_date=None,
    reference_no=None,
    posting_date=None,
    cost_center=None,
    submit=0,
):
    if not company:
        frappe.throw(_("Company is required"))
    if not customer:
        frappe.throw(_("Customer is required"))
    if not mode_of_payment:
        frappe.throw(_("Mode of Payment is required"))

    amount = flt(amount)
    if amount <= 0:
        frappe.throw(_("Amount must be greater than zero"))

    date = nowdate() if not posting_date else posting_date
    try:
        date = str(getdate(date))
    except Exception:
        frappe.throw(_("Invalid posting date"))

    party_type = "Customer"

    # Cache commonly used values
    company_doc = frappe.get_cached_doc("Company", company)
    company_currency = company_doc.default_currency
    letter_head = company_doc.default_letter_head

    # Get party account and currency in one call
    party_account = get_party_account(party_type, customer, company)
    if not party_account:
        frappe.throw(_("Unable to determine party account for customer {0}.").format(customer))
    party_account_currency = get_account_currency(party_account)

    if party_account_currency != currency:
        frappe.throw(
            _(
                "Currency is not correct, party account currency is {party_account_currency} and transaction currency is {currency}"
            ).format(party_account_currency=party_account_currency, currency=currency)
        )
    payment_type = "Receive"

    # Get bank details in one call
    bank = get_bank_cash_account(company, mode_of_payment)
    if not bank or not bank.get("account") or not bank.get("account_currency"):
        frappe.throw(
            _("Unable to resolve bank/cash account for mode of payment {0}.").format(mode_of_payment)
        )

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
    pe.party = customer
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


    if party_account and bank:
        pe.set_amounts()

    # Insert and submit in one go if needed
    pe.insert(ignore_permissions=True)
    if submit:
        pe.submit()

    return pe
