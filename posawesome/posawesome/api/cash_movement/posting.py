import frappe
from frappe import _
from frappe.utils import nowdate, flt


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

    company_cost_center = cost_center or frappe.get_cached_value("Company", company, "cost_center")

    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.company = company
    je.posting_date = posting_date or nowdate()
    je.user_remark = remarks or _("POS Cash Movement")

    # Debit target account (expense or back-office cash)
    je.append(
        "accounts",
        {
            "account": target_account,
            "debit_in_account_currency": amount,
            "credit_in_account_currency": 0,
            "cost_center": company_cost_center,
        },
    )

    # Credit source account (POS cash)
    je.append(
        "accounts",
        {
            "account": source_account,
            "debit_in_account_currency": 0,
            "credit_in_account_currency": amount,
            "cost_center": company_cost_center,
        },
    )

    je.flags.ignore_permissions = True
    previous_ignore_account_permission = frappe.flags.get("ignore_account_permission")
    frappe.flags.ignore_account_permission = True
    try:
        je.save()
        je.submit()
    finally:
        frappe.flags.ignore_account_permission = previous_ignore_account_permission
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
        previous_ignore_account_permission = frappe.flags.get("ignore_account_permission")
        frappe.flags.ignore_account_permission = True
        try:
            je.cancel()
        finally:
            frappe.flags.ignore_account_permission = previous_ignore_account_permission
