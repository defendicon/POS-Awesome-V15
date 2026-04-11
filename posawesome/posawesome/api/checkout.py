# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe
from frappe.utils import nowdate, flt
from frappe import _
from erpnext.accounts.party import get_party_bank_account
from erpnext.accounts.utils import reconcile_against_document
from erpnext.accounts.doctype.payment_request.payment_request import (
    get_dummy_message,
    get_existing_payment_request_amount,
)
from posawesome.posawesome.api.utilities import ensure_child_doctype


def get_posawesome_credit_redeem_remark(invoice_name):
    return _("POS Awesome credit redemption for Sales Invoice {0}").format(invoice_name)


@frappe.whitelist()
def create_payment_request(doc):
    doc = json.loads(doc)
    for pay in doc.get("payments"):
        if pay.get("type") == "Phone":
            if pay.get("amount") <= 0:
                frappe.throw(_("Payment amount cannot be less than or equal to 0"))

            if not doc.get("contact_mobile"):
                frappe.throw(_("Please enter the phone number first"))

            pay_req = get_existing_payment_request(doc, pay)
            if not pay_req:
                pay_req = get_new_payment_request(doc, pay)
                pay_req.submit()
            else:
                pay_req.request_phone_payment()

            return pay_req


def get_new_payment_request(doc, mop):
    payment_gateway_account = frappe.db.get_value(
        "Payment Gateway Account",
        {
            "payment_account": mop.get("account"),
        },
        ["name"],
    )

    args = {
        "dt": "Sales Invoice",
        "dn": doc.get("name"),
        "recipient_id": doc.get("contact_mobile"),
        "mode_of_payment": mop.get("mode_of_payment"),
        "payment_gateway_account": payment_gateway_account,
        "payment_request_type": "Inward",
        "party_type": "Customer",
        "party": doc.get("customer"),
        "return_doc": True,
    }
    return make_payment_request(**args)


def get_payment_gateway_account(args):
    return frappe.db.get_value(
        "Payment Gateway Account",
        args,
        ["name", "payment_gateway", "payment_account", "message"],
        as_dict=1,
    )


def get_existing_payment_request(doc, pay):
    payment_gateway_account = frappe.db.get_value(
        "Payment Gateway Account",
        {
            "payment_account": pay.get("account"),
        },
        ["name"],
    )

    args = {
        "doctype": "Payment Request",
        "reference_doctype": "Sales Invoice",
        "reference_name": doc.get("name"),
        "payment_gateway_account": payment_gateway_account,
        "email_to": doc.get("contact_mobile"),
    }
    pr = frappe.db.exists(args)
    if pr:
        return frappe.get_doc("Payment Request", pr)


def make_payment_request(**args):
    """Make payment request"""

    args = frappe._dict(args)

    ref_doc = frappe.get_doc(args.dt, args.dn)
    gateway_account = get_payment_gateway_account(args.get("payment_gateway_account"))
    if not gateway_account:
        frappe.throw(_("Payment Gateway Account not found"))

    grand_total = get_amount(ref_doc, gateway_account.get("payment_account"))
    if args.loyalty_points and args.dt == "Sales Order":
        from erpnext.accounts.doctype.loyalty_program.loyalty_program import (
            validate_loyalty_points,
        )

        loyalty_amount = validate_loyalty_points(ref_doc, int(args.loyalty_points))
        frappe.db.set_value(
            "Sales Order",
            args.dn,
            "loyalty_points",
            int(args.loyalty_points),
            update_modified=False,
        )
        frappe.db.set_value(
            "Sales Order",
            args.dn,
            "loyalty_amount",
            loyalty_amount,
            update_modified=False,
        )
        grand_total = grand_total - loyalty_amount

    bank_account = (
        get_party_bank_account(args.get("party_type"), args.get("party")) if args.get("party_type") else ""
    )

    existing_payment_request = None
    if args.order_type == "Shopping Cart":
        existing_payment_request = frappe.db.get_value(
            "Payment Request",
            {
                "reference_doctype": args.dt,
                "reference_name": args.dn,
                "docstatus": ("!=", 2),
            },
        )

    if existing_payment_request:
        frappe.db.set_value(
            "Payment Request",
            existing_payment_request,
            "grand_total",
            grand_total,
            update_modified=False,
        )
        pr = frappe.get_doc("Payment Request", existing_payment_request)
    else:
        if args.order_type != "Shopping Cart":
            existing_payment_request_amount = get_existing_payment_request_amount(args.dt, args.dn)

            if existing_payment_request_amount:
                grand_total -= existing_payment_request_amount

        pr = frappe.new_doc("Payment Request")
        pr.update(
            {
                "payment_gateway_account": gateway_account.get("name"),
                "payment_gateway": gateway_account.get("payment_gateway"),
                "payment_account": gateway_account.get("payment_account"),
                "payment_channel": gateway_account.get("payment_channel"),
                "payment_request_type": args.get("payment_request_type"),
                "currency": ref_doc.currency,
                "grand_total": grand_total,
                "mode_of_payment": args.mode_of_payment,
                "email_to": args.recipient_id or ref_doc.owner,
                "subject": _("Payment Request for {0}").format(args.dn),
                "message": gateway_account.get("message") or get_dummy_message(ref_doc),
                "reference_doctype": args.dt,
                "reference_name": args.dn,
                "party_type": args.get("party_type") or "Customer",
                "party": args.get("party") or ref_doc.get("customer"),
                "bank_account": bank_account,
            }
        )

        if args.order_type == "Shopping Cart" or args.mute_email:
            pr.flags.mute_email = True

        pr.insert(ignore_permissions=True)
        if args.submit_doc:
            pr.submit()

    if args.order_type == "Shopping Cart":
        frappe.db.commit()
        frappe.local.response["type"] = "redirect"
        frappe.local.response["location"] = pr.get_payment_url()

    if args.return_doc:
        return pr

    return pr.as_dict()


def get_amount(ref_doc, payment_account=None):
    """get amount based on doctype"""
    grand_total = 0
    for pay in ref_doc.payments:
        if pay.type == "Phone" and pay.account == payment_account:
            grand_total = pay.amount
            break

    if grand_total > 0:
        return grand_total

    else:
        frappe.throw(_("Payment Entry is already created or payment account is not matched"))


def redeeming_customer_credit(invoice_doc, data, is_payment_entry, total_cash, cash_account, payments):
    # redeeming customer credit with journal voucher
    today = nowdate()
    created_receive_payment_entries = []

    def _row_value(row, key, default=None):
        if hasattr(row, "get"):
            value = row.get(key, default)
            if value is not None:
                return value
        return getattr(row, key, default)

    if data.get("redeemed_customer_credit"):
        cost_center = frappe.get_value("POS Profile", invoice_doc.pos_profile, "cost_center")
        if not cost_center:
            cost_center = frappe.get_value("Company", invoice_doc.company, "cost_center")
        if not cost_center:
            frappe.throw(_("Cost Center is not set in pos profile {}").format(invoice_doc.pos_profile))
        for row in data.get("customer_credit_dict"):
            if row["type"] == "Invoice" and row["credit_to_redeem"]:
                outstanding_invoice = frappe.get_doc("Sales Invoice", row["credit_origin"])

                jv_doc = frappe.get_doc(
                    {
                        "doctype": "Journal Entry",
                        "voucher_type": "Journal Entry",
                        "posting_date": today,
                        "company": invoice_doc.company,
                    }
                )

                debit_row = jv_doc.append("accounts", {})
                debit_row.update(
                    {
                        "account": outstanding_invoice.debit_to,
                        "party_type": "Customer",
                        "party": invoice_doc.customer,
                        "reference_type": "Sales Invoice",
                        "reference_name": outstanding_invoice.name,
                        "debit_in_account_currency": row["credit_to_redeem"],
                        "cost_center": cost_center,
                    }
                )

                credit_row = jv_doc.append("accounts", {})
                credit_row.update(
                    {
                        "account": invoice_doc.debit_to,
                        "party_type": "Customer",
                        "party": invoice_doc.customer,
                        "reference_type": "Sales Invoice",
                        "reference_name": invoice_doc.name,
                        "credit_in_account_currency": row["credit_to_redeem"],
                        "cost_center": cost_center,
                    }
                )

                ensure_child_doctype(jv_doc, "accounts", "Journal Entry Account")

                jv_doc.flags.ignore_permissions = True
                frappe.flags.ignore_account_permission = True
                jv_doc.user_remark = get_posawesome_credit_redeem_remark(invoice_doc.name)
                jv_doc.set_missing_values()
                try:
                    jv_doc.save()
                    jv_doc.submit()
                except Exception as e:
                    frappe.log_error(frappe.get_traceback(), "POSAwesome JV Error")
                    frappe.throw(_("Unable to create Journal Entry for customer credit."))

    remaining_total_cash = flt(total_cash)

    if is_payment_entry:
        for payment in payments:
            payment_amount = flt(_row_value(payment, "amount", 0))
            if payment_amount <= 0:
                continue

            applied_amount = min(payment_amount, remaining_total_cash)

            payment_entry_doc = frappe.get_doc(
                {
                    "doctype": "Payment Entry",
                    "posting_date": today,
                    "payment_type": "Receive",
                    "party_type": "Customer",
                    "party": invoice_doc.customer,
                    "paid_amount": payment_amount,
                    "received_amount": payment_amount,
                    "paid_from": invoice_doc.debit_to,
                    "paid_to": _row_value(payment, "account"),
                    "company": invoice_doc.company,
                    "mode_of_payment": _row_value(payment, "mode_of_payment"),
                    "reference_no": invoice_doc.posa_pos_opening_shift,
                    "reference_date": today,
                }
            )

            if applied_amount > 0:
                payment_reference = {
                    "allocated_amount": applied_amount,
                    "due_date": data.get("due_date"),
                    "reference_doctype": "Sales Invoice",
                    "reference_name": invoice_doc.name,
                }

                ref_row = payment_entry_doc.append("references", {})
                ref_row.update(payment_reference)
                ensure_child_doctype(payment_entry_doc, "references", "Payment Entry Reference")
            payment_entry_doc.flags.ignore_permissions = True
            frappe.flags.ignore_account_permission = True
            payment_entry_doc.save()
            payment_entry_doc.submit()
            created_receive_payment_entries.append(
                {
                    "name": payment_entry_doc.name,
                    "mode_of_payment": _row_value(payment, "mode_of_payment"),
                    "account": _row_value(payment, "account"),
                    "paid_amount": payment_amount,
                    "allocated_amount": applied_amount,
                    "unallocated_amount": flt(payment_amount - applied_amount),
                }
            )
            if applied_amount > 0:
                remaining_total_cash = flt(remaining_total_cash - applied_amount)

    if isinstance(data, dict):
        data["created_receive_payment_entries"] = created_receive_payment_entries

    return created_receive_payment_entries


@frappe.whitelist()
def get_available_credit(customer, company):
    total_credit = []

    outstanding_invoices = frappe.get_all(
        "Sales Invoice",
        {
            "outstanding_amount": ["<", 0],
            "docstatus": 1,
            "customer": customer,
            "company": company,
        },
        ["name", "outstanding_amount", "is_return"],
    )

    allocations = {}
    invoice_names = [row.name for row in outstanding_invoices]
    if invoice_names:
        placeholders = ", ".join(["%s"] * len(invoice_names))
        payment_allocations = frappe.db.sql(
            f"""
                select
                    per.reference_name,
                    sum(per.allocated_amount) as allocated_amount
                from `tabPayment Entry Reference` per
                inner join `tabPayment Entry` pe on pe.name = per.parent
                where per.reference_doctype = 'Sales Invoice'
                    and per.reference_name in ({placeholders})
                    and pe.docstatus = 1
                    and pe.payment_type = 'Pay'
                group by per.reference_name
            """,
            invoice_names,
            as_dict=True,
        )

        allocations = {row.reference_name: flt(row.allocated_amount) for row in payment_allocations}

    for row in outstanding_invoices:
        outstanding_amount = -(row.outstanding_amount)
        cash_paid = allocations.get(row.name, 0)
        remaining_credit = flt(outstanding_amount - cash_paid)

        if remaining_credit <= 0:
            continue

        row = {
            "type": "Invoice",
            "credit_origin": row.name,
            "total_credit": remaining_credit,
            "credit_to_redeem": 0,
            "source_type": "Sales Return" if row.is_return else "Sales Invoice",
        }

        total_credit.append(row)

    advances = frappe.get_all(
        "Payment Entry",
        {
            "unallocated_amount": [">", 0],
            "payment_type": "Receive",
            "party_type": "Customer",
            "party": customer,
            "company": company,
            "docstatus": 1,
        },
        ["name", "unallocated_amount"],
    )

    outstanding_payments = frappe.get_all(
        "Payment Entry",
        {
            "unallocated_amount": [">", 0],
            "payment_type": "Pay",
            "party_type": "Customer",
            "party": customer,
            "company": company,
            "docstatus": 1,
        },
        ["name", "unallocated_amount"],
    )

    remaining_pay_outflow = sum(flt(row.unallocated_amount) for row in outstanding_payments)

    # Net customer "Pay" outflows against available "Receive" advances in the
    # same iteration order returned by frappe.get_all. This preserves the
    # existing FIFO-style behavior by list order without imposing a new sort.
    for row in advances:
        available_credit = flt(row.unallocated_amount)
        if remaining_pay_outflow > 0:
            applied_outflow = min(available_credit, remaining_pay_outflow)
            available_credit = flt(available_credit - applied_outflow)
            remaining_pay_outflow = flt(remaining_pay_outflow - applied_outflow)

        if available_credit <= 0:
            continue

        row = {
            "type": "Advance",
            "credit_origin": row.name,
            "total_credit": available_credit,
            "credit_to_redeem": 0,
            "source_type": "Payment Entry",
        }

        total_credit.append(row)

    return total_credit


def _coerce_text_list(value):
    if not value:
        return []

    parsed_value = value
    if isinstance(value, str):
        stripped_value = value.strip()
        if not stripped_value:
            return []

        if stripped_value.startswith("["):
            parsed_value = json.loads(stripped_value)
        else:
            return [row.strip() for row in stripped_value.split(",") if row.strip()]

    if isinstance(parsed_value, (list, tuple, set)):
        return [str(row).strip() for row in parsed_value if str(row).strip()]

    frappe.throw(_("Expected a list of names"))


def _coerce_bool_flag(value, default=False):
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return bool(value)

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False

    return default


def _row_value(row, fieldname, default=None):
    if hasattr(row, "get"):
        value = row.get(fieldname, default)
        if value is not None:
            return value
    return getattr(row, fieldname, default)


def _is_exact_repaired_change_allocation(
    payment_row, payment_doc, invoice_doctype, invoice_name, amount_to_allocate
):
    existing_references = list(getattr(payment_doc, "references", []) or [])
    matching_references = [
        row
        for row in existing_references
        if _row_value(row, "reference_doctype") == invoice_doctype
        and _row_value(row, "reference_name") == invoice_name
    ]
    if not matching_references:
        return False

    allocated_to_invoice = sum(
        flt(_row_value(row, "allocated_amount")) for row in matching_references
    )
    total_allocated_amount = flt(
        _row_value(payment_doc, "total_allocated_amount", _row_value(payment_row, "total_allocated_amount"))
    )
    unallocated_amount = flt(
        _row_value(payment_doc, "unallocated_amount", _row_value(payment_row, "unallocated_amount"))
    )

    return (
        abs(allocated_to_invoice - amount_to_allocate) <= 0.01
        and abs(total_allocated_amount - amount_to_allocate) <= 0.01
        and abs(unallocated_amount) <= 0.01
    )


@frappe.whitelist()
def repair_overpayment_change_allocations(
    invoice_names=None,
    doctype="Sales Invoice",
    company=None,
    customer=None,
    posting_date=None,
    dry_run=1,
    limit=100,
):
    """Repair historical POS invoices where change Pay entries were left unallocated.

    The helper only touches a narrow pattern:
    - submitted POS invoice
    - negative outstanding amount
    - non-return invoice
    - positive change amount matching the negative outstanding
    - exactly one submitted Customer/Pay Payment Entry candidate with a matching change-payment signature

    Ambiguous rows are reported and skipped instead of guessed.
    """

    invoice_names = set(_coerce_text_list(invoice_names))
    invoice_doctype = doctype if doctype in {"Sales Invoice", "POS Invoice"} else "Sales Invoice"
    dry_run = _coerce_bool_flag(dry_run, default=True)
    try:
        limit = max(1, min(int(limit or 100), 500))
    except Exception:
        limit = 100

    invoice_filters = {
        "docstatus": 1,
        "is_pos": 1,
        "is_return": 0,
        "outstanding_amount": ["<", 0],
    }
    if company:
        invoice_filters["company"] = company
    if customer:
        invoice_filters["customer"] = customer
    if posting_date:
        invoice_filters["posting_date"] = posting_date

    candidate_invoices = frappe.get_all(
        invoice_doctype,
        filters=invoice_filters,
        fields=[
            "name",
            "customer",
            "company",
            "posting_date",
            "outstanding_amount",
            "change_amount",
            "base_change_amount",
            "posa_pos_opening_shift",
            "account_for_change_amount",
        ],
        order_by="posting_date asc, name asc",
        limit_page_length=limit,
    )

    if invoice_names:
        candidate_invoices = [
            row for row in candidate_invoices if _row_value(row, "name") in invoice_names
        ]

    matched = []
    repaired = []
    skipped = []

    for invoice in candidate_invoices:
        invoice_name = _row_value(invoice, "name")
        invoice_customer = _row_value(invoice, "customer")
        invoice_company = _row_value(invoice, "company")
        amount_to_allocate = abs(flt(_row_value(invoice, "outstanding_amount")))
        change_amount = flt(
            _row_value(invoice, "change_amount") or _row_value(invoice, "base_change_amount")
        )

        if amount_to_allocate <= 0:
            skipped.append(
                {
                    "invoice": invoice_name,
                    "reason": "no_negative_outstanding",
                }
            )
            continue

        if change_amount <= 0 or abs(change_amount - amount_to_allocate) > 0.01:
            skipped.append(
                {
                    "invoice": invoice_name,
                    "reason": "change_amount_mismatch",
                    "outstanding_amount": amount_to_allocate,
                    "change_amount": change_amount,
                }
            )
            continue

        payment_filters = {
            "docstatus": 1,
            "payment_type": "Pay",
            "party_type": "Customer",
            "party": invoice_customer,
            "company": invoice_company,
            "posting_date": _row_value(invoice, "posting_date"),
        }
        if _row_value(invoice, "posa_pos_opening_shift"):
            payment_filters["reference_no"] = _row_value(invoice, "posa_pos_opening_shift")

        payment_candidates = frappe.get_all(
            "Payment Entry",
            filters=payment_filters,
            fields=[
                "name",
                "paid_amount",
                "unallocated_amount",
                "total_allocated_amount",
                "paid_from",
                "reference_no",
            ],
            order_by="creation asc, name asc",
        )

        change_account = _row_value(invoice, "account_for_change_amount")
        filtered_candidates = []
        already_allocated = False
        for payment in payment_candidates:
            if change_account and _row_value(payment, "paid_from") != change_account:
                continue

            if abs(flt(_row_value(payment, "paid_amount")) - amount_to_allocate) > 0.01:
                continue

            payment_doc = frappe.get_doc("Payment Entry", _row_value(payment, "name"))
            existing_references = list(getattr(payment_doc, "references", []) or [])
            if existing_references:
                if _is_exact_repaired_change_allocation(
                    payment,
                    payment_doc,
                    invoice_doctype,
                    invoice_name,
                    amount_to_allocate,
                ):
                    already_allocated = True
                    skipped.append(
                        {
                            "invoice": invoice_name,
                            "payment_entry": _row_value(payment, "name"),
                            "reason": "already_allocated",
                        }
                    )
                    continue

            if abs(flt(_row_value(payment, "unallocated_amount")) - amount_to_allocate) > 0.01:
                continue

            filtered_candidates.append(payment_doc)

        if already_allocated:
            continue

        if not filtered_candidates:
            skipped.append(
                {
                    "invoice": invoice_name,
                    "reason": "no_matching_payment_entry",
                }
            )
            continue

        if len(filtered_candidates) > 1:
            skipped.append(
                {
                    "invoice": invoice_name,
                    "reason": "ambiguous_payment_entries",
                    "payment_entries": [_row_value(row, "name") for row in filtered_candidates],
                }
            )
            continue

        payment_doc = filtered_candidates[0]
        match_summary = {
            "invoice": invoice_name,
            "payment_entry": _row_value(payment_doc, "name"),
            "allocated_amount": amount_to_allocate,
        }
        matched.append(match_summary)

        if dry_run:
            continue

        reconcile_against_document(
            [
                frappe._dict(
                    {
                        "voucher_type": "Payment Entry",
                        "voucher_no": _row_value(payment_doc, "name"),
                        "voucher_detail_no": None,
                        "against_voucher_type": invoice_doctype,
                        "against_voucher": invoice_name,
                        "account": _row_value(payment_doc, "paid_from"),
                        "party_type": "Customer",
                        "party": invoice_customer,
                        "dr_or_cr": "credit_in_account_currency",
                        "unreconciled_amount": amount_to_allocate,
                        "unadjusted_amount": amount_to_allocate,
                        "allocated_amount": amount_to_allocate,
                        "grand_total": amount_to_allocate,
                        "outstanding_amount": amount_to_allocate,
                        "exchange_rate": 1,
                        "is_advance": 0,
                        "difference_amount": 0,
                        "cost_center": _row_value(payment_doc, "cost_center"),
                    }
                )
            ]
        )

        repaired.append(match_summary)

    return {
        "dry_run": dry_run,
        "matched": matched,
        "repaired": repaired,
        "skipped": skipped,
        "candidate_count": len(candidate_invoices),
    }
