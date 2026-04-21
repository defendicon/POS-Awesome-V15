import json

import frappe
from frappe import _
from frappe.utils import cint

from posawesome.posawesome.api.invoices import get_draft_invoices
from posawesome.posawesome.api.quotations import search_quotations, submit_quotation
from posawesome.posawesome.api.sales_orders import search_orders

SOURCE_DOCTYPES = {
    "invoice": "Sales Invoice",
    "order": "Sales Order",
    "quote": "Quotation",
    "delivery": "Delivery Note",
}

INVOICE_LOAD_ACTIONS = {"invoice_load_draft"}
QUOTE_ACTIONS = {
    "quote_edit_draft",
    "quote_submit",
    "quote_to_order",
    "quote_to_invoice",
}
ORDER_ACTIONS = {
    "order_load",
    "order_to_delivery_note",
    "order_to_invoice",
}
DELIVERY_ACTIONS = {
    "delivery_to_invoice",
}


def _as_dict(doc):
    as_dict_method = getattr(doc, "as_dict", None)
    if callable(as_dict_method):
        return as_dict_method()
    if isinstance(doc, dict):
        return dict(doc)
    return dict(doc or {})


def _normalize_source_key(source):
    key = str(source or "invoice").strip().lower()
    if key not in SOURCE_DOCTYPES:
        frappe.throw(_("Unsupported document source {0}").format(source))
    return key


def _normalize_source_doctype(source_doctype):
    normalized = str(source_doctype or "").strip()
    if normalized == "POS Invoice":
        return "invoice", "POS Invoice"
    for key, doctype in SOURCE_DOCTYPES.items():
        if normalized == doctype:
            return key, doctype
    frappe.throw(_("Unsupported source doctype {0}").format(source_doctype))


def _normalize_target_invoice_doctype(target_invoice_doctype=None):
    doctype = str(target_invoice_doctype or "Sales Invoice").strip() or "Sales Invoice"
    if doctype not in {"Sales Invoice", "POS Invoice"}:
        frappe.throw(_("Unsupported invoice target doctype {0}").format(doctype))
    return doctype


def _serialize_source_record(source_key, row):
    payload = _as_dict(row)
    source_doctype = payload.get("doctype") if source_key == "invoice" else SOURCE_DOCTYPES[source_key]
    payload["source"] = source_key
    payload["source_doctype"] = source_doctype
    payload["doctype"] = payload.get("doctype") or source_doctype
    payload["source_docstatus"] = cint(payload.get("docstatus"))
    payload["allowed_actions"] = _get_allowed_actions(source_key, payload)
    return payload


def _search_delivery_notes(company, currency, delivery_note_name=None):
    filters = {
        "docstatus": 1,
        "company": company,
        "currency": currency,
        "status": ["not in", ["Closed", "Cancelled", "Completed"]],
        "per_billed": ["<", 100],
    }

    or_filters = []
    if delivery_note_name:
        search_value = f"%{delivery_note_name}%"
        or_filters = [
            ["Delivery Note", "name", "like", search_value],
            ["Delivery Note", "customer", "like", search_value],
            ["Delivery Note", "customer_name", "like", search_value],
            ["Delivery Note", "currency", "like", search_value],
        ]

    rows = frappe.get_list(
        "Delivery Note",
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name",
            "posting_date",
            "posting_time",
            "customer",
            "customer_name",
            "currency",
            "grand_total",
            "status",
            "docstatus",
            "per_billed",
            "owner",
            "modified",
            "modified_by",
        ],
        limit_page_length=0,
        order_by="modified desc",
    )
    return [_serialize_source_record("delivery", row) for row in rows]


def _get_allowed_actions(source_key, doc):
    docstatus = cint(doc.get("docstatus"))
    if source_key == "invoice":
        return ["invoice_load_draft"] if docstatus == 0 else []
    if source_key == "quote":
        if docstatus == 0:
            return ["quote_edit_draft", "quote_submit"]
        if docstatus == 1:
            return ["quote_to_order", "quote_to_invoice"]
        return []
    if source_key == "order":
        return ["order_load", "order_to_delivery_note", "order_to_invoice"] if docstatus == 1 else []
    if source_key == "delivery":
        return ["delivery_to_invoice"] if docstatus == 1 else []
    return []


def _assert_allowed_action(source_key, doc, action):
    allowed_actions = _get_allowed_actions(source_key, doc)
    if action not in allowed_actions:
        frappe.throw(
            _("Action {0} is not allowed for {1} {2}").format(
                action,
                SOURCE_DOCTYPES[source_key],
                doc.get("name") or "",
            )
        )
    return allowed_actions


def _prepare_mapped_doc(doc, target_doctype):
    payload = _as_dict(doc)
    if target_doctype == "POS Invoice" and payload.get("doctype") == "Sales Invoice":
        payload["doctype"] = "POS Invoice"
    return payload


def _get_mapping_functions():
    from erpnext.selling.doctype.quotation.quotation import (
        make_sales_invoice as make_invoice_from_quotation,
        make_sales_order as make_order_from_quotation,
    )
    from erpnext.selling.doctype.sales_order.sales_order import (
        make_delivery_note as make_delivery_from_order,
        make_sales_invoice as make_invoice_from_order,
    )
    from erpnext.stock.doctype.delivery_note.delivery_note import (
        make_sales_invoice as make_invoice_from_delivery,
    )

    return {
        "quote_to_order": make_order_from_quotation,
        "quote_to_invoice": make_invoice_from_quotation,
        "order_to_delivery_note": make_delivery_from_order,
        "order_to_invoice": make_invoice_from_order,
        "delivery_to_invoice": make_invoice_from_delivery,
    }


def _build_flow_context(
    source_key,
    action,
    source_doc,
    prepared_doc=None,
    target_doctype=None,
    update_stock=None,
    fulfillment_mode=None,
):
    source_payload = _as_dict(source_doc)
    links = {
        "source_doctype": SOURCE_DOCTYPES[source_key],
        "source_name": source_payload.get("name"),
    }
    if source_key == "quote":
        links["quotation"] = source_payload.get("name")
    elif source_key == "order":
        links["sales_order"] = source_payload.get("name")
    elif source_key == "delivery":
        links["delivery_note"] = source_payload.get("name")

    return {
        "source": source_key,
        "source_doctype": SOURCE_DOCTYPES[source_key],
        "source_name": source_payload.get("name"),
        "source_docstatus": cint(source_payload.get("docstatus")),
        "source_status": source_payload.get("status") or "",
        "prepared_action": action,
        "target_doctype": target_doctype or SOURCE_DOCTYPES[source_key],
        "update_stock": update_stock,
        "fulfillment_mode": fulfillment_mode,
        "allowed_actions": _get_allowed_actions(source_key, source_payload),
        "source_links": links,
        "prepared_docstatus": cint(_as_dict(prepared_doc).get("docstatus")) if prepared_doc else None,
    }


@frappe.whitelist()
def list_source_documents(
    source,
    company=None,
    currency=None,
    pos_opening_shift=None,
    doctype="Sales Invoice",
    pos_profile=None,
    cashier=None,
    is_supervisor=0,
    search=None,
    include_draft=1,
    include_submitted=1,
):
    source_key = _normalize_source_key(source)

    if source_key == "invoice":
        rows = get_draft_invoices(
            pos_opening_shift=pos_opening_shift,
            doctype=doctype,
            company=company,
            pos_profile=pos_profile,
            cashier=cashier,
            is_supervisor=is_supervisor,
            limit_page_length=0,
        )
        return [_serialize_source_record("invoice", row) for row in rows]

    if source_key == "order":
        rows = search_orders(company=company, currency=currency, order_name=search)
        return [_serialize_source_record("order", row) for row in rows]

    if source_key == "quote":
        rows = search_quotations(
            company=company,
            currency=currency,
            quotation_name=search,
            include_draft=include_draft,
            include_submitted=include_submitted,
        )
        return [_serialize_source_record("quote", row) for row in rows]

    return _search_delivery_notes(company=company, currency=currency, delivery_note_name=search)


@frappe.whitelist()
def prepare_document_flow_action(
    action,
    source_doctype,
    source_name,
    target_invoice_doctype="Sales Invoice",
):
    source_key, normalized_source_doctype = _normalize_source_doctype(source_doctype)
    action = str(action or "").strip()
    target_invoice_doctype = _normalize_target_invoice_doctype(target_invoice_doctype)

    if not source_name:
        frappe.throw(_("source_name is required"))

    source_doc = frappe.get_doc(normalized_source_doctype, source_name)
    source_payload = _as_dict(source_doc)
    allowed_actions = _assert_allowed_action(source_key, source_payload, action)

    if action in INVOICE_LOAD_ACTIONS | {"quote_edit_draft", "order_load"}:
        return {
            "action": action,
            "source": source_key,
            "source_record": _serialize_source_record(source_key, source_payload),
            "prepared_doc": source_payload,
            "flow_context": _build_flow_context(
                source_key,
                action,
                source_payload,
                prepared_doc=source_payload,
                target_doctype=normalized_source_doctype,
                update_stock=source_payload.get("update_stock"),
                fulfillment_mode="draft_edit" if source_key in {"invoice", "quote"} else "order_review",
            ),
            "allowed_actions": allowed_actions,
        }

    mapping_functions = _get_mapping_functions()
    if action not in mapping_functions:
        frappe.throw(_("Unsupported flow action {0}").format(action))

    mapped_doc = mapping_functions[action](source_name)
    target_doctype = _as_dict(mapped_doc).get("doctype") or target_invoice_doctype
    update_stock = None
    fulfillment_mode = None

    if action == "quote_to_order":
        target_doctype = "Sales Order"
        fulfillment_mode = "order"
    elif action == "order_to_delivery_note":
        target_doctype = "Delivery Note"
        fulfillment_mode = "delivery"
    elif action == "delivery_to_invoice":
        target_doctype = target_invoice_doctype
        update_stock = 0
        fulfillment_mode = "invoice_after_delivery"
    elif action == "order_to_invoice":
        target_doctype = target_invoice_doctype
        update_stock = 1
        fulfillment_mode = "direct_invoice"
    elif action == "quote_to_invoice":
        target_doctype = target_invoice_doctype
        update_stock = 1
        fulfillment_mode = "direct_invoice"

    prepared_doc = _prepare_mapped_doc(mapped_doc, target_doctype)
    if update_stock is not None:
        prepared_doc["update_stock"] = update_stock

    return {
        "action": action,
        "source": source_key,
        "source_record": _serialize_source_record(source_key, source_payload),
        "prepared_doc": prepared_doc,
        "flow_context": _build_flow_context(
            source_key,
            action,
            source_payload,
            prepared_doc=prepared_doc,
            target_doctype=target_doctype,
            update_stock=update_stock,
            fulfillment_mode=fulfillment_mode,
        ),
        "allowed_actions": allowed_actions,
    }


@frappe.whitelist()
def commit_document_flow_action(
    action,
    source_doctype,
    source_name,
    payload=None,
):
    source_key, normalized_source_doctype = _normalize_source_doctype(source_doctype)
    action = str(action or "").strip()

    if not source_name:
        frappe.throw(_("source_name is required"))

    source_doc = frappe.get_doc(normalized_source_doctype, source_name)
    source_payload = _as_dict(source_doc)
    _assert_allowed_action(source_key, source_payload, action)

    if action == "quote_submit":
        submit_payload = payload
        if isinstance(submit_payload, str) and submit_payload.strip():
            submit_payload = json.loads(submit_payload)
        elif not isinstance(submit_payload, dict):
            submit_payload = source_payload
        submit_payload.setdefault("name", source_name)
        result = submit_quotation(json.dumps(submit_payload))
        return {
            "action": action,
            "source": source_key,
            "source_name": source_name,
            "target_doctype": "Quotation",
            "result": result,
        }

    if action == "order_to_delivery_note":
        mapping_functions = _get_mapping_functions()
        delivery_note = mapping_functions[action](source_name)
        delivery_note.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        delivery_note.save()
        if cint(delivery_note.docstatus) == 0:
            delivery_note.submit()
        delivery_payload = _as_dict(delivery_note)
        return {
            "action": action,
            "source": source_key,
            "source_name": source_name,
            "target_doctype": "Delivery Note",
            "result": {
                "name": delivery_payload.get("name"),
                "doctype": "Delivery Note",
                "docstatus": delivery_payload.get("docstatus"),
                "status": delivery_payload.get("status"),
            },
            "flow_context": _build_flow_context(
                source_key,
                action,
                source_payload,
                prepared_doc=delivery_payload,
                target_doctype="Delivery Note",
                update_stock=None,
                fulfillment_mode="delivery",
            ),
        }

    frappe.throw(_("Unsupported commit action {0}").format(action))
