# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
from contextlib import contextmanager
import re
import frappe
from frappe.utils import nowdate, flt, cstr
from frappe import _
from erpnext.accounts.party import get_party_bank_account
from erpnext.accounts.doctype.payment_request.payment_request import (
    get_dummy_message,
    get_existing_payment_request_amount,
)
from posawesome.posawesome.api.utilities import ensure_child_doctype


MAX_PAYMENT_ROWS = 100
MAX_CONTACT_MOBILE_LENGTH = 30
MAX_REFERENCE_NAME_LENGTH = 140
ALLOWED_PAYMENT_REFERENCE_DOCTYPES = {"Sales Invoice", "Sales Order"}


def get_posawesome_credit_redeem_remark(invoice_name):
    return _("POS Awesome credit redemption for Sales Invoice {0}").format(invoice_name)


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


@contextmanager
def _account_permission_override():
    previous_ignore_account_permission = frappe.flags.get("ignore_account_permission")
    frappe.flags.ignore_account_permission = True
    try:
        yield
    finally:
        frappe.flags.ignore_account_permission = previous_ignore_account_permission


def _assert_company_access(company, action_label):
    company = cstr(company).strip()
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
        frappe.throw(_("You are not allowed to {0}.").format(action_label))

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
        frappe.throw(_("You are not allowed to {0} for company {1}.").format(action_label, company))
    return company


def _coerce_payment_doc_payload(doc):
    if isinstance(doc, str):
        try:
            doc = json.loads(doc)
        except Exception:
            frappe.throw(_("Invalid payment request payload"))

    if not isinstance(doc, dict):
        frappe.throw(_("Payment request payload must be a JSON object"))

    return frappe._dict(doc)


def _normalize_contact_mobile(raw_value):
    contact_mobile = cstr(raw_value).strip()
    if not contact_mobile:
        return ""
    if len(contact_mobile) > MAX_CONTACT_MOBILE_LENGTH:
        frappe.throw(_("Contact mobile number is too long"))
    if not re.fullmatch(r"^[0-9+\-\s()]+$", contact_mobile):
        frappe.throw(_("Contact mobile number contains invalid characters"))
    return contact_mobile


@frappe.whitelist()
def create_payment_request(doc):
    doc = _coerce_payment_doc_payload(doc)
    invoice_name = cstr(doc.get("name")).strip()
    if not invoice_name:
        frappe.throw(_("Sales Invoice is required"))

    invoice_doc = frappe.get_doc("Sales Invoice", invoice_name)
    if not invoice_doc.has_permission("read") and not _can_manage_all_pos_profiles():
        frappe.throw(_("Not permitted to access Sales Invoice {0}.").format(invoice_doc.name))

    _assert_company_access(invoice_doc.company, _("create payment requests"))

    contact_mobile = _normalize_contact_mobile(doc.get("contact_mobile"))
    payments = doc.get("payments") or []
    if not isinstance(payments, list):
        frappe.throw(_("payments must be a list"))
    if len(payments) > MAX_PAYMENT_ROWS:
        frappe.throw(_("Too many payment rows in one request"))

    for pay in payments:
        if not isinstance(pay, dict):
            continue
        if pay.get("type") == "Phone":
            if flt(pay.get("amount")) <= 0:
                frappe.throw(_("Payment amount cannot be less than or equal to 0"))

            if not contact_mobile:
                frappe.throw(_("Please enter the phone number first"))

            pay_req = get_existing_payment_request(invoice_doc, pay, contact_mobile)
            if not pay_req:
                pay_req = get_new_payment_request(invoice_doc, pay, contact_mobile)
                pay_req.submit()
            else:
                pay_req.request_phone_payment()

            return pay_req

    frappe.throw(_("No valid phone payment method found"))


def get_new_payment_request(doc, mop, recipient_id):
    payment_account = cstr((mop or {}).get("account")).strip()
    mode_of_payment = cstr((mop or {}).get("mode_of_payment")).strip()
    if not payment_account:
        frappe.throw(_("Payment account is required"))
    if not mode_of_payment:
        frappe.throw(_("Mode of payment is required"))

    payment_gateway_account = frappe.db.get_value(
        "Payment Gateway Account",
        {
            "payment_account": payment_account,
        },
        ["name"],
    )

    args = {
        "dt": "Sales Invoice",
        "dn": doc.get("name"),
        "recipient_id": recipient_id,
        "mode_of_payment": mode_of_payment,
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


def get_existing_payment_request(doc, pay, recipient_id):
    payment_account = cstr((pay or {}).get("account")).strip()
    if not payment_account:
        return None

    payment_gateway_account = frappe.db.get_value(
        "Payment Gateway Account",
        {
            "payment_account": payment_account,
        },
        "name",
    )

    args = {
        "doctype": "Payment Request",
        "reference_doctype": "Sales Invoice",
        "reference_name": doc.get("name"),
        "payment_gateway_account": payment_gateway_account,
        "email_to": recipient_id,
    }
    pr = frappe.db.exists(args)
    if pr:
        return frappe.get_doc("Payment Request", pr)


def make_payment_request(**args):
    """Make payment request"""

    args = frappe._dict(args)
    args.dt = cstr(args.get("dt")).strip()
    args.dn = cstr(args.get("dn")).strip()

    if args.dt not in ALLOWED_PAYMENT_REFERENCE_DOCTYPES:
        frappe.throw(_("Unsupported reference doctype for payment request"))
    if not args.dn:
        frappe.throw(_("Reference document name is required"))
    if len(args.dn) > MAX_REFERENCE_NAME_LENGTH:
        frappe.throw(_("Reference document name is too long"))

    ref_doc = frappe.get_doc(args.dt, args.dn)
    if not ref_doc.has_permission("read") and not _can_manage_all_pos_profiles():
        frappe.throw(_("Not permitted to access {0} {1}.").format(args.dt, args.dn))

    _assert_company_access(ref_doc.get("company"), _("create payment requests"))

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

        can_create_payment_request = frappe.has_permission("Payment Request", "create")
        if not can_create_payment_request:
            has_source_write = ref_doc.has_permission("write")
            if not has_source_write and not _can_manage_all_pos_profiles():
                frappe.throw(_("Not permitted to create Payment Request for {0}.").format(ref_doc.name))
        pr.insert(ignore_permissions=not can_create_payment_request)
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
                jv_doc.user_remark = get_posawesome_credit_redeem_remark(invoice_doc.name)
                jv_doc.set_missing_values()
                try:
                    with _account_permission_override():
                        jv_doc.save()
                        jv_doc.submit()
                except Exception as e:
                    frappe.log_error(frappe.get_traceback(), "POSAwesome JV Error")
                    frappe.throw(_("Unable to create Journal Entry for customer credit."))

    if is_payment_entry and total_cash > 0:
        for payment in payments:
            if not payment.amount:
                continue
            payment_entry_doc = frappe.get_doc(
                {
                    "doctype": "Payment Entry",
                    "posting_date": today,
                    "payment_type": "Receive",
                    "party_type": "Customer",
                    "party": invoice_doc.customer,
                    "paid_amount": payment.amount,
                    "received_amount": payment.amount,
                    "paid_from": invoice_doc.debit_to,
                    "paid_to": payment.account,
                    "company": invoice_doc.company,
                    "mode_of_payment": payment.mode_of_payment,
                    "reference_no": invoice_doc.posa_pos_opening_shift,
                    "reference_date": today,
                }
            )

            payment_reference = {
                "allocated_amount": payment.amount,
                "due_date": data.get("due_date"),
                "reference_doctype": "Sales Invoice",
                "reference_name": invoice_doc.name,
            }

            ref_row = payment_entry_doc.append("references", {})
            ref_row.update(payment_reference)
            ensure_child_doctype(payment_entry_doc, "references", "Payment Entry Reference")
            payment_entry_doc.flags.ignore_permissions = True
            with _account_permission_override():
                payment_entry_doc.save()
                payment_entry_doc.submit()


@frappe.whitelist()
def get_available_credit(customer, company):
    customer = cstr(customer).strip()
    company = _assert_company_access(company, _("view available customer credit"))
    if not customer:
        return []

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
            "party_type": "Customer",
            "party": customer,
            "company": company,
            "docstatus": 1,
        },
        ["name", "unallocated_amount"],
    )

    for row in advances:
        row = {
            "type": "Advance",
            "credit_origin": row.name,
            "total_credit": row.unallocated_amount,
            "credit_to_redeem": 0,
            "source_type": "Payment Entry",
        }

        total_credit.append(row)

    return total_credit
