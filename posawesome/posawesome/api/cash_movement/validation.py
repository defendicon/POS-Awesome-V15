import json

import frappe
from frappe import _
from frappe.utils import flt

from posawesome.posawesome.api.payment_processing.utils import get_bank_cash_account


def parse_payload(payload):
    if isinstance(payload, str):
        return frappe._dict(json.loads(payload))
    if isinstance(payload, dict):
        return frappe._dict(payload)
    frappe.throw(_("Invalid payload for cash movement."))


def get_opening_shift(opening_shift_name):
    if not opening_shift_name:
        frappe.throw(_("POS Opening Shift is required."))

    opening_shift = frappe.get_doc("POS Opening Shift", opening_shift_name)
    if opening_shift.docstatus != 1 or opening_shift.status != "Open":
        frappe.throw(_("POS Opening Shift must be submitted and open."))
    if opening_shift.user != frappe.session.user:
        frappe.throw(_("Only the shift owner can create cash movement entries."))
    return opening_shift


def get_pos_profile(profile_name):
    if not profile_name:
        frappe.throw(_("POS Profile is required."))
    return frappe.get_doc("POS Profile", profile_name)


def validate_company_consistency(opening_shift, profile_doc):
    if opening_shift.pos_profile != profile_doc.name:
        frappe.throw(_("POS Profile must match the active POS Opening Shift profile."))
    if opening_shift.company != profile_doc.company:
        frappe.throw(_("POS Profile company must match active POS Opening Shift company."))


def validate_amount(amount, profile_doc):
    value = flt(amount)
    if value <= 0:
        frappe.throw(_("Amount must be greater than zero."))

    max_amount = flt(profile_doc.get("posa_cash_movement_max_amount") or 0)
    if max_amount > 0 and value > max_amount:
        frappe.throw(_("Amount exceeds POS Profile cash movement max amount."))
    return value


def validate_remarks(remarks, profile_doc):
    if profile_doc.get("posa_require_cash_movement_remarks") and not (remarks or "").strip():
        frappe.throw(_("Remarks are required for cash movement in this POS Profile."))


def extract_allowed_accounts(rows):
    accounts = []
    for row in rows or []:
        account = None
        if isinstance(row, str):
            account = row
        elif isinstance(row, dict):
            account = row.get("account")
        else:
            account = getattr(row, "account", None)

        account = (account or "").strip()
        if account and account not in accounts:
            accounts.append(account)
    return accounts


def _resolve_default_source_cash_account(profile_doc):
    company = profile_doc.company
    configured_default = (profile_doc.get("posa_default_source_account") or "").strip()
    if configured_default:
        return configured_default

    mode_of_payment = profile_doc.get("posa_cash_mode_of_payment") or "Cash"

    account = frappe.db.get_value(
        "Mode of Payment Account",
        {"parent": mode_of_payment, "company": company},
        "default_account",
    )
    if account:
        return account

    bank = get_bank_cash_account(company, mode_of_payment)
    if bank and bank.get("account"):
        return bank.get("account")

    fallback = frappe.db.get_value("Company", company, "default_cash_account")
    if fallback:
        return fallback

    frappe.throw(_("Unable to resolve POS cash account from POS Profile cash mode of payment."))


def resolve_source_cash_account(payload, profile_doc):
    payload = payload or {}
    selected_source = (payload.get("source_account") or "").strip()
    allow_override = bool(profile_doc.get("posa_allow_source_account_override"))
    allowed_sources = extract_allowed_accounts(profile_doc.get("posa_allowed_source_accounts"))

    if selected_source and not allow_override:
        frappe.throw(_("Source account override is disabled for this POS Profile."))

    if selected_source and allowed_sources and selected_source not in allowed_sources:
        frappe.throw(_("Selected source account is not allowed for this POS Profile."))

    source_account = selected_source or _resolve_default_source_cash_account(profile_doc)
    if not selected_source and allowed_sources and source_account not in allowed_sources:
        source_account = allowed_sources[0]

    if allowed_sources and source_account not in allowed_sources:
        frappe.throw(_("Selected source account is not allowed for this POS Profile."))

    account_type = frappe.db.get_value("Account", source_account, "account_type")
    if account_type != "Cash":
        frappe.throw(_("Source account must be a Cash account."))

    return source_account


def resolve_target_account(payload, profile_doc, movement_type):
    movement_type = (movement_type or "").strip()
    if movement_type == "Expense":
        account = (payload.get("expense_account") or profile_doc.get("posa_default_expense_account") or "").strip()
        allowed_expense_accounts = extract_allowed_accounts(profile_doc.get("posa_allowed_expense_accounts"))

        if not account and allowed_expense_accounts:
            account = allowed_expense_accounts[0]

        if allowed_expense_accounts and account not in allowed_expense_accounts:
            if payload.get("expense_account"):
                frappe.throw(_("Selected expense account is not allowed for this POS Profile."))
            account = allowed_expense_accounts[0]

        if not account:
            frappe.throw(_("Expense account is required for POS Expense."))
        return account, account

    if movement_type == "Deposit":
        configured_default = profile_doc.get("posa_back_office_cash_account")
        payload_account = payload.get("target_account") or payload.get("back_office_cash_account")

        if configured_default:
            if payload_account and payload_account != configured_default:
                frappe.throw(
                    _("Back Office Cash Account is fixed by POS Profile and cannot be overridden.")
                )
            account = configured_default
        else:
            account = payload_account

        if not account:
            frappe.throw(_("Back Office Cash Account is required for cash deposit."))
        account_type = frappe.db.get_value("Account", account, "account_type")
        if account_type != "Cash":
            frappe.throw(_("Back Office Cash Account must be a Cash account."))
        return account, None

    frappe.throw(_("Invalid movement type."))


def validate_account_company(account, company, label):
    if not frappe.db.exists("Account", account):
        frappe.throw(_("{0} is invalid.").format(label))
    account_company = frappe.db.get_value("Account", account, "company")
    if account_company and account_company != company:
        frappe.throw(_("{0} must belong to company {1}.").format(label, company))


def ensure_no_duplicate_client_request(client_request_id):
    if not client_request_id:
        return None
    existing_name = frappe.db.get_value(
        "POS Cash Movement",
        {"client_request_id": client_request_id},
        "name",
    )
    if existing_name:
        return frappe.get_doc("POS Cash Movement", existing_name)
    return None
