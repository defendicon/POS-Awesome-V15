from __future__ import annotations

import frappe
from frappe.utils import nowdate

from posawesome.posawesome.api.utilities import ensure_child_doctype

from posawesome.posawesome.api.employees import (
    _ensure_terminal_user,
    _get_user_doc,
    _is_pos_supervisor,
    _resolve_profile_name,
)


def _to_float(value) -> float:
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def _now_datetime():
    utils = getattr(frappe, "utils", None)
    if utils and hasattr(utils, "now_datetime"):
        return utils.now_datetime()
    return None


def _normalize_code(gift_card_code: str | None) -> str:
    code = str(gift_card_code or "").strip().upper()
    if not code:
        code = str(frappe.generate_hash() or "").strip().upper()[:10]
    if not code:
        frappe.throw(frappe._("Gift card code is required."))
    return code


def _doc_value(doc, key, default=None):
    if doc is None:
        return default
    if hasattr(doc, "get"):
        value = doc.get(key, default)
        if value is not None:
            return value
    return getattr(doc, key, default)


def _require_supervisor(pos_profile=None, cashier=None):
    profile_name = _resolve_profile_name(pos_profile)
    if not profile_name:
        frappe.throw(frappe._("POS profile is required."))

    cashier = str(cashier or "").strip()
    if not cashier:
        frappe.throw(frappe._("Cashier is required."))

    _ensure_terminal_user(profile_name, cashier)
    user_doc = _get_user_doc(cashier)
    if not _is_pos_supervisor(user_doc):
        frappe.throw(frappe._("A POS supervisor is required for this action."))

    return profile_name, cashier, user_doc


def _get_profile_doc(pos_profile=None):
    profile_name = _resolve_profile_name(pos_profile)
    if not profile_name:
        frappe.throw(frappe._("POS profile is required."))
    return frappe.get_cached_doc("POS Profile", profile_name)


def _resolve_cost_center(profile_doc, company):
    cost_center = str(_doc_value(profile_doc, "cost_center") or "").strip()
    if cost_center:
        return cost_center
    cost_center = str(frappe.get_value("Company", company, "cost_center") or "").strip()
    if cost_center:
        return cost_center
    frappe.throw(frappe._("Cost Center is not set for POS Profile or Company."))


def _resolve_issue_source_account(profile_doc, company):
    source_account = str(_doc_value(profile_doc, "posa_default_source_account") or "").strip()
    if source_account:
        return source_account
    source_account = str(frappe.get_value("Company", company, "default_cash_account") or "").strip()
    if source_account:
        return source_account
    frappe.throw(
        frappe._("Set a default source account on the POS Profile before issuing or topping up gift cards.")
    )


def _resolve_liability_account(profile_doc):
    liability_account = str(_doc_value(profile_doc, "posa_gift_card_liability_account") or "").strip()
    if not liability_account:
        frappe.throw(
            frappe._("Set a gift card liability account on the POS Profile before using gift cards.")
        )
    return liability_account


def _create_gift_card_journal_entry(company, posting_date, remark, accounts):
    je_doc = frappe.get_doc(
        {
            "doctype": "Journal Entry",
            "voucher_type": "Journal Entry",
            "posting_date": posting_date or nowdate(),
            "company": company,
        }
    )

    for row in accounts:
        account_row = je_doc.append("accounts", {})
        account_row.update(row)

    ensure_child_doctype(je_doc, "accounts", "Journal Entry Account")
    je_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    je_doc.user_remark = remark
    je_doc.set_missing_values()
    je_doc.save()
    je_doc.submit()
    return je_doc


def _get_gift_card(gift_card_code=None):
    code = _normalize_code(gift_card_code)
    if not frappe.db.exists("POS Gift Card", {"gift_card_code": code}):
        frappe.throw(frappe._("Gift card {0} does not exist.").format(code))
    return frappe.get_doc("POS Gift Card", code)


def _append_transaction(
    gift_card_doc,
    transaction_type,
    amount,
    balance_after,
    cashier=None,
    reference_doctype=None,
    reference_name=None,
):
    row = {
        "transaction_type": transaction_type,
        "amount": _to_float(amount),
        "balance_after": _to_float(balance_after),
        "cashier": cashier,
        "posting_datetime": _now_datetime(),
    }
    if reference_doctype:
        row["reference_doctype"] = reference_doctype
    if reference_name:
        row["reference_name"] = reference_name
    gift_card_doc.append("transactions", row)
    return row


def _set_child_rows(doc, fieldname, rows):
    if hasattr(doc, "set"):
        doc.set(fieldname, rows)
    else:
        setattr(doc, fieldname, rows)


def _invoice_payment_child_doctype(invoice_doc):
    return (
        "POS Invoice Payment"
        if _doc_value(invoice_doc, "doctype") == "POS Invoice"
        else "Sales Invoice Payment"
    )


def _invoice_gift_card_child_doctype(invoice_doc):
    return "POS Gift Card Redemption"


def _set_doc_value(doc, key, value):
    if isinstance(doc, dict):
        doc[key] = value
    else:
        setattr(doc, key, value)


def _ensure_gift_card_mode_of_payment_account(company, liability_account):
    mode_of_payment_name = "Gift Card"
    if not company or not liability_account:
        return None

    if frappe.db.exists("Mode of Payment", mode_of_payment_name):
        mode_doc = frappe.get_doc("Mode of Payment", mode_of_payment_name)
    else:
        mode_doc = frappe.new_doc("Mode of Payment")
        _set_doc_value(mode_doc, "mode_of_payment", mode_of_payment_name)

    # Keep this internal payment mode aligned with ERPNext's bank/cash lookup path.
    _set_doc_value(mode_doc, "type", "Cash")

    accounts = list(_doc_value(mode_doc, "accounts") or [])
    company = str(company).strip()
    found = False
    for row in accounts:
        if str(_doc_value(row, "company") or "").strip() != company:
            continue
        _set_doc_value(row, "default_account", liability_account)
        found = True
        break

    if not found:
        mode_doc.append(
            "accounts",
            {
                "company": company,
                "default_account": liability_account,
            },
        )

    ensure_child_doctype(mode_doc, "accounts", "Mode of Payment Account")
    mode_doc.flags.ignore_permissions = True
    mode_doc.save(ignore_permissions=True)
    return mode_doc


def _remove_invoice_gift_card_settlement(invoice_doc):
    payments = list(_doc_value(invoice_doc, "payments") or [])
    filtered = [
        row for row in payments if str(_doc_value(row, "mode_of_payment") or "").strip() != "Gift Card"
    ]
    _set_child_rows(invoice_doc, "payments", filtered)


def _append_invoice_gift_card_payment(invoice_doc, amount, liability_account):
    redeemed_amount = _to_float(amount)
    if redeemed_amount <= 0:
        return None

    _ensure_gift_card_mode_of_payment_account(_doc_value(invoice_doc, "company"), liability_account)

    conversion_rate = _to_float(_doc_value(invoice_doc, "conversion_rate") or 1) or 1
    row = invoice_doc.append(
        "payments",
        {
            "mode_of_payment": "Gift Card",
            "amount": redeemed_amount,
            "base_amount": _to_float(redeemed_amount * conversion_rate),
            "account": liability_account,
            "type": "Cash",
        },
    )
    ensure_child_doctype(invoice_doc, "payments", _invoice_payment_child_doctype(invoice_doc))
    return row


def apply_invoice_gift_card_redemptions(invoice_doc, rows=None):
    rows = rows or []
    restore_invoice_gift_card_redemptions(invoice_doc)
    _set_child_rows(invoice_doc, "gift_card_redemptions", [])
    _remove_invoice_gift_card_settlement(invoice_doc)

    valid_rows = []
    for row in rows:
        redeem_amount = _to_float((row or {}).get("amount"))
        if redeem_amount <= 0:
            continue
        valid_rows.append((row or {}, redeem_amount))

    if not valid_rows:
        return 0.0

    total_redeemed = 0
    normalized_rows = []
    cashier = None
    company = _doc_value(invoice_doc, "company")
    profile_doc = _get_profile_doc(_doc_value(invoice_doc, "pos_profile"))
    liability_account = _resolve_liability_account(profile_doc)

    for row, redeem_amount in valid_rows:
        gift_card_code = row.get("gift_card_code")
        cashier = row.get("cashier") or cashier
        gift_card_doc = _get_gift_card(gift_card_code)
        if company and _doc_value(gift_card_doc, "company") != company:
            frappe.throw(frappe._("Gift card does not belong to company {0}.").format(company))
        status = _doc_value(gift_card_doc, "status", "Active")
        if status != "Active":
            frappe.throw(frappe._("Only active gift cards can be redeemed."))

        current_balance = _to_float(_doc_value(gift_card_doc, "current_balance"))
        if redeem_amount > current_balance:
            frappe.throw(frappe._("Gift card balance is insufficient."))

        next_balance = _to_float(current_balance - redeem_amount)
        gift_card_doc.current_balance = next_balance
        gift_card_doc.last_redeemed_on = _now_datetime()
        gift_card_doc.flags.ignore_permissions = True
        gift_card_doc.save(ignore_permissions=True)

        normalized_rows.append(
            {
                "gift_card_code": _doc_value(gift_card_doc, "gift_card_code"),
                "redeemed_amount": redeem_amount,
                "balance_before": current_balance,
                "balance_after": next_balance,
                "status": "Applied",
                "cashier": cashier,
            }
        )
        total_redeemed += redeem_amount

    for row in normalized_rows:
        invoice_doc.append("gift_card_redemptions", row)

    if normalized_rows:
        ensure_child_doctype(
            invoice_doc,
            "gift_card_redemptions",
            _invoice_gift_card_child_doctype(invoice_doc),
        )
        _append_invoice_gift_card_payment(invoice_doc, total_redeemed, liability_account)

    return _to_float(total_redeemed)


def restore_invoice_gift_card_redemptions(invoice_doc):
    total_restored = 0
    for row in list(_doc_value(invoice_doc, "gift_card_redemptions") or []):
        status = str(_doc_value(row, "status") or "").strip()
        if status == "Cancelled":
            continue

        redeemed_amount = _to_float(_doc_value(row, "redeemed_amount") or _doc_value(row, "amount"))
        if redeemed_amount <= 0:
            continue

        gift_card_doc = _get_gift_card(_doc_value(row, "gift_card_code"))
        restore_balance = _to_float(_doc_value(row, "balance_before"))
        if restore_balance <= 0:
            restore_balance = _to_float(_doc_value(gift_card_doc, "current_balance") + redeemed_amount)

        gift_card_doc.current_balance = restore_balance
        gift_card_doc.flags.ignore_permissions = True
        gift_card_doc.save(ignore_permissions=True)

        if isinstance(row, dict):
            row["status"] = "Cancelled"
        else:
            setattr(row, "status", "Cancelled")

        total_restored += redeemed_amount

    return _to_float(total_restored)


def _serialize_gift_card(gift_card_doc):
    return {
        "name": getattr(gift_card_doc, "name", None),
        "gift_card_code": getattr(gift_card_doc, "gift_card_code", None),
        "company": getattr(gift_card_doc, "company", None),
        "currency": getattr(gift_card_doc, "currency", None),
        "current_balance": _to_float(getattr(gift_card_doc, "current_balance", 0)),
        "status": getattr(gift_card_doc, "status", None),
        "expiry_date": getattr(gift_card_doc, "expiry_date", None),
    }


def _create_issue_or_top_up_entry(profile_doc, company, amount, reference_doctype, reference_name, cashier):
    if _to_float(amount) <= 0:
        return None

    source_account = _resolve_issue_source_account(profile_doc, company)
    liability_account = _resolve_liability_account(profile_doc)
    cost_center = _resolve_cost_center(profile_doc, company)
    remark = frappe._("POS Awesome gift card {0} for {1}").format(
        reference_doctype.lower(),
        reference_name,
    )

    return _create_gift_card_journal_entry(
        company,
        nowdate(),
        remark,
        [
            {
                "account": source_account,
                "debit_in_account_currency": _to_float(amount),
                "cost_center": cost_center,
                "user_remark": cashier,
            },
            {
                "account": liability_account,
                "credit_in_account_currency": _to_float(amount),
                "cost_center": cost_center,
                "user_remark": cashier,
            },
        ],
    )


def _create_redemption_entry(profile_doc, invoice_doc, amount, cashier):
    redeem_amount = _to_float(amount)
    if redeem_amount <= 0:
        return None

    liability_account = _resolve_liability_account(profile_doc)
    cost_center = _resolve_cost_center(profile_doc, invoice_doc.company)
    remark = frappe._("POS Awesome gift card redemption for {0} {1}").format(
        invoice_doc.doctype,
        invoice_doc.name,
    )

    return _create_gift_card_journal_entry(
        invoice_doc.company,
        invoice_doc.posting_date or nowdate(),
        remark,
        [
            {
                "account": liability_account,
                "debit_in_account_currency": redeem_amount,
                "cost_center": cost_center,
                "user_remark": cashier,
            },
            {
                "account": invoice_doc.debit_to,
                "party_type": "Customer",
                "party": invoice_doc.customer,
                "reference_type": invoice_doc.doctype,
                "reference_name": invoice_doc.name,
                "credit_in_account_currency": redeem_amount,
                "cost_center": cost_center,
                "user_remark": cashier,
            },
        ],
    )


@frappe.whitelist()
def issue_gift_card(
    pos_profile=None,
    cashier=None,
    company=None,
    initial_amount=0,
    gift_card_code=None,
    expiry_date=None,
    currency=None,
):
    profile_name, cashier, _user_doc = _require_supervisor(pos_profile, cashier)
    profile_doc = _get_profile_doc(profile_name)

    amount = _to_float(initial_amount)
    if amount < 0:
        frappe.throw(frappe._("Initial amount cannot be negative."))
    if not company:
        frappe.throw(frappe._("Company is required."))

    code = _normalize_code(gift_card_code)
    if frappe.db.exists("POS Gift Card", {"gift_card_code": code}):
        frappe.throw(frappe._("Gift card {0} already exists.").format(code))

    gift_card_doc = frappe.new_doc("POS Gift Card")
    gift_card_doc.gift_card_code = code
    gift_card_doc.company = company
    # Resolve currency from the caller, then the POS Profile, then the
    # company default — never a hardcoded "PKR".
    gift_card_doc.currency = (
        currency
        or _doc_value(profile_doc, "currency")
        or frappe.get_cached_value("Company", company, "default_currency")
    )
    gift_card_doc.current_balance = amount
    gift_card_doc.status = "Active"
    gift_card_doc.expiry_date = expiry_date
    gift_card_doc.issued_by = cashier
    if amount > 0:
        _create_issue_or_top_up_entry(
            profile_doc,
            company,
            amount,
            "POS Gift Card",
            code,
            cashier,
        )
        _append_transaction(
            gift_card_doc,
            "Issue",
            amount,
            amount,
            cashier=cashier,
        )

    gift_card_doc.flags.ignore_permissions = True
    gift_card_doc.save(ignore_permissions=True)
    return _serialize_gift_card(gift_card_doc)


@frappe.whitelist()
def top_up_gift_card(pos_profile=None, cashier=None, gift_card_code=None, amount=0):
    profile_name, cashier, _user_doc = _require_supervisor(pos_profile, cashier)
    profile_doc = _get_profile_doc(profile_name)

    top_up_amount = _to_float(amount)
    if top_up_amount <= 0:
        frappe.throw(frappe._("Top up amount must be greater than zero."))

    gift_card_doc = _get_gift_card(gift_card_code)
    if getattr(gift_card_doc, "status", "Active") != "Active":
        frappe.throw(frappe._("Only active gift cards can be topped up."))

    _create_issue_or_top_up_entry(
        profile_doc,
        _doc_value(gift_card_doc, "company"),
        top_up_amount,
        "POS Gift Card",
        _doc_value(gift_card_doc, "name"),
        cashier,
    )
    next_balance = _to_float(getattr(gift_card_doc, "current_balance", 0) + top_up_amount)
    gift_card_doc.current_balance = next_balance
    _append_transaction(
        gift_card_doc,
        "Top Up",
        top_up_amount,
        next_balance,
        cashier=cashier,
    )
    gift_card_doc.flags.ignore_permissions = True
    gift_card_doc.save(ignore_permissions=True)
    return _serialize_gift_card(gift_card_doc)


@frappe.whitelist()
def check_gift_card_balance(gift_card_code=None, company=None):
    gift_card_doc = _get_gift_card(gift_card_code)
    if company and getattr(gift_card_doc, "company", None) != company:
        frappe.throw(frappe._("Gift card does not belong to company {0}.").format(company))
    return _serialize_gift_card(gift_card_doc)
