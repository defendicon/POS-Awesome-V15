import frappe
from frappe import _
from frappe.utils import nowdate, flt
from erpnext.setup.utils import get_exchange_rate

from posawesome.posawesome.api.account_permissions import temporarily_ignore_account_permission


def _get_account_currency_details(account, company_currency, posting_date):
    account_currency = frappe.get_cached_value("Account", account, "account_currency")
    account_currency = account_currency or company_currency
    exchange_rate = 1.0
    if account_currency != company_currency:
        exchange_rate = flt(get_exchange_rate(account_currency, company_currency, posting_date))
        if exchange_rate <= 0:
            frappe.throw(
                _("Unable to determine exchange rate from {0} to {1}.").format(
                    account_currency,
                    company_currency,
                )
            )
    return account_currency, exchange_rate


def _build_account_row(account, company_currency, posting_date, base_amount, side, cost_center):
    account_currency, exchange_rate = _get_account_currency_details(
        account,
        company_currency,
        posting_date,
    )
    account_amount = flt(base_amount / exchange_rate)
    row = {
        "account": account,
        "account_currency": account_currency,
        "exchange_rate": exchange_rate,
        "debit_in_account_currency": 0,
        "credit_in_account_currency": 0,
        "debit": 0,
        "credit": 0,
        "cost_center": cost_center,
    }
    row[f"{side}_in_account_currency"] = account_amount
    row[side] = base_amount
    return row


def create_journal_entry(
    company,
    posting_date,
    movement_type,
    amount,
    source_account,
    target_account,
    remarks=None,
    cost_center=None,
):
    amount = flt(amount)
    if amount <= 0:
        frappe.throw(_("Amount must be greater than zero."))

    movement_type = (movement_type or "").strip()
    if movement_type not in {"Expense", "Deposit"}:
        frappe.throw(_("Invalid movement type for journal entry."))

    posting_date = posting_date or nowdate()
    company_currency = frappe.get_cached_value("Company", company, "default_currency")
    if not company_currency:
        frappe.throw(_("Default currency is not configured for company {0}.").format(company))

    company_cost_center = cost_center or frappe.get_cached_value("Company", company, "cost_center")
    target_row = _build_account_row(
        target_account,
        company_currency,
        posting_date,
        amount,
        "debit",
        company_cost_center,
    )
    source_row = _build_account_row(
        source_account,
        company_currency,
        posting_date,
        amount,
        "credit",
        company_cost_center,
    )

    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.company = company
    je.posting_date = posting_date
    je.multi_currency = int(
        target_row["account_currency"] != company_currency
        or source_row["account_currency"] != company_currency
    )
    je.user_remark = remarks or _("POS Cash Movement")

    # Debit target account (expense or back-office cash)
    je.append("accounts", target_row)

    # Credit source account (POS cash)
    je.append("accounts", source_row)

    je.flags.ignore_permissions = True
    je.flags.ignore_exchange_rate = True
    with temporarily_ignore_account_permission():
        je.save()
        je.submit()
    return je.name


def cancel_journal_entry(journal_entry_name):
    if not journal_entry_name:
        return

    if not frappe.db.exists("Journal Entry", journal_entry_name):
        return

    je = frappe.get_doc("Journal Entry", journal_entry_name)
    if je.docstatus == 1:
        je.flags.ignore_permissions = True
        # Cash movement keeps a hard link to JE for audit trail; allow JE cancel from this controlled path.
        je.flags.ignore_links = True
        with temporarily_ignore_account_permission():
            je.cancel()
