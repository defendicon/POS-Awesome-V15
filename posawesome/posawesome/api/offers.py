# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe
from frappe.utils import cstr, flt, nowdate
from posawesome.posawesome.doctype.pos_coupon.pos_coupon import check_coupon_code
from posawesome.posawesome.doctype.delivery_charges.delivery_charges import (
    get_applicable_delivery_charges as _get_applicable_delivery_charges,
)


@frappe.whitelist()
def get_pos_coupon(coupon, customer, company):
    res = check_coupon_code(coupon, customer, company)
    return res


@frappe.whitelist()
def get_active_gift_coupons(customer, company):
    coupons = []
    coupons_data = frappe.get_all(
        "POS Coupon",
        filters={
            "company": company,
            "coupon_type": "Gift Card",
            "customer": customer,
            "used": 0,
        },
        fields=["coupon_code"],
    )
    if len(coupons_data):
        coupons = [i.coupon_code for i in coupons_data]
    return coupons


@frappe.whitelist()
def get_offers(profile):
    pos_profile = frappe.get_doc("POS Profile", profile)
    company = pos_profile.company
    warehouse = pos_profile.warehouse
    date = nowdate()

    values = {
        "company": company,
        "pos_profile": profile,
        "warehouse": warehouse,
        "valid_from": date,
        "valid_upto": date,
    }
    data = (
        frappe.db.sql(
            """
        SELECT *
        FROM `tabPOS Offer`
        WHERE
        disable = 0 AND
        company = %(company)s AND
        (pos_profile is NULL OR pos_profile  = '' OR  pos_profile = %(pos_profile)s) AND
        (warehouse is NULL OR warehouse  = '' OR  warehouse = %(warehouse)s) AND
        (valid_from is NULL OR valid_from  = '' OR  valid_from <= %(valid_from)s) AND
        (valid_upto is NULL OR valid_upto  = '' OR  valid_upto >= %(valid_upto)s)
    """,
            values=values,
            as_dict=1,
        )
        or []
    )

    promotional_scheme_offers = _get_promotional_scheme_offers(pos_profile) or []

    return data + promotional_scheme_offers


@frappe.whitelist()
def get_applicable_delivery_charges(company, pos_profile, customer, shipping_address_name=None):
    return _get_applicable_delivery_charges(company, pos_profile, customer, shipping_address_name)


def _get_promotional_scheme_offers(pos_profile):
    if not frappe.db.table_exists("Promotional Scheme"):
        return []

    date = nowdate()
    values = {"company": pos_profile.company, "date": date}

    try:
        promotional_schemes = frappe.db.sql(
            """
            SELECT name
            FROM `tabPromotional Scheme`
            WHERE
                disable = 0
                AND selling = 1
                AND company = %(company)s
                AND (valid_from IS NULL OR valid_from = '' OR valid_from <= %(date)s)
                AND (valid_upto IS NULL OR valid_upto = '' OR valid_upto >= %(date)s)
            """,
            values=values,
            as_dict=True,
        )
    except Exception:
        frappe.log_error(frappe.get_traceback(), "POS Awesome - Failed to fetch Promotional Schemes")
        return []

    offers = []
    for row in promotional_schemes:
        try:
            scheme = frappe.get_doc("Promotional Scheme", row.name)
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                f"POS Awesome - Unable to load Promotional Scheme {row.name}",
            )
            continue

        offers.extend(_prepare_promotional_scheme_offers(scheme, pos_profile))

    return offers


def _prepare_promotional_scheme_offers(scheme, pos_profile):
    # Skip schemes with party specific or unsupported configurations for POS logic
    if scheme.applicable_for or scheme.apply_rule_on_other:
        return []

    if scheme.mixed_conditions or scheme.is_cumulative:
        return []

    offers = []
    offers.extend(_build_price_discount_offers(scheme, pos_profile))
    offers.extend(_build_product_discount_offers(scheme, pos_profile))
    return [offer for offer in offers if offer]


def _build_price_discount_offers(scheme, pos_profile):
    slabs = getattr(scheme, "price_discount_slabs", [])
    if not slabs:
        return []

    targets = _get_scheme_targets(scheme)
    profile_price_list = getattr(pos_profile, "selling_price_list", None)
    profile_warehouse = getattr(pos_profile, "warehouse", None)

    offers = []

    for slab in slabs:
        if slab.disable:
            continue

        if slab.for_price_list and profile_price_list and slab.for_price_list != profile_price_list:
            continue

        if slab.warehouse and profile_warehouse and slab.warehouse != profile_warehouse:
            continue

        offer_template = {
            "name": _make_offer_identifier(scheme.name, slab.name),
            "row_id": _make_offer_identifier(scheme.name, slab.name),
            "title": scheme.name,
            "description": slab.rule_description or scheme.name,
            "company": scheme.company,
            "pos_profile": pos_profile.name,
            "warehouse": slab.warehouse,
            "apply_on": scheme.apply_on,
            "apply_type": scheme.apply_on if scheme.apply_on in ("Item Code", "Item Group") else "",
            "offer": "Grand Total" if scheme.apply_on == "Transaction" else "Item Price",
            "auto": 1,
            "coupon_based": 0,
            "offer_applied": 0,
            "min_qty": flt(slab.min_qty),
            "max_qty": flt(slab.max_qty),
            "min_amt": flt(slab.min_amount),
            "max_amt": flt(slab.max_amount),
            "discount_type": _map_discount_type(slab.rate_or_discount),
            "rate": flt(slab.rate),
            "discount_amount": flt(slab.discount_amount),
            "discount_percentage": flt(slab.discount_percentage),
            "given_qty": 0,
            "valid_from": scheme.valid_from,
            "valid_upto": scheme.valid_upto,
            "promo_source": "Promotional Scheme",
            "promotional_scheme": scheme.name,
            "promotional_scheme_rule": slab.name,
        }

        offer_template = _normalize_discount_fields(offer_template)

        if scheme.apply_on == "Transaction":
            offers.append(offer_template)
            continue

        if not targets:
            continue

        for target in targets:
            new_offer = offer_template.copy()
            new_offer["name"] = _make_offer_identifier(scheme.name, target, slab.name)
            new_offer["row_id"] = new_offer["name"]

            if scheme.apply_on == "Item Code":
                new_offer["item"] = target
                new_offer["apply_item_code"] = target
            elif scheme.apply_on == "Item Group":
                new_offer["item_group"] = target
                new_offer["apply_item_group"] = target
            elif scheme.apply_on == "Brand":
                new_offer["brand"] = target

            offers.append(new_offer)

    return offers


def _build_product_discount_offers(scheme, pos_profile):
    slabs = getattr(scheme, "product_discount_slabs", [])
    if not slabs:
        return []

    targets = _get_scheme_targets(scheme)
    profile_warehouse = getattr(pos_profile, "warehouse", None)

    offers = []

    for slab in slabs:
        if slab.disable:
            continue

        if slab.warehouse and profile_warehouse and slab.warehouse != profile_warehouse:
            continue

        if flt(slab.free_qty) <= 0:
            continue

        offer_template = {
            "name": _make_offer_identifier(scheme.name, slab.name),
            "row_id": _make_offer_identifier(scheme.name, slab.name),
            "title": scheme.name,
            "description": slab.rule_description or scheme.name,
            "company": scheme.company,
            "pos_profile": pos_profile.name,
            "warehouse": slab.warehouse,
            "apply_on": scheme.apply_on,
            "offer": "Give Product",
            "auto": 1,
            "coupon_based": 0,
            "offer_applied": 0,
            "min_qty": flt(slab.min_qty),
            "max_qty": flt(slab.max_qty),
            "min_amt": flt(slab.min_amount),
            "max_amt": flt(slab.max_amount),
            "given_qty": flt(slab.free_qty),
            "discount_type": "Rate" if flt(slab.free_item_rate) else "Discount Percentage",
            "rate": flt(slab.free_item_rate),
            "discount_amount": 0,
            "discount_percentage": 100 if not flt(slab.free_item_rate) else 0,
            "valid_from": scheme.valid_from,
            "valid_upto": scheme.valid_upto,
            "promo_source": "Promotional Scheme",
            "promotional_scheme": scheme.name,
            "promotional_scheme_rule": slab.name,
            "round_free_qty": slab.round_free_qty,
        }

        if slab.free_item and not slab.same_item:
            offer_template["give_item"] = slab.free_item
            offer_template["apply_item_code"] = slab.free_item

        offer_template = _normalize_discount_fields(offer_template)

        if scheme.apply_on == "Transaction":
            offers.append(offer_template)
            continue

        if not targets:
            continue

        for target in targets:
            new_offer = offer_template.copy()
            new_offer["name"] = _make_offer_identifier(scheme.name, target, slab.name)
            new_offer["row_id"] = new_offer["name"]

            if scheme.apply_on == "Item Code":
                new_offer["item"] = target
                new_offer["apply_type"] = "Item Code"
                new_offer["apply_item_code"] = target
                new_offer["replace_item"] = 1 if slab.same_item else 0
            elif scheme.apply_on == "Item Group":
                new_offer["item_group"] = target
                new_offer["apply_type"] = "Item Group"
                new_offer["apply_item_group"] = target
                if slab.same_item:
                    new_offer["replace_cheapest_item"] = 1
            elif scheme.apply_on == "Brand":
                new_offer["brand"] = target
                if slab.same_item:
                    new_offer["replace_cheapest_item"] = 1

            offers.append(new_offer)

    return offers


def _get_scheme_targets(scheme):
    targets = []
    if scheme.apply_on == "Item Code":
        targets = [row.item_code for row in scheme.items if row.item_code]
    elif scheme.apply_on == "Item Group":
        targets = [row.item_group for row in scheme.item_groups if row.item_group]
    elif scheme.apply_on == "Brand":
        targets = [row.brand for row in scheme.brands if row.brand]

    # Remove duplicates while preserving order
    seen = set()
    unique_targets = []
    for target in targets:
        target_key = cstr(target)
        if target_key and target_key not in seen:
            seen.add(target_key)
            unique_targets.append(target_key)

    return unique_targets


def _map_discount_type(rate_or_discount):
    mapping = {
        "Rate": "Rate",
        "Discount Percentage": "Discount Percentage",
        "Discount Amount": "Discount Amount",
    }
    return mapping.get(rate_or_discount, "Discount Percentage")


def _normalize_discount_fields(offer):
    discount_type = offer.get("discount_type")

    if discount_type != "Rate":
        offer["rate"] = flt(0)

    if discount_type != "Discount Amount":
        offer["discount_amount"] = flt(0)

    if discount_type != "Discount Percentage":
        offer["discount_percentage"] = flt(0)

    return offer


def _make_offer_identifier(*parts):
    cleaned = [frappe.scrub(cstr(part)) for part in parts if part]
    if not cleaned:
        cleaned = [frappe.generate_hash(length=10)]
    return "ps-" + "-".join(cleaned)
