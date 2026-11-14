import frappe
from frappe import _
from frappe.utils import (
    add_days,
    cint,
    flt,
    formatdate,
    getdate,
    nowdate,
    strip_html_tags,
)
from erpnext.setup.utils import get_exchange_rate


def _get_return_validity_settings(pos_profile: str | None = None):
    """Return whether return validity is enabled and the default days window.

    Positional profile-specific configuration takes precedence over the
    global POS Settings toggle, falling back to the global values when the
    profile does not opt in.
    """

    enable_validity = 0
    default_days = 0

    if pos_profile:
        profile = None
        try:
            profile = frappe.get_cached_doc("POS Profile", pos_profile)
        except frappe.DoesNotExistError:
            profile = None
        if profile:
            enable_validity = cint(getattr(profile, "posa_enable_return_validity", 0))
            if enable_validity:
                default_days = cint(getattr(profile, "posa_return_validity_days", 0))

    if not enable_validity:
        settings = frappe.get_cached_doc("POS Settings")
        enable_validity = cint(getattr(settings, "posa_enable_return_validity", 0))
        if enable_validity:
            default_days = cint(getattr(settings, "posa_return_validity_days", 0))

    return enable_validity, default_days


def _set_return_valid_upto(invoice_doc, enabled, default_days):
    if not enabled or invoice_doc.is_return:
        return

    if invoice_doc.get("posa_return_valid_upto"):
        return

    posting_date = getdate(invoice_doc.get("posting_date") or nowdate())
    if default_days:
        invoice_doc.posa_return_valid_upto = add_days(posting_date, default_days)
    else:
        invoice_doc.posa_return_valid_upto = posting_date


def _validate_return_window(invoice_doc, doctype, enabled):
    if not enabled or not invoice_doc.is_return or not invoice_doc.get("return_against"):
        return

    original_invoice = frappe.get_doc(doctype, invoice_doc.return_against)
    validity_date = original_invoice.get("posa_return_valid_upto")
    return_date = getdate(invoice_doc.get("posting_date") or nowdate())
    if validity_date and return_date > getdate(validity_date):
        frappe.throw(_("Returns are only allowed until {0}").format(formatdate(validity_date)))


def _sanitize_item_name(name: str) -> str:
    """Strip HTML and limit length for item names."""
    if not name:
        return ""
    cleaned = strip_html_tags(name)
    return cleaned.strip()[:140]


def _resolve_effective_price_list(
    customer_name: str | None,
    pos_profile: str | None,
    fallback_price_list: str | None = None,
    *,
    allow_selection: bool = False,
) -> str | None:
    customer_price_list = None
    if customer_name:
        customer_price_list = frappe.db.get_value("Customer", customer_name, "default_price_list")
    if customer_price_list:
        return customer_price_list

    if allow_selection:
        customer_group = (
            frappe.db.get_value("Customer", customer_name, "customer_group") if customer_name else None
        )
        if customer_group:
            group_price_list = frappe.db.get_value("Customer Group", customer_group, "default_price_list")
            if group_price_list:
                return group_price_list
    profile_price_list = (
        frappe.db.get_value("POS Profile", pos_profile, "selling_price_list") if pos_profile else None
    )
    if allow_selection and fallback_price_list and fallback_price_list != profile_price_list:
        if not frappe.db.exists("Price List", {"name": fallback_price_list, "selling": 1, "enabled": 1}):
            frappe.throw(_("Price List {0} is not an enabled selling Price List.").format(fallback_price_list))
        return fallback_price_list

    return profile_price_list or fallback_price_list


def _build_invoice_remarks(invoice_doc):
    """Generate the invoice remarks string with item totals and grand total."""

    if not invoice_doc or not getattr(invoice_doc, "items", None):
        return ""

    lines = []
    for item in invoice_doc.items:
        if item.item_name and item.rate and item.qty:
            total = item.rate * item.qty
            lines.append(f"{item.item_name} - Rate: {item.rate}, Qty: {item.qty}, Amount: {total}")

    if lines:
        lines.append(f"\nGrand Total: {invoice_doc.grand_total}")

    return "\n".join(lines)


def get_latest_rate(
    from_currency: str,
    to_currency: str,
    cache=None,
    transaction_date=None,
    purpose=None,
    allow_external=True,
    silent=False,
):
    """Return the latest ERPNext-valid rate on or before ``transaction_date``.

    ``purpose`` may be ``for_buying`` or ``for_selling``. Optional POS lookups
    use ``silent=True`` so ERPNext's external-rate fallback cannot add repeated
    desk messages when a rate is unavailable.
    """
    transaction_date = getdate(transaction_date or nowdate())
    if from_currency == to_currency:
        result = 1.0, transaction_date
        if cache is not None:
            cache[(from_currency, to_currency, str(transaction_date), purpose)] = result
        return result

    if cache is not None:
        key = (from_currency, to_currency, str(transaction_date), purpose)
        if key in cache:
            return cache[key]

    filters = {
        "from_currency": from_currency,
        "to_currency": to_currency,
        "date": ["<=", transaction_date],
    }
    if purpose in {"for_buying", "for_selling"}:
        filters[purpose] = 1

    try:
        accounts_settings = frappe.get_cached_doc("Accounts Settings")
    except Exception:
        accounts_settings = None
    if accounts_settings and not cint(accounts_settings.get("allow_stale")):
        stale_days = cint(accounts_settings.get("stale_days"))
        filters["date"] = ["between", [add_days(transaction_date, -stale_days), transaction_date]]

    rate_doc = frappe.get_all(
        "Currency Exchange",
        filters=filters,
        fields=["exchange_rate", "date"],
        order_by="date desc, creation desc",
        limit=1,
    )
    if rate_doc:
        result = flt(rate_doc[0].exchange_rate), rate_doc[0].date
    elif allow_external:
        message_log = getattr(frappe, "message_log", None)
        message_count = len(message_log) if isinstance(message_log, list) else None
        flags = getattr(frappe, "flags", None)
        old_mute = getattr(flags, "mute_messages", False)
        try:
            if silent and flags is not None:
                flags.mute_messages = True
            rate = get_exchange_rate(from_currency, to_currency, transaction_date, purpose)
        finally:
            if flags is not None:
                flags.mute_messages = old_mute
            if silent and message_count is not None:
                del message_log[message_count:]
        result = (flt(rate), transaction_date) if flt(rate) > 0 else (None, None)
    else:
        result = None, None

    if cache is not None:
        cache[key] = result

    return result


def resolve_erpnext_currency_rates(
    invoice_currency: str,
    price_list_currency: str | None,
    company_currency: str,
    posting_date=None,
    cache=None,
):
    """Resolve ERPNext-style invoice and price-list rates to company currency."""

    invoice_currency = invoice_currency or company_currency
    price_list_currency = price_list_currency or company_currency
    exchange_rate_date = posting_date or nowdate()

    conversion_rate = 1.0
    if invoice_currency != company_currency:
        conversion_rate, exchange_rate_date = get_latest_rate(
            invoice_currency,
            company_currency,
            cache=cache,
            transaction_date=exchange_rate_date,
        )

    plc_conversion_rate = 1.0
    if price_list_currency != company_currency:
        plc_conversion_rate, _ignored = get_latest_rate(
            price_list_currency,
            company_currency,
            cache=cache,
            transaction_date=exchange_rate_date,
        )

    return {
        "conversion_rate": flt(conversion_rate) if conversion_rate else None,
        "plc_conversion_rate": flt(plc_conversion_rate) if plc_conversion_rate else None,
        "price_list_currency": price_list_currency,
        "exchange_rate_date": exchange_rate_date,
    }


@frappe.whitelist()
def get_price_list_currency(price_list):
    return frappe.db.get_value("Price List", price_list, "currency")


@frappe.whitelist()
def get_available_currencies():
    return frappe.get_all("Currency", filters={"enabled": 1}, fields=["name"])
