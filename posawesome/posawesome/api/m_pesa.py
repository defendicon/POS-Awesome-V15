# Copyright (c) 2021, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals

import json

import frappe
import requests
from frappe.utils import cstr, flt
from requests.auth import HTTPBasicAuth

CALLBACK_ACCEPTED = {"ResultCode": 0, "ResultDesc": "Accepted"}
CALLBACK_REJECTED = {"ResultCode": 1, "ResultDesc": "Rejected"}
MPESA_CALLBACK_FIELDS = (
    "TransactionType",
    "TransID",
    "TransTime",
    "TransAmount",
    "BusinessShortCode",
    "BillRefNumber",
    "InvoiceNumber",
    "OrgAccountBalance",
    "ThirdPartyTransID",
    "MSISDN",
    "FirstName",
    "MiddleName",
    "LastName",
)


def get_token(app_key, app_secret, base_url):
    authenticate_uri = "/oauth/v1/generate?grant_type=client_credentials"
    authenticate_url = "{0}{1}".format(base_url, authenticate_uri)
    response = requests.get(authenticate_url, auth=HTTPBasicAuth(app_key, app_secret), timeout=15)
    response.raise_for_status()
    return response.json()["access_token"]


def _clip_text(value, max_length=140):
    return cstr(value or "").strip()[:max_length]


def _extract_callback_args(kwargs):
    payload = {}

    if isinstance(kwargs, dict):
        payload.update(kwargs)

    request = getattr(frappe, "request", None)
    if request:
        try:
            json_payload = request.get_json(silent=True) or {}
            if isinstance(json_payload, dict):
                payload.update(json_payload)
        except Exception:
            pass
        try:
            if getattr(request, "form", None):
                payload.update(request.form.to_dict())
        except Exception:
            pass

    form_dict = getattr(frappe, "form_dict", None)
    if form_dict:
        for field_name in MPESA_CALLBACK_FIELDS:
            if field_name not in payload and form_dict.get(field_name) is not None:
                payload[field_name] = form_dict.get(field_name)

    return frappe._dict(payload)


def _is_post_request():
    request = getattr(frappe, "request", None)
    method = cstr(getattr(request, "method", "")).upper()
    return not method or method == "POST"


def _is_registered_shortcode(shortcode):
    if not shortcode:
        return False
    return bool(
        frappe.db.exists(
            "Mpesa C2B Register URL",
            {"business_shortcode": shortcode, "register_status": "Success"},
        )
    )


def _parse_positive_amount(amount_value):
    amount = flt(amount_value)
    if amount <= 0:
        return None
    return amount


@frappe.whitelist(allow_guest=True)
def confirmation(**kwargs):
    if not _is_post_request():
        return dict(CALLBACK_REJECTED)

    try:
        args = _extract_callback_args(kwargs)
        transid = _clip_text(args.get("TransID"), 80)
        business_shortcode = _clip_text(args.get("BusinessShortCode"), 40)
        transamount = _parse_positive_amount(args.get("TransAmount"))

        if not transid or transamount is None or not _is_registered_shortcode(business_shortcode):
            return dict(CALLBACK_REJECTED)

        existing_name = frappe.db.get_value("Mpesa Payment Register", {"transid": transid}, "name")
        if existing_name:
            return dict(CALLBACK_ACCEPTED)

        doc = frappe.new_doc("Mpesa Payment Register")
        doc.transactiontype = _clip_text(args.get("TransactionType"), 60)
        doc.transid = transid
        doc.transtime = _clip_text(args.get("TransTime"), 40)
        doc.transamount = transamount
        doc.businessshortcode = business_shortcode
        doc.billrefnumber = _clip_text(args.get("BillRefNumber"), 140)
        doc.invoicenumber = _clip_text(args.get("InvoiceNumber"), 140)
        doc.orgaccountbalance = _clip_text(args.get("OrgAccountBalance"), 140)
        doc.thirdpartytransid = _clip_text(args.get("ThirdPartyTransID"), 140)
        doc.msisdn = _clip_text(args.get("MSISDN"), 40)
        doc.firstname = _clip_text(args.get("FirstName"), 140)
        doc.middlename = _clip_text(args.get("MiddleName"), 140)
        doc.lastname = _clip_text(args.get("LastName"), 140)
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        return dict(CALLBACK_ACCEPTED)
    except Exception as exc:
        frappe.log_error(
            message=f"Mpesa confirmation callback error: {cstr(exc)}\n{frappe.get_traceback()}",
            title="Mpesa Confirmation Callback Failure",
        )
        return dict(CALLBACK_REJECTED)


@frappe.whitelist(allow_guest=True)
def validation(**kwargs):
    if not _is_post_request():
        return dict(CALLBACK_REJECTED)

    args = _extract_callback_args(kwargs)
    business_shortcode = _clip_text(args.get("BusinessShortCode"), 40)
    if not _is_registered_shortcode(business_shortcode):
        return dict(CALLBACK_REJECTED)
    return dict(CALLBACK_ACCEPTED)


@frappe.whitelist()
def get_mpesa_mode_of_payment(company):
    modes = frappe.get_all(
        "Mpesa C2B Register URL",
        filters={"company": company, "register_status": "Success"},
        fields=["mode_of_payment"],
    )
    return list(dict.fromkeys(mode.mode_of_payment for mode in modes if mode.mode_of_payment))


def _parse_payment_methods(payment_methods_list):
    if not payment_methods_list:
        return []

    if isinstance(payment_methods_list, str):
        try:
            parsed = json.loads(payment_methods_list)
        except json.JSONDecodeError:
            frappe.throw("Invalid payment methods list format")
    elif isinstance(payment_methods_list, (list, tuple)):
        parsed = payment_methods_list
    else:
        frappe.throw("Invalid payment methods list type")

    methods = [_clip_text(value, 140) for value in parsed if cstr(value).strip()]
    return methods


@frappe.whitelist()
def get_mpesa_draft_payments(
    company,
    mode_of_payment=None,
    mobile_no=None,
    full_name=None,
    payment_methods_list=None,
):
    filters = {"company": company, "docstatus": 0}
    safe_mode_of_payment = _clip_text(mode_of_payment, 140)
    safe_mobile_no = _clip_text(mobile_no, 40)
    safe_full_name = _clip_text(full_name, 140)

    if safe_mode_of_payment:
        filters["mode_of_payment"] = safe_mode_of_payment
    if safe_mobile_no:
        filters["msisdn"] = ["like", f"%{safe_mobile_no}%"]
    if safe_full_name:
        filters["full_name"] = ["like", f"%{safe_full_name}%"]

    payment_methods = _parse_payment_methods(payment_methods_list)
    if payment_methods:
        filters["mode_of_payment"] = ["in", payment_methods]

    return frappe.get_all(
        "Mpesa Payment Register",
        filters=filters,
        fields=[
            "name",
            "transid",
            "msisdn as mobile_no",
            "full_name",
            "posting_date",
            "transamount as amount",
            "currency",
            "mode_of_payment",
            "company",
        ],
        order_by="posting_date desc",
    )


@frappe.whitelist()
def submit_mpesa_payment(mpesa_payment, customer):
    if not customer:
        frappe.throw("Customer is required")

    doc = frappe.get_doc("Mpesa Payment Register", mpesa_payment)
    if doc.docstatus != 0:
        frappe.throw("Mpesa payment is already submitted")

    doc.customer = customer
    doc.submit_payment = 1
    doc.submit()
    doc.reload()
    return frappe.get_doc("Payment Entry", doc.payment_entry)
