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

    frappe.log_error(
        f"[CREATION] START - company={company}, amount={amount}, currency={currency}, "
        f"mode_of_payment={mode_of_payment}, party={party}, party_type={party_type}, "
        f"payment_type={payment_type}, exchange_rate={exchange_rate}, posting_date={posting_date}",
        "POS Payment Entry Trace"
    )

    # Cache commonly used values
    company_doc = frappe.get_cached_doc("Company", company)
    company_currency = company_doc.default_currency
    letter_head = company_doc.default_letter_head

    # Get party account and currency
    party_account = get_party_account(party_type, party, company)
    if not party_account:
        frappe.throw(_(
            "No default {0} account set for {1}"
        ).format("receivable" if party_type == "Customer" else "payable", party))
    party_account_currency = get_account_currency(party_account)

    # Get bank details BEFORE validation
    bank = get_bank_cash_account(company, mode_of_payment)
    if not bank:
        frappe.throw(_("Bank/Cash account not found for mode of payment {0}").format(mode_of_payment))

    frappe.log_error(
        f"[CREATION] CURRENCY CHECK - party_account={party_account}, "
        f"party_account_currency={party_account_currency}, bank_account={bank.account}, "
        f"bank_currency={bank.account_currency}, company_currency={company_currency}",
        "POS Payment Entry Trace"
    )

    # Validate currency: frontend always sends bank currency (physical cash)
    expected_currency = bank.account_currency
    if currency != expected_currency:
        frappe.throw(_(
            "Currency is not correct. Expected {expected}, got {currency}"
        ).format(expected=expected_currency, currency=currency))

    # Get exchange rate
    if exchange_rate and flt(exchange_rate) > 0:
        conversion_rate = flt(exchange_rate)
        frappe.log_error(
            f"[CREATION] Using user-provided exchange_rate={exchange_rate}, conversion_rate={conversion_rate}",
            "POS Payment Entry Trace"
        )
    else:
        conversion_rate = get_exchange_rate(
            currency, company_currency, date,
            "for_buying" if payment_type == "Pay" else "for_selling"
        )
        frappe.log_error(
            f"[CREATION] System fetched exchange_rate: {currency} -> {company_currency} = {conversion_rate}",
            "POS Payment Entry Trace"
        )

    # Create payment entry with metadata only
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

    # Let ERPNext fill missing metadata (party name, contact, defaults)
    pe.setup_party_account_field()
    pe.set_missing_values()

    # NOW override with our multi-currency calculations
    bank_amount = flt(amount)
    precision = flt(frappe.db.get_default("currency_precision") or 2)

    frappe.log_error(
        f"[CREATION] Before calculation - bank_amount={bank_amount}, precision={precision}, "
        f"party_account_currency={party_account_currency}, bank.account_currency={bank.account_currency}",
        "POS Payment Entry Trace"
    )

    if party_account_currency != bank.account_currency:
        bank_to_base = conversion_rate
        party_to_base = flt(get_exchange_rate(party_account_currency, company_currency, date))

        frappe.log_error(
            f"[CREATION] CROSS-CURRENCY BRANCH - bank_to_base={bank_to_base}, party_to_base={party_to_base}, "
            f"payment_type={payment_type}",
            "POS Payment Entry Trace"
        )

        if payment_type == "Receive":
            pe.received_amount = bank_amount
            pe.source_exchange_rate = party_to_base
            pe.target_exchange_rate = bank_to_base
            pe.paid_amount = flt(bank_amount * bank_to_base / party_to_base, precision)
        else:  # Pay
            pe.paid_amount = bank_amount
            pe.source_exchange_rate = bank_to_base
            pe.target_exchange_rate = party_to_base
            pe.received_amount = flt(bank_amount * bank_to_base / party_to_base, precision)

        pe.base_paid_amount = flt(pe.paid_amount * pe.source_exchange_rate, precision)
        pe.base_received_amount = flt(pe.received_amount * pe.target_exchange_rate, precision)
    else:
        paid_amount, received_amount = set_paid_amount_and_received_amount(
            party_account_currency, bank, amount, payment_type, None, conversion_rate
        )
        pe.paid_amount = paid_amount
        pe.received_amount = received_amount
        # Defensive: ensure base amounts are set for same-currency case
        if not pe.base_paid_amount:
            pe.base_paid_amount = flt(paid_amount)
        if not pe.base_received_amount:
            pe.base_received_amount = flt(received_amount)

    frappe.log_error(
        f"[CREATION] FINAL PE VALUES - paid_amount={pe.paid_amount}, received_amount={pe.received_amount}, "
        f"source_exchange_rate={pe.source_exchange_rate}, target_exchange_rate={pe.target_exchange_rate}, "
        f"base_paid_amount={pe.base_paid_amount}, base_received_amount={pe.base_received_amount}, "
        f"paid_from={pe.paid_from}, paid_to={pe.paid_to}, "
        f"paid_from_account_currency={pe.paid_from_account_currency}, "
        f"paid_to_account_currency={pe.paid_to_account_currency}",
        "POS Payment Entry Trace"
    )

    if submit:
        pe.insert(ignore_permissions=True)
        pe.submit()

    return pe
