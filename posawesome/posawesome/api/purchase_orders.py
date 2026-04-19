# Copyright (c) 2026, POS Awesome contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate, getdate
from erpnext.accounts.party import get_party_account


from .utils import get_active_pos_profile, get_default_warehouse



def _resolve_pos_profile(pos_profile):
    if isinstance(pos_profile, dict):
        return pos_profile

    if isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if raw_value:
            try:
                decoded = json.loads(raw_value)
            except Exception:
                decoded = raw_value

            if isinstance(decoded, dict):
                return decoded
            if isinstance(decoded, str) and decoded:
                return frappe.get_doc("POS Profile", decoded).as_dict()

    profile = get_active_pos_profile()
    if not profile:
        frappe.throw(_("POS Profile is required to create purchase documents."))
    return profile


def _ensure_allowed(profile, flag, label):
    if not cint(profile.get(flag)):
        frappe.throw(_("{0} is disabled for this POS Profile.").format(label))


def _resolve_supplier(supplier_value):
    if isinstance(supplier_value, dict):
        supplier_value = (
            supplier_value.get("name")
            or supplier_value.get("supplier_name")
            or supplier_value.get("supplier")
        )

    supplier = str(supplier_value or "").strip()
    if not supplier:
        return None

    if frappe.db.exists("Supplier", supplier):
        return supplier

    supplier_by_label = frappe.db.get_value(
        "Supplier", {"supplier_name": supplier}, "name"
    )
    if supplier_by_label:
        return supplier_by_label

    # Fallback: case-insensitive lookup by name/supplier_name
    ci_match = frappe.db.sql(
        """
        select name
        from `tabSupplier`
        where lower(name) = lower(%s)
           or lower(supplier_name) = lower(%s)
        limit 1
        """,
        (supplier, supplier),
    )
    if ci_match and ci_match[0]:
        return ci_match[0][0]

    return None


def _resolve_buying_price_list():
    buying_price_list = frappe.db.get_single_value("Buying Settings", "buying_price_list")
    if not buying_price_list:
        buying_price_list = frappe.db.get_value("Price List", {"buying": 1}, "name")

    if not buying_price_list:
        # Fallback to standard default if exists
        if frappe.db.exists("Price List", "Standard Buying"):
            buying_price_list = "Standard Buying"

    return buying_price_list


def _resolve_supplier_buying_price_list(supplier):
    """Resolve buying price list for a specific supplier.
    Checks Supplier-level default_price_list first, then falls back
    to the generic buying price list from Buying Settings.
    """
    if not supplier:
        return _resolve_buying_price_list()

    supplier_price_list = frappe.db.get_value("Supplier", supplier, "default_price_list")
    if supplier_price_list:
        is_buying = frappe.db.get_value("Price List", supplier_price_list, "buying")
        if is_buying:
            return supplier_price_list

    return _resolve_buying_price_list()


def _normalize_item_codes(item_codes):
    normalized = []

    def visit(value):
        if isinstance(value, (list, tuple, set)):
            for item in value:
                visit(item)
            return

        if isinstance(value, str):
            code = value.strip()
            if code:
                normalized.append(code)
            return

        if isinstance(value, int) and not isinstance(value, bool):
            normalized.append(value)

    visit(item_codes)
    return normalized


def _upsert_item_price(item_code, price_list, rate, uom=None, buying=False, selling=False):
    if not price_list or rate is None:
        return None

    rate = flt(rate)
    filters = {"item_code": item_code, "price_list": price_list}
    if uom:
        filters["uom"] = uom

    existing = frappe.db.get_value("Item Price", filters, "name")
    if existing:
        doc = frappe.get_doc("Item Price", existing)
        doc.price_list_rate = rate
        doc.flags.ignore_permissions = True
        doc.save()
        return doc.name

    doc = frappe.get_doc(
        {
            "doctype": "Item Price",
            "price_list": price_list,
            "item_code": item_code,
            "price_list_rate": rate,
            "buying": 1 if buying else 0,
            "selling": 1 if selling else 0,
            "uom": uom,
        }
    )
    doc.flags.ignore_permissions = True
    doc.insert()
    return doc.name


def _build_items_map(items):
    items_by_code = {}
    for row in items or []:
        item_code = row.get("item_code")
        if not item_code:
            continue
        items_by_code.setdefault(item_code, []).append(row)
    return items_by_code


def _resolve_input_row(items_by_code, item_code):
    rows = items_by_code.get(item_code)
    if not rows:
        return {}
    return rows.pop(0)


def _create_purchase_receipt(po_doc, payload, default_warehouse, transaction_date):
    receipt_date = payload.get("receipt_date") or payload.get("posting_date") or transaction_date
    receipt = frappe.get_doc(
        {
            "doctype": "Purchase Receipt",
            "supplier": po_doc.supplier,
            "company": po_doc.company,
            "posting_date": receipt_date,
			"currency": po_doc.currency,
        }
    )
    if default_warehouse:
        receipt.set_warehouse = default_warehouse

    items_by_code = _build_items_map(payload.get("items"))

    for po_item in po_doc.items:
        payload_row = _resolve_input_row(items_by_code, po_item.item_code)
        if payload.get("receive") and not payload_row.get("received_qty") and not payload_row.get("receive_qty"):
            payload_row["receive_qty"] = po_item.qty
            payload_row["received_qty"] = po_item.qty
        received_qty = flt(
            payload_row.get("received_qty")
            or payload_row.get("receive_qty")
            or payload_row.get("qty")
            or po_item.qty
        )
        if received_qty <= 0:
            continue

        receipt.append(
            "items",
            {
                "item_code": po_item.item_code,
                "item_name": po_item.item_name,
                "qty": received_qty,
                "uom": po_item.uom,
                "stock_uom": po_item.stock_uom,
                "conversion_factor": po_item.conversion_factor or 1,
                "rate": po_item.rate,
                "warehouse": po_item.warehouse or default_warehouse,
                "purchase_order": po_doc.name,
                "purchase_order_item": po_item.name,
                "schedule_date": po_item.schedule_date,
            },
        )
 
    if not receipt.items:
        frappe.throw(_("No items to receive. Please enter received quantities."))

    receipt.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    receipt.insert()
    receipt.submit()
    return receipt.name


@frappe.whitelist()
def create_supplier(data):
    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    _ensure_allowed(profile, "posa_allow_create_purchase_suppliers", _("Create suppliers"))

    supplier_name = payload.get("supplier_name") or payload.get("supplier")
    if not supplier_name:
        frappe.throw(_("Supplier name is required."))

    existing = frappe.db.get_value("Supplier", {"supplier_name": supplier_name}, "name")
    if existing:
        return frappe.get_doc("Supplier", existing).as_dict()

    supplier_group = payload.get("supplier_group") or frappe.db.get_value(
        "Supplier Group", {"is_group": 0}, "name"
    )
    supplier_group = supplier_group or "All Supplier Groups"

    supplier = frappe.get_doc(
        {
            "doctype": "Supplier",
            "supplier_name": supplier_name,
            "supplier_group": supplier_group,
            "supplier_type": payload.get("supplier_type") or "Company",
            "tax_id": payload.get("tax_id"),
            "mobile_no": payload.get("mobile_no"),
            "email_id": payload.get("email_id"),
        }
    )
    supplier.flags.ignore_permissions = True
    supplier.insert()
    return supplier.as_dict()


@frappe.whitelist()
def search_suppliers(search_text=None, limit=20):
    filters = {"disabled": 0}
    or_filters = None
    if search_text:
        like_value = f"%{search_text}%"
        or_filters = {
            "name": ["like", like_value],
            "supplier_name": ["like", like_value],
        }

    suppliers = frappe.get_all(
        "Supplier",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "supplier_name", "supplier_group", "supplier_type", "default_currency"],
        order_by="supplier_name asc",
        limit_page_length=limit,
    )
    return suppliers


@frappe.whitelist()
def get_buying_price_list():
    return _resolve_buying_price_list()


@frappe.whitelist()
def get_supplier_info(supplier):
    """Get supplier details including the effective buying price list."""
    supplier = _resolve_supplier(supplier)
    if not supplier:
        frappe.throw(_("Supplier not found."))

    supplier_doc = frappe.get_doc("Supplier", supplier)
    buying_price_list = _resolve_supplier_buying_price_list(supplier)

    price_list_currency = None
    if buying_price_list:
        price_list_currency = frappe.db.get_value("Price List", buying_price_list, "currency")

    return {
        "supplier": supplier,
        "supplier_name": supplier_doc.supplier_name,
        "supplier_group": supplier_doc.supplier_group,
        "default_currency": supplier_doc.default_currency,
        "buying_price_list": buying_price_list,
        "price_list_currency": price_list_currency,
    }


@frappe.whitelist()
def get_last_buying_rate(supplier, item_codes, company=None):
    """Get the last buying rate for items from supplier price lists or recent Purchase Invoices."""
    if isinstance(item_codes, str):
        try:
            item_codes = json.loads(item_codes)
        except Exception:
            item_codes = [item_codes]

    item_codes = _normalize_item_codes(item_codes)

    if not item_codes:
        return {}

    result = {}
    resolved_supplier = _resolve_supplier(supplier) if supplier else None

    if resolved_supplier:
        buying_price_list = _resolve_supplier_buying_price_list(resolved_supplier)
        price_list_rates = frappe.get_list(
            "Item Price",
            filters={
                "price_list": buying_price_list,
                "item_code": ["in", item_codes],
                "buying": 1,
            },
            fields=["item_code", "price_list_rate", "uom", "currency"],
        )

        for row in price_list_rates:
            code = row.get("item_code")
            if code and code not in result:
                price_list_currency = row.get("currency")
                if not price_list_currency and buying_price_list:
                    price_list_currency = frappe.db.get_value(
                        "Price List", buying_price_list, "currency"
                    )
                result[code] = {
                    "rate": row.get("price_list_rate", 0),
                    "currency": price_list_currency,
                    "uom": row.get("uom"),
                    "source": "price_list",
                    "supplier": resolved_supplier,
                }

    supplier_clause = ""
    params = [tuple(item_codes)]
    if resolved_supplier:
        supplier_clause = "AND pi.supplier = %s"
        params.append(resolved_supplier)
    if company:
        supplier_clause += " AND pi.company = %s"
        params.append(company)

    last_pi_items = frappe.db.sql(
        f"""
        SELECT
            ranked.item_code,
            ranked.rate,
            ranked.uom,
            ranked.currency,
            ranked.invoice,
            ranked.posting_date,
            ranked.supplier
        FROM (
            SELECT
                pii.item_code,
                pii.rate,
                pii.uom,
                pi.currency,
                pi.name AS invoice,
                pi.posting_date,
                pi.supplier,
                ROW_NUMBER() OVER (
                    PARTITION BY pii.item_code
                    ORDER BY pi.posting_date DESC, pi.creation DESC
                ) AS rn
            FROM `tabPurchase Invoice Item` pii
            JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
            WHERE pi.docstatus = 1
              AND pii.item_code IN %s
              {supplier_clause}
        ) ranked
        WHERE ranked.rn = 1
        """,
        tuple(params),
        as_dict=True,
    )

    for row in last_pi_items:
        code = row.get("item_code")
        if code and code not in result:
            result[code] = {
                "rate": row.get("rate", 0),
                "currency": row.get("currency"),
                "uom": row.get("uom"),
                "source": "last_invoice",
                "invoice": row.get("invoice"),
                "posting_date": row.get("posting_date"),
                "supplier": row.get("supplier"),
            }

    return result


@frappe.whitelist()
def create_purchase_item(data):
    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    _ensure_allowed(profile, "posa_allow_create_purchase_items", _("Create items"))

    item_code = payload.get("item_code") or payload.get("item_name")
    item_name = payload.get("item_name") or item_code
    stock_uom = payload.get("stock_uom")

    if not item_code:
        frappe.throw(_("Item code is required."))
    if not stock_uom:
        frappe.throw(_("Stock UOM is required."))

    existing = frappe.db.exists("Item", item_code)
    if existing:
        return frappe.get_doc("Item", item_code).as_dict()

    item_group = payload.get("item_group") or frappe.db.get_value(
        "Item Group", {"is_group": 0}, "name"
    )
    item_group = item_group or "All Item Groups"

    barcode = payload.get("barcode")
    if barcode and frappe.db.exists("Item Barcode", {"barcode": barcode}):
        frappe.throw(_("Barcode {0} already exists.").format(barcode))

    item_doc = frappe.get_doc(
        {
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_name,
            "item_group": item_group,
            "stock_uom": stock_uom,
            "is_stock_item": 1,
            "disabled": 0,
            "default_warehouse": profile.get("warehouse"),
            "standard_rate": flt(payload.get("buying_price") or 0),
        }
    )

    if barcode:
        item_doc.append("barcodes", {"barcode": barcode})

    item_doc.flags.ignore_permissions = True
    item_doc.flags.ignore_mandatory = True
    item_doc.insert()

    selling_price_list = payload.get("selling_price_list") or profile.get("selling_price_list")
    buying_price_list = payload.get("buying_price_list") or _resolve_buying_price_list()

    selling_price = payload.get("selling_price")
    buying_price = payload.get("buying_price")

    _upsert_item_price(
        item_code,
        selling_price_list,
        selling_price,
        uom=stock_uom,
        selling=True,
    )
    _upsert_item_price(
        item_code,
        buying_price_list,
        buying_price,
        uom=stock_uom,
        buying=True,
    )

    if buying_price is not None:
        item_doc.db_set("standard_rate", flt(buying_price), update_modified=False)

    return {
        "item": item_doc.as_dict(),
        "selling_price_list": selling_price_list,
        "buying_price_list": buying_price_list,
    }


def _get_mode_of_payment_account(mode, company):
    account = frappe.db.get_value(
        "Mode of Payment Account", {"parent": mode, "company": company}, "default_account"
    )
    if not account:
        frappe.throw(
            _("Please set default account for Mode of Payment {0} in company {1}").format(
                mode, company
            )
        )
    return account


def _create_payment_entry(reference_doc, payments, company, transaction_date):
    if not payments:
        return []

    created_payments = []

    # Check if reference is PO or PI
    ref_doctype = reference_doc.doctype
    ref_name = reference_doc.name

    # Determine outstanding amount
    outstanding_amount = 0
    if ref_doctype == "Purchase Invoice":
        outstanding_amount = reference_doc.outstanding_amount
    else:
        # For Purchase Order, use grand_total (assuming advance payment for new PO)
        # Or calculate if some advance was already made, but here it's new.
        outstanding_amount = reference_doc.grand_total

    for pay in payments:
        amount = flt(pay.get("amount"))
        mode = pay.get("mode_of_payment")

        if amount <= 0:
            continue

        paid_from_account = _get_mode_of_payment_account(mode, company)

        pe = frappe.new_doc("Payment Entry")
        pe.payment_type = "Pay"
        pe.company = company
        pe.posting_date = transaction_date
        pe.mode_of_payment = mode
        pe.party_type = "Supplier"
        pe.party = reference_doc.supplier

        pe.paid_from = paid_from_account

        # Fetch party account
        pe.paid_to = get_party_account("Supplier", reference_doc.supplier, company)
        if not pe.paid_to:
             frappe.throw(_("Please set Default Payable Account in Company {0}").format(company))

        pe.paid_amount = amount
        pe.received_amount = amount 
        # Note: If currencies differ, conversion handling is needed. 
        # Assuming base currency for simplified POS flow or that user enters converted amount.
        
        # References
        # Allocate only up to outstanding amount
        allocated_amount = 0
        if outstanding_amount > 0:
            allocated_amount = min(amount, outstanding_amount)
            outstanding_amount -= allocated_amount
        
        if allocated_amount > 0:
            pe.append("references", {
                "reference_doctype": ref_doctype,
                "reference_name": ref_name,
                "allocated_amount": allocated_amount
            })

        pe.flags.ignore_permissions = True
        pe.insert()
        pe.submit()
        created_payments.append(pe.name)

    return created_payments


@frappe.whitelist()
def create_purchase_order(data):

    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    receive_now = cint(payload.get("receive"))
    if receive_now:
        _ensure_allowed(profile, "posa_allow_purchase_receipt", _("Receive stock"))

    supplier_input = payload.get("supplier")
    if not supplier_input:
        frappe.throw(_("Supplier is required."))

    supplier = _resolve_supplier(supplier_input)
    if not supplier:
        frappe.throw(_("Supplier {0} was not found.").format(supplier_input))

    company = payload.get("company") or profile.get("company") or frappe.defaults.get_default("company")
    if not company:
        frappe.throw(_("Company is required."))

    warehouse = payload.get("warehouse") or profile.get("warehouse") or get_default_warehouse(company)
    transaction_date = payload.get("transaction_date") or nowdate()
    schedule_date = payload.get("schedule_date") or transaction_date

    items = payload.get("items") or []
    if not items:
        frappe.throw(_("Purchase order requires at least one item."))

    # Get supplier currency (NEW CODE)
    supplier_doc = frappe.get_doc("Supplier", supplier)
    supplier_currency = supplier_doc.default_currency
    if not supplier_currency:
        # Fallback to company currency if supplier has no default
        supplier_currency = frappe.get_value("Company", company, "default_currency")

    # Resolve buying price list: prefer supplier-specific, then payload override, then default
    buying_price_list = payload.get("buying_price_list") or _resolve_supplier_buying_price_list(supplier)
    price_list_currency = frappe.get_value("Price List", buying_price_list, "currency")

    # If currencies don't match, try to find a matching one
    if price_list_currency and price_list_currency != supplier_currency:
        alternative_price_list = frappe.db.get_value(
            "Price List",
            {"currency": supplier_currency, "buying": 1, "enabled": 1},
            "name"
        )
        if alternative_price_list:
            buying_price_list = alternative_price_list

    po_doc = frappe.get_doc({
        "doctype": "Purchase Order",
        "supplier": supplier,
        "company": company,
        "transaction_date": transaction_date,
        "schedule_date": schedule_date,
        "currency": supplier_currency,
        "buying_price_list": buying_price_list,
    })
    
    if warehouse:
        po_doc.set_warehouse = warehouse

    item_codes = [row.get("item_code") for row in items if row.get("item_code")]
    if item_codes:
        item_meta = frappe.get_all(
            "Item",
            filters={"name": ["in", item_codes]},
            fields=["name", "item_name", "stock_uom"],
        )
        item_map = {row.name: row for row in item_meta}
    else:
        item_map = {}

    for row in items:
        item_code = row.get("item_code")
        if not item_code:
            continue

        qty = flt(row.get("qty"))
        if qty <= 0:
            continue

        meta = item_map.get(item_code)
        stock_uom = row.get("stock_uom") or (meta.stock_uom if meta else None)
        item_name = row.get("item_name") or (meta.item_name if meta else item_code)
        uom = row.get("uom") or stock_uom
        conversion_factor = flt(row.get("conversion_factor") or 1)
        if not conversion_factor:
            conversion_factor = 1

        po_doc.append(
            "items",
            {
                "item_code": item_code,
                "item_name": item_name,
                "qty": qty,
                "uom": uom,
                "stock_uom": stock_uom,
                "conversion_factor": conversion_factor,
                "rate": flt(row.get("rate")),
                "warehouse": row.get("warehouse") or warehouse,
                "schedule_date": schedule_date,
            },
        )

    if not po_doc.items:
        frappe.throw(_("Purchase order requires at least one item with quantity."))

    po_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    po_doc.save()

    # Persist a safe draft first so if any downstream step fails (submit/PR/PI/payment),
    # the operator does not lose the created PO.
    frappe.db.commit()

    try:
        if cint(payload.get("submit", 1)):
            po_doc.submit()

        receipt_name = None
        receipt_doc = None
        if receive_now:
            receipt_name = _create_purchase_receipt(po_doc, payload, warehouse, transaction_date)
            if receipt_name:
                receipt_doc = frappe.get_doc("Purchase Receipt", receipt_name)
        invoice_name = None
        if cint(payload.get("create_invoice", 0)):
            invoice_name = _create_purchase_invoice(
                po_doc, payload, warehouse, transaction_date, receipt_doc=receipt_doc
            )

        payments = payload.get("payments")
        if payments:
            # Use PI if created, otherwise PO
            ref_doc = frappe.get_doc("Purchase Invoice", invoice_name) if invoice_name else po_doc
            _create_payment_entry(ref_doc, payments, company, transaction_date)

        return {
            "purchase_order": po_doc.name,
            "purchase_receipt": receipt_name,
            "purchase_invoice": invoice_name,
        }
    except Exception as err:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "POS Awesome PO Submit Flow Failed")
        frappe.throw(
            _("Purchase Order {0} has been saved as Draft. Error: {1}").format(
                po_doc.name, str(err)
            )
        )


@frappe.whitelist()
def search_items(search_text=None, limit=20):
    filters = {"disabled": 0}
    or_filters = None
    if search_text:
        like_value = f"%{search_text}%"
        or_filters = {
            "name": ["like", like_value],
            "item_name": ["like", like_value],
        }

    items = frappe.get_all(
        "Item",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "item_name", "stock_uom", "standard_rate"],
        limit_page_length=limit,
        order_by="name asc",
    )
    item_codes = [it.get("name") for it in items if it.get("name")]
    uom_rows = []
    if item_codes:
        uom_rows = frappe.get_all(
            "UOM Conversion Detail",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "uom", "conversion_factor"],
        )
    uom_map = {}
    for row in uom_rows:
        uom_map.setdefault(row.parent, []).append(
            {"uom": row.uom, "conversion_factor": row.conversion_factor}
        )

    results = []
    for it in items:
        item_code = it.get("name")
        stock_uom = it.get("stock_uom")
        uoms = uom_map.get(item_code, [])
        if stock_uom and not any(u.get("uom") == stock_uom for u in uoms):
            uoms.append({"uom": stock_uom, "conversion_factor": 1})
        results.append(
            {
                "item_code": item_code,
                "item_name": it.get("item_name"),
                "stock_uom": stock_uom,
                "item_uoms": uoms,
                "standard_rate": it.get("standard_rate"),
            }
        )
    return results


def _create_purchase_invoice(po_doc, payload, default_warehouse, transaction_date, receipt_doc=None):
    invoice_date = payload.get("invoice_date") or payload.get("invoice_posting_date") or transaction_date
    invoice = frappe.get_doc(
        {
            "doctype": "Purchase Invoice",
            "supplier": po_doc.supplier,
            "company": po_doc.company,
            "posting_date": invoice_date,
            "purchase_order": po_doc.name,
            "currency": payload.get("currency") or po_doc.currency,
        }
    )
    if default_warehouse:
        invoice.set_warehouse = default_warehouse

    items_by_code = _build_items_map(payload.get("items"))
    receipt_items = {
        item.purchase_order_item: item for item in (receipt_doc.items or [])
    } if receipt_doc else {}
    for po_item in po_doc.items:
        payload_row = _resolve_input_row(items_by_code, po_item.item_code)
        qty = flt(payload_row.get("qty") or po_item.qty)
        if qty <= 0:
            continue
        invoice_item = {
            "item_code": po_item.item_code,
            "item_name": po_item.item_name,
            "qty": qty,
            "uom": po_item.uom,
            "stock_uom": po_item.stock_uom,
            "conversion_factor": po_item.conversion_factor or 1,
            "rate": po_item.rate,
            "warehouse": po_item.warehouse or default_warehouse,
            "purchase_order": po_doc.name,
            "po_detail": po_item.name,
            "schedule_date": po_item.schedule_date,
        }
        receipt_item = receipt_items.get(po_item.name)
        if receipt_item and receipt_doc:
            invoice_item["purchase_receipt"] = receipt_doc.name
            invoice_item["pr_detail"] = receipt_item.name
        invoice.append("items", invoice_item)

    if not invoice.items:
        frappe.throw(_("No items to invoice. Please ensure there are items on the Purchase Order."))

    invoice.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    invoice.insert()
    invoice.submit()
    return invoice.name
