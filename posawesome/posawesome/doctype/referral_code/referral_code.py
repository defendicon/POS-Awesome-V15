# Copyright (c) 2021, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr, strip


MAX_REFERRAL_NAME_LENGTH = 140
MAX_REFERRAL_CODE_LENGTH = 140


class ReferralCode(Document):
    def autoname(self):
        if not self.referral_name:
            self.referral_name = strip(self.customer) + "-" + frappe.generate_hash()[:5].upper()
            self.name = self.referral_name
        else:
            self.referral_name = strip(self.referral_name)
            self.name = self.referral_name

        if not self.referral_code:
            self.referral_code = frappe.generate_hash()[:10].upper()

    def validate(self):
        self.referral_name = cstr(self.referral_name).strip()[:MAX_REFERRAL_NAME_LENGTH]
        self.referral_code = cstr(self.referral_code).strip().upper()[:MAX_REFERRAL_CODE_LENGTH]
        if not self.company:
            frappe.throw(_("Company is required for Referral Code."))
        if not self.customer:
            frappe.throw(_("Customer is required for Referral Code."))


def create_referral_code(company, customer, customer_offer, primary_offer=None, campaign=None):
    company = cstr(company).strip()
    customer = cstr(customer).strip()
    if not company or not customer:
        frappe.throw(_("Company and customer are required to create referral code."))

    existing = frappe.db.get_value(
        "Referral Code",
        {"company": company, "customer": customer, "disabled": 0},
        "name",
    )
    if existing:
        return frappe.get_doc("Referral Code", existing)

    doc = frappe.new_doc("Referral Code")
    doc.company = company
    doc.customer = customer
    doc.customer_offer = customer_offer
    doc.primary_offer = primary_offer
    doc.campaign = campaign
    doc.save(ignore_permissions=True)
    return doc
