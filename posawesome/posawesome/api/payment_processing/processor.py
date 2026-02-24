import frappe
import json
from frappe import _
from frappe.utils import nowdate, flt, fmt_money, cint, cstr, escape_html
from erpnext.accounts.party import get_party_account
from erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation import reconcile_dr_cr_note
from erpnext.accounts.utils import reconcile_against_document
from posawesome.posawesome.api.m_pesa import submit_mpesa_payment
from posawesome.posawesome.api.payment_processing.creation import create_payment_entry
from posawesome.posawesome.api.payment_processing.data import get_outstanding_invoices


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _assert_pos_profile_access(profile_name):
    profile_name = cstr(profile_name).strip()
    if not profile_name:
        frappe.throw(_("POS Profile is required"))

    profile_doc = frappe.get_doc("POS Profile", profile_name)
    if profile_doc.disabled:
        frappe.throw(_("POS Profile {0} is disabled.").format(profile_doc.name))

    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": profile_doc.name, "user": frappe.session.user},
    )
    has_explicit_assignments = frappe.db.exists("POS Profile User", {"parent": profile_doc.name})
    if has_explicit_assignments and not has_access and not _can_manage_all_pos_profiles():
        frappe.throw(_("You are not assigned to POS Profile {0}.").format(profile_doc.name))

    return profile_doc


def _assert_opening_shift_access(shift_name, profile_name=None):
    if not shift_name:
        frappe.throw(_("POS Opening Shift is required"))

    shift = frappe.get_doc("POS Opening Shift", shift_name)
    if shift.status != "Open":
        frappe.throw(_("POS Opening Shift {0} is not open.").format(shift.name))

    if profile_name and shift.pos_profile != profile_name:
        frappe.throw(_("POS Opening Shift {0} is not for POS Profile {1}.").format(shift.name, profile_name))

    if shift.user != frappe.session.user and not _can_manage_all_pos_profiles():
        frappe.throw(_("You are not allowed to use POS Opening Shift {0}.").format(shift.name))

    return shift


def _safe_html(value):
    return escape_html(cstr(value or ""))


@frappe.whitelist()
def process_pos_payment(payload):
    data = json.loads(payload) if isinstance(payload, str) else payload
    if not isinstance(data, dict):
        frappe.throw(_("Invalid payment payload"))
    data = frappe._dict(data)

    # Log short summary only to avoid truncation
    frappe.log_error(
        f"Payment request from {data.customer} for {data.total_payment_methods} amount with {len(data.selected_invoices)} invoices",
        "POS Payment Debug",
    )

    # validate data
    if not data.customer:
        frappe.throw(_("Customer is required"))
    if not data.company:
        frappe.throw(_("Company is required"))
    if not data.currency:
        frappe.throw(_("Currency is required"))
    if not data.pos_profile_name:
        frappe.throw(_("POS Profile is required"))
    if not data.pos_opening_shift_name:
        frappe.throw(_("POS Opening Shift is required"))

    profile_doc = _assert_pos_profile_access(data.pos_profile_name)
    _assert_opening_shift_access(data.pos_opening_shift_name, profile_doc.name)

    if not cint(profile_doc.get("posa_use_pos_awesome_payments")):
        frappe.throw(_("POS Awesome Payments is not enabled for this POS Profile"))

    if data.company and profile_doc.company and data.company != profile_doc.company:
        frappe.throw(_("Company mismatch with selected POS Profile."))

    company = data.company or profile_doc.company
    currency = data.currency
    customer = data.customer
    pos_opening_shift_name = data.pos_opening_shift_name
    allow_make_new_payments = cint(profile_doc.get("posa_allow_make_new_payments"))
    allow_reconcile_payments = cint(profile_doc.get("posa_allow_reconcile_payments"))
    allow_mpesa_reconcile_payments = cint(profile_doc.get("posa_allow_mpesa_reconcile_payments"))
    today = nowdate()

    # prepare invoice list once so allocations can update remaining amounts
    remaining_invoices = []

    def add_remaining_invoices(invoices):
        for invoice in invoices or []:
            invoice_name = invoice.get("voucher_no") or invoice.get("name")
            voucher_type = invoice.get("voucher_type") or "Sales Invoice"
            if not invoice_name:
                continue
            outstanding = flt(invoice.get("outstanding_amount"))
            if outstanding <= 0 and voucher_type == "Sales Invoice":
                try:
                    si = frappe.get_doc("Sales Invoice", invoice_name)
                    outstanding = flt(si.outstanding_amount)
                except Exception:
                    outstanding = 0
            if outstanding <= 0:
                continue
            remaining_invoices.append(
                {
                    "name": invoice_name,
                    "outstanding_amount": outstanding,
                    "voucher_type": voucher_type,
                }
            )

    add_remaining_invoices(data.selected_invoices)

    should_auto_fetch_invoices = (
        allow_reconcile_payments
        and len(remaining_invoices) == 0
        and (
            (len(data.payment_methods) > 0 and flt(data.total_payment_methods) > 0)
            or (len(data.selected_payments) > 0 and flt(data.total_selected_payments) > 0)
            or (
                len(data.selected_mpesa_payments) > 0
                and flt(data.total_selected_mpesa_payments) > 0
            )
        )
    )

    if should_auto_fetch_invoices:
        auto_invoices = get_outstanding_invoices(
            customer=customer,
            company=company,
            currency=currency,
            pos_profile=data.pos_profile_name,
            include_all_currencies=False,
        )
        add_remaining_invoices(auto_invoices)

    new_payments_entry = []
    all_payments_entry = []
    reconciled_payments = []
    errors = []

    # first process mpesa payments
    if (
        allow_mpesa_reconcile_payments
        and len(data.selected_mpesa_payments) > 0
        and data.total_selected_mpesa_payments > 0
    ):
        for mpesa_payment in data.selected_mpesa_payments:
            try:
                new_mpesa_payment = submit_mpesa_payment(mpesa_payment.get("name"), customer)
                new_payments_entry.append(new_mpesa_payment)
                all_payments_entry.append(new_mpesa_payment)
            except Exception as e:
                errors.append(str(e))

    # then reconcile selected payments with invoices
    if allow_reconcile_payments and len(data.selected_payments) > 0 and data.total_selected_payments > 0:
        for pay in data.selected_payments:
            payment_name = pay.get("name")
            is_credit_note = cint(pay.get("is_credit_note")) or pay.get("voucher_type") == "Sales Invoice"

            if is_credit_note:
                try:
                    credit_note_doc = frappe.get_doc("Sales Invoice", payment_name)
                    outstanding_credit = abs(flt(credit_note_doc.outstanding_amount))
                    if outstanding_credit <= 0:
                        errors.append(_("Credit note {0} is already fully allocated").format(payment_name))
                        continue

                    total_outstanding = sum(inv["outstanding_amount"] for inv in remaining_invoices)
                    if total_outstanding <= 0:
                        errors.append(
                            _("No outstanding invoices available for allocation of credit note {0}").format(
                                payment_name
                            )
                        )
                        continue

                    remaining_credit = outstanding_credit
                    note_entries = []
                    cost_center = getattr(credit_note_doc, "cost_center", None)
                    if not cost_center:
                        try:
                            cost_center = (
                                credit_note_doc.items[0].cost_center if credit_note_doc.items else None
                            )
                        except Exception:
                            cost_center = None

                    receivable_account = credit_note_doc.debit_to or get_party_account(
                        "Customer", customer, company
                    )

                    for inv in remaining_invoices:
                        if remaining_credit <= 0:
                            break
                        if inv["outstanding_amount"] <= 0:
                            continue

                        allocation = min(remaining_credit, inv["outstanding_amount"])
                        if allocation <= 0:
                            continue

                        note_entries.append(
                            frappe._dict(
                                {
                                    "voucher_type": "Sales Invoice",
                                    "voucher_no": payment_name,
                                    "voucher_detail_no": None,
                                    "against_voucher_type": inv.get("voucher_type") or "Sales Invoice",
                                    "against_voucher": inv["name"],
                                    "account": receivable_account,
                                    "party_type": "Customer",
                                    "party": customer,
                                    "dr_or_cr": "credit_in_account_currency",
                                    "unreconciled_amount": remaining_credit,
                                    "unadjusted_amount": outstanding_credit,
                                    "allocated_amount": allocation,
                                    "difference_amount": 0,
                                    "difference_account": None,
                                    "difference_posting_date": None,
                                    "exchange_rate": flt(credit_note_doc.conversion_rate) or 1,
                                    "debit_or_credit_note_posting_date": credit_note_doc.posting_date,
                                    "cost_center": cost_center,
                                    "currency": credit_note_doc.currency or currency,
                                }
                            )
                        )

                        inv["outstanding_amount"] -= allocation
                        remaining_credit -= allocation

                    allocated_credit = outstanding_credit - remaining_credit
                    if allocated_credit <= 0:
                        errors.append(_("No allocation made for credit note {0}").format(payment_name))
                        continue

                    reconcile_dr_cr_note(note_entries, company)

                    reconciled_payments.append(
                        {
                            "payment_entry": payment_name,
                            "allocated_amount": allocated_credit,
                        }
                    )
                    all_payments_entry.append(credit_note_doc)

                    if remaining_credit > 0:
                        errors.append(
                            _("Credit note {0} still has an unapplied balance of {1}").format(
                                payment_name,
                                fmt_money(remaining_credit, currency=credit_note_doc.currency or currency),
                            )
                        )

                except Exception as e:
                    errors.append(str(e))
                    frappe.log_error(
                        f"Error allocating credit note {payment_name}: {str(e)}",
                        "POS Payment Error",
                    )
                continue

            try:
                pe_doc = frappe.get_doc("Payment Entry", payment_name)
                unallocated = flt(pe_doc.unallocated_amount)
                if unallocated <= 0:
                    errors.append(_("Payment {0} is already fully allocated").format(payment_name))
                    continue

                total_outstanding = sum(inv["outstanding_amount"] for inv in remaining_invoices)
                if total_outstanding <= 0:
                    errors.append(
                        _("No outstanding invoices available for allocation of payment {0}").format(
                            payment_name
                        )
                    )
                    continue

                if unallocated > total_outstanding:
                    errors.append(
                        _("Allocation amount for payment {0} exceeds outstanding invoices").format(
                            payment_name
                        )
                    )
                    continue

                entry_list = []
                remaining_amount = unallocated
                for inv in remaining_invoices:
                    if remaining_amount <= 0:
                        break
                    if inv["outstanding_amount"] <= 0:
                        continue
                    allocation = min(remaining_amount, inv["outstanding_amount"])
                    if allocation <= 0:
                        continue
                    outstanding_before = inv["outstanding_amount"]
                    entry_list.append(
                        frappe._dict(
                            {
                                "voucher_type": "Payment Entry",
                                "voucher_no": payment_name,
                                "voucher_detail_no": None,
                                "against_voucher_type": inv.get("voucher_type") or "Sales Invoice",
                                "against_voucher": inv["name"],
                                "account": pe_doc.paid_from,
                                "party_type": "Customer",
                                "party": customer,
                                "dr_or_cr": "credit_in_account_currency",
                                "unreconciled_amount": unallocated,
                                "unadjusted_amount": unallocated,
                                "allocated_amount": allocation,
                                "grand_total": outstanding_before,
                                "outstanding_amount": outstanding_before,
                                "exchange_rate": 1,
                                "is_advance": 0,
                                "difference_amount": 0,
                                "cost_center": pe_doc.cost_center,
                            }
                        )
                    )
                    inv["outstanding_amount"] -= allocation
                    remaining_amount -= allocation

                total_allocated = unallocated - remaining_amount
                if total_allocated <= 0:
                    errors.append(_("No allocation made for payment {0}").format(payment_name))
                    continue

                reconcile_against_document(entry_list)

                pe_doc.reload()

                allocated_after = unallocated - flt(pe_doc.unallocated_amount)
                reconciled_payments.append(
                    {
                        "payment_entry": payment_name,
                        "allocated_amount": allocated_after,
                    }
                )
                all_payments_entry.append(pe_doc)
            except Exception as e:
                errors.append(str(e))
                frappe.log_error(
                    f"Error allocating payment {payment_name}: {str(e)}",
                    "POS Payment Error",
                )

    # then process the new payments and allocate invoices
    if allow_make_new_payments and len(data.payment_methods) > 0 and data.total_payment_methods > 0:
        for payment_method in data.payment_methods:
            try:
                amount = flt(payment_method.get("amount"))
                if not amount:
                    continue
                mode_of_payment = payment_method.get("mode_of_payment")
                payment_entry = create_payment_entry(
                    company=company,
                    customer=customer,
                    currency=currency,
                    amount=amount,
                    mode_of_payment=mode_of_payment,
                    exchange_rate=data.get("exchange_rate"),
                    posting_date=today,
                    reference_no=pos_opening_shift_name,
                    reference_date=today,
                    cost_center=profile_doc.get("cost_center"),
                    submit=0,
                )

                remaining_amount = amount
                allocated_amount = 0
                for inv in remaining_invoices:
                    if remaining_amount <= 0:
                        break
                    if inv["outstanding_amount"] <= 0:
                        continue
                    allocation = min(remaining_amount, inv["outstanding_amount"])
                    if allocation <= 0:
                        continue
                    payment_entry.append(
                        "references",
                        {
                            "reference_doctype": inv.get("voucher_type") or "Sales Invoice",
                            "reference_name": inv["name"],
                            "total_amount": inv["outstanding_amount"],
                            "outstanding_amount": inv["outstanding_amount"],
                            "allocated_amount": allocation,
                        },
                    )
                    inv["outstanding_amount"] -= allocation
                    remaining_amount -= allocation
                    allocated_amount += allocation

                payment_entry.total_allocated_amount = allocated_amount
                payment_entry.unallocated_amount = payment_entry.paid_amount - allocated_amount
                payment_entry.difference_amount = payment_entry.paid_amount - allocated_amount

                payment_entry.save(ignore_permissions=True)
                payment_entry.submit()

                new_payments_entry.append(payment_entry)
                all_payments_entry.append(payment_entry)
            except Exception as e:
                errors.append(str(e))
                frappe.log_error(f"Error creating payment entry: {str(e)}", "POS Payment Error")

    # Old allocation logic disabled
    # then show the results
    msg = ""
    if len(new_payments_entry) > 0:
        msg += "<h4>New Payments</h4>"
        msg += "<table class='table table-bordered'>"
        msg += "<thead><tr><th>Payment Entry</th><th>Amount</th></tr></thead>"
        msg += "<tbody>"
        for payment_entry in new_payments_entry:
            msg += "<tr><td>{0}</td><td>{1}</td></tr>".format(
                _safe_html(payment_entry.get("name")),
                _safe_html(payment_entry.get("paid_amount") or payment_entry.get("amount")),
            )
        msg += "</tbody>"
        msg += "</table>"
    if len(reconciled_payments) > 0:
        msg += "<h4>Reconciled Payments</h4>"
        msg += "<table class='table table-bordered'>"
        msg += "<thead><tr><th>Payment Entry</th><th>Allocated</th></tr></thead>"
        msg += "<tbody>"
        for payment in reconciled_payments:
            msg += "<tr><td>{0}</td><td>{1}</td></tr>".format(
                _safe_html(payment.get("payment_entry")),
                _safe_html(payment.get("allocated_amount")),
            )
        msg += "</tbody>"
        msg += "</table>"
    if len(errors) > 0:
        msg += "<h4>Errors</h4>"
        msg += "<table class='table table-bordered'>"
        msg += "<thead><tr><th>Error</th></tr></thead>"
        msg += "<tbody>"
        for error in errors:
            msg += "<tr><td>{0}</td></tr>".format(_safe_html(error))
        msg += "</tbody>"
        msg += "</table>"
    if len(msg) > 0:
        frappe.msgprint(msg)

    return {
        "new_payments_entry": new_payments_entry,
        "all_payments_entry": all_payments_entry,
        "reconciled_payments": reconciled_payments,
        "errors": errors,
    }
