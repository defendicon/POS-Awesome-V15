import frappe
from frappe.utils import cint, flt, cstr, getdate, nowdate
from frappe import _
from erpnext.stock.doctype.batch.batch import get_batch_qty
from posawesome.posawesome.api.items import get_bulk_stock_availability, get_stock_availability
from posawesome.posawesome.api.invoice_processing.utils import _sanitize_item_name

def _is_stock_item(item):
    """Return True when the provided row represents a stock item."""

    if item is None:
        return False

    flag = item.get("is_stock_item")
    if flag is not None:
        return bool(cint(flag))

    item_code = item.get("item_code")
    if not item_code:
        return False

    return bool(cint(frappe.get_cached_value("Item", item_code, "is_stock_item") or 0))


def _allow_negative_stock(item, global_allow_negative=None):
    """Return True if negative stock is allowed globally or for the item."""

    # Global setting overrides everything
    if global_allow_negative is None:
        global_allow_negative = cint(
            frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
        )

    if global_allow_negative:
        return True

    flag = item.get("allow_negative_stock")
    if flag is None and item.get("item_code"):
        flag = frappe.get_cached_value("Item", item.get("item_code"), "allow_negative_stock")

    return bool(cint(flag or 0))


def _get_available_stock(item):
    """Return available stock qty for an item row."""
    warehouse = item.get("warehouse")
    batch_no = item.get("batch_no")
    item_code = item.get("item_code")
    if not item_code or not warehouse:
        return 0
    if batch_no:
        return get_batch_qty(batch_no, warehouse) or 0
    return get_stock_availability(item_code, warehouse)


def _collect_stock_errors(items):
    """Return list of items exceeding available stock."""
    errors = []
    items_to_check = []

    global_allow_negative = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0)

    for d in items:
        if flt(d.get("qty")) < 0:
            continue
        if not _is_stock_item(d):
            continue
        if _allow_negative_stock(d, global_allow_negative=global_allow_negative):
            continue
        items_to_check.append(d)

    if not items_to_check:
        return []

    stock_map = get_bulk_stock_availability(items_to_check)

    for d in items_to_check:
        item_code = d.get("item_code")
        warehouse = d.get("warehouse")
        batch_no = cstr(d.get("batch_no"))

        available = stock_map.get((item_code, warehouse, batch_no), 0.0)
        requested = flt(d.get("stock_qty") or (flt(d.get("qty")) * flt(d.get("conversion_factor") or 1)))
        if requested > available:
            errors.append(
                {
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "requested_qty": requested,
                    "available_qty": available,
                }
            )
    return errors


def _should_block(pos_profile):
    allow_negative = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0)
    if allow_negative:
        return False

    block_sale = 1
    if pos_profile:
        block_sale = cint(
            frappe.db.get_value("POS Profile", pos_profile, "posa_block_sale_beyond_available_qty") or 1
        )

    return bool(block_sale)


def _validate_stock_on_invoice(invoice_doc):
    if invoice_doc.doctype == "Sales Invoice" and not cint(getattr(invoice_doc, "update_stock", 0)):
        frappe.logger().debug("Skipping stock validation for Sales Invoice without stock update")
        return
    items_to_check = [d.as_dict() for d in invoice_doc.items if d.get("is_stock_item")]
    if hasattr(invoice_doc, "packed_items"):
        items_to_check.extend([d.as_dict() for d in invoice_doc.packed_items])
    errors = _collect_stock_errors(items_to_check)
    if errors and _should_block(invoice_doc.pos_profile):
        frappe.throw(frappe.as_json({"errors": errors}), frappe.ValidationError)


def _auto_set_return_batches(invoice_doc):
    """Assign batch numbers for return invoices without a source invoice.

    When the POS Profile allows returns without an original invoice and an
    item requires a batch number, this function allocates the first
    available batch in FIFO order. If no batches exist in the selected
    warehouse, an informative error is raised instead of the generic
    validation error.
    """

    if not invoice_doc.is_return or invoice_doc.get("return_against"):
        return

    profile = invoice_doc.get("pos_profile")
    allow_without_invoice = profile and frappe.db.get_value(
        "POS Profile", profile, "posa_allow_return_without_invoice"
    )
    if not cint(allow_without_invoice):
        return

    allow_free = cint(frappe.db.get_value("POS Profile", profile, "posa_allow_free_batch_return") or 0)
    today = getdate(nowdate())

    items_to_process = []
    all_batch_nos = set()

    for d in invoice_doc.items:
        if not d.get("item_code") or not d.get("warehouse"):
            continue

        has_batch = frappe.db.get_value("Item", d.item_code, "has_batch_no")
        if has_batch and not d.get("batch_no"):
            d.use_serial_batch_fields = 1
            # get_batch_qty returns batches sorted by default (usually FIFO/Expiration)
            batch_list = get_batch_qty(item_code=d.item_code, warehouse=d.warehouse) or []
            if batch_list:
                items_to_process.append((d, batch_list))
                for b in batch_list:
                    if b.get("batch_no"):
                        all_batch_nos.add(b.get("batch_no"))
            elif not allow_free:
                frappe.throw(_("No batches available in {0} for {1}.").format(d.warehouse, d.item_code))

    if not all_batch_nos:
        return

    # Fetch expiry dates for all collected batches in one query
    batch_details = frappe.get_all(
        "Batch",
        filters={"name": ["in", list(all_batch_nos)]},
        fields=["name", "expiry_date"],
    )

    valid_batches = {
        b.name
        for b in batch_details
        if not b.expiry_date or getdate(b.expiry_date) >= today
    }

    # Assign batches
    for item, batch_list in items_to_process:
        assigned = False
        for b in batch_list:
            if b.get("batch_no") in valid_batches:
                item.batch_no = b.get("batch_no")
                assigned = True
                break
        if not assigned and not allow_free:
            frappe.throw(_("No valid batches available in {0} for {1}.").format(item.warehouse, item.item_code))


def _apply_item_name_overrides(invoice_doc, overrides=None):
    """Apply custom item names to invoice items."""
    overrides = overrides or {}
    for item in invoice_doc.items:
        source = overrides.get(item.idx) or {}
        provided = source.get("item_name") if isinstance(source, dict) else None
        default_name = frappe.get_cached_value("Item", item.item_code, "item_name")
        clean = _sanitize_item_name(provided or item.item_name)
        if clean and clean != default_name:
            item.item_name = clean
            item.name_overridden = 1
        else:
            item.item_name = default_name
            item.name_overridden = 0


def _merge_duplicate_taxes(invoice_doc):
    """Remove duplicate tax rows with same account and rate.

    If duplicates are found, keep the first occurrence and recalculate totals.
    """
    seen = set()
    unique = []
    for tax in invoice_doc.get("taxes", []):
        key = (tax.account_head, flt(tax.rate), cstr(tax.charge_type))
        if key in seen:
            continue
        seen.add(key)
        unique.append(tax)
    if len(unique) != len(invoice_doc.get("taxes", [])):
        invoice_doc.set("taxes", unique)
        invoice_doc.calculate_taxes_and_totals()


def _deduplicate_free_items(invoice_doc):
    """Merge duplicate free lines created by overlapping pricing rules."""

    items = invoice_doc.get("items", [])
    if not items:
        return

    unique = []
    seen = {}

    def _normalise_qty(row):
        qty = flt(row.get("qty"))
        if not qty:
            return 0
        return qty

    def _normalise_stock_qty(row):
        stock_qty = flt(row.get("stock_qty"))
        if stock_qty:
            return stock_qty
        qty = flt(row.get("qty"))
        if not qty:
            return 0
        conversion_factor = flt(row.get("conversion_factor") or 1) or 1
        return qty * conversion_factor

    for item in items:
        if cint(item.get("is_free_item")):
            key = (
                cstr(item.get("source_rule") or item.get("pricing_rule") or item.get("pricing_rules") or ""),
                cstr(item.get("item_code") or ""),
                cstr(item.get("warehouse") or ""),
                cstr(item.get("uom") or ""),
            )

            existing = seen.get(key)
            if existing:
                existing.qty = _normalise_qty(existing) + _normalise_qty(item)
                existing.stock_qty = _normalise_stock_qty(existing) + _normalise_stock_qty(item)
                # Ensure monetary fields remain zeroed for freebies
                for field in (
                    "rate",
                    "base_rate",
                    "amount",
                    "base_amount",
                    "net_rate",
                    "net_amount",
                    "base_net_rate",
                    "base_net_amount",
                    "discount_amount",
                    "base_discount_amount",
                ):
                    if field in existing and flt(existing.get(field)):
                        existing.set(field, 0)
                continue

            seen[key] = item
            unique.append(item)
            continue

        unique.append(item)

    if len(unique) != len(items):
        invoice_doc.set("items", unique)


def _strip_client_freebies_from_payload(payload):
    """Remove auto-applied POS freebies from inbound payloads before saving."""

    if not payload or not isinstance(payload, dict):
        return

    items = payload.get("items")
    if not isinstance(items, list):
        return

    cleaned = []
    modified = False

    for row in items:
        if not isinstance(row, dict):
            cleaned.append(row)
            continue

        auto_marker = row.get("auto_free_source")
        is_free = cint(row.get("is_free_item"))
        has_name = bool(row.get("name"))

        if auto_marker:
            modified = True
            continue

        cleaned.append(row)

    if modified:
        payload["items"] = cleaned
