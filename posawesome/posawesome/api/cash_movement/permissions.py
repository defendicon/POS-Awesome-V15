import frappe
from frappe import _


def is_manager():
    return frappe.has_role(("System Manager", "Administrator"))


def ensure_feature_enabled(profile_doc):
    if not profile_doc.get("posa_enable_cash_movement"):
        frappe.throw(_("Cash Movement is disabled for this POS Profile."))


def ensure_movement_allowed(profile_doc, movement_type):
    movement_type = (movement_type or "").strip()
    if movement_type == "Expense" and not profile_doc.get("posa_allow_pos_expense"):
        frappe.throw(_("POS Expense is disabled for this POS Profile."))
    if movement_type == "Deposit" and not profile_doc.get("posa_allow_cash_deposit"):
        frappe.throw(_("Cash Deposit is disabled for this POS Profile."))


def ensure_cancel_allowed(profile_doc):
    if not profile_doc.get("posa_allow_cancel_submitted_cash_movement"):
        frappe.throw(_("Cancelling submitted cash movements is disabled for this POS Profile."))


def ensure_delete_allowed(profile_doc):
    if not profile_doc.get("posa_allow_delete_cancelled_cash_movement"):
        frappe.throw(_("Deleting cancelled cash movements is disabled for this POS Profile."))


def ensure_owner_or_manager(movement_doc):
    if movement_doc.user == frappe.session.user or is_manager():
        return
    frappe.throw(_("You are not allowed to manage this cash movement record."))
