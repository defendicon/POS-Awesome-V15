import frappe
from frappe.utils import cint


def _get_value(doc, fieldname, default=None):
    if not doc:
        return default
    if isinstance(doc, dict):
        return doc.get(fieldname, default)
    getter = getattr(doc, "get", None)
    if callable(getter):
        return getter(fieldname, default)
    return getattr(doc, fieldname, default)


def _set_value(doc, fieldname, value):
    if isinstance(doc, dict):
        doc[fieldname] = value
    else:
        setattr(doc, fieldname, value)


def _as_int(value):
    try:
        return cint(value)
    except Exception:
        return 1 if value is True else 0


def _tax_rows(doc):
    rows = _get_value(doc, "taxes", []) or []
    return rows if isinstance(rows, list) else list(rows)


def _profile_tax_inclusive(pos_profile):
    if not pos_profile:
        return None
    try:
        return _as_int(frappe.get_cached_value("POS Profile", pos_profile, "posa_tax_inclusive"))
    except Exception as exc:
        logger = getattr(frappe, "log_error", None)
        if callable(logger):
            logger(
                f"Could not resolve posa_tax_inclusive for POS Profile {pos_profile}: {exc}",
                "POS Awesome tax inclusion",
            )
        return None


def _source_tax_inclusive(source_doc):
    for tax in _tax_rows(source_doc):
        charge_type = str(_get_value(tax, "charge_type", "") or "").strip()
        if charge_type != "Actual" and _as_int(_get_value(tax, "included_in_print_rate", 0)):
            return 1
    return 0


def apply_pos_tax_inclusion_contract(doc, source_doc=None, recalculate=True):
    """Apply POS Profile inclusive-tax rules to mapped POS documents.

    ERPNext's document mappers may recalculate Sales Invoices from Sales Orders
    before POS Awesome re-applies the POS Profile's tax-included pricing rule.
    This helper keeps the tax row flags consistent at each conversion boundary.
    """

    if not doc:
        return False

    source_pos_profile = _get_value(source_doc, "pos_profile")
    if source_pos_profile and not _get_value(doc, "pos_profile"):
        _set_value(doc, "pos_profile", source_pos_profile)

    inclusive = _profile_tax_inclusive(_get_value(doc, "pos_profile") or source_pos_profile)
    if inclusive is None:
        inclusive = _source_tax_inclusive(source_doc or doc)

    changed = False
    for tax in _tax_rows(doc):
        charge_type = str(_get_value(tax, "charge_type", "") or "").strip()
        next_value = 0 if charge_type == "Actual" else 1 if inclusive else 0
        if _as_int(_get_value(tax, "included_in_print_rate", 0)) != next_value:
            _set_value(tax, "included_in_print_rate", next_value)
            changed = True

    calculate = getattr(doc, "calculate_taxes_and_totals", None)
    if changed and recalculate and callable(calculate):
        calculate()

    return changed
