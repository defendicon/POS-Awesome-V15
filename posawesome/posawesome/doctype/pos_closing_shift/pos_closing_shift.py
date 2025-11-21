# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json
from collections import defaultdict

import frappe
from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
    consolidate_pos_invoices,
)
from frappe import _, DoesNotExistError
from frappe.model.document import Document
from frappe.utils import flt


def get_base_value(doc, fieldname, base_fieldname=None, conversion_rate=None):
    """Return the value for a field in company currency."""

    base_fieldname = base_fieldname or f"base_{fieldname}"
    base_value = doc.get(base_fieldname)

    if base_value not in (None, ""):
        return flt(base_value)

    value = doc.get(fieldname)
    if value in (None, ""):
        return 0

    if conversion_rate is None:
        conversion_rate = (
            doc.get("conversion_rate")
            or doc.get("exchange_rate")
            or doc.get("target_exchange_rate")
            or doc.get("plc_conversion_rate")
            or 1
        )

    return flt(value) * flt(conversion_rate or 1)


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
            pos_invoices = []
            for d in self.pos_transactions:
                invoice_details = frappe._dict(
                    frappe.db.get_value(
                        "POS Invoice",
                        d.pos_invoice,
                        [
                            "name as pos_invoice",
                            "customer",
                            "is_return",
                            "return_against",
                            "currency",
                        ],
                        as_dict=True,
                    )
                )
                if invoice_details:
                    pos_invoices.append(invoice_details)

            if pos_invoices:
                invoices_by_currency = {}
                for invoice in pos_invoices:
                    invoices_by_currency.setdefault(invoice.currency, []).append(invoice)

                for invoices in invoices_by_currency.values():
                    consolidate_pos_invoices(pos_invoices=invoices)

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
        consolidated_sales_invoices = set()
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
                            consolidated_sales_invoices.add(si)
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
                if self._is_consolidated_sales_invoice(sales_invoice):
                    consolidated_sales_invoices.add(sales_invoice)

        for si in consolidated_sales_invoices:
            if frappe.db.exists("Sales Invoice", si):
                si_doc = frappe.get_doc("Sales Invoice", si)
                if si_doc.docstatus == 1:
                    si_doc.cancel()

    def _is_consolidated_sales_invoice(self, sales_invoice):
        """Return True if the Sales Invoice was generated by consolidating POS Invoices."""

        if not sales_invoice:
            return False

        if frappe.db.exists("POS Invoice Merge Log", {"consolidated_invoice": sales_invoice}):
            return True

        return bool(frappe.db.exists("POS Invoice Merge Log", {"consolidated_credit_note": sales_invoice}))

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
        company_currency = frappe.get_cached_value("Company", self.company, "default_currency")

        sales_breakdown = defaultdict(float)
        net_breakdown = defaultdict(float)
        payment_breakdown = {}

        def update_payment_breakdown(mode_of_payment, base_amount=0, currency=None, amount=0):
            if not mode_of_payment:
                return

            row = payment_breakdown.setdefault(
                mode_of_payment,
                {"base": 0.0, "currencies": defaultdict(float)},
            )
            row["base"] += flt(base_amount)
            if currency:
                row["currencies"][currency] += flt(amount)

        cash_mode_of_payment = (
            frappe.db.get_value("POS Profile", self.pos_profile, "posa_cash_mode_of_payment") or "Cash"
        )

        for row in self.get("pos_transactions", []):
            invoice = row.get("sales_invoice") or row.get("pos_invoice")
            if not invoice:
                continue

            doctype = "Sales Invoice" if row.get("sales_invoice") else "POS Invoice"
            if not frappe.db.exists(doctype, invoice):
                continue

            invoice_doc = frappe.get_cached_doc(doctype, invoice)
            currency = invoice_doc.get("currency") or company_currency
            conversion_rate = (
                invoice_doc.get("conversion_rate")
                or invoice_doc.get("exchange_rate")
                or invoice_doc.get("target_exchange_rate")
                or invoice_doc.get("plc_conversion_rate")
                or 1
            )

            sales_breakdown[currency] += flt(invoice_doc.get("grand_total") or 0)
            net_breakdown[currency] += flt(invoice_doc.get("net_total") or 0)

            for payment in invoice_doc.get("payments", []):
                update_payment_breakdown(
                    payment.mode_of_payment,
                    get_base_value(payment, "amount", "base_amount", conversion_rate),
                    currency,
                    payment.amount,
                )

            change_amount = invoice_doc.get("change_amount") or 0
            if change_amount:
                update_payment_breakdown(
                    cash_mode_of_payment,
                    -get_base_value(
                        invoice_doc,
                        "change_amount",
                        "base_change_amount",
                        conversion_rate,
                    ),
                    currency,
                    -change_amount,
                )

        for row in self.get("pos_payments", []):
            payment_entry = row.get("payment_entry")
            if not payment_entry or not frappe.db.exists("Payment Entry", payment_entry):
                continue

            payment_doc = frappe.get_cached_doc("Payment Entry", payment_entry)
            multiplier = -1 if payment_doc.get("payment_type") == "Pay" else 1
            currency = (
                payment_doc.get("paid_from_account_currency")
                or payment_doc.get("paid_to_account_currency")
                or payment_doc.get("party_account_currency")
                or payment_doc.get("currency")
                or company_currency
            )
            base_amount = multiplier * abs(flt(payment_doc.get("base_paid_amount") or 0))
            paid_amount = multiplier * abs(flt(payment_doc.get("paid_amount") or 0))
            mode_of_payment = row.get("mode_of_payment") or payment_doc.get("mode_of_payment")

            update_payment_breakdown(mode_of_payment, base_amount, currency, paid_amount)

        mode_summaries = []
        payment_breakdown_copy = payment_breakdown.copy()
        for detail in self.get("payment_reconciliation", []):
            mop = detail.mode_of_payment
            breakdown = payment_breakdown_copy.pop(mop, None)
            currencies = []
            if breakdown:
                currencies = [
                    frappe._dict({"currency": currency, "amount": amount})
                    for currency, amount in sorted(breakdown["currencies"].items())
                    if amount
                ]

            base_total = flt(detail.expected_amount) - flt(detail.opening_amount)

            mode_summaries.append(
                frappe._dict(
                    {
                        "mode_of_payment": mop,
                        "base_amount": base_total,
                        "opening_amount": flt(detail.opening_amount),
                        "expected_amount": flt(detail.expected_amount),
                        "difference": flt(detail.difference),
                        "currency_breakdown": currencies,
                    }
                )
            )

        for mop, breakdown in payment_breakdown_copy.items():
            mode_summaries.append(
                frappe._dict(
                    {
                        "mode_of_payment": mop,
                        "base_amount": breakdown["base"],
                        "opening_amount": 0,
                        "expected_amount": breakdown["base"],
                        "difference": 0,
                        "currency_breakdown": [
                            frappe._dict({"currency": currency, "amount": amount})
                            for currency, amount in sorted(breakdown["currencies"].items())
                            if amount
                        ],
                    }
                )
            )

        sales_currency_breakdown = [
            frappe._dict({"currency": currency, "amount": amount})
            for currency, amount in sorted(sales_breakdown.items())
            if amount
        ]
        net_currency_breakdown = [
            frappe._dict({"currency": currency, "amount": amount})
            for currency, amount in sorted(net_breakdown.items())
            if amount
        ]

        return frappe.render_template(
            "posawesome/posawesome/doctype/pos_closing_shift/closing_shift_details.html",
            {
                "data": self,
                "currency": company_currency,
                "company_currency": company_currency,
                "mode_summaries": mode_summaries,
                "sales_currency_breakdown": sales_currency_breakdown,
                "net_currency_breakdown": net_currency_breakdown,
            },
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
            "payment_type": ["in", ["Receive", "Pay"]],
        },
        fields=[
            "name",
            "mode_of_payment",
            "paid_amount",
            "base_paid_amount",
            "paid_from_account_currency",
            "paid_to_account_currency",
            "target_exchange_rate",
            "reference_no",
            "posting_date",
            "party",
            "payment_type",
        ],
    )


@frappe.whitelist()
def get_closing_shift_overview(pos_opening_shift):
    """Return invoice and payment totals for the provided POS Opening Shift."""

    if not pos_opening_shift:
        frappe.throw(_("POS Opening Shift is required to compute the overview."))

    opening_shift_doc = None
    opening_shift_name = None
    payload = pos_opening_shift

    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
        except ValueError:
            opening_shift_name = payload
        else:
            payload = parsed if isinstance(parsed, dict) else payload

    if isinstance(payload, dict):
        opening_shift_name = payload.get("name") or opening_shift_name
    elif getattr(payload, "doctype", None) == "POS Opening Shift":
        opening_shift_doc = payload
        opening_shift_name = payload.name
    elif opening_shift_name is None:
        opening_shift_name = getattr(payload, "name", None)

    if not opening_shift_doc:
        if not opening_shift_name:
            frappe.throw(_("Invalid POS Opening Shift data provided."))
        opening_shift_doc = frappe.get_doc("POS Opening Shift", opening_shift_name)

    if opening_shift_doc.doctype != "POS Opening Shift":
        frappe.throw(_("Unable to resolve POS Opening Shift."))

    pos_profile = opening_shift_doc.pos_profile
    company = opening_shift_doc.company
    company_currency = frappe.get_cached_value("Company", company, "default_currency")

    use_pos_invoice = frappe.db.get_value(
        "POS Profile",
        pos_profile,
        "create_pos_invoice_instead_of_sales_invoice",
    )
    doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"
    invoices = get_pos_invoices(opening_shift_doc.name, doctype)

    total_invoices = len(invoices)
    company_currency_total = 0
    multi_currency_totals = {}
    payments_by_mode = {}
    credit_company_currency_total = 0
    credit_invoices_count = 0
    credit_totals_by_currency = {}
    gross_company_currency_total = 0
    sale_invoices_count = 0
    returns_company_currency_total = 0
    returns_count = 0
    returns_totals_by_currency = {}
    change_company_currency_total = 0
    change_totals_by_currency = {}
    overpayment_change_company_currency_total = 0
    overpayment_change_totals_by_currency = {}
    total_change_totals_by_currency = {}

    cash_mode_of_payment = frappe.db.get_value("POS Profile", pos_profile, "posa_cash_mode_of_payment")
    if not cash_mode_of_payment:
        cash_mode_of_payment = "Cash"

    def accumulate_payment(container, mode, currency, amount, base_amount=0, conversion_rate=None):
        if not mode:
            return
        currency = currency or company_currency
        key = (mode, currency)
        if key not in container:
            container[key] = {
                "mode_of_payment": mode,
                "currency": currency,
                "total": 0,
                "company_currency_total": 0,
                "exchange_rates": set(),
            }
        container[key]["total"] += flt(amount)
        container[key]["company_currency_total"] += flt(base_amount)

        if currency != company_currency:
            rate = None
            if flt(amount):
                rate = abs(flt(base_amount)) / abs(flt(amount)) if base_amount else None
            if not rate and conversion_rate:
                rate = flt(conversion_rate)
            if rate:
                container[key]["exchange_rates"].add(rate)

    def resolve_payment_currency(payment_row, invoice_currency):
        for fieldname in (
            "currency",
            "account_currency",
            "payment_currency",
        ):
            value = payment_row.get(fieldname)
            if value:
                return value
        return invoice_currency or company_currency

    shift_invoice_names = {invoice.get("name") for invoice in invoices}
    invoice_shift_link_field_cache = {}
    invoice_membership_cache = {}
    overpayment_invoice_names = set()

    def resolve_shift_link_field(doctype_name):
        if doctype_name in invoice_shift_link_field_cache:
            return invoice_shift_link_field_cache[doctype_name]

        link_field = None
        try:
            meta = frappe.get_meta(doctype_name)
        except DoesNotExistError:
            meta = None

        if meta:
            for df in meta.get("fields", []):
                if df.fieldtype == "Link" and df.options == "POS Opening Shift":
                    link_field = df.fieldname
                    break

        invoice_shift_link_field_cache[doctype_name] = link_field
        return link_field

    def reference_belongs_to_shift(doctype_name, docname):
        key = (doctype_name, docname)
        if key in invoice_membership_cache:
            return invoice_membership_cache[key]

        if doctype_name == doctype and docname in shift_invoice_names:
            invoice_membership_cache[key] = True
            return True

        link_field = resolve_shift_link_field(doctype_name)
        if not link_field:
            invoice_membership_cache[key] = False
            return False

        value = frappe.db.get_value(doctype_name, docname, link_field)
        invoice_membership_cache[key] = bool(value and value == opening_shift_doc.name)
        return invoice_membership_cache[key]

    payment_entries = get_payments_entries(opening_shift_doc.name)

    payment_entry_names = [row.get("name") for row in payment_entries if row.get("name")]
    references_by_entry = defaultdict(list)

    if payment_entry_names:
        reference_meta = frappe.get_meta("Payment Entry Reference")
        reference_fieldnames = {df.fieldname for df in reference_meta.get("fields", [])}
        reference_fields = [
            "parent",
            "reference_doctype",
            "reference_name",
            "allocated_amount",
        ]

        if "exchange_rate" in reference_fieldnames:
            reference_fields.append("exchange_rate")
        if "allocated_amount_in_company_currency" in reference_fieldnames:
            reference_fields.append("allocated_amount_in_company_currency")
        if "base_allocated_amount" in reference_fieldnames:
            reference_fields.append("base_allocated_amount")

        reference_rows = frappe.get_all(
            "Payment Entry Reference",
            filters={"parent": ["in", payment_entry_names]},
            fields=reference_fields,
        )

        for reference in reference_rows:
            references_by_entry[reference.get("parent")].append(reference)

    for entry in payment_entries:
        if entry.get("payment_type") != "Pay":
            continue

        references = references_by_entry.get(entry.get("name")) or []

        for reference in references:
            reference_doctype = reference.get("reference_doctype")
            reference_name = reference.get("reference_name")
            belongs_to_shift = False

            if reference_doctype and reference_name:
                belongs_to_shift = reference_belongs_to_shift(
                    reference_doctype,
                    reference_name,
                )

            if belongs_to_shift and reference_doctype in {"POS Invoice", "Sales Invoice"}:
                overpayment_invoice_names.add(reference_name)

    def reference_base_amount(reference, fallback_rate=None):
        for fieldname in (
            "allocated_amount_in_company_currency",
            "base_allocated_amount",
        ):
            value = reference.get(fieldname)
            if value not in (None, ""):
                return flt(value)

        amount_value = flt(reference.get("allocated_amount") or 0)
        rate_value = reference.get("exchange_rate") or fallback_rate or 1
        return amount_value * flt(rate_value or 1)

    for invoice in invoices:
        conversion_rate = invoice.get("conversion_rate")
        base_grand_total = get_base_value(invoice, "grand_total", "base_grand_total", conversion_rate)
        company_currency_total += base_grand_total
        if base_grand_total >= 0:
            gross_company_currency_total += base_grand_total
            sale_invoices_count += 1
        else:
            returns_company_currency_total += abs(base_grand_total)
            returns_count += 1
        invoice_currency = invoice.get("currency") or company_currency
        invoice_total = invoice.get("rounded_total") or invoice.get("grand_total") or 0
        currency_entry = multi_currency_totals.setdefault(
            invoice_currency,
            {
                "currency": invoice_currency,
                "total": 0,
                "invoice_count": 0,
                "company_currency_total": 0,
                "exchange_rates": set(),
            },
        )
        currency_entry["total"] += flt(invoice_total)
        currency_entry["invoice_count"] += 1
        currency_entry["company_currency_total"] += flt(base_grand_total)

        if invoice_currency != company_currency:
            rate = flt(conversion_rate) if conversion_rate else None
            if not rate and flt(invoice_total):
                rate = abs(flt(base_grand_total)) / abs(flt(invoice_total)) if base_grand_total else None
            if rate:
                currency_entry["exchange_rates"].add(rate)

        change_amount = flt(invoice.get("change_amount") or 0)
        has_overpayment_entry = invoice.get("name") in overpayment_invoice_names

        if change_amount and not has_overpayment_entry:
            change_entry = change_totals_by_currency.setdefault(
                invoice_currency,
                {
                    "currency": invoice_currency,
                    "total": 0,
                    "company_currency_total": 0,
                    "exchange_rates": set(),
                },
            )
            change_entry["total"] += change_amount

            change_base_amount = flt(
                get_base_value(invoice, "change_amount", "base_change_amount", conversion_rate)
            )
            change_company_currency_total += change_base_amount
            change_entry["company_currency_total"] += change_base_amount

            total_change_entry = total_change_totals_by_currency.setdefault(
                invoice_currency,
                {
                    "currency": invoice_currency,
                    "total": 0,
                    "company_currency_total": 0,
                    "exchange_rates": set(),
                },
            )
            total_change_entry["total"] += change_amount
            total_change_entry["company_currency_total"] += change_base_amount

            if invoice_currency != company_currency:
                rate = None
                if change_amount:
                    rate = abs(change_base_amount) / abs(change_amount) if change_base_amount else None
                if not rate and conversion_rate:
                    rate = flt(conversion_rate)
                if rate:
                    change_entry["exchange_rates"].add(rate)
                    total_change_entry["exchange_rates"].add(rate)

        outstanding_company_currency = invoice.get("base_outstanding_amount")
        if outstanding_company_currency in (None, ""):
            outstanding_company_currency = invoice.get("outstanding_amount")
        if outstanding_company_currency in (None, ""):
            outstanding_company_currency = get_base_value(
                invoice,
                "outstanding_amount",
                "base_outstanding_amount",
                conversion_rate,
            )
        outstanding_company_currency = flt(outstanding_company_currency or 0)

        if outstanding_company_currency > 0:
            credit_invoices_count += 1
            credit_company_currency_total += outstanding_company_currency
            outstanding_invoice_currency = invoice.get("outstanding_amount")
            if outstanding_invoice_currency in (None, ""):
                base_divisor = flt(conversion_rate) or 0
                if base_divisor:
                    outstanding_invoice_currency = outstanding_company_currency / base_divisor
                else:
                    outstanding_invoice_currency = outstanding_company_currency
            outstanding_invoice_currency = flt(outstanding_invoice_currency or 0)
            credit_entry = credit_totals_by_currency.setdefault(
                invoice_currency,
                {
                    "currency": invoice_currency,
                    "total": 0,
                    "invoice_count": 0,
                    "company_currency_total": 0,
                    "exchange_rates": set(),
                },
            )
            credit_entry["total"] += flt(outstanding_invoice_currency)
            credit_entry["invoice_count"] += 1
            credit_entry["company_currency_total"] += outstanding_company_currency

            if invoice_currency != company_currency:
                rate = None
                if outstanding_invoice_currency:
                    rate = abs(outstanding_company_currency) / abs(flt(outstanding_invoice_currency))
                if not rate and conversion_rate:
                    rate = flt(conversion_rate)
                if rate:
                    credit_entry["exchange_rates"].add(rate)

        is_return = bool(invoice.get("is_return"))
        if not is_return and flt(invoice_total) < 0:
            is_return = True

        if is_return:
            returns_entry = returns_totals_by_currency.setdefault(
                invoice_currency,
                {
                    "currency": invoice_currency,
                    "total": 0,
                    "invoice_count": 0,
                    "company_currency_total": 0,
                    "exchange_rates": set(),
                },
            )
            returns_entry["total"] += abs(flt(invoice_total))
            returns_entry["invoice_count"] += 1
            returns_entry["company_currency_total"] += abs(flt(base_grand_total))

            if invoice_currency != company_currency:
                rate = flt(conversion_rate) if conversion_rate else None
                if not rate and flt(invoice_total):
                    rate = abs(flt(base_grand_total)) / abs(flt(invoice_total)) if base_grand_total else None
                if rate:
                    returns_entry["exchange_rates"].add(rate)

        for payment in invoice.get("payments", []):
            mode = payment.get("mode_of_payment")
            payment_currency = resolve_payment_currency(payment, invoice_currency)
            amount = flt(payment.get("amount") or 0)
            base_amount = get_base_value(payment, "amount", "base_amount", conversion_rate)
            accumulate_payment(
                payments_by_mode,
                mode,
                payment_currency,
                amount,
                base_amount,
                conversion_rate,
            )

    for entry in payment_entries:
        mode = entry.get("mode_of_payment")
        payment_currency = (
            entry.get("paid_to_account_currency")
            or entry.get("paid_from_account_currency")
            or company_currency
        )
        raw_amount = flt(entry.get("paid_amount") or 0)
        entry_rate = (
            entry.get("target_exchange_rate")
            or entry.get("source_exchange_rate")
            or entry.get("exchange_rate")
        )
        raw_base_amount = get_base_value(
            entry,
            "paid_amount",
            "base_paid_amount",
            entry_rate,
        )

        multiplier = -1 if entry.get("payment_type") == "Pay" else 1
        amount = multiplier * abs(raw_amount)
        base_amount = multiplier * abs(raw_base_amount)

        if entry.get("payment_type") == "Pay":
            change_row = overpayment_change_totals_by_currency.setdefault(
                payment_currency,
                {
                    "currency": payment_currency,
                    "total": 0,
                    "company_currency_total": 0,
                    "exchange_rates": set(),
                },
            )
            refund_amount = abs(raw_amount)
            refund_base_amount = abs(raw_base_amount)
            change_row["total"] += refund_amount
            change_row["company_currency_total"] += refund_base_amount
            overpayment_change_company_currency_total += refund_base_amount

            total_change_entry = total_change_totals_by_currency.setdefault(
                payment_currency,
                {
                    "currency": payment_currency,
                    "total": 0,
                    "company_currency_total": 0,
                    "exchange_rates": set(),
                },
            )
            total_change_entry["total"] += refund_amount
            total_change_entry["company_currency_total"] += refund_base_amount

            if payment_currency != company_currency:
                rate = None
                if refund_amount:
                    rate = abs(refund_base_amount) / abs(refund_amount) if refund_base_amount else None
                if not rate and entry_rate:
                    rate = flt(entry_rate)
                if rate:
                    change_row["exchange_rates"].add(rate)
                    total_change_entry["exchange_rates"].add(rate)

        references = references_by_entry.get(entry.get("name")) or []
        allocated_amount_sum = 0
        allocated_base_sum = 0

        if references:
            for reference in references:
                allocated_amount = multiplier * abs(flt(reference.get("allocated_amount") or 0))
                if not allocated_amount:
                    continue

                allocated_base = multiplier * abs(reference_base_amount(reference, entry_rate))
                allocated_amount_sum += allocated_amount
                allocated_base_sum += allocated_base

                reference_doctype = reference.get("reference_doctype")
                reference_name = reference.get("reference_name")
                belongs_to_shift = False
                if reference_doctype and reference_name:
                    belongs_to_shift = reference_belongs_to_shift(
                        reference_doctype,
                        reference_name,
                    )

                rate = reference.get("exchange_rate") or entry_rate

                accumulate_payment(
                    payments_by_mode,
                    mode,
                    payment_currency,
                    allocated_amount,
                    allocated_base,
                    rate,
                )

        residual_amount = amount - allocated_amount_sum
        residual_base = base_amount - allocated_base_sum

        unallocated_amount = entry.get("unallocated_amount")
        if unallocated_amount not in (None, ""):
            residual_amount = multiplier * abs(flt(unallocated_amount))
            residual_base = multiplier * abs(
                get_base_value(
                    entry,
                    "unallocated_amount",
                    "base_unallocated_amount",
                    entry_rate,
                )
            )

        if abs(residual_amount) > 0.0001 or abs(residual_base) > 0.0001:
            accumulate_payment(
                payments_by_mode,
                mode,
                payment_currency,
                residual_amount,
                residual_base,
                entry_rate,
            )

    if cash_mode_of_payment:
        for row in payments_by_mode.values():
            if row["mode_of_payment"] != cash_mode_of_payment:
                continue

            overpayment_change_row = overpayment_change_totals_by_currency.get(row["currency"])
            if overpayment_change_row:
                row["total"] -= flt(overpayment_change_row.get("total"))

                base_overpayment_change = overpayment_change_row.get("company_currency_total")
                if base_overpayment_change:
                    row["company_currency_total"] -= flt(base_overpayment_change)

    cash_expected_totals = []
    cash_expected_company_currency_total = 0
    if cash_mode_of_payment:
        for row in payments_by_mode.values():
            if row["mode_of_payment"] == cash_mode_of_payment:
                cash_expected_totals.append(
                    {
                        "currency": row["currency"],
                        "total": flt(row["total"]),
                        "company_currency_total": flt(row["company_currency_total"]),
                        "exchange_rates": sorted(
                            {flt(rate) for rate in (row.get("exchange_rates") or []) if flt(rate)}
                        ),
                    },
                )
                cash_expected_company_currency_total += flt(row["company_currency_total"])

    average_invoice_value = 0
    if sale_invoices_count:
        average_invoice_value = gross_company_currency_total / sale_invoices_count

    def prepare_currency_rows(container, include_count=False):
        output = []
        for row in container.values():
            exchange_rates = row.get("exchange_rates") or []
            if isinstance(exchange_rates, set):
                exchange_rates = sorted({flt(rate) for rate in exchange_rates if flt(rate)})
            else:
                exchange_rates = [
                    flt(rate) for rate in exchange_rates if rate not in (None, "") and flt(rate)
                ]
                exchange_rates = sorted(set(exchange_rates))

            record = {
                "currency": row.get("currency"),
                "total": flt(row.get("total")),
                "company_currency_total": flt(row.get("company_currency_total")),
                "exchange_rates": exchange_rates,
            }
            if include_count:
                record["invoice_count"] = row.get("invoice_count", 0)
            output.append(record)
        return sorted(output, key=lambda r: (r.get("currency") or ""))

    def prepare_payment_rows(container):
        output = []
        for row in container.values():
            exchange_rates = row.get("exchange_rates") or []
            if isinstance(exchange_rates, set):
                exchange_rates = sorted({flt(rate) for rate in exchange_rates if flt(rate)})
            else:
                exchange_rates = [
                    flt(rate) for rate in exchange_rates if rate not in (None, "") and flt(rate)
                ]
                exchange_rates = sorted(set(exchange_rates))

            output.append(
                {
                    "mode_of_payment": row.get("mode_of_payment"),
                    "currency": row.get("currency"),
                    "total": flt(row.get("total")),
                    "company_currency_total": flt(row.get("company_currency_total")),
                    "exchange_rates": exchange_rates,
                }
            )

        output.sort(key=lambda r: (r.get("mode_of_payment") or "", r.get("currency") or ""))
        return output

    return {
        "total_invoices": total_invoices,
        "company_currency": company_currency,
        "company_currency_total": flt(company_currency_total),
        "multi_currency_totals": prepare_currency_rows(multi_currency_totals, include_count=True),
        "payments_by_mode": prepare_payment_rows(payments_by_mode),
        "credit_invoices": {
            "count": credit_invoices_count,
            "company_currency_total": flt(credit_company_currency_total),
            "by_currency": prepare_currency_rows(credit_totals_by_currency, include_count=True),
        },
        "sales_summary": {
            "gross_company_currency_total": flt(gross_company_currency_total),
            "net_company_currency_total": flt(company_currency_total),
            "average_invoice_value": flt(average_invoice_value),
            "sale_invoices_count": sale_invoices_count,
        },
        "returns": {
            "count": returns_count,
            "company_currency_total": flt(returns_company_currency_total),
            "by_currency": prepare_currency_rows(returns_totals_by_currency, include_count=True),
        },
        "change_returned": {
            "company_currency_total": flt(
                change_company_currency_total + overpayment_change_company_currency_total
            ),
            "by_currency": prepare_currency_rows(total_change_totals_by_currency),
            "invoice_change": {
                "company_currency_total": flt(change_company_currency_total),
                "by_currency": prepare_currency_rows(change_totals_by_currency),
            },
            "overpayment_change": {
                "company_currency_total": flt(overpayment_change_company_currency_total),
                "by_currency": prepare_currency_rows(overpayment_change_totals_by_currency),
            },
        },
        "cash_expected": {
            "mode_of_payment": cash_mode_of_payment,
            "company_currency_total": flt(cash_expected_company_currency_total),
            "by_currency": sorted(
                cash_expected_totals,
                key=lambda row: (row.get("currency") or ""),
            ),
        },
    }


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

    company_currency = frappe.get_cached_value("Company", closing_shift.company, "default_currency")

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
        conversion_rate = d.get("conversion_rate")
        pos_transactions.append(
            frappe._dict(
                {
                    invoice_field: d.name,
                    "posting_date": d.posting_date,
                    "grand_total": get_base_value(d, "grand_total", "base_grand_total", conversion_rate),
                    "transaction_currency": d.get("currency") or company_currency,
                    "transaction_amount": flt(d.get("grand_total")),
                    "customer": d.customer,
                }
            )
        )
        base_grand_total = get_base_value(d, "grand_total", "base_grand_total", conversion_rate)
        base_net_total = get_base_value(d, "net_total", "base_net_total", conversion_rate)
        closing_shift.grand_total += base_grand_total
        closing_shift.net_total += base_net_total
        closing_shift.total_quantity += flt(d.total_qty)

        for t in d.taxes:
            existing_tax = [tx for tx in taxes if tx.account_head == t.account_head and tx.rate == t.rate]
            if existing_tax:
                existing_tax[0].amount += get_base_value(
                    t, "tax_amount", "base_tax_amount", d.get("conversion_rate")
                )
            else:
                taxes.append(
                    frappe._dict(
                        {
                            "account_head": t.account_head,
                            "rate": t.rate,
                            "amount": get_base_value(
                                t, "tax_amount", "base_tax_amount", d.get("conversion_rate")
                            ),
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
                conversion_rate = d.get("conversion_rate")
                if existing_pay[0].mode_of_payment == cash_mode_of_payment:
                    amount = get_base_value(p, "amount", "base_amount", conversion_rate) - get_base_value(
                        d, "change_amount", "base_change_amount", conversion_rate
                    )
                else:
                    amount = get_base_value(p, "amount", "base_amount", conversion_rate)
                existing_pay[0].expected_amount += flt(amount)
            else:
                payments.append(
                    frappe._dict(
                        {
                            "mode_of_payment": p.mode_of_payment,
                            "opening_amount": 0,
                            "expected_amount": get_base_value(
                                p, "amount", "base_amount", d.get("conversion_rate")
                            ),
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
        multiplier = -1 if py.payment_type == "Pay" else 1
        signed_amount = multiplier * abs(get_base_value(py, "paid_amount", "base_paid_amount"))
        if existing_pay:
            existing_pay[0].expected_amount += signed_amount
        else:
            payments.append(
                frappe._dict(
                    {
                        "mode_of_payment": py.mode_of_payment,
                        "opening_amount": 0,
                        "expected_amount": signed_amount,
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
