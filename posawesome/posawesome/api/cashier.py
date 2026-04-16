# Copyright (c) 2024, POSAwesome contributors
# For license information, please see license.txt

"""Cashier accountability API — supervisor override verification and audit trail."""

import frappe
from frappe import _

from posawesome.posawesome.api.employees import (
    _ensure_terminal_user,
    _get_user_doc,
    _get_user_pin,
    _is_pos_supervisor,
    _resolve_profile_name,
)

# ---------------------------------------------------------------------------
# Allowed override action types (kept in one place for easy extension)
# ---------------------------------------------------------------------------
_ALLOWED_OVERRIDE_TYPES = {
    "return",
    "delete_invoice",
    "price_override",
    "high_discount",
    "void_invoice",
    "custom",
}


def _validate_override_type(override_type: str) -> str:
    ot = str(override_type or "").strip().lower()
    if not ot:
        frappe.throw(_("override_type is required."))
    if ot not in _ALLOWED_OVERRIDE_TYPES:
        frappe.throw(
            _("Unknown override_type '{0}'. Allowed values: {1}").format(
                ot, ", ".join(sorted(_ALLOWED_OVERRIDE_TYPES))
            )
        )
    return ot


@frappe.whitelist()
def verify_supervisor_for_action(
    pos_profile=None,
    supervisor_user=None,
    supervisor_pin=None,
    override_type=None,
    override_reason=None,
    invoice_name=None,
):
    """Verify that *supervisor_user* is a valid supervisor and has entered the
    correct PIN, then return the approval payload that should be written back
    onto the invoice/transaction document.

    This is a **stateless** verification call — it does **not** modify any
    document itself.  The caller is responsible for stamping ``posa_override_by``,
    ``posa_override_reason``, and ``posa_override_type`` onto the relevant doc.

    Returns::

        {
            "approved": True,
            "supervisor": "<user>",
            "supervisor_name": "<full_name>",
            "override_type": "<type>",
            "override_reason": "<reason>",
        }
    """
    profile_name = _resolve_profile_name(pos_profile)
    if not profile_name:
        frappe.throw(_("POS profile is required for supervisor verification."))

    supervisor_user = str(supervisor_user or "").strip()
    supervisor_pin = str(supervisor_pin or "").strip()
    if not supervisor_user or not supervisor_pin:
        frappe.throw(_("Supervisor user and PIN are required."))

    ot = _validate_override_type(override_type)

    _ensure_terminal_user(profile_name, supervisor_user)
    user_doc = _get_user_doc(supervisor_user)

    if not _is_pos_supervisor(user_doc):
        frappe.throw(_("Selected user is not a POS supervisor."))

    stored_pin = _get_user_pin(user_doc)
    if not stored_pin or stored_pin != supervisor_pin:
        frappe.throw(_("Supervisor PIN is incorrect."))

    reason = str(override_reason or "").strip()

    return {
        "approved": True,
        "supervisor": user_doc.name,
        "supervisor_name": user_doc.full_name or user_doc.name,
        "override_type": ot,
        "override_reason": reason,
    }


@frappe.whitelist()
def stamp_supervisor_override(
    invoice_name=None,
    doctype="Sales Invoice",
    supervisor_user=None,
    override_type=None,
    override_reason=None,
):
    """Persist supervisor override fields onto a **draft** invoice.

    The caller must have already verified the supervisor PIN via
    ``verify_supervisor_for_action``.  This endpoint writes the result to the
    database so the audit trail is server-side authoritative.

    Only draft (docstatus == 0) documents can be stamped.
    """
    if not invoice_name:
        frappe.throw(_("invoice_name is required."))

    supervisor_user = str(supervisor_user or "").strip()
    if not supervisor_user:
        frappe.throw(_("supervisor_user is required."))

    ot = _validate_override_type(override_type)
    reason = str(override_reason or "").strip()

    if not frappe.db.exists(doctype, invoice_name):
        frappe.throw(_("Document {0} does not exist.").format(invoice_name))

    docstatus = frappe.db.get_value(doctype, invoice_name, "docstatus")
    if int(docstatus or 0) != 0:
        frappe.throw(_("Supervisor override can only be stamped on draft documents."))

    update_fields: dict = {}
    if frappe.db.has_column(doctype, "posa_override_by"):
        update_fields["posa_override_by"] = supervisor_user
    if frappe.db.has_column(doctype, "posa_override_type"):
        update_fields["posa_override_type"] = ot
    if frappe.db.has_column(doctype, "posa_override_reason"):
        update_fields["posa_override_reason"] = reason

    if not update_fields:
        return {"stamped": False, "reason": "columns_not_found"}

    frappe.db.set_value(doctype, invoice_name, update_fields)
    frappe.db.commit()

    return {
        "stamped": True,
        "invoice": invoice_name,
        "doctype": doctype,
        "supervisor": supervisor_user,
        "override_type": ot,
    }
