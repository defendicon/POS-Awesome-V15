"""Authoritative per-payment currency normalization for POS documents."""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from posawesome.posawesome.api.invoice_processing.utils import get_latest_rate


PAYMENT_CURRENCY_FIELDS = (
    "posa_payment_currency",
    "posa_original_amount",
    "posa_exchange_rate",
    "posa_company_exchange_rate",
    "posa_rate_date",
    "posa_rate_source",
    "posa_account_currency",
    "posa_account_amount",
)
TENDER_AMOUNT_PRECISION = 9


def _precision(row, fieldname, fallback=2):
    try:
        value = row.precision(fieldname)
        return fallback if value is None else value
    except Exception:
        return fallback


def _tender_amount_precision(row):
    """Keep conversion inputs exact even when Currency display precision is lower."""
    return max(_precision(row, "posa_original_amount"), TENDER_AMOUNT_PRECISION)


def _company_currency(invoice_doc):
    return (
        frappe.get_cached_value("Company", invoice_doc.company, "default_currency")
        or invoice_doc.currency
    )


def _profile(invoice_doc, profile_doc=None):
    if profile_doc:
        return profile_doc
    if invoice_doc.get("pos_profile"):
        return frappe.get_cached_doc("POS Profile", invoice_doc.pos_profile)
    return None


def _allowed_payment_currencies(profile_doc, invoice_currency, company_currency):
    configured = {
        row.currency
        for row in (profile_doc.get("posa_allowed_currencies") or [])
        if row.get("currency") and cint(row.get("allow_for_payments"))
    }
    return configured or {invoice_currency, company_currency}


def _resolve_rate(from_currency, to_currency, posting_date, cache, manual_rate=None):
    if from_currency == to_currency:
        return 1.0, getdate(posting_date), "same_currency"
    if manual_rate and flt(manual_rate) > 0:
        return flt(manual_rate), getdate(posting_date), "manual"
    rate, rate_date = get_latest_rate(
        from_currency,
        to_currency,
        cache=cache,
        transaction_date=posting_date,
        silent=True,
    )
    if not rate or flt(rate) <= 0:
        frappe.throw(
            _("No exchange rate is available for {0} to {1} on or before {2}.").format(
                from_currency, to_currency, posting_date
            )
        )
    return flt(rate), rate_date, "currency_exchange"


def normalize_invoice_payment_currencies(invoice_doc, profile_doc=None, rate_cache=None):
    """Validate and normalize each tender into invoice, company and account currencies.

    ERPNext's standard ``amount`` remains the invoice-currency equivalent and
    ``base_amount`` remains the company-currency equivalent. The original tender
    is retained in POS Awesome fields so rows with different currencies are never
    summed directly.
    """

    profile_doc = _profile(invoice_doc, profile_doc)
    company_currency = _company_currency(invoice_doc)
    invoice_currency = invoice_doc.currency or company_currency
    posting_date = invoice_doc.get("posting_date") or nowdate()
    cache = rate_cache if rate_cache is not None else {}
    feature_enabled = bool(
        profile_doc and cint(profile_doc.get("posa_enable_multi_currency_payments"))
    )
    allow_manual = bool(
        feature_enabled and cint(profile_doc.get("posa_allow_manual_payment_exchange_rate"))
    )
    allowed = _allowed_payment_currencies(
        profile_doc, invoice_currency, company_currency
    ) if profile_doc else {invoice_currency, company_currency}

    for payment in invoice_doc.get("payments") or []:
        payment_currency = payment.get("posa_payment_currency") or invoice_currency
        if not feature_enabled:
            payment_currency = invoice_currency
        elif payment_currency not in allowed:
            frappe.throw(
                _("Currency {0} is not allowed for payments in POS Profile {1}.").format(
                    payment_currency, profile_doc.name
                )
            )

        original_amount = payment.get("posa_original_amount")
        if original_amount in (None, ""):
            original_amount = payment.get("amount") or 0

        manual_rate = None
        if allow_manual and payment.get("posa_rate_source") == "manual":
            manual_rate = payment.get("posa_exchange_rate")

        invoice_rate, rate_date, source = _resolve_rate(
            payment_currency,
            invoice_currency,
            posting_date,
            cache,
            manual_rate=manual_rate,
        )
        invoice_to_company = flt(invoice_doc.get("conversion_rate")) or (
            1.0 if invoice_currency == company_currency else 0
        )
        if invoice_to_company <= 0:
            invoice_to_company, _date, _source = _resolve_rate(
                invoice_currency, company_currency, posting_date, cache
            )
        company_rate = flt(invoice_rate * invoice_to_company)

        account = payment.get("account")
        account_currency = (
            frappe.get_cached_value("Account", account, "account_currency")
            if account
            else company_currency
        ) or company_currency
        account_rate, _account_rate_date, _account_source = _resolve_rate(
            payment_currency,
            account_currency,
            posting_date,
            cache,
        )

        payment.posa_payment_currency = payment_currency
        payment.posa_original_amount = flt(
            original_amount, _tender_amount_precision(payment)
        )
        payment.posa_exchange_rate = invoice_rate
        payment.posa_company_exchange_rate = company_rate
        payment.posa_rate_date = rate_date
        payment.posa_rate_source = source
        payment.posa_account_currency = account_currency
        payment.posa_account_amount = flt(
            flt(original_amount) * account_rate,
            _precision(payment, "posa_account_amount"),
        )
        payment.amount = flt(
            flt(original_amount) * invoice_rate, _precision(payment, "amount")
        )
        payment.base_amount = flt(
            flt(original_amount) * company_rate, _precision(payment, "base_amount")
        )

    invoice_doc.paid_amount = flt(sum(row.amount for row in invoice_doc.get("payments") or []))
    invoice_doc.base_paid_amount = flt(
        sum(row.base_amount for row in invoice_doc.get("payments") or [])
    )
    return invoice_doc


def set_multi_currency_change_amounts(invoice_doc):
    """Derive invoice and company change from their matching currency totals."""

    payments = invoice_doc.get("payments") or []
    multi_currency_rows = [
        payment
        for payment in payments
        if payment.get("posa_payment_currency")
        and payment.get("posa_original_amount") not in (None, "")
        and flt(payment.get("posa_company_exchange_rate")) > 0
    ]
    if not multi_currency_rows or invoice_doc.get("is_return"):
        return invoice_doc

    if not any(payment.get("type") == "Cash" for payment in payments):
        return invoice_doc

    invoice_total = flt(
        invoice_doc.get("rounded_total") or invoice_doc.get("grand_total")
    )
    if flt(invoice_doc.get("paid_amount")) > invoice_total:
        invoice_doc.change_amount = flt(
            flt(invoice_doc.get("paid_amount")) - invoice_total,
            _precision(invoice_doc, "change_amount"),
        )

    base_invoice_total = flt(
        invoice_doc.get("base_rounded_total")
        or invoice_doc.get("base_grand_total")
    )
    invoice_doc.base_change_amount = flt(
        max(flt(invoice_doc.get("base_paid_amount")) - base_invoice_total, 0),
        _precision(invoice_doc, "base_change_amount"),
    )
    return invoice_doc


def preserve_multi_currency_payment_amounts(invoice_doc, method=None):
    """Restore original-tender values after the ERPNext v16 before-save logic.

    Frappe document hooks run after the controller method for the same event.
    This therefore prevents v16 from persisting ``amount * conversion_rate`` as
    the base value after the authoritative tender normalization has already run.
    """

    payments = invoice_doc.get("payments") or []
    if not cint(invoice_doc.get("is_pos")) or not any(
        payment.get("posa_payment_currency")
        and payment.get("posa_original_amount") not in (None, "")
        for payment in payments
    ):
        return invoice_doc

    normalize_invoice_payment_currencies(invoice_doc)
    set_multi_currency_change_amounts(invoice_doc)
    normalize_change_returns(invoice_doc)
    return invoice_doc


def normalize_change_returns(invoice_doc, profile_doc=None, rate_cache=None):
    profile_doc = _profile(invoice_doc, profile_doc)
    rows = invoice_doc.get("posa_change_returns") or []
    invoice_total = abs(flt(invoice_doc.get("rounded_total") or invoice_doc.get("grand_total")))
    paid_total = abs(flt(sum(row.amount for row in invoice_doc.get("payments") or [])))
    change_due = max(paid_total - invoice_total, 0)
    if not rows:
        invoice_doc.posa_change_returned = 0
        invoice_doc.posa_remaining_change = flt(change_due)
        return invoice_doc

    if not (
        profile_doc
        and cint(profile_doc.get("posa_enable_multi_currency_payments"))
        and cint(profile_doc.get("posa_enable_multi_currency_change"))
    ):
        frappe.throw(_("Multi-currency change is not enabled for this POS Profile."))

    company_currency = _company_currency(invoice_doc)
    invoice_currency = invoice_doc.currency or company_currency
    posting_date = invoice_doc.get("posting_date") or nowdate()
    allowed = {
        row.currency
        for row in (profile_doc.get("posa_allowed_currencies") or [])
        if row.get("currency") and cint(row.get("allow_for_change"))
    } or {invoice_currency, company_currency}
    cache = rate_cache if rate_cache is not None else {}
    returned = 0

    for row in rows:
        currency = row.get("currency") or invoice_currency
        if currency not in allowed:
            frappe.throw(_("Currency {0} is not allowed for change.").format(currency))
        original_amount = abs(flt(row.get("original_amount")))
        invoice_rate, rate_date, source = _resolve_rate(
            currency, invoice_currency, posting_date, cache
        )
        company_rate, _date, _source = _resolve_rate(
            currency, company_currency, posting_date, cache
        )
        row.currency = currency
        row.invoice_currency = invoice_currency
        row.company_currency = company_currency
        row.original_amount = original_amount
        row.exchange_rate = invoice_rate
        row.invoice_amount = flt(original_amount * invoice_rate)
        row.company_exchange_rate = company_rate
        row.base_amount = flt(original_amount * company_rate)
        row.rate_date = rate_date
        row.rate_source = source
        returned += row.invoice_amount

    tolerance = 1.0 / (10 ** (_precision(invoice_doc, "grand_total") or 2))
    if returned > change_due + tolerance:
        frappe.throw(
            _("Physical change returned ({0}) cannot exceed change due ({1}).").format(
                frappe.format_value(returned, {"fieldtype": "Currency", "options": invoice_currency}),
                frappe.format_value(change_due, {"fieldtype": "Currency", "options": invoice_currency}),
            )
        )
    invoice_doc.posa_change_returned = flt(returned)
    invoice_doc.posa_remaining_change = flt(max(change_due - returned, 0))
    return invoice_doc
