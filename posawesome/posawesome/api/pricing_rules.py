"""Pricing rule API endpoints for POS Awesome.

These endpoints expose a lightweight snapshot of active pricing rules for the
frontend and provide a reconciliation endpoint to double check locally applied
rules with ERPNext's official pricing rule engine.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

import frappe
from frappe import _
from frappe.query_builder import DocType
from frappe.query_builder.functions import Coalesce
from frappe.utils import cint, flt, getdate, nowdate


# ---------------------------------------------------------------------------
# Helpers


def _parse_params(params, kwargs):
    if params and isinstance(params, str):
        data = frappe.parse_json(params)
    elif isinstance(params, dict):
        data = frappe._dict(params)
    else:
        data = frappe._dict(kwargs)

    return frappe._dict({k: data.get(k) for k in data})


def _coerce_date(value: str | None) -> str:
    if not value:
        return nowdate()
    try:
        return str(getdate(value))
    except Exception:
        return nowdate()


def _as_list(value: Iterable) -> List:
    return list(value) if value else []


def _get_targets_map(parent_names: List[str]) -> Dict[str, Dict[str, List[str]]]:
    """Fetch child table rows for item code / group / brand mappings."""

    target_map: Dict[str, Dict[str, List[str]]] = {
        "item_code": {},
        "item_group": {},
        "brand": {},
    }

    if not parent_names:
        return target_map

    child_configs: Tuple[Tuple[str, str], ...] = (
        ("Pricing Rule Item Code", "item_code"),
        ("Pricing Rule Item Group", "item_group"),
        ("Pricing Rule Brand", "brand"),
    )

    for doctype, fieldname in child_configs:
        rows = frappe.get_all(doctype, filters={"parent": ("in", parent_names)}, fields=["parent", fieldname])
        for row in rows:
            if not row.get(fieldname):
                continue
            target_map[fieldname].setdefault(row.parent, []).append(row[fieldname])

    return target_map


def _serialize_rule(base, target_field: str | None, targets: Iterable[str] | None) -> List[dict]:
    """Return serialised rules for each specific target."""

    base_rule = frappe._dict(base)
    if not target_field:
        return [base_rule]

    target_values = list(targets or [])
    if not target_values:
        return [base_rule]

    serialised = []
    for value in target_values:
        cloned = frappe._dict(base_rule.copy())
        cloned[target_field] = value
        serialised.append(cloned)

    return serialised


def _normalise_rule(doc: frappe._dict) -> frappe._dict:
    """Map ERPNext fields to the lightweight payload expected by the frontend."""

    price_or_product_discount = doc.get("price_or_product_discount") or ""
    rate_or_discount = doc.get("rate_or_discount") or ""

    discount_type = ""
    if rate_or_discount in {"Discount Percentage", "Discount Rate"}:
        discount_type = "Rate"
    elif rate_or_discount in {"Discount Amount"}:
        discount_type = "Amount"
    elif rate_or_discount in {"Margin", "Margin Rate", "Margin Amount"}:
        discount_type = "Margin"
    elif rate_or_discount == "Rate":
        discount_type = "Rate"

    slabs = []
    if doc.get("min_qty"):
        slabs.append(
            {
                "min_qty": flt(doc.get("min_qty")),
                "rate_or_discount": flt(
                    doc.get("rate") or doc.get("discount_percentage") or doc.get("discount_amount") or 0
                ),
            }
        )

    output = frappe._dict(
        name=doc.get("name"),
        priority=cint(doc.get("priority") or 0),
        stop_further_rules=cint(doc.get("stop_further_rules") or 0),
        apply_multiple_pricing_rules=cint(doc.get("apply_multiple_pricing_rules") or 0),
        apply_on=doc.get("apply_on"),
        min_qty=flt(doc.get("min_qty") or 0),
        valid_from=str(doc.get("valid_from")) if doc.get("valid_from") else None,
        valid_upto=str(doc.get("valid_upto")) if doc.get("valid_upto") else None,
        price_or_discount=price_or_product_discount,
        discount_type=discount_type,
        rate_or_discount_type=rate_or_discount,
        rate_or_discount=flt(
            doc.get("rate") or doc.get("discount_percentage") or doc.get("discount_amount") or 0
        ),
        free_item_rate=flt(doc.get("free_item_rate") or 0),
        currency=doc.get("currency"),
        price_list=doc.get("for_price_list"),
        company=doc.get("company"),
        customer=doc.get("customer"),
        customer_group=doc.get("customer_group"),
        territory=doc.get("territory"),
        for_price_list_rate=flt(doc.get("for_price_list_rate") or 0),
        uom=doc.get("uom"),
        slabs=slabs,
        margin_type=doc.get("margin_type"),
        margin_rate_or_amount=flt(doc.get("margin_rate_or_amount") or 0),
        apply_discount_on_rate=cint(doc.get("apply_discount_on_rate") or 0),
        is_free_item_rule=1 if price_or_product_discount == "Product" else 0,
        same_item=cint(doc.get("same_item") or 0),
        free_item=doc.get("free_item"),
        free_qty=(
            flt(doc.get("free_qty") or 0)
            if cint(doc.get("is_recursive") or doc.get("apply_per_threshold") or 0)
            else 1
        ),
        free_qty_per_unit=flt(doc.get("free_qty_per_unit") or 0),
        apply_per_threshold=cint(doc.get("is_recursive") or doc.get("apply_per_threshold") or 0),
        max_free_qty=flt(doc.get("max_free_qty")) if doc.get("max_free_qty") is not None else None,
        recurse_for=flt(doc.get("recurse_for") or 0),
        apply_recursion_over=flt(doc.get("apply_recursion_over") or 0),
        round_free_qty=cint(doc.get("round_free_qty") or 0),
        dont_enforce_free_item_qty=cint(doc.get("dont_enforce_free_item_qty") or 0),
    )

    return output


# ---------------------------------------------------------------------------
# Public API


@frappe.whitelist()
def get_active_pricing_rules(params: dict | None = None, **kwargs):
    """Return active selling pricing rules for the POS context."""

    ctx = _parse_params(params, kwargs)
    if not ctx.get("company"):
        frappe.throw(_("Company is required"))
    if not ctx.get("price_list"):
        frappe.throw(_("Price List is required"))

    ctx_date = _coerce_date(ctx.get("date"))

    PricingRule = DocType("Pricing Rule")
    meta = frappe.get_meta("Pricing Rule")

    select_columns = [
        PricingRule.name,
        PricingRule.priority,
        PricingRule.apply_multiple_pricing_rules,
        PricingRule.apply_on,
        PricingRule.min_qty,
        PricingRule.valid_from,
        PricingRule.valid_upto,
        PricingRule.price_or_product_discount,
        PricingRule.rate_or_discount,
        PricingRule.discount_percentage,
        PricingRule.discount_amount,
        PricingRule.rate,
        PricingRule.currency,
        PricingRule.for_price_list,
        PricingRule.company,
        PricingRule.customer,
        PricingRule.customer_group,
        PricingRule.territory,
    ]

    optional_fields = [
        "margin_type",
        "margin_rate_or_amount",
        "apply_discount_on_rate",
        "same_item",
        "free_item",
        "free_qty",
        "free_qty_per_unit",
        "free_item_rate",
        "apply_per_threshold",
        "max_free_qty",
        "is_recursive",
        "recurse_for",
        "apply_recursion_over",
        "round_free_qty",
        "dont_enforce_free_item_qty",
        "stop_further_rules",
        "for_price_list_rate",
        "uom",
    ]

    for fieldname in optional_fields:
        if meta.has_field(fieldname):
            select_columns.append(getattr(PricingRule, fieldname))

    query = (
        frappe.qb.from_(PricingRule)
        .select(*select_columns)
        .where(PricingRule.selling == 1)
        .where(Coalesce(PricingRule.disable, 0) == 0)
        .where(PricingRule.company == ctx.company)
        .where((PricingRule.valid_from.isnull()) | (PricingRule.valid_from <= ctx_date))
        .where((PricingRule.valid_upto.isnull()) | (PricingRule.valid_upto >= ctx_date))
    )

    if ctx.get("price_list"):
        query = query.where(
            (PricingRule.for_price_list.isnull()) | (PricingRule.for_price_list == ctx.price_list)
        )

    if ctx.get("currency"):
        query = query.where((PricingRule.currency.isnull()) | (PricingRule.currency == ctx.currency))

    if ctx.get("customer"):
        query = query.where((PricingRule.customer.isnull()) | (PricingRule.customer == ctx.customer))
    if ctx.get("customer_group"):
        query = query.where(
            (PricingRule.customer_group.isnull()) | (PricingRule.customer_group == ctx.customer_group)
        )
    if ctx.get("territory"):
        query = query.where((PricingRule.territory.isnull()) | (PricingRule.territory == ctx.territory))

    rules = query.run(as_dict=True)
    parent_names = [r["name"] for r in rules]
    targets = _get_targets_map(parent_names)

    payload: List[dict] = []
    for row in rules:
        normalised = _normalise_rule(row)
        apply_on = (row.apply_on or "").strip()
        field_name = None
        mapping = {
            "Item Code": "item_code",
            "Item Group": "item_group",
            "Brand": "brand",
        }
        if apply_on in mapping:
            field_name = mapping[apply_on]

        target_values = targets.get(field_name, {}).get(row.name) if field_name else None
        serialised = _serialize_rule(normalised, field_name, target_values)
        payload.extend(serialised)

    return payload


def _build_doc_context(ctx: frappe._dict):
    doc = frappe._dict(
        doctype="Sales Invoice",
        company=ctx.company,
        customer=ctx.get("customer"),
        customer_group=ctx.get("customer_group"),
        territory=ctx.get("territory"),
        currency=ctx.get("currency"),
        selling_price_list=ctx.get("price_list"),
        price_list_currency=ctx.get("currency"),
        conversion_rate=flt(ctx.get("conversion_rate") or 1),
        items=[],
    )
    return doc


def _build_pricing_args(line: frappe._dict, ctx: frappe._dict) -> frappe._dict:
    raw_qty = flt(line.qty or 0)

    stock_candidates = [
        line.get("stock_qty"),
        line.get("base_qty"),
        line.get("base_quantity"),
        line.get("transfer_qty"),
    ]

    stock_qty = None
    for candidate in stock_candidates:
        value = flt(candidate or 0)
        if value:
            stock_qty = value
            break

    if stock_qty is None:
        conversion_candidates = [
            line.get("conversion_factor"),
            line.get("uom_conversion_factor"),
        ]
        for factor in conversion_candidates:
            numeric = flt(factor or 0)
            if numeric not in (0, 1):
                stock_qty = raw_qty * numeric
                break

    if stock_qty is None:
        stock_qty = raw_qty

    qty = abs(raw_qty)
    effective_stock_qty = abs(stock_qty)

    return frappe._dict(
        doctype="Sales Invoice Item",
        parent="POS-AWESOME-CART",
        parenttype="Sales Invoice",
        item_code=line.item_code,
        qty=qty,
        stock_qty=effective_stock_qty,
        price_list_rate=flt(line.base_price_list_rate or line.price_list_rate or 0),
        rate=flt(line.base_rate or line.rate or 0),
        currency=ctx.get("currency"),
        price_list=ctx.get("price_list"),
        transaction_date=ctx.get("date") or nowdate(),
        company=ctx.company,
        conversion_rate=flt(ctx.get("conversion_rate") or 1),
        plc_conversion_rate=flt(ctx.get("conversion_rate") or 1),
        customer=ctx.get("customer"),
        customer_group=ctx.get("customer_group"),
        territory=ctx.get("territory"),
        pricing_rules=line.get("pricing_rules"),
        warehouse=line.get("warehouse"),
        uom=line.get("uom"),
        item_group=line.get("item_group"),
        brand=line.get("brand"),
        ignore_pricing_rule=0,
        child_docname=line.get("posa_row_id") or line.get("name") or line.item_code,
        transaction_type="selling",
    )


def _collect_freebies(accumulator: Dict[Tuple[str, str], Dict[str, frappe._dict]], free_item_data):
    if not free_item_data:
        return
    for entry in free_item_data:
        key = (entry.get("item_code"), entry.get("pricing_rules"))
        record = accumulator.setdefault(key, frappe._dict(entry))
        record.qty = flt(record.get("qty") or 0) + flt(entry.get("qty") or 0)


@frappe.whitelist()
def reconcile_line_prices(cart_payload: dict | str | None = None):
    """Recalculate line prices with ERPNext logic and return diffs."""

    if not cart_payload:
        return {"updates": [], "free_lines": []}

    if isinstance(cart_payload, str):
        cart = frappe.parse_json(cart_payload)
    else:
        cart = frappe._dict(cart_payload)

    ctx = frappe._dict(cart.get("context") or {})
    if not ctx:
        frappe.throw(_("Context is required"))

    lines = cart.get("lines") or []
    free_lines = cart.get("free_lines") or []

    doc = _build_doc_context(ctx)

    updates: List[dict] = []
    freebies: Dict[Tuple[str, str], frappe._dict] = {}

    from erpnext.accounts.doctype.pricing_rule.pricing_rule import get_pricing_rule_for_item

    for raw_line in lines:
        line = frappe._dict(raw_line)
        args = _build_pricing_args(line, ctx)
        details = get_pricing_rule_for_item(args, doc=doc)

        applied_rules = []
        if details.get("pricing_rules"):
            applied_rules = _as_list(frappe.parse_json(details.get("pricing_rules")))

        price_list_rate = flt(details.get("price_list_rate") or args.price_list_rate)
        discount_amount = flt(details.get("discount_amount") or 0)
        discount_percentage = flt(details.get("discount_percentage") or 0)
        rate = flt(details.get("rate") or (price_list_rate - discount_amount))

        updates.append(
            {
                "row_id": line.get("posa_row_id") or line.get("name") or line.item_code,
                "rate": rate,
                "price_list_rate": price_list_rate,
                "discount_amount": discount_amount,
                "discount_percentage": discount_percentage,
                "pricing_rules": applied_rules,
            }
        )

        _collect_freebies(freebies, details.get("free_item_data"))

        doc.setdefault("items", []).append(
            frappe._dict(
                {
                    "item_code": args.item_code,
                    "qty": args.qty,
                    "pricing_rules": ",".join(applied_rules),
                    "is_free_item": 0,
                    "rate": rate,
                    "amount": rate * args.qty,
                    "net_amount": rate * args.qty,
                    "price_list_rate": price_list_rate,
                }
            )
        )

    # Calculate totals for transaction-level pricing rules
    total = sum(flt(d.get("amount")) for d in doc.get("items"))
    doc.total = total
    doc.net_total = total

    invoice_updates = {}
    try:
        # Apply transaction-level rules using the controller method
        doc_obj = frappe.get_doc(doc)
        if hasattr(doc_obj, "apply_pricing_rule"):
            doc_obj.apply_pricing_rule()
            invoice_updates = {
                "discount_amount": flt(doc_obj.discount_amount),
                "additional_discount_percentage": flt(doc_obj.additional_discount_percentage),
                "pricing_rules": doc_obj.pricing_rules,
                "apply_discount_on": doc_obj.apply_discount_on,
            }
    except Exception as e:
        frappe.log_error(f"Failed to apply transaction pricing rules: {str(e)}")

    expected_free_lines = []
    for (item_code, rule_name), data in freebies.items():
        expected_free_lines.append(
            {
                "item_code": item_code,
                "qty": flt(data.get("qty") or 0),
                "pricing_rules": rule_name,
                "rate": flt(data.get("rate") or 0),
                "price_list_rate": flt(data.get("price_list_rate") or data.get("for_price_list_rate") or 0),
                "discount_amount": flt(data.get("discount_amount") or 0),
                "discount_percentage": flt(data.get("discount_percentage") or 0),
                "base_rate": flt(data.get("base_rate") or data.get("rate") or 0),
                "base_price_list_rate": flt(
                    data.get("base_price_list_rate") or data.get("price_list_rate") or 0
                ),
                "base_discount_amount": flt(
                    data.get("base_discount_amount") or data.get("discount_amount") or 0
                ),
                "same_item": cint(data.get("same_item") or 0),
                "uom": data.get("uom"),
                "is_free": 1,
            }
        )

    # Include explicitly provided free lines in response for comparison
    for entry in free_lines:
        line = frappe._dict(entry)
        expected_free_lines.append(
            {
                "item_code": line.item_code,
                "qty": flt(line.get("qty") or 0),
                "pricing_rules": line.get("source_rule") or line.get("pricing_rules"),
                "rate": flt(line.get("rate") or 0),
                "uom": line.get("uom"),
                "is_free": 1,
            }
        )

    return {"updates": updates, "free_lines": expected_free_lines, "invoice_updates": invoice_updates}
