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
) -> str | None:
    customer_price_list = None
    if customer_name:
        customer_price_list = frappe.db.get_value("Customer", customer_name, "default_price_list")
    if customer_price_list:
        return customer_price_list

    if pos_profile:
        profile_price_list = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")
        if profile_price_list:
            return profile_price_list

    return fallback_price_list


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


def get_latest_rate(from_currency: str, to_currency: str, cache=None):
    """Return the most recent Currency Exchange rate and its date."""
    if cache is not None:
        key = (from_currency, to_currency)
        if key in cache:
            return cache[key]

    rate_doc = frappe.get_all(
        "Currency Exchange",
        filters={"from_currency": from_currency, "to_currency": to_currency},
        fields=["exchange_rate", "date"],
        order_by="date desc, creation desc",
        limit=1,
    )
    if rate_doc:
        result = flt(rate_doc[0].exchange_rate), rate_doc[0].date
    else:
        rate = get_exchange_rate(from_currency, to_currency, nowdate())
        result = flt(rate), nowdate()

    if cache is not None:
        cache[key] = result

    return result

@frappe.whitelist()
def get_price_list_currency(price_list):
    return frappe.db.get_value("Price List", price_list, "currency")

@frappe.whitelist()
def get_available_currencies():
    return frappe.get_all("Currency", filters={"enabled": 1}, fields=["name"])
