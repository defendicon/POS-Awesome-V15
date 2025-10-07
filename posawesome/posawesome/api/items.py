# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

import json
import re

import frappe
from erpnext.stock.doctype.batch.batch import (
    get_batch_no,
    get_batch_qty,
)
from erpnext.stock.get_item_details import get_item_details
from frappe import _, as_json
from frappe.utils import cstr, flt, get_datetime, nowdate
from frappe.utils.background_jobs import enqueue
from frappe.utils.caching import redis_cache

from .utils import (
    HAS_VARIANTS_EXCLUSION,
    expand_item_groups,
    get_active_pos_profile,
    get_item_groups,
)


def normalize_brand(brand: str) -> str:
    """Return a normalized representation of a brand name."""
    return cstr(brand).strip().lower()


def _ensure_pos_profile(pos_profile):
    """Return a ``(profile_dict, profile_json)`` tuple for the given input.

    The POS profile parameter can arrive as a JSON string, a python ``dict``,
    a bare profile name or even ``None`` (when the frontend has not yet loaded
    the active profile). This helper normalises those inputs so downstream code
    can rely on a fully populated dictionary and a JSON serialised
    representation of the same profile. If no valid profile can be resolved a
    user-facing validation error is raised.
    """

    profile_dict = None
    profile_json = None

    if isinstance(pos_profile, dict):
        profile_dict = pos_profile
        profile_json = as_json(pos_profile)
    elif isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if raw_value:
            try:
                decoded_value = json.loads(raw_value)
            except Exception:
                decoded_value = raw_value

            if isinstance(decoded_value, dict):
                profile_dict = decoded_value
                profile_json = raw_value
            elif isinstance(decoded_value, str):
                if decoded_value:
                    profile_doc = frappe.get_doc("POS Profile", decoded_value)
                    profile_dict = profile_doc.as_dict()
                else:
                    profile_dict = get_active_pos_profile()
            elif decoded_value is None:
                profile_dict = get_active_pos_profile()
        else:
            profile_dict = get_active_pos_profile()
    elif pos_profile is None:
        profile_dict = get_active_pos_profile()

    if profile_dict and not profile_json:
        profile_json = as_json(profile_dict)

    if not profile_dict or not profile_json:
        frappe.throw(_("POS profile data is missing or invalid."))

    return profile_dict, profile_json


def get_stock_availability(item_code, warehouse):
    """Return total available quantity for an item in the given warehouse.

    ``warehouse`` can be either a single warehouse or a warehouse group.
    In case of a group, quantities from all child warehouses are summed up
    to provide an accurate availability figure.
    """

    if not warehouse:
        return 0.0

    warehouses = [warehouse]
    if frappe.db.get_value("Warehouse", warehouse, "is_group"):
        # Include all child warehouses when a group warehouse is set
        warehouses = frappe.db.get_descendants("Warehouse", warehouse) or []

    rows = frappe.get_all(
        "Bin",
        fields=["sum(actual_qty) as actual_qty"],
        filters={"item_code": item_code, "warehouse": ["in", warehouses]},
    )

    return flt(rows[0].actual_qty) if rows else 0.0


@frappe.whitelist()
def get_available_qty(items):
    """Return available stock quantity for given items.

    Args:
        items (str | list[dict]): JSON string or list of dicts with
            item_code, warehouse and optional batch_no.

    Returns:
        list: List of dicts with item_code, warehouse and available_qty
            in stock UOM.
    """

    if isinstance(items, str):
        items = json.loads(items)

    result = []
    for it in items or []:
        item_code = it.get("item_code")
        warehouse = it.get("warehouse")
        batch_no = it.get("batch_no")

        if not item_code or not warehouse:
            continue

        if batch_no:
            available_qty = get_batch_qty(batch_no, warehouse) or 0
        else:
            available_qty = get_stock_availability(item_code, warehouse)

        result.append(
            {
                "item_code": item_code,
                "warehouse": warehouse,
                "available_qty": flt(available_qty),
            }
        )

    return result


@frappe.whitelist()
def get_items(
    pos_profile,
    price_list=None,
    item_group="",
    search_value="",
    customer=None,
    limit=None,
    offset=None,
    start_after=None,
    modified_after=None,
    include_description=False,
    include_image=False,
    item_groups=None,
):
    _pos_profile, pos_profile_json = _ensure_pos_profile(pos_profile)
    use_price_list = _pos_profile.get("posa_use_server_cache")
    pos_profile_name = _pos_profile.get("name")
    warehouse = _pos_profile.get("warehouse")
    ttl = _pos_profile.get("posa_server_cache_duration")
    if ttl:
        ttl = int(ttl) * 60

    if isinstance(item_groups, str):
        try:
            item_groups = json.loads(item_groups)
        except Exception:
            item_groups = []
    item_groups = item_groups or get_item_groups(pos_profile_name)
    item_groups = expand_item_groups(item_groups)
    item_groups_tuple = tuple(sorted(item_groups)) if item_groups else tuple()

    @redis_cache(ttl=ttl or 300)
    def __get_items(
        _pos_profile_name,
        _warehouse,
        price_list,
        customer,
        search_value,
        limit,
        offset,
        start_after,
        modified_after,
        item_group,
        include_description,
        include_image,
        item_groups_tuple,
    ):
        return _get_items(
            pos_profile_json,
            price_list,
            item_group,
            search_value,
            customer,
            limit,
            offset,
            start_after,
            modified_after,
            include_description,
            include_image,
            list(item_groups_tuple),
        )

    def _get_items(
        pos_profile,
        price_list,
        item_group,
        search_value,
        customer=None,
        limit=None,
        offset=None,
        start_after=None,
        modified_after=None,
        include_description=False,
        include_image=False,
        item_groups=None,
    ):
        pos_profile = json.loads(pos_profile)

        use_limit_search = pos_profile.get("posa_use_limit_search")
        search_serial_no = pos_profile.get("posa_search_serial_no")
        search_batch_no = pos_profile.get("posa_search_batch_no")
        posa_show_template_items = pos_profile.get("posa_show_template_items")
        posa_display_items_in_stock = pos_profile.get("posa_display_items_in_stock")

        if not price_list:
            price_list = pos_profile.get("selling_price_list")

        def _to_positive_int(value):
            """Convert the input to a non-negative integer if possible."""
            try:
                ivalue = int(value)
                return ivalue if ivalue >= 0 else None
            except (TypeError, ValueError):
                return None

        limit = _to_positive_int(limit)
        offset = _to_positive_int(offset)

        search_limit = 0
        if use_limit_search:
            raw_search_limit = pos_profile.get("posa_search_limit")
            search_limit = _to_positive_int(raw_search_limit) or 500

        result = []

        # Build ORM filters
        filters = {"disabled": 0, "is_sales_item": 1, "is_fixed_asset": 0}
        if start_after:
            filters["item_name"] = [">", start_after]
        if modified_after:
            try:
                parsed_modified_after = get_datetime(modified_after)
            except Exception:
                frappe.throw(_("modified_after must be a valid ISO datetime"))
            filters["modified"] = [">", parsed_modified_after.isoformat()]

        # Add item group filter
        if item_groups:
            filters["item_group"] = ["in", item_groups]

        # Add search conditions
        or_filters = []
        item_code_for_search = None
        data = {}
        search_words = []
        normalized_search_value = ""
        longest_search_token = ""
        raw_search_value = ""
        if search_value:
            raw_search_value = cstr(search_value).strip()
            data = search_serial_or_batch_or_barcode_number(search_value, search_serial_no, search_batch_no)

            tokens = re.split(r"\s+", raw_search_value)
            seen = []
            for token in tokens:
                cleaned = cstr(token).strip()
                if not cleaned:
                    continue
                if len(cleaned) > len(longest_search_token):
                    longest_search_token = cleaned
                lowered = cleaned.lower()
                if lowered not in seen:
                    seen.append(lowered)
            search_words = seen
            normalized_search_value = " ".join(search_words)

            resolved_item_code = data.get("item_code")
            base_search_term = resolved_item_code or (longest_search_token or raw_search_value)
            item_code = resolved_item_code or raw_search_value
            min_search_len = 2

            if use_limit_search:
                if len(raw_search_value) >= min_search_len:
                    or_filters = [
                        ["name", "like", f"{base_search_term}%"],
                        ["item_name", "like", f"{base_search_term}%"],
                        ["item_code", "like", f"%{base_search_term}%"],
                    ]
                    item_code_for_search = base_search_term

                # Prefer exact match when barcode/serial/batch resolves to item_code
                if resolved_item_code:
                    filters["item_code"] = resolved_item_code
                    or_filters = []
                    item_code_for_search = None
                elif len(raw_search_value) < min_search_len:
                    # For short inputs, only attempt exact matches
                    filters["item_code"] = base_search_term
            elif resolved_item_code:
                filters["item_code"] = resolved_item_code
        else:
            resolved_item_code = None

        if item_group and item_group.upper() != "ALL":
            filters["item_group"] = ["like", f"%{item_group}%"]

        if not posa_show_template_items:
            filters.update(HAS_VARIANTS_EXCLUSION)

        if pos_profile.get("posa_hide_variants_items"):
            filters["variant_of"] = ["is", "not set"]

        # Determine limit
        limit_page_length = None
        limit_start = None
        order_by = "item_name asc"

        if limit is not None:
            limit_page_length = limit
            if offset and not start_after:
                limit_start = offset
        elif use_limit_search and not pos_profile.get("posa_force_reload_items"):
            limit_page_length = search_limit

        # When not using limit search and no explicit limit is supplied,
        # allow searches to return the full matching catalog. Limit-search
        # profiles continue to honour the configured cap so Enter queries
        # only hydrate the requested subset of items.
        if search_value and not use_limit_search and limit is None:
            limit_page_length = None

        fields = [
            "name",
            "item_code",
            "item_name",
            "stock_uom",
            "is_stock_item",
            "has_variants",
            "variant_of",
            "item_group",
            "idx",
            "has_batch_no",
            "has_serial_no",
            "max_discount",
            "brand",
        ]
        fields += ["description"] if include_description else []
        fields += ["image"] if include_image else []

        page_start = limit_start or 0
        page_size = limit_page_length or 100

        word_filter_active = bool(normalized_search_value) and len(normalized_search_value) >= 3

        def _collect_searchable_values(row):
            values = [
                row.get("item_code"),
                row.get("item_name"),
                row.get("name"),
                row.get("description"),
                row.get("barcode"),
                row.get("brand"),
                row.get("item_group"),
                row.get("attributes"),
            ]

            item_attributes = row.get("item_attributes")
            if isinstance(item_attributes, list):
                for attr in item_attributes:
                    if isinstance(attr, dict):
                        values.append(attr.get("attribute"))
                        values.append(attr.get("attribute_value"))
                    else:
                        values.append(attr)
            elif item_attributes:
                values.append(item_attributes)

            for barcode in row.get("item_barcode") or []:
                if isinstance(barcode, dict):
                    values.append(barcode.get("barcode"))
                else:
                    values.append(barcode)

            for barcode in row.get("barcodes") or []:
                values.append(barcode)

            for serial in row.get("serial_no_data") or []:
                if isinstance(serial, dict):
                    values.append(serial.get("serial_no"))
                else:
                    values.append(serial)

            for batch in row.get("batch_no_data") or []:
                if isinstance(batch, dict):
                    values.append(batch.get("batch_no"))
                else:
                    values.append(batch)

            normalized_values = []
            for val in values:
                normalized = cstr(val).strip()
                if normalized:
                    normalized_values.append(normalized.lower())
            return normalized_values

        def matches_search_words(row):
            if not word_filter_active or not search_words:
                return True

            searchable_values = _collect_searchable_values(row)
            for word in search_words:
                if not any(word in value for value in searchable_values):
                    return False
            return True

        while True:
            items_data = frappe.get_all(
                "Item",
                filters=filters,
                or_filters=or_filters if or_filters else None,
                fields=fields,
                limit_start=page_start,
                limit_page_length=page_size,
                order_by=order_by,
            )

            if not items_data and item_code_for_search and page_start == (limit_start or 0):
                items_data = frappe.get_all(
                    "Item",
                    filters=filters,
                    or_filters=[
                        ["name", "like", f"%{item_code_for_search}%"],
                        ["item_name", "like", f"%{item_code_for_search}%"],
                        ["item_code", "like", f"%{item_code_for_search}%"],
                    ],
                    fields=fields,
                    limit_start=page_start,
                    limit_page_length=page_size,
                    order_by=order_by,
                )

            if not items_data:
                break

            details = get_items_details(
                json.dumps(pos_profile),
                json.dumps(items_data),
                price_list=price_list,
                customer=customer,
            )
            detail_map = {d["item_code"]: d for d in details}

            for item in items_data:
                item_code = item.item_code
                detail = detail_map.get(item_code, {})

                attributes = ""
                if pos_profile.get("posa_show_template_items") and item.has_variants:
                    attributes = get_item_attributes(item.name)
                item_attributes = ""
                if pos_profile.get("posa_show_template_items") and item.variant_of:
                    item_attributes = frappe.get_all(
                        "Item Variant Attribute",
                        fields=["attribute", "attribute_value"],
                        filters={"parent": item.name, "parentfield": "attributes"},
                    )

                if (
                    posa_display_items_in_stock
                    and (not detail.get("actual_qty") or detail.get("actual_qty") < 0)
                    and not item.has_variants
                ):
                    continue

                row = {}
                row.update(item)
                row.update(detail)
                row.update(
                    {
                        "attributes": attributes or "",
                        "item_attributes": item_attributes or "",
                    }
                )
                if not matches_search_words(row):
                    continue
                result.append(row)
                if limit_page_length and len(result) >= limit_page_length:
                    break

            if limit_page_length and len(result) >= limit_page_length:
                break

            page_start += len(items_data)
            if len(items_data) < page_size:
                break

        return result[:limit_page_length] if limit_page_length else result

    if use_price_list:
        return __get_items(
            pos_profile_name,
            warehouse,
            price_list,
            customer,
            search_value,
            limit,
            offset,
            start_after,
            modified_after,
            item_group,
            include_description,
            include_image,
            item_groups_tuple,
        )
    else:
        return _get_items(
            pos_profile_json,
            price_list,
            item_group,
            search_value,
            customer,
            limit,
            offset,
            start_after,
            modified_after,
            include_description,
            include_image,
            item_groups,
        )


@frappe.whitelist()
def get_items_groups():
    return frappe.db.sql(
        """select name from `tabItem Group`
		where is_group = 0 order by name limit 500""",
        as_dict=1,
    )


@frappe.whitelist()
def get_items_count(pos_profile, item_groups=None):
    pos_profile, _ = _ensure_pos_profile(pos_profile)
    if isinstance(item_groups, str):
        try:
            item_groups = json.loads(item_groups)
        except Exception:
            item_groups = []
    item_groups = item_groups or get_item_groups(pos_profile.get("name"))
    item_groups = expand_item_groups(item_groups)
    filters = {"disabled": 0, "is_sales_item": 1, "is_fixed_asset": 0}
    if item_groups:
        filters["item_group"] = ["in", item_groups]
    return frappe.db.count("Item", filters)


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


@frappe.whitelist()
def get_items_details(pos_profile, items_data, price_list=None, customer=None):
    """Bulk fetch item details for a list of items.

    Instead of calling :pyfunc:`get_item_detail` for each item, this
    implementation gathers price, stock, barcode and UOM information for all
    items using a few ``frappe.get_all`` queries. Batch and serial
    information is also fetched in bulk so that the front end can cache it
    for offline selection without additional round trips per item.
    """

    pos_profile, _ = _ensure_pos_profile(pos_profile)
    items_data = json.loads(items_data)

    warehouse = pos_profile.get("warehouse")
    if not items_data:
        return []

    ttl = pos_profile.get("posa_server_cache_duration")
    if ttl:
        ttl = int(ttl) * 60

    def _to_tuple(data):
        return tuple(sorted(data))

    @redis_cache(ttl=ttl or 300)
    def _get_item_prices(price_list, currency, item_codes, customer):
        if not item_codes:
            return []
        today = nowdate()
        params = {
            "price_list": price_list,
            "currency": currency,
            "item_codes": tuple(item_codes),
            "today": today,
            "customer": customer or "",
        }
        query = """
			SELECT
				item_code,
				price_list_rate,
				currency,
				uom,
				customer
			FROM (
				SELECT
					item_code,
					price_list_rate,
					currency,
					uom,
					customer,
					valid_from,
					valid_upto
				FROM `tabItem Price`
				WHERE
					price_list = %(price_list)s
					AND item_code IN %(item_codes)s
					AND currency = %(currency)s
					AND selling = 1
					AND valid_from <= %(today)s
					AND IFNULL(customer, '') IN ('', %(customer)s)
					AND valid_upto >= %(today)s
				UNION ALL
				SELECT
					item_code,
					price_list_rate,
					currency,
					uom,
					customer,
					valid_from,
					valid_upto
				FROM `tabItem Price`
				WHERE
					price_list = %(price_list)s
					AND item_code IN %(item_codes)s
					AND currency = %(currency)s
					AND selling = 1
					AND valid_from <= %(today)s
					AND IFNULL(customer, '') IN ('', %(customer)s)
					AND (valid_upto IS NULL OR valid_upto = '')
			) ip
			ORDER BY IFNULL(customer, '') ASC, valid_from ASC, valid_upto DESC
		"""
        return frappe.db.sql(query, params, as_dict=True)

    @redis_cache(ttl=ttl or 300)
    def _get_bin_qty(warehouse, item_codes):
        """Fetch stock quantities for multiple items.

        Supports both single warehouses and warehouse groups. When a
        group warehouse is provided, quantities from all its child
        warehouses are aggregated.
        """

        if not item_codes or not warehouse:
            return []

        if frappe.db.get_value("Warehouse", warehouse, "is_group"):
            warehouses = frappe.db.get_descendants("Warehouse", warehouse) or []
            if not warehouses:
                return []
            return frappe.get_all(
                "Bin",
                fields=["item_code", "sum(actual_qty) as actual_qty"],
                filters={
                    "warehouse": ["in", warehouses],
                    "item_code": ["in", item_codes],
                },
                group_by="item_code",
            )

        return frappe.get_all(
            "Bin",
            fields=["item_code", "actual_qty"],
            filters={"warehouse": warehouse, "item_code": ["in", item_codes]},
        )

    @redis_cache(ttl=ttl or 300)
    def _get_item_meta(item_codes):
        if not item_codes:
            return []
        return frappe.get_all(
            "Item",
            fields=["name", "has_batch_no", "has_serial_no", "stock_uom"],
            filters={"name": ["in", item_codes]},
        )

    @redis_cache(ttl=ttl or 300)
    def _get_barcodes(item_codes):
        if not item_codes:
            return []
        return frappe.get_all(
            "Item Barcode",
            fields=["parent", "barcode", "posa_uom"],
            filters={"parent": ["in", item_codes]},
        )

    @redis_cache(ttl=ttl or 300)
    def _get_uoms(item_codes):
        if not item_codes:
            return []
        return frappe.get_all(
            "UOM Conversion Detail",
            fields=["parent", "uom", "conversion_factor"],
            filters={"parent": ["in", item_codes]},
        )

    @redis_cache(ttl=ttl or 300)
    def _get_batches(warehouse, item_codes):
        """Fetch batch data and quantities for multiple items."""
        if not item_codes or not warehouse:
            return []
        rows = []
        for item_code in item_codes:
            batch_list = get_batch_qty(item_code=item_code, warehouse=warehouse) or []
            for batch in batch_list:
                if batch.get("batch_no") and flt(batch.get("qty")) > 0:
                    rows.append(
                        frappe._dict(
                            {
                                "item_code": item_code,
                                "batch_no": batch.get("batch_no"),
                                "batch_qty": batch.get("qty"),
                                "expiry_date": batch.get("expiry_date"),
                                "batch_price": batch.get("posa_batch_price"),
                                "manufacturing_date": batch.get("manufacturing_date"),
                            }
                        )
                    )
        return rows

    @redis_cache(ttl=ttl or 300)
    def _get_serials(warehouse, item_codes):
        if not item_codes or not warehouse:
            return []
        return frappe.get_all(
            "Serial No",
            fields=["name as serial_no", "item_code"],
            filters={
                "item_code": ["in", item_codes],
                "warehouse": warehouse,
                "status": "Active",
            },
        )

    price_list = price_list or pos_profile.get("selling_price_list")
    today = nowdate()
    price_list_currency = frappe.db.get_value("Price List", price_list, "currency") or pos_profile.get(
        "currency"
    )

    company = pos_profile.get("company")
    allow_multi_currency = pos_profile.get("posa_allow_multi_currency") or 0
    company_currency = frappe.db.get_value("Company", company, "default_currency") if company else None

    exchange_rate = 1
    if (
        company_currency
        and price_list_currency
        and price_list_currency != company_currency
        and allow_multi_currency
    ):
        from erpnext.setup.utils import get_exchange_rate

        try:
            exchange_rate = get_exchange_rate(price_list_currency, company_currency, today)
        except Exception:
            frappe.log_error(
                f"Missing exchange rate from {price_list_currency} to {company_currency}",
                "POS Awesome",
            )

    item_codes = [d.get("item_code") for d in items_data if d.get("item_code") and not d.get("has_variants")]
    item_codes_tuple = _to_tuple(item_codes)

    price_rows = _get_item_prices(price_list, price_list_currency, item_codes_tuple, customer)
    stock_rows = _get_bin_qty(warehouse, item_codes_tuple)
    meta_rows = _get_item_meta(item_codes_tuple)
    uom_rows = _get_uoms(item_codes_tuple)
    barcode_rows = _get_barcodes(item_codes_tuple)

    # Determine which items require batch or serial data
    batch_items = [d.name for d in meta_rows if d.has_batch_no]
    serial_items = [d.name for d in meta_rows if d.has_serial_no]

    batch_rows = _get_batches(warehouse, _to_tuple(batch_items))
    serial_rows = _get_serials(warehouse, _to_tuple(serial_items))

    price_map = {}
    for d in price_rows:
        price_map.setdefault(d.item_code, {})
        price_map[d.item_code][d.get("uom") or "None"] = d

    stock_map = {d.item_code: d.actual_qty for d in stock_rows}
    meta_map = {d.name: d for d in meta_rows}

    uom_map = {}
    for d in uom_rows:
        uom_map.setdefault(d.parent, []).append({"uom": d.uom, "conversion_factor": d.conversion_factor})

    barcode_map = {}
    for d in barcode_rows:
        barcode_map.setdefault(d.parent, []).append({"barcode": d.barcode, "posa_uom": d.posa_uom})

    batch_map = {}
    for d in batch_rows:
        batch_map.setdefault(d.item_code, []).append(
            {
                "batch_no": d.batch_no,
                "batch_qty": d.batch_qty,
                "expiry_date": d.expiry_date,
                "batch_price": d.batch_price,
                "manufacturing_date": d.manufacturing_date,
            }
        )

    serial_map = {}
    for d in serial_rows:
        serial_map.setdefault(d.item_code, []).append({"serial_no": d.serial_no})

    result = []
    for item in items_data:
        item_code = item.get("item_code")
        if not item_code or item.get("has_variants"):
            continue

        meta = meta_map.get(item_code, {})
        uoms = uom_map.get(item_code, [])

        stock_uom = meta.get("stock_uom")
        if stock_uom and not any(u.get("uom") == stock_uom for u in uoms):
            uoms.append({"uom": stock_uom, "conversion_factor": 1.0})

        item_price = {}
        if price_map.get(item_code):
            requested_uom = item.get("uom")
            if requested_uom:
                item_price = price_map[item_code].get(requested_uom) or {}

            if not item_price:
                item_price = price_map[item_code].get(stock_uom) or price_map[item_code].get("None") or {}

        row = {}
        row.update(item)
        row.update(
            {
                "item_uoms": uoms or [],
                "item_barcode": barcode_map.get(item_code, []),
                "actual_qty": stock_map.get(item_code, 0) or 0,
                "has_batch_no": meta.get("has_batch_no"),
                "has_serial_no": meta.get("has_serial_no"),
                "batch_no_data": batch_map.get(item_code, []),
                "serial_no_data": serial_map.get(item_code, []),
                "rate": item_price.get("price_list_rate") or 0,
                "price_list_rate": item_price.get("price_list_rate") or 0,
                "currency": item_price.get("currency") or price_list_currency or pos_profile.get("currency"),
                "price_list_currency": price_list_currency,
                "plc_conversion_rate": exchange_rate,
                "conversion_rate": exchange_rate,
            }
        )

        result.append(row)

    return result


@frappe.whitelist()
def get_item_detail(item, doc=None, warehouse=None, price_list=None, company=None):
    item = json.loads(item)
    today = nowdate()
    item_code = item.get("item_code")
    batch_no_data = []
    serial_no_data = []
    if warehouse and item.get("has_batch_no"):
        batch_list = get_batch_qty(warehouse=warehouse, item_code=item_code)
        if batch_list:
            for batch in batch_list:
                if batch.qty > 0 and batch.batch_no:
                    batch_doc = frappe.get_cached_doc("Batch", batch.batch_no)
                    if (
                        str(batch_doc.expiry_date) > str(today) or batch_doc.expiry_date in ["", None]
                    ) and batch_doc.disabled == 0:
                        batch_no_data.append(
                            {
                                "batch_no": batch.batch_no,
                                "batch_qty": batch.qty,
                                "expiry_date": batch_doc.expiry_date,
                                "batch_price": batch_doc.posa_batch_price,
                                "manufacturing_date": batch_doc.manufacturing_date,
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
            fields=["name as serial_no"],
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

    max_discount = frappe.get_value("Item", item_code, "max_discount")
    res = get_item_details(
        item,
        doc,
        overwrite_warehouse=False,
    )
    if item.get("is_stock_item") and warehouse:
        res["actual_qty"] = get_stock_availability(item_code, warehouse)
    res["max_discount"] = max_discount
    res["batch_no_data"] = batch_no_data
    res["serial_no_data"] = serial_no_data

    # Add UOMs data directly from item document
    uoms = frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": item_code},
        fields=["uom", "conversion_factor"],
    )

    # Add stock UOM if not already in uoms list
    stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
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
def get_items_from_barcode(selling_price_list, currency, barcode):
    search_item = frappe.db.get_value(
        "Item Barcode",
        {"barcode": barcode},
        ["parent as item_code", "posa_uom"],
        as_dict=1,
    )
    if search_item:
        item_doc = frappe.get_cached_doc("Item", search_item.item_code)
        item_price = frappe.db.get_value(
            "Item Price",
            {
                "item_code": search_item.item_code,
                "price_list": selling_price_list,
                "currency": currency,
            },
            "price_list_rate",
        )

        return {
            "item_code": item_doc.name,
            "item_name": item_doc.item_name,
            "barcode": barcode,
            "rate": item_price or 0,
            "uom": search_item.posa_uom or item_doc.stock_uom,
            "currency": currency,
        }
    return None


def build_item_cache(item_code):
    """Build item cache for faster access."""
    # Implementation for building item cache
    pass


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


@frappe.whitelist()
def search_serial_or_batch_or_barcode_number(search_value, search_serial_no=None, search_batch_no=None):
    """Search for items by serial number, batch number, or barcode."""
    # Search by barcode
    barcode_data = frappe.db.get_value(
        "Item Barcode",
        {"barcode": search_value},
        ["parent as item_code", "barcode"],
        as_dict=True,
    )
    if barcode_data:
        return {"item_code": barcode_data.item_code, "barcode": barcode_data.barcode}

    # Search by batch number if enabled
    if search_batch_no:
        batch_data = frappe.db.get_value(
            "Batch",
            {"name": search_value},
            ["item as item_code", "name as batch_no"],
            as_dict=True,
        )
        if batch_data:
            return {
                "item_code": batch_data.item_code,
                "batch_no": batch_data.batch_no,
            }

    # Search by serial number if enabled
    if search_serial_no:
        serial_data = frappe.db.get_value(
            "Serial No",
            {"name": search_value},
            ["item_code", "name as serial_no"],
            as_dict=True,
        )
        if serial_data:
            return {
                "item_code": serial_data.item_code,
                "serial_no": serial_data.serial_no,
            }

    return {}


@frappe.whitelist()
def update_price_list_rate(item_code, price_list, rate, uom=None):
    """Create or update Item Price for the given item and price list."""
    if not item_code or not price_list:
        frappe.throw(_("Item Code and Price List are required"))

    rate = flt(rate)
    filters = {"item_code": item_code, "price_list": price_list}
    if uom:
        filters["uom"] = uom
    else:
        filters["uom"] = ["in", ["", None]]

    name = frappe.db.exists("Item Price", filters)
    if name:
        doc = frappe.get_doc("Item Price", name)
        doc.price_list_rate = rate
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc(
            {
                "doctype": "Item Price",
                "item_code": item_code,
                "price_list": price_list,
                "uom": uom,
                "price_list_rate": rate,
                "selling": 1,
            }
        )
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return _("Item Price has been added or updated")


@frappe.whitelist()
def get_price_for_uom(item_code, price_list, uom):
    """Return Item Price for the given item, price list and UOM if it exists."""
    if not (item_code and price_list and uom):
        return None

    price = frappe.db.get_value(
        "Item Price",
        {
            "item_code": item_code,
            "price_list": price_list,
            "uom": uom,
            "selling": 1,
        },
        "price_list_rate",
    )
    return price


@frappe.whitelist()
def get_item_brand(item_code):
    """Return normalized brand for an item, falling back to its template's brand."""
    if not item_code:
        return ""
    data = frappe.db.get_value("Item", item_code, ["brand", "variant_of"], as_dict=True)
    if not data:
        return ""
    brand = data.brand
    if not brand and data.variant_of:
        brand = frappe.db.get_value("Item", data.variant_of, "brand")
    return normalize_brand(brand) if brand else ""
