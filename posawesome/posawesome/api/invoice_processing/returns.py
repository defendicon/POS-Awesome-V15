import frappe
import time
import json
from collections import defaultdict
from frappe import _
from frappe.utils import (
    cstr,
    cint,
    flt,
    getdate,
    nowdate,
)
from posawesome.posawesome.api.invoice_processing.utils import _get_return_validity_settings
from posawesome.posawesome.api.utils import log_perf_event, get_active_pos_profile
from posawesome.posawesome.api.payment_processing.data import (
    _assert_company_access,
    _assert_pos_profile_access,
    _coerce_text_filter,
)


ALLOWED_RETURN_DOCTYPES = {"Sales Invoice", "POS Invoice"}
MAX_RETURN_ITEMS = 500


def _can_manage_all_pos_profiles():
    return "System Manager" in frappe.get_roles()


def _normalize_return_doctype(doctype):
    normalized = cstr(doctype or "Sales Invoice").strip()
    if normalized not in ALLOWED_RETURN_DOCTYPES:
        frappe.throw(_("Unsupported return doctype: {0}").format(normalized or doctype))
    return normalized


def _extract_profile_name(pos_profile):
    if isinstance(pos_profile, dict):
        return cstr(
            pos_profile.get("name")
            or pos_profile.get("pos_profile")
            or pos_profile.get("profile")
            or ""
        ).strip()

    if isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if not raw_value:
            return ""
        try:
            decoded = json.loads(raw_value)
        except Exception:
            decoded = raw_value
        if isinstance(decoded, dict):
            return _extract_profile_name(decoded)
        return cstr(decoded).strip()

    return ""

@frappe.whitelist()
def search_invoices_for_return(
    invoice_name,
    company,
    customer_name=None,
    customer_id=None,
    mobile_no=None,
    tax_id=None,
    from_date=None,
    to_date=None,
    min_amount=None,
    max_amount=None,
    page=1,
    pos_profile=None,
    doctype="Sales Invoice",
):
    """
    Search for invoices that can be returned with separate customer search fields and pagination

    Args:
        invoice_name: Invoice ID to search for
        company: Company to search in
        customer_name: Customer name to search for
        customer_id: Customer ID to search for
        mobile_no: Mobile number to search for
        tax_id: Tax ID to search for
        from_date: Start date for filtering
        to_date: End date for filtering
        min_amount: Minimum invoice amount to filter by
        max_amount: Maximum invoice amount to filter by
        page: Page number for pagination (starts from 1)

    Returns:
        Dictionary with:
        - invoices: List of invoice documents
        - has_more: Boolean indicating if there are more invoices to load
    """
    doctype = _normalize_return_doctype(doctype)
    company = _coerce_text_filter(company, _("Company"))
    invoice_name = _coerce_text_filter(invoice_name, _("Invoice"))
    customer_name = _coerce_text_filter(customer_name, _("Customer Name"))
    customer_id = _coerce_text_filter(customer_id, _("Customer ID"))
    mobile_no = _coerce_text_filter(mobile_no, _("Mobile Number"))
    tax_id = _coerce_text_filter(tax_id, _("Tax ID"))
    pos_profile = _extract_profile_name(pos_profile)

    if not company:
        frappe.throw(_("Company is required"))

    if not pos_profile:
        active_profile_name = _extract_profile_name(get_active_pos_profile())
        if active_profile_name:
            active_company = frappe.get_cached_value("POS Profile", active_profile_name, "company")
            if active_company == company:
                pos_profile = active_profile_name

    _assert_company_access(company)
    _assert_pos_profile_access(pos_profile)

    if pos_profile:
        profile_company = frappe.get_cached_value("POS Profile", pos_profile, "company")
        if profile_company and profile_company != company:
            frappe.throw(_("POS Profile {0} does not belong to company {1}.").format(pos_profile, company))

    parsed_from_date = None
    parsed_to_date = None
    if from_date:
        parsed_from_date = getdate(from_date)
    if to_date:
        parsed_to_date = getdate(to_date)
    if parsed_from_date and parsed_to_date and parsed_from_date > parsed_to_date:
        frappe.throw(_("from_date cannot be greater than to_date."))

    parsed_min_amount = flt(min_amount) if min_amount not in (None, "") else None
    parsed_max_amount = flt(max_amount) if max_amount not in (None, "") else None
    if (
        parsed_min_amount is not None
        and parsed_max_amount is not None
        and parsed_max_amount < parsed_min_amount
    ):
        frappe.throw(_("max_amount cannot be less than min_amount."))

    started_at = time.perf_counter()
    enforce_return_validity, _return_validity_days = _get_return_validity_settings(pos_profile)

    # Start with base filters
    filters = {
        "company": company,
        "docstatus": 1,
        "is_return": 0,
    }

    # Normalize page number input
    try:
        page = int(page or 1)
    except (TypeError, ValueError):
        page = 1
    if page < 1:
        page = 1

    # Items per page - can be adjusted based on performance requirements
    page_length = 100
    start = (page - 1) * page_length

    # Add invoice name filter if provided
    if invoice_name:
        filters["name"] = ["like", f"%{invoice_name}%"]

    # Add date range filters if provided
    if from_date:
        filters["posting_date"] = [">=", parsed_from_date]

    if to_date:
        if "posting_date" in filters:
            filters["posting_date"] = ["between", [parsed_from_date, parsed_to_date]]
        else:
            filters["posting_date"] = ["<=", parsed_to_date]

    # Add amount filters if provided
    if parsed_min_amount is not None:
        filters["grand_total"] = [">=", parsed_min_amount]

    if parsed_max_amount is not None:
        if "grand_total" in filters:
            # If min_amount was already set, change to between
            filters["grand_total"] = ["between", [parsed_min_amount, parsed_max_amount]]
        else:
            filters["grand_total"] = ["<=", parsed_max_amount]

    # If any customer search criteria is provided, find matching customers
    customer_ids = []
    if customer_name or customer_id or mobile_no or tax_id:
        conditions = []
        params = {}

        if customer_name:
            conditions.append("customer_name LIKE %(customer_name)s")
            params["customer_name"] = f"%{customer_name}%"

        if customer_id:
            conditions.append("name LIKE %(customer_id)s")
            params["customer_id"] = f"%{customer_id}%"

        if mobile_no:
            conditions.append("mobile_no LIKE %(mobile_no)s")
            params["mobile_no"] = f"%{mobile_no}%"

        if tax_id:
            conditions.append("tax_id LIKE %(tax_id)s")
            params["tax_id"] = f"%{tax_id}%"

        # Build the WHERE clause for the query
        where_clause = " OR ".join(conditions)
        customer_query = f"""
        SELECT name
        FROM `tabCustomer`
        WHERE {where_clause}
        LIMIT 100
    """

        customers = frappe.db.sql(customer_query, params, as_dict=True)
        customer_ids = [c.name for c in customers]

        # If we found matching customers, add them to the filter
        if customer_ids:
            filters["customer"] = ["in", customer_ids]
        # If customer search criteria provided but no matches found, return empty
        elif any([customer_name, customer_id, mobile_no, tax_id]):
            log_perf_event(
                "search_invoices_for_return",
                started_at,
                doctype=doctype,
                page=page,
                rows=0,
                customer_matches=0,
                early_exit=1,
            )
            return {"invoices": [], "has_more": False}

    # Get invoices matching all criteria with pagination (+1 row for has_more)
    invoices_list = frappe.get_list(
        doctype,
        filters=filters,
        fields=[
            "name",
            "company",
            "customer",
            "customer_name",
            "posting_date",
            "posting_time",
            "grand_total",
            "currency",
            "discount_amount",
            "additional_discount_percentage",
            "posa_return_valid_upto",
            "is_return",
        ],
        limit_start=start,
        limit_page_length=page_length + 1,
        order_by="posting_date desc, name desc",
    )

    has_more = len(invoices_list) > page_length
    if has_more:
        invoices_list = invoices_list[:page_length]

    if not invoices_list:
        log_perf_event(
            "search_invoices_for_return",
            started_at,
            doctype=doctype,
            page=page,
            rows=0,
            has_more=0,
            customer_matches=len(customer_ids),
        )
        return {"invoices": [], "has_more": False}

    data = []
    for invoice in invoices_list:
        invoice["doctype"] = doctype

        # Validation checks logic
        validity_date = invoice.get("posa_return_valid_upto")
        expired = False
        if enforce_return_validity and validity_date:
            expired = getdate(nowdate()) > getdate(validity_date)
        invoice["posa_return_expired"] = cint(expired)

        data.append(invoice)

    total_count = (start + len(data) + 1) if has_more else (start + len(data))

    result = {
        "invoices": data,
        "has_more": has_more,
        "total_count": total_count,
    }
    log_perf_event(
        "search_invoices_for_return",
        started_at,
        doctype=doctype,
        page=page,
        rows=len(data),
        has_more=int(bool(has_more)),
        customer_matches=len(customer_ids),
    )
    return result


@frappe.whitelist()
def get_invoice_for_return(invoice_name, pos_profile=None, doctype="Sales Invoice"):
    """Return one invoice with returnable item quantities after past returns."""
    doctype = _normalize_return_doctype(doctype)
    invoice_name = _coerce_text_filter(invoice_name, _("Invoice"))
    pos_profile = _extract_profile_name(pos_profile)
    if not invoice_name:
        frappe.throw(_("Invoice is required"))

    started_at = time.perf_counter()
    invoice_doc = frappe.get_cached_doc(doctype, invoice_name)
    if not pos_profile:
        pos_profile = cstr(invoice_doc.get("pos_profile")).strip()
    if not pos_profile:
        pos_profile = _extract_profile_name(get_active_pos_profile())

    _assert_pos_profile_access(pos_profile)
    enforce_return_validity, _return_validity_days = _get_return_validity_settings(pos_profile)

    if not frappe.has_permission(doctype, "read", invoice_doc.name) and not _can_manage_all_pos_profiles():
        frappe.throw(_("Not permitted to access {0} {1}.").format(doctype, invoice_doc.name))
    _assert_company_access(invoice_doc.company)

    if pos_profile and invoice_doc.get("pos_profile") and invoice_doc.get("pos_profile") != pos_profile:
        frappe.throw(
            _("Invoice {0} does not belong to POS Profile {1}.").format(invoice_doc.name, pos_profile)
        )

    invoice = {
        "name": invoice_doc.name,
        "doctype": doctype,
        "customer": invoice_doc.customer,
        "customer_name": invoice_doc.customer_name,
        "grand_total": invoice_doc.grand_total,
        "total": invoice_doc.total,
        "net_total": invoice_doc.net_total,
        "currency": invoice_doc.currency,
        "discount_amount": invoice_doc.discount_amount,
        "additional_discount_percentage": invoice_doc.additional_discount_percentage,
        "posa_return_valid_upto": invoice_doc.get("posa_return_valid_upto"),
        "payments": [
            {
                "mode_of_payment": payment.get("mode_of_payment"),
                "amount": payment.get("amount"),
                "base_amount": payment.get("base_amount"),
                "default": payment.get("default"),
                "account": payment.get("account"),
                "type": payment.get("type"),
                "currency": payment.get("currency"),
                "conversion_rate": payment.get("conversion_rate"),
            }
            for payment in (invoice_doc.get("payments") or [])
        ],
    }

    meta = frappe.get_meta(doctype)
    item_field = meta.get_field("items")
    item_doctype = item_field.options if item_field else None
    if not item_doctype:
        log_perf_event(
            "get_invoice_for_return",
            started_at,
            doctype=doctype,
            invoice=invoice_name,
            rows=0,
            fully_returned=0,
        )
        return invoice

    returned_items = frappe.get_all(
        doctype,
        filters={
            "return_against": invoice_name,
            "docstatus": 1,
            "is_return": 1,
        },
        fields=["name"],
    )

    returned_qty_by_code = defaultdict(float)
    returned_names = [row.name for row in returned_items]
    if returned_names:
        returned_rows = frappe.get_all(
            item_doctype,
            filters={"parent": ["in", returned_names], "parenttype": doctype},
            fields=["item_code", "qty"],
        )
        for row in returned_rows:
            item_code = row.get("item_code")
            if not item_code:
                continue
            returned_qty_by_code[item_code] += abs(flt(row.get("qty") or 0))

    filtered_items = []
    for item in invoice_doc.get("items") or []:
        item_code = item.get("item_code")
        remaining_qty = flt(item.get("qty") or 0) - flt(returned_qty_by_code.get(item_code, 0))
        if remaining_qty > 0:
            filtered_items.append(
                {
                    "name": item.get("name"),
                    "item_code": item.get("item_code"),
                    "item_name": item.get("item_name"),
                    "description": item.get("description"),
                    "uom": item.get("uom"),
                    "stock_uom": item.get("stock_uom"),
                    "conversion_factor": item.get("conversion_factor"),
                    "warehouse": item.get("warehouse"),
                    "batch_no": item.get("batch_no"),
                    "serial_no": item.get("serial_no"),
                    "is_free_item": item.get("is_free_item"),
                    "rate": item.get("rate"),
                    "price_list_rate": item.get("price_list_rate"),
                    "discount_percentage": item.get("discount_percentage"),
                    "discount_amount": item.get("discount_amount"),
                    "net_rate": item.get("net_rate"),
                    "net_amount": item.get("net_amount"),
                    "qty": remaining_qty,
                    "stock_qty": item.get("stock_qty"),
                    "amount": item.get("amount"),
                }
            )

    invoice["items"] = filtered_items
    invoice["is_fully_returned"] = 1 if (invoice_doc.items and not filtered_items) else 0

    validity_date = invoice.get("posa_return_valid_upto")
    expired = False
    if enforce_return_validity and validity_date:
        expired = getdate(nowdate()) > getdate(validity_date)
    invoice["posa_return_expired"] = cint(expired)

    log_perf_event(
        "get_invoice_for_return",
        started_at,
        doctype=doctype,
        invoice=invoice_name,
        rows=len(filtered_items),
        fully_returned=int(bool(invoice.get("is_fully_returned"))),
    )
    return invoice


@frappe.whitelist()
def validate_return_items(original_invoice_name, return_items, doctype="Sales Invoice"):
    """
    Ensure that return items do not exceed the quantity from the original invoice.
    """
    doctype = _normalize_return_doctype(doctype)
    original_invoice_name = _coerce_text_filter(original_invoice_name, _("Invoice"))
    if not original_invoice_name:
        return {"valid": False, "message": _("Original invoice is required.")}

    if isinstance(return_items, str):
        try:
            return_items = json.loads(return_items)
        except Exception:
            return {"valid": False, "message": _("Invalid return items payload.")}
    if not isinstance(return_items, list):
        return {"valid": False, "message": _("Return items must be a list.")}
    if len(return_items) > MAX_RETURN_ITEMS:
        return {"valid": False, "message": _("Too many return items in one request.")}

    if not frappe.db.exists(doctype, original_invoice_name):
        return {
            "valid": False,
            "message": _("Invoice {0} was not found.").format(original_invoice_name),
        }

    original_invoice_doc = frappe.get_doc(doctype, original_invoice_name)
    if (
        not frappe.has_permission(doctype, "read", original_invoice_doc.name)
        and not _can_manage_all_pos_profiles()
    ):
        return {"valid": False, "message": _("Not permitted to access the original invoice.")}
    _assert_company_access(original_invoice_doc.company)

    meta = frappe.get_meta(doctype)
    item_field = meta.get_field("items")
    item_doctype = item_field.options if item_field else None
    if not item_doctype:
        return {"valid": True}

    original_item_qty = {}

    original_items = frappe.get_all(
        item_doctype,
        filters={"parent": original_invoice_name, "parenttype": doctype},
        fields=["item_code", "qty"],
    )
    for item in original_items:
        original_item_qty[item.item_code] = original_item_qty.get(item.item_code, 0) + flt(item.qty or 0)

    returned_items = frappe.get_all(
        doctype,
        filters={
            "return_against": original_invoice_name,
            "docstatus": 1,
            "is_return": 1,
        },
        fields=["name"],
    )

    returned_names = [row.name for row in returned_items]
    if returned_names:
        returned_rows = frappe.get_all(
            item_doctype,
            filters={"parent": ["in", returned_names], "parenttype": doctype},
            fields=["item_code", "qty"],
        )
        for item in returned_rows:
            if item.item_code in original_item_qty:
                original_item_qty[item.item_code] -= abs(flt(item.qty or 0))

    for item in return_items:
        if not isinstance(item, dict):
            continue
        item_code = cstr(item.get("item_code")).strip()
        return_qty = abs(flt(item.get("qty", 0)))
        if item_code in original_item_qty and return_qty > original_item_qty[item_code]:
            return {
                "valid": False,
                "message": _("You are trying to return more quantity for item {0} than was sold.").format(
                    item_code
                ),
            }

    return {"valid": True}
