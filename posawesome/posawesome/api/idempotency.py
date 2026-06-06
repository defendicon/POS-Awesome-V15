import frappe


def normalize_client_request_id(value):
    normalized = (value or "").strip()
    return normalized or None


def extract_invoice_client_request_id(invoice=None, data=None):
    invoice = invoice or {}
    data = data or {}
    return normalize_client_request_id(
        invoice.get("posa_client_request_id") or data.get("idempotency_key") or data.get("client_request_id")
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


def find_invoice_by_client_request_id(
    client_request_id,
    company=None,
    pos_profile=None,
    opening_shift=None,
    invoice_doctype=None,
):
    if not client_request_id:
        return None

    if not company or not pos_profile:
        frappe.throw(
            frappe._("Company and POS Profile are required for invoice retry lookup.")
        )

    doctypes = [invoice_doctype] if invoice_doctype else ["Sales Invoice", "POS Invoice"]
    matches = []
    for doctype in doctypes:
        if not doctype_supports_client_request_id(doctype):
            continue

        filters = {
            "posa_client_request_id": client_request_id,
            "company": company,
            "pos_profile": pos_profile,
        }
        if opening_shift:
            filters["posa_pos_opening_shift"] = opening_shift

        rows = frappe.get_all(
            doctype,
            filters=filters,
            fields=["name"],
            limit_page_length=2,
        )
        matches.extend((doctype, row.get("name")) for row in rows)

        if len(matches) > 1:
            break

    if len(matches) > 1:
        frappe.throw(
            frappe._(
                "Multiple invoices match this client request ID in the current POS scope."
            )
        )

    if matches:
        doctype, invoice_name = matches[0]
        return frappe.get_doc(doctype, invoice_name)

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
