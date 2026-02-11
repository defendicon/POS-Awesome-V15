import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from posawesome.posawesome.api.cash_movement.posting import cancel_journal_entry


class POSCashMovement(Document):
    def validate(self):
        self._validate_amount()
        self._validate_company_links()
        self._validate_accounts()
        self._validate_movement_type_rules()

    def on_cancel(self):
        if self.journal_entry:
            cancel_journal_entry(self.journal_entry)

    def on_trash(self):
        if self.docstatus != 2:
            frappe.throw(_("Only cancelled POS Cash Movement records can be deleted."))

    def _validate_amount(self):
        if flt(self.amount) <= 0:
            frappe.throw(_("Amount must be greater than zero."))

    def _validate_company_links(self):
        pos_profile_company = frappe.db.get_value("POS Profile", self.pos_profile, "company")
        if pos_profile_company and self.company != pos_profile_company:
            frappe.throw(_("Company must match the selected POS Profile company."))

        opening_shift = frappe.db.get_value(
            "POS Opening Shift",
            self.pos_opening_shift,
            ["company", "pos_profile", "user", "status", "docstatus"],
            as_dict=1,
        )
        if not opening_shift:
            frappe.throw(_("POS Opening Shift is required."))

        if opening_shift.company != self.company:
            frappe.throw(_("Company must match the selected POS Opening Shift company."))

        if opening_shift.pos_profile != self.pos_profile:
            frappe.throw(_("POS Profile must match the selected POS Opening Shift profile."))

        if opening_shift.user != self.user:
            frappe.throw(_("User must match the selected POS Opening Shift user."))

    def _validate_accounts(self):
        if not self.source_account or not self.target_account:
            frappe.throw(_("Source and target accounts are required."))

        source_company = frappe.db.get_value("Account", self.source_account, "company")
        target_company = frappe.db.get_value("Account", self.target_account, "company")

        if source_company and source_company != self.company:
            frappe.throw(_("Source account must belong to the selected company."))
        if target_company and target_company != self.company:
            frappe.throw(_("Target account must belong to the selected company."))

    def _validate_movement_type_rules(self):
        movement_type = (self.movement_type or "").strip()
        if movement_type not in {"Expense", "Deposit"}:
            frappe.throw(_("Movement Type must be Expense or Deposit."))

        if movement_type == "Expense":
            if not self.expense_account:
                frappe.throw(_("Expense Account is required for expense entries."))
            if self.expense_account != self.target_account:
                frappe.throw(_("Expense target account must match Expense Account."))

        if movement_type == "Deposit" and self.source_account == self.target_account:
            frappe.throw(_("Source and target accounts cannot be the same for cash deposit."))
