import json
from typing import Dict, List, Set, Tuple

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
        if row.get("is_free_item") is not None:
            row["is_free_item"] = cint(row.get("is_free_item"))
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
                "is_free_item": row.get("is_free_item"),
                "posa_pricing_rule_freebie": row.get("posa_pricing_rule_freebie"),
                "posa_pricing_rule_key": row.get("posa_pricing_rule_key"),
                "posa_pricing_rule_source_row": row.get("posa_pricing_rule_source_row"),
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
        if _is_pricing_rule_freebie(item):
            continue
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


def _collect_matched_identifiers(detail) -> Set[str]:
    if not detail:
        return set()

    identifiers = _extract_rule_identifiers(
        detail.get("pricing_rule"),
        detail.get("pricing_rules"),
        detail.get("pricing_rule_name"),
        detail.get("rule"),
        detail.get("applied_pricing_rule"),
        detail.get("applied_pricing_rules"),
        detail.get("free_item_data"),
    )

    return {
        _parse_rule_identifier(identifier)
        for identifier in identifiers
        if _parse_rule_identifier(identifier)
    }


def _is_pricing_rule_freebie(item) -> bool:
    if not item:
        return False

    try:
        flag = item.get("is_free_item")
    except AttributeError:
        flag = None

    if flag is not None:
        try:
            return bool(cint(flag))
        except Exception:
            return bool(flag)

    try:
        return bool(item.get("posa_pricing_rule_freebie"))
    except AttributeError:
        return False


def _resolve_freebie_rule_identifier(item) -> str:
    if not item:
        return ""

    identifiers = _extract_rule_identifiers(
        getattr(item, "posa_pricing_rule_freebie", None),
        item.get("posa_pricing_rule_freebie") if hasattr(item, "get") else None,
        item.get("pricing_rule") if hasattr(item, "get") else None,
        item.get("pricing_rules") if hasattr(item, "get") else None,
        item.get("pricing_rule_name") if hasattr(item, "get") else None,
        item.get("rule") if hasattr(item, "get") else None,
        item.get("applied_pricing_rule") if hasattr(item, "get") else None,
        item.get("applied_pricing_rules") if hasattr(item, "get") else None,
    )

    for identifier in identifiers:
        parsed = _parse_rule_identifier(identifier)
        if parsed:
            return parsed

    return ""


def _child_value(item, fieldname: str, default=None):
    if hasattr(item, "get"):
        try:
            value = item.get(fieldname)
        except Exception:
            value = None
        else:
            if value is not None:
                return value

    return getattr(item, fieldname, default)


def _build_freebie_key_parts(item, rule_id: str) -> Tuple[str, ...]:
    if not item:
        return (rule_id or "",)

    item_code = _child_value(item, "item_code")
    if not item_code:
        item_code = _child_value(item, "free_item_code") or _child_value(item, "free_item")

    batch_no = _child_value(item, "batch_no") or _child_value(item, "free_batch_no")
    serial_no = _child_value(item, "serial_no") or _child_value(item, "free_serial_no")
    uom = (
        _child_value(item, "uom")
        or _child_value(item, "stock_uom")
        or _child_value(item, "free_uom")
    )
    warehouse = _child_value(item, "warehouse") or _child_value(item, "free_warehouse")

    raw_factor = _child_value(item, "conversion_factor")
    if raw_factor is None:
        raw_factor = _child_value(item, "free_conversion_factor")
    conversion_factor = flt(raw_factor or 1) or 1

    parts = (
        str(rule_id or ""),
        str(item_code or ""),
        str(batch_no or ""),
        str(serial_no or ""),
        str(uom or ""),
        str(warehouse or ""),
        str(conversion_factor or 1),
    )

    return parts


def _build_freebie_composite_key(item, rule_id: str) -> str:
    explicit_key = _child_value(item, "posa_pricing_rule_key")

    if explicit_key:
        return str(explicit_key)

    return "::".join(_build_freebie_key_parts(item, rule_id))


def normalize_pricing_rule_freebies(doc) -> bool:
    """Merge duplicate pricing rule freebies on the provided document."""

    if not doc or not getattr(doc, "items", None):
        return False

    mutated = False
    seen = {}
    to_remove = []

    for child in list(doc.items):
        if not _is_pricing_rule_freebie(child):
            continue

        rule_id = _resolve_freebie_rule_identifier(child)
        if not rule_id:
            continue

        if _child_value(child, "is_free_item") != 1:
            try:
                child.is_free_item = 1
            except Exception:
                pass
            mutated = True

        if _child_value(child, "posa_pricing_rule_freebie") != rule_id:
            try:
                child.posa_pricing_rule_freebie = rule_id
            except Exception:
                pass
            mutated = True

        composite = _build_freebie_composite_key(child, rule_id)

        identifiers = set(
            _extract_rule_identifiers(
                _child_value(child, "pricing_rules"),
                _child_value(child, "applied_pricing_rules"),
                _child_value(child, "pricing_rule"),
                _child_value(child, "rule"),
            )
        )
        identifiers.add(rule_id)

        serialized = json.dumps(sorted(identifiers))
        current_serialized = _child_value(child, "pricing_rules")
        if current_serialized != serialized:
            try:
                child.pricing_rules = serialized
            except Exception:
                pass
            mutated = True

        if _child_value(child, "applied_pricing_rules") != serialized:
            try:
                child.applied_pricing_rules = serialized
            except Exception:
                pass
            mutated = True

        if _child_value(child, "applied_pricing_rule") != rule_id:
            try:
                child.applied_pricing_rule = rule_id
            except Exception:
                pass
            mutated = True

        existing = seen.get(composite)
        if not existing:
            seen[composite] = child
            continue

        qty = flt(_child_value(existing, "qty") or 0)
        stock_qty = flt(_child_value(existing, "stock_qty") or 0)

        incoming_qty = flt(_child_value(child, "qty") or 0)
        incoming_stock_qty = _child_value(child, "stock_qty")
        if incoming_stock_qty is None:
            incoming_stock_qty = incoming_qty * flt(_child_value(child, "conversion_factor") or 1)

        if incoming_qty > 0 and (qty <= 0 or incoming_qty >= qty):
            existing.qty = incoming_qty
        else:
            existing.qty = qty

        if incoming_stock_qty and flt(incoming_stock_qty) > 0 and (
            stock_qty <= 0 or flt(incoming_stock_qty) >= stock_qty
        ):
            existing.stock_qty = flt(incoming_stock_qty)
        else:
            existing.stock_qty = stock_qty

        rate = flt(_child_value(existing, "rate") or 0)
        base_rate = flt(_child_value(existing, "base_rate")) or rate

        try:
            amount_precision = existing.precision("amount")
        except Exception:
            amount_precision = 2

        try:
            base_amount_precision = existing.precision("base_amount")
        except Exception:
            base_amount_precision = 2

        existing.amount = flt(existing.qty * rate, amount_precision)
        existing.base_amount = flt(existing.qty * base_rate, base_amount_precision)
        if hasattr(existing, "net_amount"):
            try:
                net_precision = existing.precision("net_amount")
            except Exception:
                net_precision = amount_precision
            existing.net_amount = flt(existing.amount, net_precision)
        if hasattr(existing, "base_net_amount"):
            try:
                base_net_precision = existing.precision("base_net_amount")
            except Exception:
                base_net_precision = base_amount_precision
            existing.base_net_amount = flt(existing.base_amount, base_net_precision)

        existing_serialized = _child_value(existing, "pricing_rules")
        if existing_serialized != serialized:
            try:
                existing.pricing_rules = serialized
            except Exception:
                pass

        if _child_value(existing, "applied_pricing_rules") != serialized:
            try:
                existing.applied_pricing_rules = serialized
            except Exception:
                pass

        if _child_value(existing, "applied_pricing_rule") != rule_id:
            try:
                existing.applied_pricing_rule = rule_id
            except Exception:
                pass

        to_remove.append(child)
        mutated = True

    for duplicate in to_remove:
        try:
            doc.remove(duplicate)
        except Exception:
            items = [item for item in doc.items if item != duplicate]
            doc.set("items", items)
        mutated = True

    return mutated


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
        if _is_pricing_rule_freebie(child):
            continue
        args = _build_item_args(parsed_context, child.as_dict())
        args.pricing_rules = json.dumps([rule_identifier])
        try:
            detail = get_pricing_rule_for_item(args, doc=doc.as_dict(), for_validate=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "POS Awesome: failed to apply pricing rule")
            continue

        detail = frappe._dict(detail)
        matched_identifiers = _collect_matched_identifiers(detail)

        if rule_identifier not in matched_identifiers:
            continue

        detail["posa_row_id"] = child.get("name")
        results.append(detail)

    return results


@frappe.whitelist()
def auto_apply_pos_pricing_rules(context: str) -> Dict[str, List]:
    """Evaluate pricing rules for all items and return the aggregated updates."""

    _ensure_pricing_rule_dependencies_available()
    parsed_context = _prepare_context(context)
    doc = frappe.get_doc(parsed_context.get("doc_dict"))
    doc.name = parsed_context.get("doc_name") or doc.get("name") or "POS-PRICING"
    parsed_context["doc_name"] = doc.name

    updates: List[Dict] = []
    active_rules: Set[str] = set()

    for child in doc.items:
        if _is_pricing_rule_freebie(child):
            continue
        args = _build_item_args(parsed_context, child.as_dict())
        try:
            detail = get_pricing_rule_for_item(args, doc=doc.as_dict(), for_validate=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "POS Awesome: failed to auto apply pricing rule")
            continue

        if not detail:
            continue

        detail = frappe._dict(detail)
        matched_identifiers = _collect_matched_identifiers(detail)

        if not matched_identifiers and not detail.get("free_item_data"):
            continue

        detail["posa_row_id"] = child.get("name")
        updates.append(detail)
        active_rules.update(matched_identifiers)

    return {
        "updates": updates,
        "active_pricing_rules": sorted(active_rules),
    }
