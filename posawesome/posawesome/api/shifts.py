# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint, nowdate

from posawesome.posawesome.api.pos_access import (
    get_authenticated_pos_user,
    get_authorized_pos_profile,
)

from .utilities import get_version


@frappe.whitelist()
def get_opening_dialog_data():
    data = {}

    # Get only POS Profiles where current user is defined in POS Profile User table
    pos_profiles_data = frappe.db.sql(
        """
        SELECT DISTINCT p.name, p.company, p.currency
        FROM `tabPOS Profile` p
        INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
        WHERE p.disabled = 0 AND u.user = %s
        ORDER BY p.name
    """,
        frappe.session.user,
        as_dict=1,
    )

    data["pos_profiles_data"] = pos_profiles_data

    # Derive companies from accessible POS Profiles
    company_names = []
    for profile in pos_profiles_data:
        if profile.company and profile.company not in company_names:
            company_names.append(profile.company)
    data["companies"] = [{"name": c} for c in company_names]

    pos_profiles_list = []
    for i in data["pos_profiles_data"]:
        pos_profiles_list.append(i.name)

    payment_method_table = "POS Payment Method" if get_version() == 13 else "Sales Invoice Payment"
    data["payments_method"] = frappe.get_list(
        payment_method_table,
        filters={"parent": ["in", pos_profiles_list]},
        fields=["*"],
        limit_page_length=0,
        order_by="parent",
        ignore_permissions=True,
    )
    # set currency from pos profile
    for mode in data["payments_method"]:
        mode["currency"] = frappe.get_cached_value("POS Profile", mode["parent"], "currency")

    return data


@frappe.whitelist()
def create_opening_voucher(pos_profile, company, balance_details):
    profile = get_authorized_pos_profile(pos_profile, company=company)
    user = get_authenticated_pos_user()
    balance_details = json.loads(balance_details) if isinstance(balance_details, str) else balance_details
    if not isinstance(balance_details, list):
        frappe.throw(_("Opening balances must be a list."))

    allowed_payment_methods = {
        row.get("mode_of_payment")
        for row in (profile.get("payments") or [])
        if hasattr(row, "get") and row.get("mode_of_payment")
    }
    if any(not hasattr(row, "get") for row in balance_details):
        frappe.throw(_("Invalid opening balance row."))
    if any(not row.get("mode_of_payment") for row in balance_details):
        frappe.throw(_("Every opening balance row requires a payment method."))
    supplied_payment_methods = {row.get("mode_of_payment") for row in balance_details}
    if not supplied_payment_methods.issubset(allowed_payment_methods):
        frappe.throw(
            _("Opening balances contain a payment method outside this POS Profile."),
            frappe.PermissionError,
        )

    existing_opening = frappe.db.exists(
        "POS Opening Shift",
        {
            "user": user,
            "pos_profile": profile.get("name"),
            "pos_closing_shift": ["is", "not set"],
            "docstatus": 1,
            "status": "Open",
        },
    )
    if existing_opening:
        frappe.throw(_("An open POS shift already exists for this POS Profile."))

    new_pos_opening = frappe.get_doc(
        {
            "doctype": "POS Opening Shift",
            "period_start_date": frappe.utils.get_datetime(),
            "posting_date": frappe.utils.getdate(),
            "user": user,
            "pos_profile": profile.get("name"),
            "company": profile.get("company"),
            "docstatus": 1,
        }
    )
    new_pos_opening.set("balance_details", balance_details)
    new_pos_opening.insert(ignore_permissions=True)

    data = {}
    data["pos_opening_shift"] = new_pos_opening.as_dict()
    update_opening_shift_data(data, new_pos_opening.pos_profile)
    return data


@frappe.whitelist()
def check_opening_shift(user=None):
    authenticated_user = get_authenticated_pos_user()
    if user and user != authenticated_user:
        frappe.throw(_("You can only access your own POS opening shift."), frappe.PermissionError)

    open_vouchers = frappe.db.get_all(
        "POS Opening Shift",
        filters={
            "user": authenticated_user,
            "pos_closing_shift": ["is", "not set"],
            "docstatus": 1,
            "status": "Open",
        },
        fields=["name", "pos_profile"],
        order_by="period_start_date desc",
    )
    data = ""
    if len(open_vouchers) > 0:
        get_authorized_pos_profile(open_vouchers[0]["pos_profile"])
        data = {}
        data["pos_opening_shift"] = frappe.get_doc("POS Opening Shift", open_vouchers[0]["name"])
        update_opening_shift_data(data, open_vouchers[0]["pos_profile"])
    return data


def update_opening_shift_data(data, pos_profile):
    data["pos_profile"] = frappe.get_doc("POS Profile", pos_profile)
    if data["pos_profile"].get("posa_language"):
        frappe.local.lang = data["pos_profile"].posa_language
    data["company"] = frappe.get_doc("Company", data["pos_profile"].company)
    allow_negative_stock = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0)
    data["stock_settings"] = {}
    data["stock_settings"].update({"allow_negative_stock": bool(allow_negative_stock)})
