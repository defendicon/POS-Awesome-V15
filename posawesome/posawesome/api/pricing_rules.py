"""Pricing rule API utilities for POS Awesome."""

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

try:
    from erpnext.stock.get_item_details import get_item_details  # type: ignore
except Exception:
    # When running in environments where ERPNext is not installed (e.g. CI) we
    # still want the module to be importable. The actual environment used by the
    # POS runtime always includes ERPNext.
    get_item_details = None  # type: ignore


RULE_FIELDS = [
    "name",
    "priority",
    "stop_further_rules",
    "apply_multiple_pricing_rules",
    "apply_on",
    "min_qty",
    "max_qty",
    "valid_from",
    "valid_upto",
    "price_or_discount",
    "discount_type",
    "rate_or_discount",
    "currency",
    "price_list",
    "company",
    "item_code",
    "item_group",
    "brand",
    "customer",
    "customer_group",
    "territory",
    "for_price_list_rate",
    "uom",
    "margin_type",
    "margin_rate_or_amount",
    "is_free_item",
    "same_item",
    "free_item",
    "free_qty",
    "free_qty_per_unit",
    "apply_per_threshold",
    "max_free_qty",
]

SLAB_FIELDS = [
    "parent",
    "min_qty",
    "max_qty",
    "rate_or_discount",
    "discount_percentage",
    "discount_amount",
    "rate",
    "margin_rate_or_amount",
    "margin_type",
]


def _resolve_available_fields(field_list: Iterable[str], doctype: str) -> List[str]:
    meta = frappe.get_meta(doctype)
    valid = {df.fieldname for df in meta.fields}
    return [field for field in field_list if field == "name" or field in valid]


def _normalize_slab_row(row: frappe._dict) -> Dict[str, Any]:
    rate_or_discount = row.get("rate_or_discount")
    if rate_or_discount is None:
        for key in ("discount_percentage", "discount_amount", "rate", "margin_rate_or_amount"):
            if row.get(key) not in (None, ""):
                rate_or_discount = row.get(key)
                break
    return {
        "min_qty": flt(row.get("min_qty") or 0),
        "max_qty": flt(row.get("max_qty") or 0) if row.get("max_qty") else None,
        "rate_or_discount": flt(rate_or_discount or 0),
        "margin_rate_or_amount": flt(row.get("margin_rate_or_amount") or 0),
    }


def _serialize_rule(row: frappe._dict, slabs_map: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    return {
        "name": row.name,
        "priority": cint(row.priority),
        "stop_further_rules": cint(row.stop_further_rules),
        "apply_multiple_pricing_rules": cint(row.apply_multiple_pricing_rules),
        "apply_on": row.apply_on,
        "min_qty": flt(row.min_qty or 0),
        "max_qty": flt(row.max_qty or 0) if row.max_qty else None,
        "valid_from": row.valid_from,
        "valid_upto": row.valid_upto,
        "price_or_discount": row.price_or_discount,
        "discount_type": row.discount_type,
        "rate_or_discount": flt(row.rate_or_discount or 0),
        "currency": row.currency,
        "price_list": row.price_list,
        "company": row.company,
        "item_code": row.item_code,
        "item_group": row.item_group,
        "brand": row.brand,
        "customer": row.customer,
        "customer_group": row.customer_group,
        "territory": row.territory,
        "for_price_list_rate": cint(row.for_price_list_rate),
        "uom": row.uom,
        "margin_type": row.margin_type,
        "margin_rate_or_amount": flt(row.margin_rate_or_amount or 0),
        "is_free_item_rule": cint(row.is_free_item),
        "same_item": cint(row.same_item),
        "free_item": row.free_item,
        "free_qty": flt(row.free_qty or 0),
        "free_qty_per_unit": flt(row.free_qty_per_unit or 0),
        "apply_per_threshold": cint(row.apply_per_threshold),
        "max_free_qty": flt(row.max_free_qty or 0) if row.max_free_qty else None,
        "slabs": slabs_map.get(row.name, []),
    }


def _matches_party(rule: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
    for key in ("customer", "customer_group", "territory"):
        value = rule.get(key)
        if value and value != ctx.get(key):
            return False
    return True


def _matches_pricing_context(rule: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
    if rule.get("company") and rule["company"] != ctx.get("company"):
        return False
    if rule.get("price_list") and rule["price_list"] != ctx.get("price_list"):
        return False
    if rule.get("currency") and rule["currency"] != ctx.get("currency"):
        return False
    if rule.get("uom") and ctx.get("uom") and rule["uom"] != ctx.get("uom"):
        return False
    tx_date = ctx.get("date") or nowdate()
    try:
        tx_date = getdate(tx_date)
    except Exception:
        tx_date = getdate(nowdate())
    valid_from = rule.get("valid_from")
    valid_upto = rule.get("valid_upto")
    if valid_from and getdate(valid_from) > tx_date:
        return False
    if valid_upto and getdate(valid_upto) < tx_date:
        return False
    min_qty = flt(rule.get("min_qty") or 0)
    if min_qty and flt(ctx.get("qty") or ctx.get("min_qty") or 0) < min_qty:
        return False
    return _matches_party(rule, ctx)


@frappe.whitelist()
def get_active_pricing_rules(**kwargs):
    """Return a minimal snapshot of pricing rules active for the current context."""

    if not kwargs.get("company"):
        frappe.throw(_("Company is required"))
    if not kwargs.get("price_list"):
        frappe.throw(_("Price list is required"))
    if not kwargs.get("currency"):
        frappe.throw(_("Currency is required"))

    ctx = {
        "company": kwargs.get("company"),
        "price_list": kwargs.get("price_list"),
        "currency": kwargs.get("currency"),
        "customer": kwargs.get("customer"),
        "customer_group": kwargs.get("customer_group"),
        "territory": kwargs.get("territory"),
        "date": kwargs.get("date") or nowdate(),
    }

    limit = cint(kwargs.get("limit") or 0) or None
    offset = cint(kwargs.get("offset") or 0) or None

    rule_fields = _resolve_available_fields(RULE_FIELDS, "Pricing Rule")
    slab_fields = _resolve_available_fields(SLAB_FIELDS, "Pricing Rule Slab")

    conditions = {
        "selling": 1,
        "disabled": 0,
    }
    if ctx["company"]:
        conditions["company"] = ["in", (ctx["company"], "")]

    rows = frappe.get_all(
        "Pricing Rule",
        fields=rule_fields,
        filters=conditions,
        limit_page_length=limit,
        limit_start=offset,
        order_by="priority desc, modified desc",
        as_list=False,
    )

    if not rows:
        return []

    names = [row.name for row in rows]
    slabs_map: Dict[str, List[Dict[str, Any]]] = {name: [] for name in names}
    if names and slab_fields:
        slab_rows = frappe.get_all(
            "Pricing Rule Slab",
            fields=slab_fields,
            filters={"parent": ["in", names]},
            order_by="min_qty asc",
        )
        for slab in slab_rows:
            if slab.parent not in slabs_map:
                slabs_map[slab.parent] = []
            slabs_map[slab.parent].append(_normalize_slab_row(frappe._dict(slab)))

    serialized = []
    for row in rows:
        data = _serialize_rule(frappe._dict(row), slabs_map)
        if _matches_pricing_context(data, ctx):
            serialized.append(data)

    return serialized


def _parse_payload(data: Any) -> Dict[str, Any]:
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {}
    return data or {}


def _build_parent_doc(ctx: Dict[str, Any]) -> frappe._dict:
    return frappe._dict(
        {
            "doctype": "Sales Invoice",
            "company": ctx.get("company"),
            "customer": ctx.get("customer"),
            "customer_group": ctx.get("customer_group"),
            "territory": ctx.get("territory"),
            "currency": ctx.get("currency"),
            "selling_price_list": ctx.get("price_list"),
            "price_list": ctx.get("price_list"),
            "posting_date": ctx.get("date") or nowdate(),
            "transaction_date": ctx.get("date") or nowdate(),
            "conversion_rate": flt(ctx.get("conversion_rate") or 1),
            "plc_conversion_rate": flt(ctx.get("plc_conversion_rate") or 1),
        }
    )


def _evaluate_paid_line(
    line: Dict[str, Any],
    ctx: Dict[str, Any],
    parent_doc: frappe._dict,
) -> Dict[str, Any]:
    if not get_item_details:
        return {
            "item_code": line.get("item_code"),
            "qty": flt(line.get("qty") or 0),
            "rate": flt(line.get("rate") or line.get("base_rate") or 0),
            "discount_amount": flt(line.get("discount_amount") or 0),
            "discount_percentage": flt(line.get("discount_percentage") or 0),
            "pricing_rules": line.get("pricing_rules") or [],
        }

    args = frappe._dict(
        {
            "doctype": "Sales Invoice Item",
            "item_code": line.get("item_code"),
            "company": ctx.get("company"),
            "customer": ctx.get("customer"),
            "customer_group": ctx.get("customer_group"),
            "territory": ctx.get("territory"),
            "price_list": ctx.get("price_list"),
            "selling_price_list": ctx.get("price_list"),
            "price_list_currency": ctx.get("currency"),
            "currency": ctx.get("currency"),
            "conversion_rate": flt(ctx.get("conversion_rate") or 1),
            "plc_conversion_rate": flt(ctx.get("plc_conversion_rate") or 1),
            "transaction_date": ctx.get("date") or nowdate(),
            "posting_date": ctx.get("date") or nowdate(),
            "qty": flt(line.get("qty") or 0),
            "base_qty": flt(line.get("qty") or 0),
            "uom": line.get("uom"),
            "warehouse": line.get("warehouse"),
            "batch_no": line.get("batch_no"),
            "serial_no": line.get("serial_no"),
            "apply_pricing_rule": 1,
            "ignore_pricing_rule": 0,
            "pos_profile": ctx.get("pos_profile"),
        }
    )
    if line.get("base_rate"):
        args["price_list_rate"] = flt(line.get("base_rate"))
    res = get_item_details(args, parent_doc)
    pricing_rules = res.get("pricing_rules") or []
    if isinstance(pricing_rules, str):
        pricing_rules = [pricing_rules]
    return {
        "item_code": line.get("item_code"),
        "qty": flt(line.get("qty") or 0),
        "rate": flt(res.get("rate") or 0),
        "discount_amount": flt(res.get("discount_amount") or 0),
        "discount_percentage": flt(res.get("discount_percentage") or 0),
        "pricing_rules": pricing_rules,
    }


def _evaluate_free_items(paid_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    freebies: List[Dict[str, Any]] = []
    for line in paid_results:
        for rule in line.get("pricing_rules") or []:
            rule_doc = frappe.get_cached_value("Pricing Rule", rule, ["is_free_item", "free_item", "free_qty", "same_item"])
            if not rule_doc:
                continue
            if isinstance(rule_doc, (list, tuple)):
                is_free = cint(rule_doc[0])
                free_item = rule_doc[1] if len(rule_doc) > 1 else None
                free_qty = flt(rule_doc[2]) if len(rule_doc) > 2 else 0
                same_item = cint(rule_doc[3]) if len(rule_doc) > 3 else 0
            else:
                is_free = cint(rule_doc.get("is_free_item"))
                free_item = rule_doc.get("free_item")
                free_qty = flt(rule_doc.get("free_qty") or 0)
                same_item = cint(rule_doc.get("same_item"))
            if not is_free:
                continue
            freebies.append(
                {
                    "item_code": free_item if not same_item else line.get("item_code"),
                    "qty": flt(free_qty or 0),
                    "source_rule": rule,
                }
            )
    return freebies


@frappe.whitelist()
def reconcile_line_prices(cart_payload: Optional[Any] = None):
    """Reconcile locally computed prices with ERPNext's pricing engine."""

    payload = _parse_payload(cart_payload)
    ctx = payload.get("context") or {}
    lines = payload.get("lines") or []

    if not isinstance(lines, list):
        frappe.throw(_("Invalid payload"))

    parent_doc = _build_parent_doc(ctx)

    paid_results: List[Dict[str, Any]] = []
    reconciled = []
    for line in lines:
        if line.get("is_free"):
            continue
        if not line.get("item_code"):
            continue
        evaluated = _evaluate_paid_line(line, ctx, parent_doc)
        evaluated["row_id"] = line.get("posa_row_id") or line.get("row_id") or line.get("idx")
        reconciled.append(
            {
                "row_id": evaluated["row_id"],
                "item_code": evaluated["item_code"],
                "qty": evaluated["qty"],
                "rate": evaluated["rate"],
                "discount_amount": evaluated["discount_amount"],
                "discount_percentage": evaluated["discount_percentage"],
                "pricing_rules": evaluated.get("pricing_rules") or [],
            }
        )
        paid_results.append(evaluated)

    freebies = _evaluate_free_items(paid_results)

    return {
        "paid_lines": reconciled,
        "free_lines": freebies,
    }
