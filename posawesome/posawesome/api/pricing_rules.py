# -*- coding: utf-8 -*-
"""Helpers for exposing Pricing Rule management to the POS frontend."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint


def _resolve_company(profile: str | None = None, company: str | None = None) -> str | None:
    """Return the company associated with the provided profile or explicit argument."""

    if company:
        return company

    if not profile:
        return None

    try:
        pos_profile = frappe.get_cached_doc("POS Profile", profile)
    except frappe.DoesNotExistError:
        frappe.throw(_("POS Profile {0} does not exist").format(profile))

    return pos_profile.company


@frappe.whitelist()
def get_pricing_rules(profile: str | None = None, company: str | None = None):
    """Return pricing rules that are relevant for the POS."""

    target_company = _resolve_company(profile, company)

    filters = {"selling": 1}
    if target_company:
        filters["company"] = target_company

    fields = _resolve_fields()

    rules = frappe.get_all(
        "Pricing Rule",
        filters=filters,
        fields=fields,
        order_by="modified desc",
    )

    for rule in rules:
        rule["disable"] = cint(rule.get("disable"))

    return rules


def _resolve_fields() -> list[str]:
    """Return the list of Pricing Rule fields supported by the current schema."""

    desired_fields = [
        "name",
        "title",
        "company",
        "selling",
        "apply_on",
        "applicable_for",
        "price_or_product_discount",
        "rate_or_discount",
        "min_qty",
        "max_qty",
        "min_amount",
        "max_amount",
        "valid_from",
        "valid_upto",
        "for_price_list",
        "currency",
        "priority",
        "disable",
    ]

    existing_columns = set(frappe.db.get_table_columns("Pricing Rule") or [])
    fields = [field for field in desired_fields if field in existing_columns]

    if fields:
        return fields

    # Fallback to the minimal set of columns used by the POS frontend.
    minimal_fields = [
        "name",
        "title",
        "apply_on",
        "price_or_product_discount",
        "valid_from",
        "valid_upto",
        "disable",
    ]

    return [field for field in minimal_fields if field in existing_columns] or ["name"]


@frappe.whitelist()
def set_pricing_rule_status(pricing_rule: str, disable: int | str):
    """Enable or disable a pricing rule from the POS interface."""

    if not pricing_rule:
        frappe.throw(_("Pricing Rule is required"))

    disable_value = cint(disable)

    rule = frappe.get_doc("Pricing Rule", pricing_rule)

    if rule.disable == disable_value:
        return {"name": rule.name, "disable": rule.disable}

    rule.db_set("disable", disable_value)
    rule.reload()

    return {"name": rule.name, "disable": rule.disable}
