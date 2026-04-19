import frappe


def normalize_client_request_id(value):
    normalized = (value or "").strip()
    return normalized or None


def extract_invoice_client_request_id(invoice=None, data=None):
    invoice = invoice or {}
    data = data or {}
    return normalize_client_request_id(
        invoice.get("posa_client_request_id")
        or data.get("idempotency_key")
        or data.get("client_request_id")
    )


def strip_invoice_client_request_id(payload):
    if isinstance(payload, dict):
        payload.pop("posa_client_request_id", None)
    return payload


def doctype_supports_client_request_id(doctype):
    has_column = getattr(getattr(frappe, "db", None), "has_column", None)
    if not callable(has_column):
        return True
    try:
        return bool(has_column(doctype, "posa_client_request_id"))
    except Exception:
        return False


def set_invoice_client_request_id(invoice_doc, client_request_id):
    if client_request_id and doctype_supports_client_request_id(getattr(invoice_doc, "doctype", None)):
        invoice_doc.posa_client_request_id = client_request_id
    return invoice_doc


def find_invoice_by_client_request_id(client_request_id, preferred_doctype=None):
    if not client_request_id:
        return None

    doctypes = []
    if preferred_doctype:
        doctypes.append(preferred_doctype)
    doctypes.extend(
        doctype for doctype in ("Sales Invoice", "POS Invoice") if doctype not in doctypes
    )

    for doctype in doctypes:
        if not doctype_supports_client_request_id(doctype):
            continue
        existing_name = frappe.db.get_value(
            doctype,
            {"posa_client_request_id": client_request_id},
            "name",
        )
        if existing_name:
            return frappe.get_doc(doctype, existing_name)

    return None


def find_payment_entries_by_client_request_id(client_request_id):
    if not client_request_id or not doctype_supports_client_request_id("Payment Entry"):
        return []

    rows = frappe.get_list(
        "Payment Entry",
        filters={"posa_client_request_id": client_request_id},
        fields=[
            "name",
            "paid_amount",
            "received_amount",
            "posting_date",
            "mode_of_payment",
            "party",
            "party_type",
            "docstatus",
            "posa_client_request_id",
        ],
        order_by="creation asc",
    )
    return list(rows or [])
