# Copyright (c) 2026, POS Awesome contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate, getdate
from erpnext.accounts.party import get_party_account


from . import utils as pos_utils


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

    profile = pos_utils.get_active_pos_profile()
    if not profile:
        frappe.throw(_("POS Profile is required to create purchase documents."))
    return profile


def _assert_pos_write_allowed(profile, company=None):
    return pos_utils.assert_pos_profile_write_allowed(profile, company=company)


def _ensure_allowed(profile, flag, label):
    if not cint(profile.get(flag)):
        frappe.throw(_("{0} is disabled for this POS Profile.").format(label))


INVALID_DATE_MARKERS = {"invalid date", "nan", "none", "null", "undefined"}


def _normalize_date_for_backend(value, fallback=None):
    if value is None:
        return fallback

    normalized = str(value).strip()
    if not normalized or normalized.lower() in INVALID_DATE_MARKERS:
        return fallback

    parts = normalized.replace("/", "-").split("-")
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        if len(parts[0]) == 4:
            year, month, day = parts
        elif len(parts[2]) == 4:
            day, month, year = parts
        else:
            year = month = day = None

        if year and month and day:
            try:
                return str(getdate(f"{year}-{month.zfill(2)}-{day.zfill(2)}"))
            except Exception:
                return fallback

    try:
        return str(getdate(normalized))
    except Exception:
        return fallback


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

    supplier_by_label = frappe.db.get_value("Supplier", {"supplier_name": supplier}, "name")
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


def _build_po_items_map(items):
    items_by_detail = {}
    items_by_code = {}
    for row in items or []:
        detail_name = row.get("po_detail") or row.get("purchase_order_item") or row.get("name")
        if detail_name:
            items_by_detail[str(detail_name)] = row

        item_code = row.get("item_code")
        if item_code:
            items_by_code.setdefault(item_code, []).append(row)

    return items_by_detail, items_by_code


def _resolve_po_input_row(items_by_detail, items_by_code, po_item):
    if po_item.name and str(po_item.name) in items_by_detail:
        return items_by_detail.pop(str(po_item.name))

    return _resolve_input_row(items_by_code, po_item.item_code)


def _get_billed_qty_by_po_item(po_doc):
    item_names = [row.name for row in po_doc.items if row.name]
    if not item_names:
        return {}

    rows = frappe.db.sql(
        """
        select po_detail, sum(qty) as billed_qty
        from `tabPurchase Invoice Item`
        where docstatus = 1
          and po_detail in %s
        group by po_detail
        """,
        (tuple(item_names),),
        as_dict=True,
    )
    return {row.get("po_detail"): flt(row.get("billed_qty")) for row in rows}


def _get_purchase_order_progress(po_doc):
    per_received = flt(po_doc.get("per_received"))
    per_billed = flt(po_doc.get("per_billed"))
    return {
        "per_received": per_received,
        "per_billed": per_billed,
        "has_receipt": per_received > 0,
        "has_invoice": per_billed > 0,
        "receipt_complete": per_received >= 99.999,
        "invoice_complete": per_billed >= 99.999,
        "receipt_partial": 0 < per_received < 99.999,
        "invoice_partial": 0 < per_billed < 99.999,
    }


def _get_receipt_summary_by_po_names(po_names):
    if not po_names:
        return {}

    rows = frappe.db.sql(
        """
        select pri.purchase_order,
               count(distinct pr.name) as receipt_count
        from `tabPurchase Receipt Item` pri
        inner join `tabPurchase Receipt` pr on pr.name = pri.parent
        where pr.docstatus = 1
          and pri.purchase_order in %s
        group by pri.purchase_order
        """,
        (tuple(po_names),),
        as_dict=True,
    )
    return {
        row.get("purchase_order"): {
            "receipt_count": cint(row.get("receipt_count")),
        }
        for row in rows
    }


def _get_invoice_summary_by_po_names(po_names):
    if not po_names:
        return {}

    rows = frappe.db.sql(
        """
        select linked.purchase_order,
               count(linked.invoice_name) as invoice_count,
               sum(linked.outstanding_amount) as outstanding_amount,
               max(linked.posting_date) as last_invoice_date
        from (
            select distinct
                   pii.purchase_order,
                   pi.name as invoice_name,
                   pi.outstanding_amount,
                   pi.posting_date
            from `tabPurchase Invoice Item` pii
            inner join `tabPurchase Invoice` pi on pi.name = pii.parent
            where pi.docstatus = 1
              and pii.purchase_order in %s
        ) linked
        group by linked.purchase_order
        """,
        (tuple(po_names),),
        as_dict=True,
    )
    return {
        row.get("purchase_order"): {
            "invoice_count": cint(row.get("invoice_count")),
            "outstanding_amount": flt(row.get("outstanding_amount")),
            "last_invoice_date": row.get("last_invoice_date"),
        }
        for row in rows
    }


def _get_purchase_order_advance_paid_by_names(po_names):
    if not po_names:
        return {}

    rows = frappe.db.sql(
        """
        select per.reference_name as purchase_order,
               sum(per.allocated_amount) as advance_paid
        from `tabPayment Entry Reference` per
        inner join `tabPayment Entry` pe on pe.name = per.parent
        where pe.docstatus = 1
          and pe.payment_type = 'Pay'
          and per.reference_doctype = 'Purchase Order'
          and per.reference_name in %s
        group by per.reference_name
        """,
        (tuple(po_names),),
        as_dict=True,
    )
    return {row.get("purchase_order"): flt(row.get("advance_paid")) for row in rows}


def _get_purchase_order_management_row(row, receipt_summary, invoice_summary, advance_paid_map):
    progress = _get_purchase_order_progress(row)
    po_name = row.get("name")
    invoice_info = invoice_summary.get(po_name, {})
    advance_paid = flt(advance_paid_map.get(po_name))
    invoice_outstanding = flt(invoice_info.get("outstanding_amount"))
    payable_amount = invoice_outstanding if invoice_info.get("invoice_count") else max(
        flt(row.get("grand_total")) - advance_paid, 0
    )

    row.update(progress)
    row.update(receipt_summary.get(po_name, {}))
    row["invoice_count"] = cint(invoice_info.get("invoice_count"))
    row["outstanding_amount"] = invoice_outstanding
    row["last_invoice_date"] = invoice_info.get("last_invoice_date")
    row["advance_paid"] = advance_paid
    row["payable_amount"] = payable_amount
    row["needs_receipt"] = not progress["receipt_complete"]
    row["needs_invoice"] = not progress["invoice_complete"]
    row["needs_payment"] = payable_amount > 0
    return row


def _get_payment_reference_for_purchase_order(po_doc):
    rows = frappe.db.sql(
        """
        select distinct pi.name, pi.outstanding_amount, pi.posting_date
        from `tabPurchase Invoice Item` pii
        inner join `tabPurchase Invoice` pi on pi.name = pii.parent
        where pi.docstatus = 1
          and pi.outstanding_amount > 0
          and pii.purchase_order = %s
        order by pi.posting_date desc, pi.modified desc
        limit 1
        """,
        (po_doc.name,),
        as_dict=True,
    )
    if rows:
        return frappe.get_doc("Purchase Invoice", rows[0].get("name"))
    return po_doc


def _create_purchase_receipt(po_doc, payload, default_warehouse, transaction_date):
    receipt_date = _normalize_date_for_backend(
        payload.get("receipt_date") or payload.get("posting_date"),
        fallback=transaction_date,
    )
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

    payload_items = payload.get("items") or []
    has_explicit_items = bool(payload_items)
    items_by_detail, items_by_code = _build_po_items_map(payload_items)

    for po_item in po_doc.items:
        payload_row = _resolve_po_input_row(items_by_detail, items_by_code, po_item)
        if has_explicit_items and not payload_row:
            continue

        remaining_qty = max(flt(po_item.qty) - flt(po_item.get("received_qty")), 0)
        if remaining_qty <= 0:
            continue

        if (
            payload.get("receive")
            and not payload_row.get("received_qty")
            and not payload_row.get("receive_qty")
        ):
            payload_row["receive_qty"] = remaining_qty
            payload_row["received_qty"] = remaining_qty
        received_qty = flt(
            payload_row.get("received_qty")
            or payload_row.get("receive_qty")
            or payload_row.get("qty")
            or remaining_qty
        )
        received_qty = min(received_qty, remaining_qty)
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
    _assert_pos_write_allowed(profile, company=payload.get("company"))
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
                    price_list_currency = frappe.db.get_value("Price List", buying_price_list, "currency")
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
    _assert_pos_write_allowed(profile, company=payload.get("company"))
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

    item_group = payload.get("item_group") or frappe.db.get_value("Item Group", {"is_group": 0}, "name")
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
            _("Please set default account for Mode of Payment {0} in company {1}").format(mode, company)
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
            pe.append(
                "references",
                {
                    "reference_doctype": ref_doctype,
                    "reference_name": ref_name,
                    "allocated_amount": allocated_amount,
                },
            )

        pe.flags.ignore_permissions = True
        pe.insert()
        pe.submit()
        created_payments.append(pe.name)

    return created_payments


def _get_purchase_order_name(payload):
    return payload.get("purchase_order") or payload.get("purchase_order_name") or payload.get("name")


def _get_purchase_order_doc(payload, company):
    po_name = _get_purchase_order_name(payload)
    if not po_name:
        return frappe.get_doc({"doctype": "Purchase Order"})

    if not frappe.db.exists("Purchase Order", po_name):
        frappe.throw(_("Purchase Order {0} was not found.").format(po_name))

    po_doc = frappe.get_doc("Purchase Order", po_name)
    if cint(po_doc.docstatus) != 0:
        frappe.throw(_("Only draft Purchase Orders can be updated from POS."))
    if company and po_doc.company and po_doc.company != company:
        frappe.throw(_("Purchase Order {0} does not belong to company {1}.").format(po_name, company))

    return po_doc


def _get_submitted_purchase_order_doc(payload, company):
    po_name = _get_purchase_order_name(payload)
    if not po_name:
        return None

    if not frappe.db.exists("Purchase Order", po_name):
        frappe.throw(_("Purchase Order {0} was not found.").format(po_name))

    po_doc = frappe.get_doc("Purchase Order", po_name)
    if company and po_doc.company and po_doc.company != company:
        frappe.throw(_("Purchase Order {0} does not belong to company {1}.").format(po_name, company))

    return po_doc if cint(po_doc.docstatus) == 1 else None


def _set_purchase_order_items(po_doc, items, warehouse, schedule_date):
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

    po_doc.set("items", [])

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


def _run_purchase_order_followup_flow(po_doc, payload, company, warehouse, transaction_date, receive_now):
    progress = _get_purchase_order_progress(po_doc)

    receipt_name = None
    receipt_doc = None
    if receive_now:
        if progress["receipt_complete"]:
            frappe.throw(_("Purchase Receipt is already complete for Purchase Order {0}.").format(po_doc.name))
        receipt_name = _create_purchase_receipt(po_doc, payload, warehouse, transaction_date)
        if receipt_name:
            receipt_doc = frappe.get_doc("Purchase Receipt", receipt_name)

    invoice_name = None
    if cint(payload.get("create_invoice", 0)):
        if progress["invoice_complete"]:
            frappe.throw(_("Purchase Invoice is already complete for Purchase Order {0}.").format(po_doc.name))
        invoice_name = _create_purchase_invoice(
            po_doc, payload, warehouse, transaction_date, receipt_doc=receipt_doc
        )

    payments = payload.get("payments")
    if payments:
        ref_doc = frappe.get_doc("Purchase Invoice", invoice_name) if invoice_name else po_doc
        _create_payment_entry(ref_doc, payments, company, transaction_date)

    return {
        "purchase_order": po_doc.name,
        "purchase_receipt": receipt_name,
        "purchase_invoice": invoice_name,
    }


@frappe.whitelist()
def create_purchase_order(data):

    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    company = payload.get("company") or profile.get("company") or frappe.defaults.get_default("company")
    _assert_pos_write_allowed(profile, company=company)
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    submit_order = cint(payload.get("submit", 1))
    receive_now = cint(payload.get("receive")) if submit_order else 0
    if receive_now:
        _ensure_allowed(profile, "posa_allow_purchase_receipt", _("Receive stock"))

    supplier_input = payload.get("supplier")
    if not supplier_input:
        frappe.throw(_("Supplier is required."))

    supplier = _resolve_supplier(supplier_input)
    if not supplier:
        frappe.throw(_("Supplier {0} was not found.").format(supplier_input))

    if not company:
        frappe.throw(_("Company is required."))

    warehouse = payload.get("warehouse") or profile.get("warehouse") or pos_utils.get_default_warehouse(company)
    transaction_date = _normalize_date_for_backend(payload.get("transaction_date")) or nowdate()
    schedule_date = _normalize_date_for_backend(payload.get("schedule_date"), fallback=transaction_date)

    items = payload.get("items") or []
    if not items:
        frappe.throw(_("Purchase order requires at least one item."))

    submitted_po_doc = _get_submitted_purchase_order_doc(payload, company)
    if submitted_po_doc:
        if not submit_order:
            frappe.throw(_("Submitted Purchase Orders cannot be saved as draft."))
        return _run_purchase_order_followup_flow(
            submitted_po_doc,
            payload,
            company,
            warehouse or submitted_po_doc.get("set_warehouse"),
            transaction_date,
            receive_now,
        )

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
            "Price List", {"currency": supplier_currency, "buying": 1, "enabled": 1}, "name"
        )
        if alternative_price_list:
            buying_price_list = alternative_price_list

    po_doc = _get_purchase_order_doc(payload, company)
    po_doc.update(
        {
            "supplier": supplier,
            "company": company,
            "transaction_date": transaction_date,
            "schedule_date": schedule_date,
            "currency": supplier_currency,
            "buying_price_list": buying_price_list,
        }
    )

    if warehouse:
        po_doc.set_warehouse = warehouse

    _set_purchase_order_items(po_doc, items, warehouse, schedule_date)

    po_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    po_doc.save()

    # Intentional partial persistence: keep the draft PO before submit/receipt/invoice/payment
    # work so the operator does not lose it if any downstream step fails.
    frappe.db.commit()

    if not submit_order:
        return {
            "purchase_order": po_doc.name,
            "draft": 1,
        }

    try:
        po_doc.submit()

        return _run_purchase_order_followup_flow(po_doc, payload, company, warehouse, transaction_date, receive_now)
    except Exception as err:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "POS Awesome PO Submit Flow Failed")
        frappe.throw(
            _("Purchase Order {0} has been saved as Draft. Error: {1}").format(po_doc.name, str(err))
        )


@frappe.whitelist()
def search_draft_purchase_orders(
    pos_profile=None,
    company=None,
    search_text=None,
    supplier=None,
    warehouse=None,
    from_date=None,
    to_date=None,
    limit=50,
):
    profile = _resolve_pos_profile(pos_profile)
    company = company or profile.get("company") or frappe.defaults.get_default("company")
    _assert_pos_write_allowed(profile, company=company)
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    filters = {"docstatus": 0}
    if company:
        filters["company"] = company

    if warehouse:
        filters["set_warehouse"] = warehouse

    resolved_supplier = _resolve_supplier(supplier) if supplier else None
    if resolved_supplier:
        filters["supplier"] = resolved_supplier

    start_date = _normalize_date_for_backend(from_date)
    end_date = _normalize_date_for_backend(to_date)
    if start_date and end_date:
        filters["transaction_date"] = ["between", [start_date, end_date]]
    elif start_date:
        filters["transaction_date"] = [">=", start_date]
    elif end_date:
        filters["transaction_date"] = ["<=", end_date]

    effective_search_text = search_text
    if supplier and not resolved_supplier and not effective_search_text:
        effective_search_text = supplier

    or_filters = None
    if effective_search_text:
        like_value = f"%{str(effective_search_text).strip()}%"
        or_filters = {
            "name": ["like", like_value],
            "supplier": ["like", like_value],
            "supplier_name": ["like", like_value],
        }

    try:
        limit_page_length = max(1, min(cint(limit or 50), 200))
    except Exception:
        limit_page_length = 50

    return frappe.get_all(
        "Purchase Order",
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name",
            "supplier",
            "supplier_name",
            "company",
            "transaction_date",
            "schedule_date",
            "grand_total",
            "currency",
            "set_warehouse",
            "status",
            "modified",
            "owner",
        ],
        order_by="modified desc",
        limit_page_length=limit_page_length,
    )


@frappe.whitelist()
def search_purchase_management_orders(
    pos_profile=None,
    company=None,
    search_text=None,
    supplier=None,
    warehouse=None,
    from_date=None,
    to_date=None,
    status_filter=None,
    limit=50,
):
    profile = _resolve_pos_profile(pos_profile)
    company = company or profile.get("company") or frappe.defaults.get_default("company")
    _assert_pos_write_allowed(profile, company=company)
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    filters = {
        "docstatus": 1,
        "status": ["not in", ["Closed", "Cancelled"]],
    }
    if company:
        filters["company"] = company
    if warehouse:
        filters["set_warehouse"] = warehouse

    resolved_supplier = _resolve_supplier(supplier) if supplier else None
    if resolved_supplier:
        filters["supplier"] = resolved_supplier

    start_date = _normalize_date_for_backend(from_date)
    end_date = _normalize_date_for_backend(to_date)
    if start_date and end_date:
        filters["transaction_date"] = ["between", [start_date, end_date]]
    elif start_date:
        filters["transaction_date"] = [">=", start_date]
    elif end_date:
        filters["transaction_date"] = ["<=", end_date]

    effective_search_text = search_text
    if supplier and not resolved_supplier and not effective_search_text:
        effective_search_text = supplier

    or_filters = None
    if effective_search_text:
        like_value = f"%{str(effective_search_text).strip()}%"
        or_filters = {
            "name": ["like", like_value],
            "supplier": ["like", like_value],
            "supplier_name": ["like", like_value],
        }

    try:
        limit_page_length = max(1, min(cint(limit or 50), 200))
    except Exception:
        limit_page_length = 50

    orders = frappe.get_all(
        "Purchase Order",
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name",
            "supplier",
            "supplier_name",
            "company",
            "transaction_date",
            "schedule_date",
            "grand_total",
            "currency",
            "set_warehouse",
            "status",
            "docstatus",
            "per_received",
            "per_billed",
            "modified",
            "owner",
        ],
        order_by="modified desc",
        limit_page_length=limit_page_length,
    )
    po_names = [row.get("name") for row in orders if row.get("name")]
    receipt_summary = _get_receipt_summary_by_po_names(po_names)
    invoice_summary = _get_invoice_summary_by_po_names(po_names)
    advance_paid_map = _get_purchase_order_advance_paid_by_names(po_names)

    results = []
    for row in orders:
        row = _get_purchase_order_management_row(
            row, receipt_summary, invoice_summary, advance_paid_map
        )
        if status_filter == "to_receive" and not row.get("needs_receipt"):
            continue
        if status_filter == "to_bill" and not row.get("needs_invoice"):
            continue
        if status_filter == "to_pay" and not row.get("needs_payment"):
            continue
        if status_filter == "active" and not (
            row.get("needs_receipt") or row.get("needs_invoice") or row.get("needs_payment")
        ):
            continue
        results.append(row)

    return results


def _attach_purchase_item_options(doc, source_doc=None):
    item_codes = [row.get("item_code") for row in doc.get("items", []) if row.get("item_code")]
    if not item_codes:
        return doc

    item_rows = frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=["name", "item_group", "stock_uom", "standard_rate"],
    )
    item_map = {row.name: row for row in item_rows}

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

    billed_qty_map = _get_billed_qty_by_po_item(source_doc) if source_doc else {}

    for row in doc.get("items", []):
        item_code = row.get("item_code")
        meta = item_map.get(item_code)
        if meta:
            row.setdefault("item_group", meta.item_group)
            row.setdefault("stock_uom", meta.stock_uom)
            row.setdefault("standard_rate", meta.standard_rate)

        item_uoms = list(uom_map.get(item_code, []))
        stock_uom = row.get("stock_uom")
        if stock_uom and not any(uom.get("uom") == stock_uom for uom in item_uoms):
            item_uoms.append({"uom": stock_uom, "conversion_factor": 1})
        row["item_uoms"] = item_uoms

        ordered_qty = flt(row.get("qty"))
        received_qty = flt(row.get("received_qty"))
        billed_qty = flt(billed_qty_map.get(row.get("name")))
        row["ordered_qty"] = ordered_qty
        row["received_qty"] = received_qty
        row["pending_receipt_qty"] = max(ordered_qty - received_qty, 0)
        row["billed_qty"] = billed_qty
        row["pending_bill_qty"] = max(ordered_qty - billed_qty, 0)

    return doc


@frappe.whitelist()
def get_draft_purchase_order(purchase_order, pos_profile=None, company=None):
    profile = _resolve_pos_profile(pos_profile)
    company = company or profile.get("company") or frappe.defaults.get_default("company")
    _assert_pos_write_allowed(profile, company=company)
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    if not purchase_order or not frappe.db.exists("Purchase Order", purchase_order):
        frappe.throw(_("Purchase Order {0} was not found.").format(purchase_order))

    po_doc = frappe.get_doc("Purchase Order", purchase_order)
    if cint(po_doc.docstatus) != 0:
        frappe.throw(_("Only draft Purchase Orders can be loaded."))
    if company and po_doc.company and po_doc.company != company:
        frappe.throw(_("Purchase Order {0} does not belong to company {1}.").format(purchase_order, company))

    doc = po_doc.as_dict()
    doc.update(_get_purchase_order_progress(po_doc))
    doc["is_draft"] = cint(po_doc.docstatus) == 0
    return _attach_purchase_item_options(doc, source_doc=po_doc)


@frappe.whitelist()
def get_purchase_management_order(purchase_order, pos_profile=None, company=None):
    profile = _resolve_pos_profile(pos_profile)
    company = company or profile.get("company") or frappe.defaults.get_default("company")
    _assert_pos_write_allowed(profile, company=company)
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    if not purchase_order or not frappe.db.exists("Purchase Order", purchase_order):
        frappe.throw(_("Purchase Order {0} was not found.").format(purchase_order))

    po_doc = frappe.get_doc("Purchase Order", purchase_order)
    if cint(po_doc.docstatus) != 1:
        frappe.throw(_("Only submitted Purchase Orders can be managed."))
    if company and po_doc.company and po_doc.company != company:
        frappe.throw(_("Purchase Order {0} does not belong to company {1}.").format(purchase_order, company))

    doc = po_doc.as_dict()
    doc.update(_get_purchase_order_progress(po_doc))
    _attach_purchase_item_options(doc, source_doc=po_doc)

    receipt_summary = _get_receipt_summary_by_po_names([po_doc.name]).get(po_doc.name, {})
    invoice_summary = _get_invoice_summary_by_po_names([po_doc.name]).get(po_doc.name, {})
    advance_paid = _get_purchase_order_advance_paid_by_names([po_doc.name]).get(po_doc.name)
    _get_purchase_order_management_row(
        doc,
        {po_doc.name: receipt_summary},
        {po_doc.name: invoice_summary},
        {po_doc.name: advance_paid},
    )

    doc["purchase_receipts"] = frappe.db.sql(
        """
        select distinct pr.name, pr.posting_date, pr.status, pr.grand_total
        from `tabPurchase Receipt Item` pri
        inner join `tabPurchase Receipt` pr on pr.name = pri.parent
        where pr.docstatus = 1
          and pri.purchase_order = %s
        order by pr.posting_date desc, pr.modified desc
        """,
        (po_doc.name,),
        as_dict=True,
    )
    doc["purchase_invoices"] = frappe.db.sql(
        """
        select distinct pi.name, pi.posting_date, pi.status, pi.grand_total, pi.outstanding_amount
        from `tabPurchase Invoice Item` pii
        inner join `tabPurchase Invoice` pi on pi.name = pii.parent
        where pi.docstatus = 1
          and pii.purchase_order = %s
        order by pi.posting_date desc, pi.modified desc
        """,
        (po_doc.name,),
        as_dict=True,
    )
    return doc


@frappe.whitelist()
def process_purchase_management_action(data):
    payload = json.loads(data) if isinstance(data, str) else data
    profile = _resolve_pos_profile(payload.get("pos_profile"))
    company = payload.get("company") or profile.get("company") or frappe.defaults.get_default("company")
    _assert_pos_write_allowed(profile, company=company)
    _ensure_allowed(profile, "posa_allow_purchase_order", _("Purchase orders"))

    action = str(payload.get("action") or "").strip().lower()
    if action not in {"receipt", "invoice", "receipt_and_invoice", "payment"}:
        frappe.throw(_("Invalid purchase management action."))

    po_name = payload.get("purchase_order") or payload.get("name")
    if not po_name or not frappe.db.exists("Purchase Order", po_name):
        frappe.throw(_("Purchase Order {0} was not found.").format(po_name))

    po_doc = frappe.get_doc("Purchase Order", po_name)
    if cint(po_doc.docstatus) != 1:
        frappe.throw(_("Only submitted Purchase Orders can be managed."))
    if company and po_doc.company and po_doc.company != company:
        frappe.throw(_("Purchase Order {0} does not belong to company {1}.").format(po_name, company))

    warehouse = payload.get("warehouse") or po_doc.get("set_warehouse") or profile.get("warehouse")
    transaction_date = _normalize_date_for_backend(payload.get("transaction_date")) or nowdate()

    if action in {"receipt", "receipt_and_invoice"}:
        _ensure_allowed(profile, "posa_allow_purchase_receipt", _("Receive stock"))

    try:
        if action == "payment":
            payments = payload.get("payments") or []
            if not payments:
                frappe.throw(_("Please enter at least one payment amount."))
            ref_doc = _get_payment_reference_for_purchase_order(po_doc)
            if ref_doc.doctype == "Purchase Invoice":
                payable_amount = flt(ref_doc.get("outstanding_amount"))
            else:
                advance_paid = flt(_get_purchase_order_advance_paid_by_names([po_doc.name]).get(po_doc.name))
                payable_amount = max(flt(po_doc.get("grand_total")) - advance_paid, 0)
            if payable_amount <= 0:
                frappe.throw(_("There is no payable balance for Purchase Order {0}.").format(po_doc.name))

            capped_payments = []
            remaining_payable = payable_amount
            for payment in payments:
                amount = min(flt(payment.get("amount")), remaining_payable)
                if amount <= 0:
                    continue
                capped_payments.append(
                    {
                        "mode_of_payment": payment.get("mode_of_payment"),
                        "amount": amount,
                    }
                )
                remaining_payable -= amount
            payment_entries = _create_payment_entry(ref_doc, capped_payments, company, transaction_date)
            return {
                "purchase_order": po_doc.name,
                "payment_entries": payment_entries,
                "payment_reference_doctype": ref_doc.doctype,
                "payment_reference": ref_doc.name,
            }

        followup_payload = dict(payload)
        followup_payload["receive"] = 1 if action in {"receipt", "receipt_and_invoice"} else 0
        followup_payload["create_invoice"] = 1 if action in {"invoice", "receipt_and_invoice"} else 0
        result = _run_purchase_order_followup_flow(
            po_doc,
            followup_payload,
            company,
            warehouse,
            transaction_date,
            cint(followup_payload.get("receive")),
        )
        return result
    except Exception:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "POS Awesome Purchase Management Failed")
        raise


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
    invoice_date = _normalize_date_for_backend(
        payload.get("invoice_date") or payload.get("invoice_posting_date"),
        fallback=transaction_date,
    )
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

    payload_items = payload.get("items") or []
    has_explicit_items = bool(payload_items)
    items_by_detail, items_by_code = _build_po_items_map(payload_items)
    billed_qty_map = _get_billed_qty_by_po_item(po_doc)
    receipt_items = (
        {item.purchase_order_item: item for item in (receipt_doc.items or [])} if receipt_doc else {}
    )
    for po_item in po_doc.items:
        payload_row = _resolve_po_input_row(items_by_detail, items_by_code, po_item)
        if has_explicit_items and not payload_row:
            continue

        remaining_bill_qty = max(flt(po_item.qty) - flt(billed_qty_map.get(po_item.name)), 0)
        if remaining_bill_qty <= 0:
            continue
        qty = flt(payload_row.get("invoice_qty") or payload_row.get("bill_qty") or payload_row.get("qty") or remaining_bill_qty)
        qty = min(qty, remaining_bill_qty)
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
