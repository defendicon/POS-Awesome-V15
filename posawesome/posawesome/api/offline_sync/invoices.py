import json

import frappe

from posawesome.posawesome.api.invoice_processing.creation import (
    repair_invoice_submission,
    submit_invoice,
    trusted_invoice_shift_reassignment,
)
from posawesome.posawesome.api.idempotency import normalize_invoice_request_identity


def _ensure_dict(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {}
    return dict(value or {})


def _invoice_identity(response):
    return {
        "name": response.get("name"),
        "doctype": response.get("doctype") or "Sales Invoice",
        "docstatus": response.get("docstatus", response.get("status")),
        "status": response.get("status", response.get("docstatus")),
    }


@frappe.whitelist()
def submit_invoice_outbox_entry(client_request_id, invoice, data=None):
    client_request_id = (client_request_id or "").strip()
    if not client_request_id:
        frappe.throw("client_request_id is required")

    invoice_payload = _ensure_dict(invoice)
    if invoice_payload.get("doctype") not in (None, "", "Sales Invoice", "POS Invoice"):
        frappe.throw("Only Sales Invoice and POS Invoice documents can use invoice recovery.")
    data_payload = _ensure_dict(data)
    normalize_invoice_request_identity(
        invoice_payload,
        data_payload,
        client_request_id=client_request_id,
    )

    with trusted_invoice_shift_reassignment(
        invoice_payload,
        data_payload,
        "offline_sync",
    ):
        response = submit_invoice(
            json.dumps(invoice_payload),
            json.dumps(data_payload),
            submit_in_background=0,
        )

    return {
        "acknowledged": int((response or {}).get("docstatus", (response or {}).get("status")) or 0) == 1,
        "client_request_id": client_request_id,
        "invoice": _invoice_identity(response or {}),
        "ledger_state": (response or {}).get("ledger_state"),
        "replayed": bool((response or {}).get("replayed")),
        "idempotent": bool((response or {}).get("idempotent", True)),
    }


@frappe.whitelist()
def reconcile_invoice_outbox_entry(
    client_request_id,
    company,
    pos_profile,
    document_type="Sales Invoice",
):
    repaired = repair_invoice_submission(
        client_request_id=client_request_id,
        company=company,
        pos_profile=pos_profile,
        document_type=document_type,
    )
    return {
        "acknowledged": bool(repaired.get("docstatus") == 1),
        "client_request_id": client_request_id,
        "invoice": _invoice_identity(repaired or {}),
        "ledger_state": repaired.get("ledger_state"),
        "repaired": bool(repaired.get("repaired")),
        "idempotent": True,
    }


@frappe.whitelist()
def repair_invoice_outbox_entry(
    client_request_id,
    company,
    pos_profile,
    document_type="Sales Invoice",
):
    return reconcile_invoice_outbox_entry(
        client_request_id=client_request_id,
        company=company,
        pos_profile=pos_profile,
        document_type=document_type,
    )
