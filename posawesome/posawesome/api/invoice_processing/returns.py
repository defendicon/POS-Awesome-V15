import frappe
from frappe import _
from frappe.utils import (
    cint,
    flt,
    getdate,
    nowdate,
)
from posawesome.posawesome.api.invoice_processing.utils import _get_return_validity_settings

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
    enforce_return_validity, _ = _get_return_validity_settings(pos_profile)

    # Start with base filters
    filters = {
        "company": company,
        "docstatus": 1,
        "is_return": 0,
    }

    # Convert page to integer if it's a string
    if page and isinstance(page, str):
        page = int(page)
    else:
        page = 1  # Default to page 1

    # Items per page - can be adjusted based on performance requirements
    page_length = 100
    start = (page - 1) * page_length

    # Add invoice name filter if provided
    if invoice_name:
        filters["name"] = ["like", f"%{invoice_name}%"]

    # Add date range filters if provided
    if from_date:
        filters["posting_date"] = [">=", from_date]

    if to_date:
        if "posting_date" in filters:
            filters["posting_date"] = ["between", [from_date, to_date]]
        else:
            filters["posting_date"] = ["<=", to_date]

    # Add amount filters if provided
    if min_amount:
        filters["grand_total"] = [">=", float(min_amount)]

    if max_amount:
        if "grand_total" in filters:
            # If min_amount was already set, change to between
            filters["grand_total"] = ["between", [float(min_amount), float(max_amount)]]
        else:
            filters["grand_total"] = ["<=", float(max_amount)]

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
            return {"invoices": [], "has_more": False}

    # Count total invoices matching the criteria (for has_more flag)
    total_count = frappe.db.count(doctype, filters=filters)

    # Get invoices matching all criteria with pagination
    invoices_list = frappe.get_list(
        doctype,
        filters=filters,
        fields=["*"],
        limit_start=start,
        limit_page_length=page_length,
        order_by="posting_date desc, name desc",
    )

    if not invoices_list:
        return {"invoices": [], "has_more": False}

    invoice_names = [d.name for d in invoices_list]

    # Pre-fetch child tables
    meta = frappe.get_meta(doctype)
    item_doctype = meta.get_field("items").options
    payment_doctype = meta.get_field("payments").options

    # Items
    all_items = frappe.get_all(
        item_doctype,
        filters={"parent": ["in", invoice_names]},
        fields=["*"],
        order_by="idx",
    )
    items_map = {}
    for item in all_items:
        items_map.setdefault(item.parent, []).append(item)

    # Payments
    all_payments = frappe.get_all(
        payment_doctype,
        filters={"parent": ["in", invoice_names]},
        fields=["*"],
        order_by="idx",
    )
    payments_map = {}
    for payment in all_payments:
        payments_map.setdefault(payment.parent, []).append(payment)

    # Returns check
    all_returns = frappe.get_all(
        doctype,
        filters={"return_against": ["in", invoice_names], "docstatus": 1, "is_return": 1},
        fields=["name", "return_against"],
    )

    returned_qty_map = {}
    if all_returns:
        return_names = [r.name for r in all_returns]
        return_items = frappe.get_all(
            item_doctype,
            filters={"parent": ["in", return_names]},
            fields=["item_code", "qty", "parent"],
        )

        # Map return ID -> Original Invoice ID
        return_to_orig = {r.name: r.return_against for r in all_returns}

        for r_item in return_items:
            orig_inv = return_to_orig.get(r_item.parent)
            if orig_inv:
                key = (orig_inv, r_item.item_code)
                returned_qty_map[key] = returned_qty_map.get(key, 0) + abs(flt(r_item.qty))

    data = []
    for invoice in invoices_list:
        # Attach children
        invoice["items"] = items_map.get(invoice.name, [])
        invoice["payments"] = payments_map.get(invoice.name, [])

        # Validation checks logic
        validity_date = invoice.get("posa_return_valid_upto")
        expired = False
        if enforce_return_validity and validity_date:
            expired = getdate(nowdate()) > getdate(validity_date)
        invoice["posa_return_expired"] = cint(expired)

        filtered_items = []
        has_any_return = False

        for item in invoice["items"]:
            # returned_qty_map key is (invoice.name, item.item_code)
            ret_qty = returned_qty_map.get((invoice.name, item.item_code), 0)
            if ret_qty > 0:
                has_any_return = True

            remaining_qty = item.qty - ret_qty
            if remaining_qty > 0:
                item.qty = remaining_qty
                filtered_items.append(item)

        invoice["items"] = filtered_items
        invoice["is_fully_returned"] = 0

        # If items were originally present but now empty after filtering, it's fully returned
        if items_map.get(invoice.name) and not filtered_items:
            invoice["is_fully_returned"] = 1

        data.append(invoice)

    return {
        "invoices": data,
        "has_more": (start + page_length) < total_count,
        "total_count": total_count,
    }


@frappe.whitelist()
def validate_return_items(original_invoice_name, return_items, doctype="Sales Invoice"):
    """
    Ensure that return items do not exceed the quantity from the original invoice.
    """
    original_invoice = frappe.get_doc(doctype, original_invoice_name)
    original_item_qty = {}

    for item in original_invoice.items:
        original_item_qty[item.item_code] = original_item_qty.get(item.item_code, 0) + item.qty

    returned_items = frappe.get_all(
        doctype,
        filters={
            "return_against": original_invoice_name,
            "docstatus": 1,
            "is_return": 1,
        },
        fields=["name"],
    )

    for returned_invoice in returned_items:
        ret_doc = frappe.get_doc(doctype, returned_invoice.name)
        for item in ret_doc.items:
            if item.item_code in original_item_qty:
                original_item_qty[item.item_code] -= abs(item.qty)

    for item in return_items:
        item_code = item.get("item_code")
        return_qty = abs(item.get("qty", 0))
        if item_code in original_item_qty and return_qty > original_item_qty[item_code]:
            return {
                "valid": False,
                "message": _("You are trying to return more quantity for item {0} than was sold.").format(
                    item_code
                ),
            }

    return {"valid": True}
