# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe
from frappe.utils import cint, cstr
from frappe import _
from .utilities import get_version

MAX_OPENING_BALANCE_ROWS = 200


def _can_manage_other_users():
    return "System Manager" in frappe.get_roles()


def _resolve_shift_user(user=None):
    session_user = frappe.session.user
    requested_user = cstr(user or session_user).strip()
    if requested_user != session_user and not _can_manage_other_users():
        frappe.throw(_("You are not permitted to access another user's shift data."))
    return requested_user


def _assert_pos_profile_access(pos_profile_name, expected_company=None):
    profile = frappe.db.get_value(
        "POS Profile",
        pos_profile_name,
        ["name", "company", "disabled"],
        as_dict=True,
    )
    if not profile:
        frappe.throw(_("POS Profile {0} was not found.").format(pos_profile_name))
    if cint(profile.disabled):
        frappe.throw(_("POS Profile {0} is disabled.").format(pos_profile_name))

    if expected_company and profile.company != expected_company:
        frappe.throw(_("POS Profile {0} does not belong to company {1}.").format(pos_profile_name, expected_company))

    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": pos_profile_name, "user": frappe.session.user},
    )
    if not has_access and not _can_manage_other_users():
        frappe.throw(_("You are not assigned to POS Profile {0}.").format(pos_profile_name))

    return profile


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
    if isinstance(balance_details, str):
        try:
            balance_details = json.loads(balance_details)
        except Exception:
            frappe.throw(_("Balance details must be a valid JSON array."))
    if not isinstance(balance_details, list):
        frappe.throw(_("Balance details must be a list."))
    if len(balance_details) > MAX_OPENING_BALANCE_ROWS:
        frappe.throw(_("Too many opening balance rows in one request."))
    balance_details = [row for row in balance_details if isinstance(row, dict)]

    pos_profile_name = cstr(pos_profile).strip()
    if not pos_profile_name:
        frappe.throw(_("POS Profile is required."))

    requested_company = cstr(company).strip()
    profile = _assert_pos_profile_access(pos_profile_name, requested_company or None)

    new_pos_opening = frappe.get_doc(
        {
            "doctype": "POS Opening Shift",
            "period_start_date": frappe.utils.get_datetime(),
            "posting_date": frappe.utils.getdate(),
            "user": frappe.session.user,
            "pos_profile": profile.name,
            "company": profile.company,
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
def check_opening_shift(user):
    shift_user = _resolve_shift_user(user)
    open_vouchers = frappe.db.get_all(
        "POS Opening Shift",
        filters={
            "user": shift_user,
            "pos_closing_shift": ["is", "not set"],
            "docstatus": 1,
            "status": "Open",
        },
        fields=["name", "pos_profile"],
        order_by="period_start_date desc",
    )
    data = ""
    if len(open_vouchers) > 0:
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
