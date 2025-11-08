import json
from typing import Dict, List

import frappe
from frappe import _
from frappe.utils import cint, flt, today

try:
    from erpnext.accounts.doctype.pricing_rule.pricing_rule import get_pricing_rule_for_item
    from erpnext.accounts.doctype.pricing_rule.utils import get_pricing_rules
except ImportError:  # pragma: no cover - handled at runtime if ERPNext not present
    get_pricing_rule_for_item = None
    get_pricing_rules = None


def _ensure_pricing_rule_dependencies_available():
    if not get_pricing_rules or not get_pricing_rule_for_item:
        frappe.throw(_("Pricing Rule utilities are unavailable. Please ensure ERPNext is installed."))


def _prepare_context(context_json: str) -> Dict:
    if isinstance(context_json, str):
        context = frappe.parse_json(context_json)
    else:
        context = frappe._dict(context_json or {})

    if not context:
        frappe.throw(_("Pricing rule context is required."))

    context = frappe._dict(context)
    context.setdefault("doctype", "Sales Invoice")
    context.setdefault("child_doctype", "Sales Invoice Item")
    context.setdefault("transaction_date", today())
    context.setdefault(
        "currency",
        frappe.get_cached_value("Company", context.get("company"), "default_currency")
        if context.get("company")
        else None,
    )
    context.setdefault("conversion_rate", context.get("conversion_rate") or 1)
    context.setdefault("plc_conversion_rate", context.get("plc_conversion_rate") or 1)
    context.setdefault("price_list_currency", context.get("price_list_currency") or context.get("currency"))
    context.setdefault("transaction_type", "selling")
    context.setdefault("ignore_pricing_rule", 0)
    context.setdefault("is_pos", 1)

    raw_items = context.get("items") or []
    prepared_items = []
    for item in raw_items:
        row = frappe._dict(item)
        if not row.get("name"):
            row["name"] = row.get("item_code")
        row.setdefault("qty", flt(row.get("qty")))
        row.setdefault("stock_qty", flt(row.get("stock_qty")) or row.get("qty"))
        row.setdefault("uom", row.get("uom") or row.get("stock_uom"))
        row.setdefault("stock_uom", row.get("stock_uom") or row.get("uom"))
        row.setdefault("conversion_factor", row.get("conversion_factor") or 1)
        row.setdefault("price_list_rate", flt(row.get("price_list_rate")))
        row.setdefault("rate", flt(row.get("rate")))
        row.setdefault("discount_percentage", flt(row.get("discount_percentage")))
        row.setdefault("discount_amount", flt(row.get("discount_amount")))
        prepared_items.append(row)

    context["items"] = prepared_items
    doc_dict = {
        "doctype": context.doctype,
        "company": context.get("company"),
        "customer": context.get("customer"),
        "currency": context.get("currency"),
        "conversion_rate": context.get("conversion_rate"),
        "price_list_currency": context.get("price_list_currency"),
        "plc_conversion_rate": context.get("plc_conversion_rate"),
        "selling_price_list": context.get("price_list"),
        "is_return": cint(context.get("is_return")),
        "transaction_type": context.get("transaction_type") or "selling",
        "ignore_pricing_rule": cint(context.get("ignore_pricing_rule")),
        "is_pos": cint(context.get("is_pos")),
        "items": [],
    }

    for row in prepared_items:
        doc_row = frappe._dict(
            {
                "doctype": context.child_doctype,
                "name": row.name,
                "item_code": row.get("item_code"),
                "item_name": row.get("item_name"),
                "item_group": row.get("item_group"),
                "brand": row.get("brand"),
                "qty": row.get("qty"),
                "stock_qty": row.get("stock_qty"),
                "uom": row.get("uom"),
                "stock_uom": row.get("stock_uom"),
                "warehouse": row.get("warehouse"),
                "price_list_rate": row.get("price_list_rate"),
                "rate": row.get("rate"),
                "discount_percentage": row.get("discount_percentage"),
                "discount_amount": row.get("discount_amount"),
                "conversion_factor": row.get("conversion_factor"),
                "serial_no": row.get("serial_no"),
                "batch_no": row.get("batch_no"),
                "pricing_rules": row.get("pricing_rules"),
                "parenttype": context.doctype,
            }
        )
        doc_dict.setdefault("items", []).append(doc_row)

    context["doc_dict"] = doc_dict
    return context


def _build_item_args(context: Dict, item: Dict) -> Dict:
    args = {
        "doctype": context.child_doctype,
        "name": item.get("name"),
        "child_docname": item.get("name"),
        "parenttype": context.doctype,
        "parent": context.get("doc_name") or context.get("name") or "POS-PRICING",
        "item_code": item.get("item_code"),
        "item_group": item.get("item_group"),
        "brand": item.get("brand"),
        "qty": item.get("qty"),
        "stock_qty": item.get("stock_qty"),
        "uom": item.get("uom"),
        "stock_uom": item.get("stock_uom"),
        "warehouse": item.get("warehouse"),
        "serial_no": item.get("serial_no"),
        "batch_no": item.get("batch_no"),
        "price_list_rate": item.get("price_list_rate"),
        "rate": item.get("rate"),
        "discount_percentage": item.get("discount_percentage"),
        "discount_amount": item.get("discount_amount"),
        "conversion_factor": item.get("conversion_factor"),
        "is_free_item": item.get("is_free_item"),
        "pricing_rules": item.get("pricing_rules"),
        "currency": context.get("currency"),
        "conversion_rate": context.get("conversion_rate"),
        "price_list": context.get("price_list"),
        "price_list_currency": context.get("price_list_currency"),
        "plc_conversion_rate": context.get("plc_conversion_rate"),
        "company": context.get("company"),
        "transaction_date": context.get("transaction_date"),
        "campaign": context.get("campaign"),
        "sales_partner": context.get("sales_partner"),
        "ignore_pricing_rule": 0,
        "pos_profile": context.get("pos_profile"),
        "coupon_code": context.get("coupon_code"),
        "customer": context.get("customer"),
        "customer_group": context.get("customer_group"),
        "territory": context.get("territory"),
        "supplier": context.get("supplier"),
        "supplier_group": context.get("supplier_group"),
        "is_return": cint(context.get("is_return")),
        "update_stock": cint(context.get("update_stock")),
        "transaction_type": context.get("transaction_type") or "selling",
    }
    return frappe._dict(args)


def _as_serializable_rule(rule) -> Dict:
    doc = rule
    if isinstance(rule, str):
        doc = frappe.get_cached_doc("Pricing Rule", rule)
    if isinstance(doc, dict):
        doc = frappe._dict(doc)

    return {
        "name": doc.get("name"),
        "title": doc.get("title") or doc.get("name"),
        "description": doc.get("rule_description") or doc.get("description") or "",
        "apply_on": doc.get("apply_on"),
        "price_or_product_discount": doc.get("price_or_product_discount"),
        "rate_or_discount": doc.get("rate_or_discount"),
        "discount_percentage": flt(doc.get("discount_percentage")),
        "discount_amount": flt(doc.get("discount_amount")),
        "margin_type": doc.get("margin_type"),
        "margin_rate_or_amount": flt(doc.get("margin_rate_or_amount")),
        "priority": cint(doc.get("priority")),
        "apply_multiple_pricing_rules": cint(doc.get("apply_multiple_pricing_rules")),
        "min_qty": flt(doc.get("min_qty")) if doc.get("min_qty") else None,
        "company": doc.get("company"),
        "currency": doc.get("currency"),
        "valid_from": doc.get("valid_from"),
        "valid_upto": doc.get("valid_upto"),
        "free_item": doc.get("free_item"),
    }


def _collect_pricing_rules(context: Dict, doc) -> List[Dict]:
    rules: Dict[str, Dict] = {}
    for item in context.get("items", []):
        args = _build_item_args(context, item)
        try:
            item_rules = get_pricing_rules(args, doc)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "POS Awesome: failed to fetch pricing rules")
            continue

        if not item_rules:
            continue

        for rule in item_rules:
            serializable = _as_serializable_rule(rule)
            name = serializable.get("name")
            if name and name not in rules:
                rules[name] = serializable

    return list(rules.values())


def _parse_rule_identifier(pricing_rule) -> str:
    if isinstance(pricing_rule, (list, tuple)):
        return pricing_rule[0] if pricing_rule else ""
    return pricing_rule


def _extract_rule_identifiers(*candidates) -> List[str]:
    identifiers: List[str] = []

    def _walk(value):
        if not value:
            return

        if isinstance(value, (list, tuple, set)):
            for entry in value:
                _walk(entry)
            return

        if isinstance(value, dict):
            for key in (
                "pricing_rule",
                "pricing_rules",
                "pricing_rule_name",
                "rule",
                "name",
            ):
                if value.get(key):
                    _walk(value.get(key))
            return

        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return

            try:
                loaded = json.loads(stripped)
            except Exception:
                loaded = None

            if isinstance(loaded, (list, tuple, set, dict)):
                _walk(loaded)
                return

            if isinstance(loaded, str) and loaded != stripped:
                _walk(loaded)
                return

            if "," in stripped:
                for part in stripped.split(","):
                    _walk(part)
                return

            identifiers.append(stripped)
            return

        identifiers.append(str(value))

    for candidate in candidates:
        _walk(candidate)

    return [identifier for identifier in identifiers if identifier]


@frappe.whitelist()
def get_pos_pricing_rules(context: str) -> List[Dict]:
    """Return applicable pricing rules for the provided POS invoice context."""

    _ensure_pricing_rule_dependencies_available()
    parsed_context = _prepare_context(context)
    doc = frappe.get_doc(parsed_context.get("doc_dict"))
    doc.name = parsed_context.get("doc_name") or doc.get("name") or "POS-PRICING"
    parsed_context["doc_name"] = doc.name

    rules = _collect_pricing_rules(parsed_context, doc)
    return rules


@frappe.whitelist()
def apply_pos_pricing_rule(context: str, pricing_rule: str) -> List[Dict]:
    """Apply a specific pricing rule to the provided POS invoice context."""

    _ensure_pricing_rule_dependencies_available()
    if not pricing_rule:
        frappe.throw(_("Pricing Rule is required"))

    parsed_context = _prepare_context(context)
    doc = frappe.get_doc(parsed_context.get("doc_dict"))
    doc.name = parsed_context.get("doc_name") or doc.get("name") or "POS-PRICING"
    parsed_context["doc_name"] = doc.name

    results: List[Dict] = []
    rule_identifier = _parse_rule_identifier(pricing_rule)

    for child in doc.items:
        args = _build_item_args(parsed_context, child.as_dict())
        args.pricing_rules = json.dumps([rule_identifier])
        try:
            detail = get_pricing_rule_for_item(args, doc=doc.as_dict(), for_validate=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "POS Awesome: failed to apply pricing rule")
            continue

        detail = frappe._dict(detail)
        matched_identifiers = {
            _parse_rule_identifier(identifier)
            for identifier in _extract_rule_identifiers(
                detail.get("pricing_rule"),
                detail.get("pricing_rules"),
                detail.get("pricing_rule_name"),
                detail.get("rule"),
                detail.get("applied_pricing_rule"),
                detail.get("applied_pricing_rules"),
            )
            if _parse_rule_identifier(identifier)
        }

        has_free_item_data = bool(detail.get("free_item_data"))
        has_rate_or_discount_change = any(
            key in detail and detail.get(key) is not None
            for key in (
                "discount_percentage",
                "discount_amount",
                "price_list_rate",
                "rate",
                "margin_type",
                "margin_rate_or_amount",
            )
        )

        if (
            rule_identifier not in matched_identifiers
            and not has_free_item_data
            and not has_rate_or_discount_change
        ):
            continue

        detail["posa_row_id"] = child.get("name")
        results.append(detail)

    return results
