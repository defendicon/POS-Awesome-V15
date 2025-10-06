# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json

import frappe
from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
	consolidate_pos_invoices,
)
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class POSClosingShift(Document):
	def validate(self):
		user = frappe.get_all(
			"POS Closing Shift",
			filters={
				"user": self.user,
				"docstatus": 1,
				"pos_opening_shift": self.pos_opening_shift,
				"name": ["!=", self.name],
			},
		)

		if user:
			frappe.throw(
				_(
					"POS Closing Shift {} against {} between selected period".format(
						frappe.bold("already exists"), frappe.bold(self.user)
					)
				),
				title=_("Invalid Period"),
			)

		if frappe.db.get_value("POS Opening Shift", self.pos_opening_shift, "status") != "Open":
			frappe.throw(
				_("Selected POS Opening Shift should be open."),
				title=_("Invalid Opening Entry"),
			)
		self.update_payment_reconciliation()

	def update_payment_reconciliation(self):
		# update the difference values in Payment Reconciliation child table
		# get default precision for site
		precision = frappe.get_cached_value("System Settings", None, "currency_precision") or 3
		for d in self.payment_reconciliation:
			d.difference = +flt(d.closing_amount, precision) - flt(d.expected_amount, precision)

	def on_submit(self):
		opening_entry = frappe.get_doc("POS Opening Shift", self.pos_opening_shift)
		opening_entry.pos_closing_shift = self.name
		opening_entry.set_status()
		self.delete_draft_invoices()
		opening_entry.save()
		# link invoices with this closing shift so ERPNext can block edits
		self._set_closing_entry_invoices()

		if frappe.db.get_value(
			"POS Profile",
			self.pos_profile,
			"create_pos_invoice_instead_of_sales_invoice",
		):
			pos_invoices = [
				frappe._dict(
					frappe.db.get_value(
						"POS Invoice",
						d.pos_invoice,
						[
							"name as pos_invoice",
							"customer",
							"is_return",
							"return_against",
						],
						as_dict=True,
					)
				)
				for d in self.pos_transactions
			]
			if pos_invoices:
				consolidate_pos_invoices(pos_invoices=pos_invoices)

	def on_cancel(self):
		if frappe.db.exists("POS Opening Shift", self.pos_opening_shift):
			opening_entry = frappe.get_doc("POS Opening Shift", self.pos_opening_shift)
			if opening_entry.pos_closing_shift == self.name:
				opening_entry.pos_closing_shift = ""
				opening_entry.set_status()
				opening_entry.save()
		# remove links from invoices so they can be cancelled
		self._clear_closing_entry_invoices()

	def _set_closing_entry_invoices(self):
		"""Set `pos_closing_entry` on linked invoices."""
		for d in self.pos_transactions:
			invoice = d.get("sales_invoice") or d.get("pos_invoice")
			if not invoice:
				continue
			doctype = "Sales Invoice" if d.get("sales_invoice") else "POS Invoice"
			if frappe.db.has_column(doctype, "pos_closing_entry"):
				frappe.db.set_value(doctype, invoice, "pos_closing_entry", self.name)

	def _clear_closing_entry_invoices(self):
		"""Clear closing shift links, cancel merge logs and cancel consolidated sales invoices."""
		sales_invoices = set()
		for d in self.pos_transactions:
			pos_invoice = d.get("pos_invoice")
			sales_invoice = d.get("sales_invoice")
			if pos_invoice:
				if frappe.db.has_column("POS Invoice", "pos_closing_entry"):
					frappe.db.set_value("POS Invoice", pos_invoice, "pos_closing_entry", None)

				merge_logs = frappe.get_all(
					"POS Invoice Merge Log",
					filters={"pos_invoice": pos_invoice},
					pluck="name",
				)
				for log in merge_logs:
					log_doc = frappe.get_doc("POS Invoice Merge Log", log)
					for field in (
						"consolidated_invoice",
						"consolidated_credit_note",
					):
						si = log_doc.get(field)
						if si:
							sales_invoices.add(si)
					if log_doc.docstatus == 1:
						log_doc.cancel()
					frappe.delete_doc("POS Invoice Merge Log", log_doc.name, force=1)

				if frappe.db.has_column("POS Invoice", "consolidated_invoice"):
					frappe.db.set_value("POS Invoice", pos_invoice, "consolidated_invoice", None)

				if frappe.db.has_column("POS Invoice", "status"):
					pos_doc = frappe.get_doc("POS Invoice", pos_invoice)
					pos_doc.set_status(update=True)

			if sales_invoice:
				if frappe.db.has_column("Sales Invoice", "pos_closing_entry"):
					frappe.db.set_value("Sales Invoice", sales_invoice, "pos_closing_entry", None)
				sales_invoices.add(sales_invoice)

		for si in sales_invoices:
			if frappe.db.exists("Sales Invoice", si):
				si_doc = frappe.get_doc("Sales Invoice", si)
				if si_doc.docstatus == 1:
					si_doc.cancel()

	def delete_draft_invoices(self):
		if frappe.get_value("POS Profile", self.pos_profile, "posa_allow_delete"):
			doctype = (
				"POS Invoice"
				if frappe.db.get_value(
					"POS Profile",
					self.pos_profile,
					"create_pos_invoice_instead_of_sales_invoice",
				)
				else "Sales Invoice"
			)
			data = frappe.db.sql(
				f"""
		select
		    name
		from
		    `tab{doctype}`
		where
		    docstatus = 0 and posa_is_printed = 0 and posa_pos_opening_shift = %s
		""",
				(self.pos_opening_shift),
				as_dict=1,
			)

			for invoice in data:
				frappe.delete_doc(doctype, invoice.name, force=1)

	@frappe.whitelist()
	def get_payment_reconciliation_details(self):
		currency = frappe.get_cached_value("Company", self.company, "default_currency")
		return frappe.render_template(
			"posawesome/posawesome/doctype/pos_closing_shift/closing_shift_details.html",
			{"data": self, "currency": currency},
		)


@frappe.whitelist()
def get_cashiers(doctype, txt, searchfield, start, page_len, filters):
	cashiers_list = frappe.get_all("POS Profile User", filters=filters, fields=["user"])
	result = []
	for cashier in cashiers_list:
		user_email = frappe.get_value("User", cashier.user, "email")
		if user_email:
			# Return list of tuples in format (value, label) where value is user ID and label shows both ID and email
			result.append([cashier.user, f"{cashier.user} ({user_email})"])
	return result


@frappe.whitelist()
def get_pos_invoices(pos_opening_shift, doctype=None):
	if not doctype:
		pos_profile = frappe.db.get_value("POS Opening Shift", pos_opening_shift, "pos_profile")
		use_pos_invoice = frappe.db.get_value(
			"POS Profile",
			pos_profile,
			"create_pos_invoice_instead_of_sales_invoice",
		)
		doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"
	submit_printed_invoices(pos_opening_shift, doctype)
	cond = " and ifnull(consolidated_invoice,'') = ''" if doctype == "POS Invoice" else ""
	data = frappe.db.sql(
		f"""
	select
		name
	from
		`tab{doctype}`
	where
		docstatus = 1 and posa_pos_opening_shift = %s{cond}
	""",
		(pos_opening_shift),
		as_dict=1,
	)

	data = [frappe.get_doc(doctype, d.name).as_dict() for d in data]

	return data


@frappe.whitelist()
def get_payments_entries(pos_opening_shift):
	return frappe.get_all(
		"Payment Entry",
		filters={
			"docstatus": 1,
			"reference_no": pos_opening_shift,
			"payment_type": "Receive",
		},
		fields=[
			"name",
			"mode_of_payment",
			"paid_amount",
			"reference_no",
			"posting_date",
			"party",
		],
	)


@frappe.whitelist()
def make_closing_shift_from_opening(opening_shift):
	opening_shift = json.loads(opening_shift)
	use_pos_invoice = frappe.db.get_value(
		"POS Profile",
		opening_shift.get("pos_profile"),
		"create_pos_invoice_instead_of_sales_invoice",
	)
	doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"
	submit_printed_invoices(opening_shift.get("name"), doctype)
	closing_shift = frappe.new_doc("POS Closing Shift")
	closing_shift.pos_opening_shift = opening_shift.get("name")
	closing_shift.period_start_date = opening_shift.get("period_start_date")
	closing_shift.period_end_date = frappe.utils.get_datetime()
	closing_shift.pos_profile = opening_shift.get("pos_profile")
	closing_shift.user = opening_shift.get("user")
	closing_shift.company = opening_shift.get("company")
	closing_shift.grand_total = 0
	closing_shift.net_total = 0
	closing_shift.total_quantity = 0

	invoices = get_pos_invoices(opening_shift.get("name"), doctype)

	pos_transactions = []
	taxes = []
	payments = []
	pos_payments_table = []
	for detail in opening_shift.get("balance_details"):
		payments.append(
			frappe._dict(
				{
					"mode_of_payment": detail.get("mode_of_payment"),
					"opening_amount": detail.get("amount") or 0,
					"expected_amount": detail.get("amount") or 0,
				}
			)
		)

	invoice_field = "pos_invoice" if doctype == "POS Invoice" else "sales_invoice"

	for d in invoices:
		pos_transactions.append(
			frappe._dict(
				{
					invoice_field: d.name,
					"posting_date": d.posting_date,
					"grand_total": d.grand_total,
					"customer": d.customer,
				}
			)
		)
		closing_shift.grand_total += flt(d.grand_total)
		closing_shift.net_total += flt(d.net_total)
		closing_shift.total_quantity += flt(d.total_qty)

		for t in d.taxes:
			existing_tax = [tx for tx in taxes if tx.account_head == t.account_head and tx.rate == t.rate]
			if existing_tax:
				existing_tax[0].amount += flt(t.tax_amount)
			else:
				taxes.append(
					frappe._dict(
						{
							"account_head": t.account_head,
							"rate": t.rate,
							"amount": t.tax_amount,
						}
					)
				)

		for p in d.payments:
			existing_pay = [pay for pay in payments if pay.mode_of_payment == p.mode_of_payment]
			if existing_pay:
				cash_mode_of_payment = frappe.get_value(
					"POS Profile",
					opening_shift.get("pos_profile"),
					"posa_cash_mode_of_payment",
				)
				if not cash_mode_of_payment:
					cash_mode_of_payment = "Cash"
				if existing_pay[0].mode_of_payment == cash_mode_of_payment:
					amount = p.amount - d.change_amount
				else:
					amount = p.amount
				existing_pay[0].expected_amount += flt(amount)
			else:
				payments.append(
					frappe._dict(
						{
							"mode_of_payment": p.mode_of_payment,
							"opening_amount": 0,
							"expected_amount": p.amount,
						}
					)
				)

	pos_payments = get_payments_entries(opening_shift.get("name"))

	for py in pos_payments:
		pos_payments_table.append(
			frappe._dict(
				{
					"payment_entry": py.name,
					"mode_of_payment": py.mode_of_payment,
					"paid_amount": py.paid_amount,
					"posting_date": py.posting_date,
					"customer": py.party,
				}
			)
		)
		existing_pay = [pay for pay in payments if pay.mode_of_payment == py.mode_of_payment]
		if existing_pay:
			existing_pay[0].expected_amount += flt(py.paid_amount)
		else:
			payments.append(
				frappe._dict(
					{
						"mode_of_payment": py.mode_of_payment,
						"opening_amount": 0,
						"expected_amount": py.paid_amount,
					}
				)
			)

	closing_shift.set("pos_transactions", pos_transactions)
	closing_shift.set("payment_reconciliation", payments)
	closing_shift.set("taxes", taxes)
	closing_shift.set("pos_payments", pos_payments_table)

	return closing_shift


@frappe.whitelist()
def submit_closing_shift(closing_shift):
	closing_shift = json.loads(closing_shift)
	closing_shift_doc = frappe.get_doc(closing_shift)
	closing_shift_doc.flags.ignore_permissions = True
	closing_shift_doc.save()
	closing_shift_doc.submit()
	return closing_shift_doc.name


def submit_printed_invoices(pos_opening_shift, doctype):
	invoices_list = frappe.get_all(
		doctype,
		filters={
			"posa_pos_opening_shift": pos_opening_shift,
			"docstatus": 0,
			"posa_is_printed": 1,
		},
	)
	for invoice in invoices_list:
		invoice_doc = frappe.get_doc(doctype, invoice.name)
		invoice_doc.submit()
