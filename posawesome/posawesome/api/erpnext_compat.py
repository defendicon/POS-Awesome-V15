"""ERPNext version compatibility layer.

Centralises version-sensitive imports so that POS Awesome can work
across ERPNext v15 and v16+ without scattered try/except blocks.
All resolver functions perform lazy imports -- calling them at module
level is safe and will not trigger ImportError during DocType sync.
"""


def resolve_make_sales_invoice_from_order():
    """Resolve ``make_sales_invoice`` (Sales Order -> Sales Invoice)."""
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
        return make_sales_invoice
    except ImportError:
        pass
    raise ImportError(
        "Cannot import 'make_sales_invoice' from ERPNext Sales Order. "
        "This version of POS Awesome requires ERPNext v15. "
        "For ERPNext v16+, use the v16-compatible branch of POS Awesome."
    )


def resolve_make_sales_invoice_from_quotation():
    """Resolve ``make_sales_invoice`` (Quotation -> Sales Invoice)."""
    try:
        from erpnext.selling.doctype.quotation.quotation import make_sales_invoice
        return make_sales_invoice
    except ImportError:
        pass
    raise ImportError(
        "Cannot import 'make_sales_invoice' from ERPNext Quotation. "
        "This version of POS Awesome requires ERPNext v15. "
        "For ERPNext v16+, use the v16-compatible branch of POS Awesome."
    )


def resolve_make_sales_order_from_quotation():
    """Resolve ``make_sales_order`` (Quotation -> Sales Order)."""
    try:
        from erpnext.selling.doctype.quotation.quotation import make_sales_order
        return make_sales_order
    except ImportError:
        pass
    raise ImportError(
        "Cannot import 'make_sales_order' from ERPNext Quotation. "
        "This version of POS Awesome requires ERPNext v15. "
        "For ERPNext v16+, use the v16-compatible branch of POS Awesome."
    )


def resolve_make_delivery_note_from_order():
    """Resolve ``make_delivery_note`` (Sales Order -> Delivery Note)."""
    try:
        from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
        return make_delivery_note
    except ImportError:
        pass
    raise ImportError(
        "Cannot import 'make_delivery_note' from ERPNext Sales Order. "
        "This version of POS Awesome requires ERPNext v15. "
        "For ERPNext v16+, use the v16-compatible branch of POS Awesome."
    )


def resolve_make_sales_invoice_from_delivery():
    """Resolve ``make_sales_invoice`` (Delivery Note -> Sales Invoice)."""
    try:
        from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice
        return make_sales_invoice
    except ImportError:
        pass
    raise ImportError(
        "Cannot import 'make_sales_invoice' from ERPNext Delivery Note. "
        "This version of POS Awesome requires ERPNext v15. "
        "For ERPNext v16+, use the v16-compatible branch of POS Awesome."
    )


def resolve_get_party_bank_account():
    """Resolve ``get_party_bank_account`` (v15: erpnext.accounts.party, v16+: erpnext.accounts.doctype.bank_account.bank_account)."""
    try:
        from erpnext.accounts.doctype.bank_account.bank_account import get_party_bank_account
        return get_party_bank_account
    except ImportError:
        pass
    try:
        from erpnext.accounts.party import get_party_bank_account
        return get_party_bank_account
    except ImportError:
        pass
    raise ImportError(
        "Cannot import 'get_party_bank_account' from ERPNext. "
        "This version of POS Awesome requires ERPNext v15 or v16."
    )
