import frappe
import json
from frappe import _
from frappe.utils import nowdate, flt, fmt_money, cint
from erpnext.accounts.party import get_party_account
from erpnext.accounts.doctype.payment_reconciliation.payment_reconciliation import reconcile_dr_cr_note
from erpnext.accounts.utils import get_account_currency, reconcile_against_document
from posawesome.posawesome.api.m_pesa import submit_mpesa_payment
from posawesome.posawesome.api.payment_processing.creation import create_payment_entry
from posawesome.posawesome.api.idempotency import (
    find_payment_entries_by_client_request_id,
    normalize_client_request_id,
)


def _amounts_match(left, right):
    return abs(flt(left) - flt(right)) < 0.0001


def _get_entry_amount(entry):
    return flt(entry.get("paid_amount")) or flt(entry.get("received_amount"))


def _get_value(source, key, default=None):
    if isinstance(source, dict):
        return source.get(key, default)

    getter = getattr(source, "get", None)
    if callable(getter):
        try:
            return getter(key, default)
        except TypeError:
            pass

    return getattr(source, key, default)


def _expected_lookup_errors():
    errors = [PermissionError]

    for attr_name in ("DoesNotExistError", "PermissionError"):
        error_type = getattr(frappe, attr_name, None)
        if isinstance(error_type, type) and error_type not in errors:
            errors.append(error_type)

    return tuple(errors)


def _to_public_entry(entry):
    return {
        "doctype": _get_value(entry, "doctype"),
        "name": _get_value(entry, "name"),
        "paid_amount": _get_value(entry, "paid_amount"),
        "received_amount": _get_value(entry, "received_amount"),
        "amount": _get_value(entry, "amount"),
        "posting_date": _get_value(entry, "posting_date"),
        "mode_of_payment": _get_value(entry, "mode_of_payment"),
        "party": _get_value(entry, "party"),
        "party_type": _get_value(entry, "party_type"),
        "docstatus": _get_value(entry, "docstatus"),
        "posa_client_request_id": _get_value(entry, "posa_client_request_id"),
        "unallocated_amount": _get_value(entry, "unallocated_amount"),
        "outstanding_amount": _get_value(entry, "outstanding_amount"),
    }


def _create_exchange_gain_loss_je(payment_entry, company, party_type, party, payment_type, difference, precision):
    existing = frappe.get_all(
        "Journal Entry",
        filters={
            "reference_type": "Payment Entry",
            "reference_name": payment_entry.name,
            "voucher_type": "Exchange Gain Or Loss",
            "is_system_generated": 1,
        },
        limit=1,
    )
    if existing:
        return

    company_defaults = frappe.get_cached_value(
        "Company", company, ("exchange_gain_loss_account", "cost_center"), as_dict=True
    )
    gain_loss_account = company_defaults.exchange_gain_loss_account
    cost_center = company_defaults.cost_center or payment_entry.cost_center

    if not gain_loss_account:
        frappe.log_error(f"No exchange_gain_loss_account set for company {company}", "POS Payment Error")
        return

    if abs(difference) < 0.01:
        return

    party_acct = payment_entry.paid_from if payment_type == "Receive" else payment_entry.paid_to
    party_acct_currency = get_account_currency(party_acct)
    gl_currency = get_account_currency(gain_loss_account) or party_acct_currency

    is_gain = (payment_type == "Receive" and difference > 0) or (payment_type == "Pay" and difference < 0)
    abs_diff = abs(difference)

    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Exchange Gain Or Loss"
    je.company = company
    je.posting_date = payment_entry.posting_date
    je.multi_currency = 0
    je.is_system_generated = 1

    if is_gain:
        je.append("accounts", {
            "account": party_acct,
            "party_type": party_type,
            "party": party,
            "debit_in_account_currency": abs_diff,
            "debit": abs_diff,
            "account_currency": party_acct_currency,
            "exchange_rate": 1,
            "reference_type": "Payment Entry",
            "reference_name": payment_entry.name,
            "cost_center": cost_center,
        })
        je.append("accounts", {
            "account": gain_loss_account,
            "credit_in_account_currency": abs_diff,
            "credit": abs_diff,
            "account_currency": gl_currency,
            "exchange_rate": 1,
            "cost_center": cost_center,
        })
    else:
        je.append("accounts", {
            "account": gain_loss_account,
            "debit_in_account_currency": abs_diff,
            "debit": abs_diff,
            "account_currency": gl_currency,
            "exchange_rate": 1,
            "cost_center": cost_center,
        })
        je.append("accounts", {
            "account": party_acct,
            "party_type": party_type,
            "party": party,
            "credit_in_account_currency": abs_diff,
            "credit": abs_diff,
            "account_currency": party_acct_currency,
            "exchange_rate": 1,
            "reference_type": "Payment Entry",
            "reference_name": payment_entry.name,
            "cost_center": cost_center,
        })

    je.save(ignore_permissions=True)
    je.submit()


def _to_public_entries(entries):
    return [_to_public_entry(entry) for entry in entries or []]


def _requested_reconciled_amount(payment):
    for fieldname in ("allocated_amount", "amount", "unallocated_amount", "outstanding_amount"):
        amount = abs(flt(payment.get(fieldname)))
        if amount > 0:
            return amount
    return 0


def _build_completed_reconciliation_summaries(selected_payments, completed_documents):
    completed_by_name = {
        _get_value(document, "name"): document
        for document in completed_documents or []
        if _get_value(document, "name")
    }
    summaries = []

    for payment in selected_payments or []:
        payment_name = payment.get("name")
        document = completed_by_name.get(payment_name)
        if not document:
            continue

        allocated_amount = _requested_reconciled_amount(payment)
        if (
            not allocated_amount
            and (_get_value(document, "doctype") == "Payment Entry" or payment.get("voucher_type") != "Sales Invoice")
        ):
            allocated_amount = max(
                flt(_get_value(document, "paid_amount")) - flt(_get_value(document, "unallocated_amount")),
                0,
            )

        summaries.append(
            {
                "payment_entry": payment_name,
                "allocated_amount": allocated_amount,
            }
        )

    return summaries


def _partition_payment_methods(existing_entries, payment_methods):
    unmatched_entries = list(existing_entries or [])
    matched_entries = []
    missing_payment_methods = []

    for payment_method in payment_methods or []:
        amount = flt(payment_method.get("amount"))
        if not amount:
            continue

        mode_of_payment = payment_method.get("mode_of_payment")
        matched_index = next(
            (
                index
                for index, entry in enumerate(unmatched_entries)
                if cint(entry.get("docstatus")) == 1
                and entry.get("mode_of_payment") == mode_of_payment
                and _amounts_match(_get_entry_amount(entry), amount)
            ),
            None,
        )

        if matched_index is None:
            missing_payment_methods.append(payment_method)
            continue

        matched_entries.append(unmatched_entries.pop(matched_index))

    return matched_entries, missing_payment_methods, unmatched_entries


def _partition_completed_mpesa_payments(selected_mpesa_payments, customer):
    completed_entries = []
    pending_payments = []
    lookup_errors = _expected_lookup_errors()

    for mpesa_payment in selected_mpesa_payments or []:
        payment_name = mpesa_payment.get("name")
        if not payment_name:
            pending_payments.append(mpesa_payment)
            continue

        try:
            mpesa_doc = frappe.get_doc("Mpesa Payment Register", payment_name)
            linked_customer = getattr(mpesa_doc, "customer", None)
            payment_entry_name = getattr(mpesa_doc, "payment_entry", None)
            if (
                cint(getattr(mpesa_doc, "docstatus", 0)) == 1
                and payment_entry_name
                and (not linked_customer or linked_customer == customer)
            ):
                completed_entries.append(frappe.get_doc("Payment Entry", payment_entry_name))
                continue
        except lookup_errors:
            pending_payments.append(mpesa_payment)
            continue
        except Exception as err:
            frappe.log_error(
                "Unexpected M-Pesa replay lookup failure for {0}: {1}\nContext: {2}".format(
                    payment_name,
                    str(err),
                    json.dumps(mpesa_payment, default=str),
                ),
                "POS Payment Replay Check Error",
            )
            raise

        pending_payments.append(mpesa_payment)

    return completed_entries, pending_payments


def _partition_completed_reconciliations(selected_payments):
    completed_docs = []
    pending_payments = []
    lookup_errors = _expected_lookup_errors()

    for payment in selected_payments or []:
        payment_name = payment.get("name")
        if not payment_name:
            pending_payments.append(payment)
            continue

        is_credit_note = cint(payment.get("is_credit_note")) or payment.get("voucher_type") == "Sales Invoice"
        doctype = "Sales Invoice" if is_credit_note else "Payment Entry"

        try:
            payment_doc = frappe.get_doc(doctype, payment_name)
            if is_credit_note:
                if _amounts_match(abs(flt(getattr(payment_doc, "outstanding_amount", 0))), 0):
                    completed_docs.append(payment_doc)
                    continue
            elif flt(getattr(payment_doc, "unallocated_amount", 0)) <= 0:
                completed_docs.append(payment_doc)
                continue
        except lookup_errors:
            pending_payments.append(payment)
            continue
        except Exception as err:
            frappe.log_error(
                "Unexpected payment replay lookup failure for {0}: {1}\nContext: {2}".format(
                    payment_name,
                    str(err),
                    json.dumps(payment, default=str),
                ),
                "POS Payment Replay Check Error",
            )
            raise

        pending_payments.append(payment)

    return completed_docs, pending_payments


@frappe.whitelist()
def process_pos_payment(payload):
    data = json.loads(payload)
    data = frappe._dict(data)
    client_request_id = normalize_client_request_id(data.get("client_request_id"))

    if not data.pos_profile.get("posa_use_pos_awesome_payments"):
        frappe.throw(_("POS Awesome Payments is not enabled for this POS Profile"))

    party = data.get("party") or data.get("customer")
    party_type = data.get("party_type") or "Customer"
    payment_type = data.get("payment_type") or "Receive"

    # validate data
    if not party:
        frappe.throw(_("Party is required"))
    if not data.company:
        frappe.throw(_("Company is required"))
    if not data.currency:
        frappe.throw(_("Currency is required"))
    if not data.pos_profile_name:
        frappe.throw(_("POS Profile is required"))
    if not data.pos_opening_shift_name:
        frappe.throw(_("POS Opening Shift is required"))

    company = data.company
    currency = data.currency
    customer = party
    pos_opening_shift_name = data.pos_opening_shift_name
    allow_make_new_payments = data.pos_profile.get("posa_allow_make_new_payments")
    allow_reconcile_payments = data.pos_profile.get("posa_allow_reconcile_payments")
    allow_mpesa_reconcile_payments = data.pos_profile.get("posa_allow_mpesa_reconcile_payments")
    posting_date = data.get("posting_date") or nowdate()
    selected_mpesa_payments = list(data.selected_mpesa_payments or [])
    selected_payments = list(data.selected_payments or [])
    payment_methods = list(data.payment_methods or [])
    existing_entries = find_payment_entries_by_client_request_id(client_request_id)
    matched_existing_entries, pending_payment_methods, unmatched_existing_entries = _partition_payment_methods(
        existing_entries,
        payment_methods,
    )
    draft_entries = [
        entry for entry in unmatched_existing_entries if cint(entry.get("docstatus")) == 0
    ]
    if draft_entries:
        draft_names = ", ".join(entry.get("name") for entry in draft_entries if entry.get("name"))
        frappe.throw(
            _("Payment request {0} has draft Payment Entry records pending review: {1}").format(
                client_request_id or _("unknown request"),
                draft_names or _("draft payment entries"),
            )
        )

    is_replay_attempt = bool(existing_entries)
    completed_mpesa_entries, pending_mpesa_payments = ([], [])
    if (
        is_replay_attempt
        and allow_mpesa_reconcile_payments
        and data.total_selected_mpesa_payments > 0
    ):
        completed_mpesa_entries, pending_mpesa_payments = _partition_completed_mpesa_payments(
            selected_mpesa_payments,
            customer,
        )
    else:
        pending_mpesa_payments = selected_mpesa_payments

    completed_reconciliations, pending_selected_payments = ([], [])
    if is_replay_attempt and allow_reconcile_payments and data.total_selected_payments > 0:
        completed_reconciliations, pending_selected_payments = _partition_completed_reconciliations(
            selected_payments
        )
    else:
        pending_selected_payments = selected_payments

    completed_reconciliation_summaries = _build_completed_reconciliation_summaries(
        selected_payments,
        completed_reconciliations,
    )
    cached_entries = list(matched_existing_entries) + completed_mpesa_entries + completed_reconciliations
    if (
        existing_entries
        and not pending_payment_methods
        and not unmatched_existing_entries
        and not pending_mpesa_payments
        and not pending_selected_payments
    ):
        return {
            "new_payments_entry": _to_public_entries(matched_existing_entries),
            "all_payments_entry": _to_public_entries(cached_entries),
            "reconciled_payments": completed_reconciliation_summaries,
            "errors": [],
            "replayed": True,
        }

    # prepare invoice list once so allocations can update remaining amounts
    remaining_invoices = []

    def add_remaining_invoices(invoices):
        for invoice in invoices or []:
            invoice_name = invoice.get("voucher_no") or invoice.get("name")
            voucher_type = invoice.get("voucher_type") or "Sales Invoice"
            if not invoice_name:
                continue
            outstanding = flt(invoice.get("outstanding_amount"))
            conversion_rate = flt(invoice.get("conversion_rate")) or 1
            if outstanding <= 0 and voucher_type == "Sales Invoice":
                try:
                    si = frappe.get_doc("Sales Invoice", invoice_name)
                    outstanding = flt(si.outstanding_amount)
                    conversion_rate = flt(si.conversion_rate) or 1
                    if conversion_rate > 0:
                        outstanding = flt(outstanding / conversion_rate, 2)
                except Exception:
                    outstanding = 0
            if outstanding <= 0:
                continue
            remaining_invoices.append(
                {
                    "name": invoice_name,
                    "outstanding_amount": outstanding,
                    "voucher_type": voucher_type,
                    "conversion_rate": conversion_rate,
                }
            )

    add_remaining_invoices(data.selected_invoices)

    new_payments_entry = []
    all_payments_entry = list(cached_entries)
    reconciled_payments = list(completed_reconciliation_summaries)
    errors = []

    # first process mpesa payments
    if (
        allow_mpesa_reconcile_payments
        and len(pending_mpesa_payments) > 0
        and data.total_selected_mpesa_payments > 0
    ):
        for mpesa_payment in pending_mpesa_payments:
            try:
                new_mpesa_payment = submit_mpesa_payment(mpesa_payment.get("name"), customer)
                new_payments_entry.append(new_mpesa_payment)
                all_payments_entry.append(new_mpesa_payment)
            except Exception as e:
                errors.append(str(e))

    # then reconcile selected payments with invoices
    if allow_reconcile_payments and len(pending_selected_payments) > 0 and data.total_selected_payments > 0:
        for pay in pending_selected_payments:
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
    if allow_make_new_payments and len(pending_payment_methods) > 0 and data.total_payment_methods > 0:
        for payment_method in pending_payment_methods:
            try:
                amount = flt(payment_method.get("amount"))
                if not amount:
                    continue
                mode_of_payment = payment_method.get("mode_of_payment")
                payment_entry = create_payment_entry(
                    company=company,
                    currency=currency,
                    amount=amount,
                    mode_of_payment=mode_of_payment,
                    customer=customer,
                    party=party,
                    party_type=party_type,
                    payment_type=payment_type,
                    exchange_rate=data.get("exchange_rate"),
                    posting_date=posting_date,
                    reference_no=data.get("reference_no") or pos_opening_shift_name,
                    reference_date=data.get("reference_date") or posting_date,
                    cost_center=data.pos_profile.get("cost_center"),
                    submit=0,
                    client_request_id=client_request_id,
                )

                party_account = get_party_account(party_type, party, company)
                party_account_currency = get_account_currency(party_account)

                first_inv = remaining_invoices[0] if remaining_invoices else {}
                exchange_rate_val = flt(data.get("exchange_rate", 1))
                precision = flt(frappe.db.get_default("currency_precision") or 2)

                bank_currency = (
                    payment_entry.paid_to_account_currency
                    if payment_type == "Receive"
                    else payment_entry.paid_from_account_currency
                )
                bank_amount = (
                    payment_entry.received_amount
                    if payment_type == "Receive"
                    else payment_entry.paid_amount
                )

                company_currency = frappe.get_cached_value("Company", company, "default_currency")

                # Convert bank amount to party currency ONCE
                if bank_currency == party_account_currency:
                    remaining_party = flt(bank_amount, precision)
                elif bank_currency == company_currency:
                    remaining_party = flt(bank_amount, precision)
                else:
                    bank_to_party = flt(get_exchange_rate(bank_currency, party_account_currency, posting_date), precision)
                    remaining_party = flt(bank_amount * bank_to_party, precision)

                total_allocated = 0

                for inv in remaining_invoices:
                    if remaining_party <= 0:
                        break
                    if inv["outstanding_amount"] <= 0:
                        continue

                    voucher_type = inv.get("voucher_type") or "Sales Invoice"

                    # Fetch from DB for accurate party-currency amounts (ERPNext pattern)
                    inv_doc = frappe.get_cached_doc(voucher_type, inv["name"])
                    inv_currency = inv_doc.currency
                    inv_conv_rate = flt(inv_doc.conversion_rate, 1)

                    # Get amounts in party account currency
                    if inv_currency == party_account_currency:
                        inv_outstanding_party = flt(inv_doc.outstanding_amount)
                        inv_total_party = flt(inv_doc.grand_total or inv_doc.rounded_total or inv_doc.outstanding_amount)
                    elif party_account_currency == company_currency:
                        inv_outstanding_party = flt(inv_doc.outstanding_amount * inv_conv_rate, precision)
                        inv_total_party = flt(inv_doc.base_rounded_total or inv_doc.base_grand_total or inv_outstanding_party)
                    else:
                        inv_to_party = flt(get_exchange_rate(inv_currency, party_account_currency, posting_date), precision)
                        comp_to_party = flt(get_exchange_rate(company_currency, party_account_currency, posting_date), precision)
                        inv_outstanding_party = flt(inv_doc.outstanding_amount * inv_to_party, precision)
                        inv_total_party = flt((inv_doc.base_rounded_total or inv_doc.base_grand_total) * comp_to_party, precision)

                    if inv_outstanding_party <= 0:
                        continue

                    allocation = min(remaining_party, inv_outstanding_party)

                    if allocation <= 0:
                        continue

                    payment_entry.append(
                        "references",
                        {
                            "reference_doctype": voucher_type,
                            "reference_name": inv["name"],
                            "total_amount": inv_total_party,
                            "outstanding_amount": inv_outstanding_party,
                            "allocated_amount": allocation,
                        },
                    )

                    remaining_party -= allocation
                    total_allocated = flt(total_allocated + allocation, precision)

                payment_entry.total_allocated_amount = total_allocated

                party_amount = (
                    payment_entry.paid_amount if payment_type == "Receive" else payment_entry.received_amount
                )
                payment_entry.unallocated_amount = flt(party_amount - total_allocated, precision)

                invoice_exchange_rate = flt(first_inv.get("conversion_rate", 0))
                ref_names = ", ".join(r.reference_name for r in payment_entry.references)
                verb = "received" if payment_type == "Receive" else "paid"
                party_label = "from" if payment_type == "Receive" else "to"
                party_label_amount = payment_entry.paid_amount if payment_type == "Receive" else payment_entry.received_amount
                invoice_type = "Sales Invoice" if payment_type == "Receive" else "Purchase Invoice"
                reference_no_str = data.get("reference_no") or pos_opening_shift_name
                reference_date_str = data.get("reference_date") or posting_date

                if invoice_exchange_rate and not _amounts_match(invoice_exchange_rate, exchange_rate_val):
                    rate_note = f"\nExchange Rate: 1 {bank_currency} = {exchange_rate_val} {party_account_currency}"
                else:
                    rate_note = ""

                payment_entry.remarks = (
                    f"Amount {bank_currency} {flt(bank_amount)} {verb} {party_label} {party}\n"
                    f"Transaction reference no {reference_no_str or ''} dated {reference_date_str or ''}\n"
                    f"Amount {party_account_currency} {flt(party_label_amount)} against {invoice_type} {ref_names}{rate_note}"
                )

                payment_entry.save(ignore_permissions=True)
                payment_entry.submit()

                difference = flt(payment_entry.base_paid_amount - payment_entry.base_total_allocated_amount, precision)
                if (
                    invoice_exchange_rate > 0
                    and not _amounts_match(invoice_exchange_rate, exchange_rate_val)
                    and abs(difference) >= 0.01
                ):
                    _create_exchange_gain_loss_je(
                        payment_entry=payment_entry,
                        company=company,
                        party_type=party_type,
                        party=party,
                        payment_type=payment_type,
                        difference=difference,
                        precision=precision,
                    )
                    payment_entry.reload()
                    for ref in payment_entry.references:
                        frappe.db.set_value("Payment Entry Reference", ref.name, "exchange_gain_loss", abs(difference))
                    frappe.db.set_value("Payment Entry", payment_entry.name, {
                        "unallocated_amount": 0,
                        "difference_amount": difference,
                    })

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
                payment_entry.get("name"),
                payment_entry.get("paid_amount") or payment_entry.get("amount"),
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
                payment.get("payment_entry"),
                payment.get("allocated_amount"),
            )
        msg += "</tbody>"
        msg += "</table>"
    if len(errors) > 0:
        msg += "<h4>Errors</h4>"
        msg += "<table class='table table-bordered'>"
        msg += "<thead><tr><th>Error</th></tr></thead>"
        msg += "<tbody>"
        for error in errors:
            msg += "<tr><td>{0}</td></tr>".format(error)
        msg += "</tbody>"
        msg += "</table>"
    if len(msg) > 0:
        frappe.msgprint(msg)

    return {
        "new_payments_entry": _to_public_entries(new_payments_entry),
        "all_payments_entry": _to_public_entries(all_payments_entry),
        "reconciled_payments": reconciled_payments,
        "errors": errors,
    }
