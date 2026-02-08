# Copyright (c) 2021, Youssef Restom and contributors
# For license information, please see license.txt

"""Customer hooks and compatibility wrappers.

Hook handlers live here; customer CRUD/list APIs are implemented in
`posawesome.posawesome.api.customers` and exposed via wrappers as needed.
"""


import frappe
from frappe import _

from posawesome.posawesome.doctype.referral_code.referral_code import (
    create_referral_code,
)

from . import customers


def after_insert(doc, method):
    create_customer_referral_code(doc)
    create_gift_coupon(doc)


def validate(doc, method):
    validate_referral_code(doc)


def create_customer_referral_code(doc):
    if doc.posa_referral_company:
        company = frappe.get_cached_doc("Company", doc.posa_referral_company)
        if not company.posa_auto_referral:
            return
        create_referral_code(
            doc.posa_referral_company,
            doc.name,
            company.posa_customer_offer,
            company.posa_primary_offer,
            company.posa_referral_campaign,
        )


def create_gift_coupon(doc):
    if doc.posa_referral_code:
        coupon = frappe.new_doc("POS Coupon")
        coupon.customer = doc.name
        coupon.referral_code = doc.posa_referral_code
        coupon.create_coupon_from_referral()


def validate_referral_code(doc):
    referral_code = doc.posa_referral_code
    exist = None
    if referral_code:
        exist = frappe.db.exists("Referral Code", referral_code)
        if not exist:
            exist = frappe.db.exists("Referral Code", {"referral_code": referral_code})
        if not exist:
            frappe.throw(_("This Referral Code {0} not exists").format(referral_code))


@frappe.whitelist()
def get_customer_balance(customer):
    return customers.get_customer_balance(customer)


@frappe.whitelist()
def create_customer(*args, **kwargs):
    """Backward compatible wrapper for ``api.customers.create_customer``."""
    return customers.create_customer(*args, **kwargs)
