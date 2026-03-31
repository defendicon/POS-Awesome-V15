import frappe
from frappe import _
from frappe.utils import nowdate, getdate, flt, fmt_money, cint
from erpnext.accounts.party import get_party_account
from erpnext.accounts.utils import reconcile_against_document
from erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation import reconcile_dr_cr_note
from posawesome.posawesome.api.payment_processing.data import (
    get_outstanding_invoices,
    get_unallocated_payments
)

@frappe.whitelist()
def auto_reconcile_customer_invoices(customer, company, currency=None, pos_profile=None, party_type="Customer"):
    """Automatically reconcile all unallocated payments against outstanding invoices for a customer.

    Fetch all outstanding invoices and available payments, then allocate them in
    chronological order until either side is exhausted. The function returns a
    summary describing the work that was performed so the client can refresh its
    UI accordingly.
    """

    if not customer:
        frappe.throw(_("Customer is required"))
    if not company:
        frappe.throw(_("Company is required"))

    outstanding_invoices = get_outstanding_invoices(
        customer=customer,
        company=company,
        currency=currency,
        pos_profile=pos_profile,
        party_type=party_type,
    )

    unallocated_payments = get_unallocated_payments(
        customer=customer,
        company=company,
        currency=currency,
        party_type=party_type,
    )

    if not outstanding_invoices:
        return {
            "summary": _("No outstanding invoices were found for {0}.").format(customer),
            "allocations": [],
            "skipped_payments": [],
            "total_allocated": 0,
            "remaining_outstanding": 0,
            "outstanding_count": 0,
            "processed_payments": len(unallocated_payments or []),
            "reconciled_payments": 0,
        }

    if not unallocated_payments:
        total_outstanding = sum(flt(inv.get("outstanding_amount") or 0) for inv in outstanding_invoices)
        outstanding_count = len(outstanding_invoices)
        return {
            "summary": _("No unallocated payments were available for reconciliation."),
            "allocations": [],
            "skipped_payments": [],
            "total_allocated": 0,
            "remaining_outstanding": total_outstanding,
            "outstanding_count": outstanding_count,
            "processed_payments": 0,
            "reconciled_payments": 0,
        }

    # Sort invoices by posting date (oldest first) to keep allocations predictable.
    outstanding_invoices = sorted(
        outstanding_invoices,
        key=lambda inv: (
            getdate(inv.get("posting_date")) if inv.get("posting_date") else getdate(nowdate()),
            (
                getdate(inv.get("due_date"))
                if inv.get("due_date")
                else getdate(inv.get("posting_date") or nowdate())
            ),
            inv.get("voucher_no"),
        ),
    )

    # Sort payments oldest first so that earlier payments are consumed before newer ones
    unallocated_payments = sorted(
        unallocated_payments,
        key=lambda pay: (
            getdate(pay.get("posting_date")) if pay.get("posting_date") else getdate(nowdate()),
            pay.get("name"),
        ),
    )

    allocations = []
    skipped_payments = []
    total_allocated = 0

    def _restore_outstandings(invoice_allocs):
        # Helper to restore outstanding amounts if allocation fails mid-way
        for alloc in invoice_allocs:
            for invoice in outstanding_invoices:
                if invoice.get("voucher_no") == alloc.get("invoice"):
                    invoice["outstanding_amount"] = flt(invoice.get("outstanding_amount") or 0) + flt(
                        alloc.get("amount") or 0
                    )

    for payment in unallocated_payments:
        payment_name = payment.get("name")
        if cint(payment.get("is_credit_note")) or payment.get("voucher_type") == "Sales Invoice":
            try:
                credit_note_doc = frappe.get_doc("Sales Invoice", payment_name)
            except Exception as exc:
                skipped_payments.append(
                    _("Unable to load Credit Note {0}: {1}").format(payment_name, frappe._(str(exc)))
                )
                continue

            outstanding_credit = abs(flt(credit_note_doc.get("outstanding_amount")))
            if outstanding_credit <= 0:
                skipped_payments.append(
                    _("Credit Note {0} has no remaining balance to allocate.").format(payment_name)
                )
                continue

            remaining_credit = outstanding_credit
            note_entries = []
            invoice_allocations = []

            receivable_account = credit_note_doc.get("debit_to") or get_party_account(
                "Customer", customer, company
            )
            cost_center = getattr(credit_note_doc, "cost_center", None)
            if not cost_center:
                try:
                    cost_center = credit_note_doc.items[0].cost_center if credit_note_doc.items else None
                except Exception:
                    cost_center = None

            for invoice in outstanding_invoices:
                if remaining_credit <= 0:
                    break

                outstanding = flt(invoice.get("outstanding_amount"))
                if outstanding <= 0:
                    continue

                allocation = min(remaining_credit, outstanding)
                if allocation <= 0:
                    continue

                note_entries.append(
                    frappe._dict(
                        {
                            "voucher_type": "Sales Invoice",
                            "voucher_no": payment_name,
                            "voucher_detail_no": None,
                            "against_voucher_type": invoice.get("voucher_type") or "Sales Invoice",
                            "against_voucher": invoice.get("voucher_no"),
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
                            "exchange_rate": flt(credit_note_doc.get("conversion_rate")) or 1,
                            "debit_or_credit_note_posting_date": credit_note_doc.get("posting_date"),
                            "cost_center": cost_center,
                            "currency": credit_note_doc.get("currency") or currency,
                        }
                    )
                )

                invoice_allocations.append(
                    {
                        "invoice": invoice.get("voucher_no"),
                        "amount": allocation,
                    }
                )

                invoice["outstanding_amount"] = outstanding - allocation
                remaining_credit -= allocation

            if not note_entries:
                skipped_payments.append(
                    _("No outstanding invoices were available to reconcile Credit Note {0}.").format(
                        payment_name
                    )
                )
                continue

            try:
                reconcile_dr_cr_note(note_entries, company)
            except Exception as exc:
                _restore_outstandings(invoice_allocations)
                skipped_payments.append(
                    _("Failed to reconcile Credit Note {0}: {1}").format(payment_name, frappe._(str(exc)))
                )
                frappe.log_error(
                    title="POS Auto Reconcile Error",
                    message=f"Failed to auto reconcile credit note {payment_name}: {str(exc)}",
                )
                continue

            allocated_credit = outstanding_credit - remaining_credit
            if allocated_credit <= 0:
                _restore_outstandings(invoice_allocations)
                skipped_payments.append(
                    _("No allocation was recorded for Credit Note {0}.").format(payment_name)
                )
                continue

            total_allocated += allocated_credit
            allocations.append(
                {
                    "payment_entry": payment_name,
                    "allocated_amount": allocated_credit,
                    "allocations": invoice_allocations,
                    "type": "Credit Note",
                }
            )
            continue

        if payment.get("voucher_type") == "Journal Entry":
            unallocated_before = flt(payment.get("unallocated_amount"))
            if unallocated_before <= 0:
                skipped_payments.append(
                    _("Journal Entry {0} has no unallocated amount remaining.").format(payment_name)
                )
                continue

            remaining_amount = unallocated_before
            entry_list = []
            invoice_allocations = []
            party_account = payment.get("account") or get_party_account(party_type, customer, company)
            dr_or_cr = (
                "credit_in_account_currency"
                if party_type == "Customer"
                else "debit_in_account_currency"
            )

            for invoice in outstanding_invoices:
                if remaining_amount <= 0:
                    break

                outstanding = flt(invoice.get("outstanding_amount"))
                if outstanding <= 0:
                    continue

                allocation = min(remaining_amount, outstanding)
                if allocation <= 0:
                    continue

                entry_list.append(
                    frappe._dict(
                        {
                            "voucher_type": "Journal Entry",
                            "voucher_no": payment_name,
                            "voucher_detail_no": payment.get("reference_row"),
                            "against_voucher_type": invoice.get("voucher_type") or "Sales Invoice",
                            "against_voucher": invoice.get("voucher_no"),
                            "account": party_account,
                            "party_type": party_type,
                            "party": customer,
                            "dr_or_cr": dr_or_cr,
                            "unreconciled_amount": unallocated_before,
                            "unadjusted_amount": unallocated_before,
                            "allocated_amount": allocation,
                            "grand_total": outstanding,
                            "outstanding_amount": outstanding,
                            "exchange_rate": flt(payment.get("exchange_rate")) or 1,
                            "is_advance": cint(payment.get("is_advance")),
                            "difference_amount": 0,
                            "cost_center": payment.get("cost_center"),
                        }
                    )
                )

                invoice_allocations.append(
                    {
                        "invoice": invoice.get("voucher_no"),
                        "amount": allocation,
                    }
                )

                invoice["outstanding_amount"] = outstanding - allocation
                remaining_amount -= allocation

            if not entry_list:
                skipped_payments.append(
                    _("No outstanding invoices were available to reconcile Journal Entry {0}.").format(
                        payment_name
                    )
                )
                continue

            try:
                reconcile_against_document(entry_list)
            except Exception as exc:
                _restore_outstandings(invoice_allocations)
                skipped_payments.append(
                    _("Failed to reconcile Journal Entry {0}: {1}").format(payment_name, frappe._(str(exc)))
                )
                frappe.log_error(
                    title="POS Auto Reconcile Error",
                    message=f"Failed to auto reconcile journal entry {payment_name}: {str(exc)}",
                )
                continue

            allocated_amount = flt(unallocated_before - remaining_amount)
            if allocated_amount <= 0:
                _restore_outstandings(invoice_allocations)
                skipped_payments.append(
                    _("No allocation was recorded for Journal Entry {0}.").format(payment_name)
                )
                continue

            total_allocated += allocated_amount
            allocations.append(
                {
                    "payment_entry": payment_name,
                    "allocated_amount": allocated_amount,
                    "allocations": invoice_allocations,
                    "type": "Journal Entry",
                }
            )
            continue

        try:
            pe_doc = frappe.get_doc("Payment Entry", payment_name)
        except Exception as exc:
            skipped_payments.append(
                _("Unable to load Payment Entry {0}: {1}").format(payment_name, frappe._(str(exc)))
            )
            continue

        # Some Payment Entries can still be allocatable from the fetched
        # reconciliation amount even when PE.unallocated_amount is zero.
        # Prefer the fetched row amount when available.
        unallocated_before = flt(payment.get("unallocated_amount")) or flt(pe_doc.get("unallocated_amount"))
        if unallocated_before <= 0:
            skipped_payments.append(
                _("Payment Entry {0} has no unallocated amount remaining.").format(payment_name)
            )
            continue

        remaining_amount = unallocated_before
        entry_list = []
        invoice_allocations = []

        for invoice in outstanding_invoices:
            if remaining_amount <= 0:
                break

            outstanding = flt(invoice.get("outstanding_amount"))
            if outstanding <= 0:
                continue

            allocation = min(remaining_amount, outstanding)
            if allocation <= 0:
                continue

            entry_list.append(
                frappe._dict(
                        {
                            "voucher_type": "Payment Entry",
                            "voucher_no": payment_name,
                            "voucher_detail_no": payment.get("reference_row"),
                            "against_voucher_type": invoice.get("voucher_type") or "Sales Invoice",
                            "against_voucher": invoice.get("voucher_no"),
                            "account": payment.get("account") or (
                                pe_doc.paid_to if party_type == "Supplier" else pe_doc.paid_from
                            ),
                            "party_type": party_type,
                            "party": customer,
                            "dr_or_cr": (
                                "credit_in_account_currency"
                                if party_type == "Customer"
                                else "debit_in_account_currency"
                            ),
                        "unreconciled_amount": unallocated_before,
                        "unadjusted_amount": unallocated_before,
                        "allocated_amount": allocation,
                        "grand_total": outstanding,
                        "outstanding_amount": outstanding,
                        "exchange_rate": 1,
                        "is_advance": 0,
                        "difference_amount": 0,
                        "cost_center": pe_doc.cost_center,
                    }
                )
            )

            invoice_allocations.append(
                {
                    "invoice": invoice.get("voucher_no"),
                    "amount": allocation,
                }
            )

            invoice["outstanding_amount"] = outstanding - allocation
            remaining_amount -= allocation

        if not entry_list:
            skipped_payments.append(
                _("No outstanding invoices were available to reconcile Payment Entry {0}.").format(
                    payment_name
                )
            )
            continue

        try:
            reconcile_against_document(entry_list)
        except Exception as exc:
            _restore_outstandings(invoice_allocations)
            skipped_payments.append(
                _("Failed to reconcile Payment Entry {0}: {1}").format(payment_name, frappe._(str(exc)))
            )
            frappe.log_error(
                title="POS Auto Reconcile Error",
                message=f"Failed to auto reconcile payment {payment_name}: {str(exc)}",
            )
            continue

        allocated_amount = flt(unallocated_before - remaining_amount)

        if allocated_amount <= 0:
            _restore_outstandings(invoice_allocations)
            skipped_payments.append(
                _("No allocation was recorded for Payment Entry {0}.").format(payment_name)
            )
            continue

        total_allocated += allocated_amount
        allocations.append(
            {
                "payment_entry": payment_name,
                "allocated_amount": allocated_amount,
                "allocations": invoice_allocations,
                "type": "Payment Entry",
            }
        )

    remaining_outstanding = sum(
        flt(inv.get("outstanding_amount") or 0)
        for inv in outstanding_invoices
        if flt(inv.get("outstanding_amount") or 0) > 0
    )
    outstanding_count = len(
        [inv for inv in outstanding_invoices if flt(inv.get("outstanding_amount") or 0) > 0]
    )

    summary_parts = []
    if total_allocated:
        summary_parts.append(
            _("Allocated {0} across {1} payment(s).").format(
                fmt_money(total_allocated, currency=currency), len(allocations)
            )
        )
    else:
        summary_parts.append(_("No allocations were made."))

    summary_parts.append(
        _("Remaining outstanding: {0} across {1} invoice(s).").format(
            fmt_money(remaining_outstanding, currency=currency), outstanding_count
        )
    )

    if skipped_payments:
        summary_parts.append(_("{0} payment(s) were skipped.").format(len(skipped_payments)))

    return {
        "summary": " ".join(summary_parts),
        "allocations": allocations,
        "skipped_payments": skipped_payments,
        "total_allocated": total_allocated,
        "remaining_outstanding": remaining_outstanding,
        "outstanding_count": outstanding_count,
        "processed_payments": len(unallocated_payments),
        "reconciled_payments": len(allocations),
    }
