# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json

import frappe
from frappe.utils import cstr, flt, getdate, nowdate
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
    today = getdate(nowdate())
    coupons_data = frappe.get_all(
        "POS Coupon",
        filters={
            "company": company,
            "coupon_type": "Gift Card",
            "customer": customer,
            "used": 0,
        },
        fields=["coupon_code", "valid_from", "valid_upto"],
    )
    if len(coupons_data):
        coupons = [
            i.coupon_code
            for i in coupons_data
            if _is_coupon_active(i, today)
        ]
    return coupons


def _is_coupon_active(coupon_data, today):
    """Return True if the coupon is valid for the provided date."""

    if coupon_data.valid_from and getdate(coupon_data.valid_from) > today:
        return False

    if coupon_data.valid_upto and getdate(coupon_data.valid_upto) < today:
        return False

    return True


@frappe.whitelist()
def get_offers(profile, customer=None, customer_group=None, territory=None):
    pos_profile = frappe.get_doc("POS Profile", profile)
    company = pos_profile.company
    warehouse = pos_profile.warehouse
    date = nowdate()

    party_filters = _normalize_party_filters(
        {
            "customer": customer,
            "customer_group": customer_group,
            "territory": territory,
        }
    )

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
    pricing_rule_offers = _get_pricing_rule_offers(pos_profile, party_filters) or []

    offers = list(data or [])
    offers.extend(promotional_scheme_offers)
    offers.extend(pricing_rule_offers)
    return offers


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


def _get_pricing_rule_offers(pos_profile, party_filters=None):
    if not frappe.db.table_exists("Pricing Rule"):
        return []

    if not _is_truthy(getattr(pos_profile, "posa_enable_pricing_rules", 0)):
        return []

    supported_apply_on = {"Item Code", "Item Group", "Brand", "Transaction"}
    today = getdate(nowdate())
    party_filters = party_filters or {}

    base_filters = {
        "disable": 0,
        "docstatus": ("<", 2),
        "selling": 1,
        "company": pos_profile.company,
    }

    try:
        rules = frappe.get_all(
            "Pricing Rule",
            filters=base_filters,
            fields=[
                "name",
                "title",
                "rule_description",
                "apply_on",
                "price_or_product_discount",
                "for_price_list",
                "warehouse",
                "min_qty",
                "max_qty",
                "min_amt",
                "max_amt",
                "rate_or_discount",
                "discount_percentage",
                "discount_amount",
                "rate",
                "coupon_code_based",
                "valid_from",
                "valid_upto",
                "priority",
                "applicable_for",
                "customer",
                "customer_group",
                "territory",
                "condition",
                "mixed_conditions",
                "apply_rule_on_other",
                "is_cumulative",
                "is_recursive",
                "apply_multiple_pricing_rules",
                "same_item",
                "free_item",
                "free_qty",
                "round_free_qty",
            ],
            order_by="priority asc, name asc",
        )
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "POS Awesome - Failed to fetch Pricing Rules for offers",
        )
        return []

    offers = []
    price_list = getattr(pos_profile, "selling_price_list", None)

    for rule_meta in rules:
        try:
            apply_on = rule_meta.apply_on
            if apply_on not in supported_apply_on:
                continue

            if rule_meta.mixed_conditions or rule_meta.apply_rule_on_other:
                continue

            if not _pricing_rule_matches_party(rule_meta, party_filters):
                continue

            if rule_meta.condition:
                continue

            if rule_meta.is_cumulative or rule_meta.is_recursive:
                continue

            if rule_meta.apply_multiple_pricing_rules:
                continue

            if rule_meta.valid_from and getdate(rule_meta.valid_from) > today:
                continue

            if rule_meta.valid_upto and getdate(rule_meta.valid_upto) < today:
                continue

            if rule_meta.for_price_list:
                if not price_list or rule_meta.for_price_list != price_list:
                    continue

            rule_doc = frappe.get_doc("Pricing Rule", rule_meta.name)
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                f"POS Awesome - Unable to load Pricing Rule {rule_meta.name}",
            )
            continue

        offers.extend(_convert_pricing_rule_to_offers(rule_doc, pos_profile))

    return offers


def _convert_pricing_rule_to_offers(rule, pos_profile):
    apply_on = rule.get("apply_on")
    offer_type = _infer_pricing_rule_offer_type(rule)

    base_offer = {
        "name": _make_offer_identifier("pricing-rule", rule.name),
        "row_id": _make_offer_identifier("pricing-rule", rule.name),
        "title": rule.get("title") or rule.name,
        "description": rule.get("rule_description") or rule.get("title") or rule.name,
        "company": rule.get("company"),
        "pos_profile": pos_profile.name,
        "warehouse": rule.get("warehouse"),
        "apply_on": apply_on,
        "apply_type": apply_on if apply_on in ("Item Code", "Item Group", "Brand") else "",
        "offer": offer_type,
        "auto": 1,
        "coupon_based": 1 if rule.get("coupon_code_based") else 0,
        "offer_applied": 0,
        "price_or_product_discount": rule.get("price_or_product_discount"),
        "min_qty": flt(rule.get("min_qty")),
        "max_qty": flt(rule.get("max_qty")),
        "min_amt": flt(rule.get("min_amt")),
        "max_amt": flt(rule.get("max_amt")),
        "discount_type": _map_discount_type(rule.get("rate_or_discount")),
        "rate": flt(rule.get("rate")),
        "discount_amount": flt(rule.get("discount_amount")),
        "discount_percentage": flt(rule.get("discount_percentage")),
        "given_qty": flt(rule.get("free_qty")),
        "valid_from": rule.get("valid_from"),
        "valid_upto": rule.get("valid_upto"),
        "promo_source": "Pricing Rule",
        "pricing_rule": rule.name,
        "round_free_qty": rule.get("round_free_qty"),
        "source": "Pricing Rule",
        "priority": rule.get("priority"),
        "applicable_for": rule.get("applicable_for"),
        "customer": rule.get("customer"),
        "customer_group": rule.get("customer_group"),
        "territory": rule.get("territory"),
    }

    if offer_type == "Give Product":
        same_item = bool(rule.get("same_item"))
        free_item = rule.get("free_item")

        if not same_item and free_item:
            base_offer["give_item"] = free_item
            base_offer["apply_item_code"] = free_item

        if not base_offer["discount_percentage"] and not base_offer["discount_amount"] and not base_offer["rate"]:
            base_offer["discount_type"] = "Discount Percentage"
            base_offer["discount_percentage"] = 100
    else:
        base_offer["given_qty"] = 0
        base_offer.pop("give_item", None)

    base_offer = _normalize_discount_fields(base_offer)

    targets = _gather_pricing_rule_targets(rule)

    offers = []
    if apply_on == "Transaction":
        base_offer["name"] = _make_offer_identifier("pricing-rule", rule.name, "transaction")
        base_offer["row_id"] = base_offer["name"]
        offers.append(base_offer)
        return offers

    if not targets:
        return offers

    same_item = bool(rule.get("same_item"))

    for target in targets:
        offer_entry = base_offer.copy()
        offer_entry["name"] = _make_offer_identifier("pricing-rule", rule.name, target)
        offer_entry["row_id"] = offer_entry["name"]

        if apply_on == "Item Code":
            offer_entry["item"] = target
            offer_entry["apply_item_code"] = target
            offer_entry["apply_type"] = "Item Code"
            if offer_type == "Give Product" and same_item:
                offer_entry["replace_item"] = 1
        elif apply_on == "Item Group":
            offer_entry["item_group"] = target
            offer_entry["apply_item_group"] = target
            offer_entry["apply_type"] = "Item Group"
            if offer_type == "Give Product" and same_item:
                offer_entry["replace_cheapest_item"] = 1
        elif apply_on == "Brand":
            offer_entry["brand"] = target
            offer_entry["apply_type"] = "Brand"
            if offer_type == "Give Product" and same_item:
                offer_entry["replace_cheapest_item"] = 1

        offers.append(offer_entry)

    return offers


def _gather_pricing_rule_targets(rule):
    apply_on = rule.get("apply_on")
    targets = []

    if apply_on == "Item Code":
        targets = [row.item_code for row in getattr(rule, "items", []) if getattr(row, "item_code", None)]
    elif apply_on == "Item Group":
        targets = [row.item_group for row in getattr(rule, "item_groups", []) if getattr(row, "item_group", None)]
    elif apply_on == "Brand":
        targets = [row.brand for row in getattr(rule, "brands", []) if getattr(row, "brand", None)]

    seen = set()
    unique_targets = []
    for target in targets:
        key = cstr(target)
        if key and key not in seen:
            seen.add(key)
            unique_targets.append(key)

    return unique_targets


def _infer_pricing_rule_offer_type(rule):
    if (rule.get("price_or_product_discount") or "").lower() == "product":
        return "Give Product"

    if rule.get("apply_on") == "Transaction":
        return "Grand Total"

    return "Item Price"


def _pricing_rule_matches_party(rule_meta, party_filters):
    applicable_for = cstr(rule_meta.applicable_for or "").strip()
    if not applicable_for:
        return True

    if not party_filters:
        return False

    if applicable_for == "Customer":
        rule_customer = cstr(rule_meta.customer or "").strip()
        return bool(rule_customer) and rule_customer == party_filters.get("customer")

    if applicable_for == "Customer Group":
        rule_group = cstr(rule_meta.customer_group or "").strip()
        return bool(rule_group) and rule_group == party_filters.get("customer_group")

    if applicable_for == "Territory":
        rule_territory = cstr(rule_meta.territory or "").strip()
        return bool(rule_territory) and rule_territory == party_filters.get("territory")

    return False


def _is_truthy(value):
    if value is None:
        return False

    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized:
            return False
        return normalized in {"1", "true", "yes", "y"}

    return bool(value)

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


def _normalize_party_filters(filters):
    normalized = {}
    if not filters:
        return normalized

    for key in ("customer", "customer_group", "territory"):
        value = filters.get(key)
        text = cstr(value or "").strip()
        if text:
            normalized[key] = text

    return normalized
