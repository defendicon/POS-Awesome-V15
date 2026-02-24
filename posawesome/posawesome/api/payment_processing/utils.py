import json

import frappe
from frappe import _
from erpnext.accounts.doctype.journal_entry.journal_entry import get_default_bank_cash_account


MAX_MODE_OF_PAYMENTS = 200


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _assert_company_access(company):
    company = str(company or "").strip()
    if not company:
        frappe.throw(_("Company is required"))

    if _can_manage_all_pos_profiles() or frappe.has_permission("Sales Invoice", "read"):
        return company

    profile_names = frappe.get_all(
        "POS Profile User",
        filters={"user": frappe.session.user},
        pluck="parent",
    )
    if not profile_names:
        frappe.throw(_("You are not allowed to access mode of payment accounts for this company."))

    allowed_companies = {
        row.company
        for row in frappe.get_all(
            "POS Profile",
            filters={"name": ["in", profile_names]},
            fields=["company"],
        )
        if row.company
    }
    if company not in allowed_companies:
        frappe.throw(
            _("You are not allowed to access mode of payment accounts for company {0}.").format(company)
        )
    return company


def get_party_account(party_type, party, company):
    try:
        # First try to get from Party Account
        account = frappe.get_cached_value(
            "Party Account",
            {"parenttype": party_type, "parent": party, "company": company},
            "account",
        )

        if not account:
            # Try to get default account from company
            account = frappe.get_cached_value(
                "Company",
                company,
                ("default_receivable_account" if party_type == "Customer" else "default_payable_account"),
            )

        if not account:
            frappe.log_error(
                f"No account found for {party_type} {party} in company {company}",
                "POS Account Error",
            )

        return account
    except Exception as e:
        frappe.log_error(f"Error getting party account: {str(e)}")
        return None

def get_bank_cash_account(company, mode_of_payment, bank_account=None):
    bank = get_default_bank_cash_account(
        company, "Bank", mode_of_payment=mode_of_payment, account=bank_account
    )

    if not bank:
        bank = get_default_bank_cash_account(
            company, "Cash", mode_of_payment=mode_of_payment, account=bank_account
        )

    return bank

def set_paid_amount_and_received_amount(
    party_account_currency,
    bank,
    outstanding_amount,
    payment_type,
    bank_amount,
    conversion_rate,
):
    paid_amount = received_amount = 0
    if party_account_currency == bank.account_currency:
        paid_amount = received_amount = abs(outstanding_amount)
    elif payment_type == "Receive":
        paid_amount = abs(outstanding_amount)
        if bank_amount:
            received_amount = bank_amount
        else:
            received_amount = paid_amount * conversion_rate

    else:
        received_amount = abs(outstanding_amount)
        if bank_amount:
            paid_amount = bank_amount
        else:
            # if party account currency and bank currency is different then populate paid amount as well
            paid_amount = received_amount * conversion_rate

    return paid_amount, received_amount


def _coerce_mode_of_payments(mode_of_payments):
    if isinstance(mode_of_payments, str):
        try:
            mode_of_payments = json.loads(mode_of_payments)
        except Exception:
            frappe.throw(_("mode_of_payments must be valid JSON"))

    if mode_of_payments is None:
        return []
    if not isinstance(mode_of_payments, (list, tuple, set)):
        frappe.throw(_("mode_of_payments must be a list"))

    sanitized = []
    seen = set()
    for mode in mode_of_payments:
        mode_name = str(mode or "").strip()
        if not mode_name or mode_name in seen:
            continue
        sanitized.append(mode_name)
        seen.add(mode_name)

    if len(sanitized) > MAX_MODE_OF_PAYMENTS:
        frappe.throw(_("Too many mode of payment values in one request."))

    return sanitized


@frappe.whitelist()
def get_mode_of_payment_accounts(company, mode_of_payments):
    company = _assert_company_access(company)
    mode_of_payments = _coerce_mode_of_payments(mode_of_payments)

    currency_map = {}
    for mode in mode_of_payments:
        account = get_bank_cash_account(company, mode)
        if account:
            currency_map[mode] = account.get("account_currency")
    return currency_map
