import json

import frappe
from posawesome.posawesome.api.performance import pos_perf_endpoint

from posawesome.posawesome.api.invoice_processing.creation import (
    repair_invoice_submission,
    submit_invoice,
)


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
@pos_perf_endpoint("pos.offline.sync_mutation", source="server")
def submit_invoice_outbox_entry(client_request_id, invoice, data=None):
    client_request_id = (client_request_id or "").strip()
    if not client_request_id:
        frappe.throw("client_request_id is required")

    invoice_payload = _ensure_dict(invoice)
    data_payload = _ensure_dict(data)
    invoice_payload["posa_client_request_id"] = client_request_id
    data_payload.setdefault("idempotency_key", client_request_id)
    data_payload.setdefault("client_request_id", client_request_id)

    response = submit_invoice(
        json.dumps(invoice_payload),
        json.dumps(data_payload),
        submit_in_background=0,
    )

    return {
        "acknowledged": True,
        "client_request_id": client_request_id,
        "invoice": _invoice_identity(response or {}),
        "ledger_state": (response or {}).get("ledger_state"),
        "replayed": bool((response or {}).get("replayed")),
        "idempotent": bool((response or {}).get("idempotent", True)),
    }


@frappe.whitelist()
@pos_perf_endpoint("pos.offline.conflict_detected", source="server")
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
@pos_perf_endpoint("pos.offline.conflict_detected", source="server")
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
