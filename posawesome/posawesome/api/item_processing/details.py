import frappe
from frappe.utils import nowdate
from posawesome.posawesome.api.item_fetchers import ItemDetailAggregator, get_batches
from posawesome.posawesome.api.item_processing.stock import get_stock_availability
from posawesome.posawesome.api.utils import _ensure_pos_profile, log_perf_event
from frappe import _, as_json
import json
import time

@frappe.whitelist()
def get_items_details(pos_profile, items_data, price_list=None, customer=None):
    """Bulk fetch item details for a list of items."""

    started_at = time.perf_counter()

    pos_profile, _ = _ensure_pos_profile(pos_profile)
    items_data = json.loads(items_data)

    if not items_data:
        log_perf_event(
            "get_items_details",
            started_at,
            profile=pos_profile.get("name"),
            items=0,
            cache_enabled=int(bool(pos_profile.get("posa_use_server_cache"))),
        )
        return []

    aggregator = ItemDetailAggregator(pos_profile, price_list=price_list, customer=customer)
    result = aggregator.build_details(items_data)
    log_perf_event(
        "get_items_details",
        started_at,
        profile=pos_profile.get("name"),
        items=len(items_data),
        rows=len(result or []),
        cache_enabled=int(bool(pos_profile.get("posa_use_server_cache"))),
    )
    return result


@frappe.whitelist()
def get_item_detail(item, doc=None, warehouse=None, price_list=None, company=None):
    from erpnext.stock.get_item_details import get_item_details
    item = json.loads(item)
    today = nowdate()
    item_code = item.get("item_code")
    batch_no_data = []
    non_expired_batch_qty = 0
    serial_no_data = []
    if warehouse and item.get("has_batch_no"):
        batch_rows = get_batches(warehouse, (item_code,))
        for row in batch_rows:
            if not row.batch_no:
                continue
            is_expired = bool(row.expiry_date and str(row.expiry_date) <= str(today))
            if is_expired:
                continue
            non_expired_batch_qty += row.batch_qty or 0
            batch_no_data.append(
                {
                    "batch_no": row.batch_no,
                    "batch_qty": row.batch_qty,
                    "expiry_date": row.expiry_date,
                    "batch_price": row.batch_price,
                    "manufacturing_date": row.manufacturing_date,
                    "is_expired": False,
                }
            )
    if warehouse and item.get("has_serial_no"):
        serial_no_data = frappe.get_all(
            "Serial No",
            filters={
                "item_code": item_code,
                "status": "Active",
                "warehouse": warehouse,
            },
            fields=["name as serial_no", "batch_no"],
        )

    item["selling_price_list"] = price_list

    # Determine if multi-currency is enabled on the POS Profile
    allow_multi_currency = False
    if item.get("pos_profile"):
        allow_multi_currency = (
            frappe.db.get_value("POS Profile", item.get("pos_profile"), "posa_allow_multi_currency") or 0
        )

    # Ensure conversion rate exists when price list currency differs from
    # company currency to avoid ValidationError from ERPNext. Also provide
    # sensible defaults when price list or currency is missing.
    if company:
        company_currency = frappe.db.get_value("Company", company, "default_currency")
        price_list_currency = company_currency
        if price_list:
            price_list_currency = (
                frappe.db.get_value("Price List", price_list, "currency") or company_currency
            )

        exchange_rate = 1
        if price_list_currency != company_currency and allow_multi_currency:
            from erpnext.setup.utils import get_exchange_rate

            try:
                exchange_rate = get_exchange_rate(price_list_currency, company_currency, today)
            except Exception:
                frappe.log_error(
                    f"Missing exchange rate from {price_list_currency} to {company_currency}",
                    "POS Awesome",
                )

        item["price_list_currency"] = price_list_currency
        item["plc_conversion_rate"] = exchange_rate
        item["conversion_rate"] = exchange_rate

        if doc:
            doc.price_list_currency = price_list_currency
            doc.plc_conversion_rate = exchange_rate
            doc.conversion_rate = exchange_rate

    # Add company and doctype to the item args for ERPNext validation
    if company:
        item["company"] = company

    # Set doctype for ERPNext validation
    item["doctype"] = "Sales Invoice"

    # Create a proper doc structure with company for ERPNext validation
    if not doc and company:
        doc = frappe._dict({"doctype": "Sales Invoice", "company": company})

    item_meta = frappe._dict(
        frappe.db.get_value(
            "Item",
            item_code,
            ["max_discount", "allow_negative_stock", "stock_uom"],
            as_dict=True,
        )
        or {}
    )

    max_discount = item_meta.get("max_discount")
    res = get_item_details(
        item,
        doc,
        overwrite_warehouse=False,
    )
    if item.get("is_stock_item") and warehouse:
        if item.get("has_batch_no"):
            res["actual_qty"] = non_expired_batch_qty
        else:
            res["actual_qty"] = get_stock_availability(item_code, warehouse)
    res["max_discount"] = max_discount
    res["batch_no_data"] = batch_no_data
    res["serial_no_data"] = serial_no_data
    res["allow_negative_stock"] = item_meta.get("allow_negative_stock")

    # Add UOMs data directly from item document
    uoms = frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": item_code},
        fields=["uom", "conversion_factor"],
    )

    # Add stock UOM if not already in uoms list
    stock_uom = item_meta.get("stock_uom")
    if stock_uom:
        stock_uom_exists = False
        for uom_data in uoms:
            if uom_data.get("uom") == stock_uom:
                stock_uom_exists = True
                break

        if not stock_uom_exists:
            uoms.append({"uom": stock_uom, "conversion_factor": 1.0})

    res["item_uoms"] = uoms

    return res


@frappe.whitelist()
def get_item_variants(pos_profile, parent_item_code, price_list=None, customer=None):
    """Return variants of an item along with attribute metadata."""
    pos_profile, pos_profile_json = _ensure_pos_profile(pos_profile)
    price_list = price_list or pos_profile.get("selling_price_list")

    fields = [
        "name as item_code",
        "item_name",
        "description",
        "stock_uom",
        "image",
        "is_stock_item",
        "has_variants",
        "variant_of",
        "item_group",
        "idx",
        "has_batch_no",
        "has_serial_no",
        "max_discount",
        "brand",
        "allow_negative_stock",
    ]

    items_data = frappe.get_all(
        "Item",
        filters={"variant_of": parent_item_code, "disabled": 0},
        fields=fields,
        order_by="item_name asc",
    )

    if not items_data:
        return {"variants": [], "attributes_meta": {}}

    details = get_items_details(
        pos_profile_json,
        json.dumps(items_data),
        price_list=price_list,
        customer=customer,
    )

    detail_map = {d["item_code"]: d for d in details}
    result = []
    for item in items_data:
        detail = detail_map.get(item["item_code"], {})
        if detail:
            item.update(detail)
        else:
            item.setdefault("item_barcode", [])
        result.append(item)

    # --------------------------
    # Build attributes meta *and* per-item attribute list
    # --------------------------
    attr_rows = frappe.get_all(
        "Item Variant Attribute",
        filters={"parent": ["in", [d["item_code"] for d in items_data]]},
        fields=["parent", "attribute", "attribute_value"],
    )

    from collections import defaultdict

    attributes_meta: dict[str, set] = defaultdict(set)
    item_attr_map: dict[str, list] = defaultdict(list)

    for row in attr_rows:
        attributes_meta[row.attribute].add(row.attribute_value)
        item_attr_map[row.parent].append({"attribute": row.attribute, "attribute_value": row.attribute_value})

    attributes_meta = {k: sorted(v) for k, v in attributes_meta.items()}

    for item in result:
        item["item_attributes"] = item_attr_map.get(item["item_code"], [])

    # Ensure attributes_meta is always a dictionary
    return {"variants": result, "attributes_meta": attributes_meta or {}}


def get_item_optional_attributes(item_code):
    """Get optional attributes for an item."""
    return frappe.get_all(
        "Item Variant Attribute",
        fields=["attribute", "attribute_value"],
        filters={"parent": item_code, "parentfield": "attributes"},
    )


@frappe.whitelist()
def get_item_attributes(item_code):
    """Get item attributes."""
    return frappe.get_all(
        "Item Attribute",
        fields=["name", "attribute_name"],
        filters={
            "name": [
                "in",
                [
                    attr.attribute
                    for attr in frappe.get_all(
                        "Item Variant Attribute",
                        fields=["attribute"],
                        filters={"parent": item_code},
                    )
                ],
            ]
        },
    )
