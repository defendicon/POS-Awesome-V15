# Copyright (c) 2022, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe import _
import json
from frappe.model.document import Document
from frappe.utils import cstr


class DeliveryCharges(Document):
    def validate(self):
        if not self.default_rate or self.default_rate <= 0:
            frappe.throw(_("Default Rate is required"))
        self.validate_profiles()

    def validate_profiles(self):
        profiles = []
        seen_profiles = set()
        for row in self.profiles:
            profile_name = cstr(row.pos_profile).strip()
            if not profile_name:
                continue

            if profile_name in seen_profiles:
                frappe.throw("Duplicate POS Profile in Delivery Charges")
            seen_profiles.add(profile_name)
            profiles.append(profile_name)

        self.set_profiles_list(profiles)

    def set_profiles_list(self, profiles_list):
        if len(profiles_list) > 0:
            self.profiles_list = json.dumps(profiles_list)
        else:
            self.profiles_list = None


def get_applicable_delivery_charges(
    company,
    pos_profile=None,
    customer=None,
    address=None,
    delivery_charges=None,
    restrict=False,
):
    def _unique_non_empty(values):
        seen = set()
        result = []
        for value in values:
            normalized = cstr(value).strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            result.append(normalized)
        return result

    charges = []
    address_list = []
    delivery_charges_list = []
    if address:
        address_list.append(address)
    if customer:
        address_list.extend(
            frappe.get_all(
                "Dynamic Link",
                filters={
                    "link_doctype": "Customer",
                    "link_name": customer,
                    "parentfield": "links",
                    "parenttype": "Address",
                },
                pluck="parent",
            )
        )
    for address in _unique_non_empty(address_list):
        address_charges = frappe.get_cached_value("Address", address, "posa_delivery_charges")
        if address_charges:
            delivery_charges_list.append(address_charges)

    delivery_charges_filters = {"disabled": 0, "company": company}
    if delivery_charges:
        delivery_charges_list.append(delivery_charges)

    delivery_charges_list = _unique_non_empty(delivery_charges_list)
    if delivery_charges_list:
        delivery_charges_filters["name"] = ["in", delivery_charges_list]
    if restrict:
        delivery_charges_filters["profiles_list"] = ["not in", ["", None]]

    delivery_charges_items = frappe.get_all(
        "Delivery Charges",
        filters=delivery_charges_filters,
        fields=["*"],
    )
    if not delivery_charges_items:
        return []

    delivery_charges_list = [i.name for i in delivery_charges_items]

    delivery_profiles_filters = {"parent": ("in", delivery_charges_list)}
    if pos_profile:
        delivery_profiles_filters["pos_profile"] = pos_profile
    delivery_profiles = frappe.get_all(
        "Delivery Charges POS Profile",
        filters=delivery_profiles_filters,
        fields=["*"],
    )
    profile_by_parent = {profile.parent: profile for profile in delivery_profiles}

    for charge in delivery_charges_items:
        profile = profile_by_parent.get(charge.name)
        if profile:
            charge.rate = profile.rate
            charges.append(charge)
        else:
            if not restrict:
                if not charge.profiles_list:
                    charge.rate = charge.default_rate
                    charges.append(charge)

    return charges
