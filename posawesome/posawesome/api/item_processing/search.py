import json
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import frappe
from frappe import _, as_json
from frappe.utils import cint, cstr, get_datetime
from frappe.utils.caching import redis_cache

from posawesome.posawesome.api.item_fetchers import ItemDetailAggregator
from posawesome.posawesome.api.utils import (
    HAS_VARIANTS_EXCLUSION,
    expand_item_groups,
    get_active_pos_profile,
    get_item_groups,
    _ensure_pos_profile,
    log_perf_event,
)
from posawesome.posawesome.api.item_processing.barcode import search_serial_or_batch_or_barcode_number
from posawesome.posawesome.api.item_processing.details import get_items_details

@dataclass(frozen=True)
class ProfileContext:
    """Container describing the active POS profile and caching metadata."""

    pos_profile: Dict[str, Any]
    pos_profile_json: str
    use_price_list_cache: bool
    profile_name: str
    warehouse: Optional[str]
    cache_ttl: Optional[int]


@dataclass(frozen=True)
class ItemGroupContext:
    """Normalized representation of the allowed item groups."""

    groups: List[str]
    groups_tuple: Tuple[str, ...]


@dataclass(frozen=True)
class SearchPlan:
    """Complete set of parameters required to execute the item search."""

    filters: Dict[str, Any]
    or_filters: List[Any]
    fields: List[str]
    limit_page_length: Optional[int]
    limit_start: Optional[int]
    order_by: str
    page_size: int
    initial_page_start: int
    item_code_for_search: Optional[str]
    search_words: List[str]
    normalized_search_value: str
    word_filter_active: bool
    include_description: bool
    include_image: bool
    posa_display_items_in_stock: bool
    posa_show_template_items: bool


def normalize_brand(brand: str) -> str:
    """Return a normalized representation of a brand name."""
    return cstr(brand).strip().lower()



def _to_positive_int(value: Any) -> Optional[int]:
    """Convert the input to a non-negative integer if possible."""

    try:
        integer = int(value)
    except (TypeError, ValueError):
        return None
    return integer if integer >= 0 else None



def _build_search_plan(
    pos_profile: Dict[str, Any],
    item_group: str,
    search_value: str,
    limit,
    offset,
    start_after,
    modified_after,
    include_description: bool,
    include_image: bool,
    item_groups: Optional[Sequence[str]],
) -> SearchPlan:
    """Assemble filters, pagination rules and search metadata."""

    use_limit_search = pos_profile.get("posa_use_limit_search")
    search_serial_no = pos_profile.get("posa_search_serial_no")
    search_batch_no = pos_profile.get("posa_search_batch_no")
    posa_show_template_items = pos_profile.get("posa_show_template_items")
    posa_display_items_in_stock = pos_profile.get("posa_display_items_in_stock")

    limit = _to_positive_int(limit)
    offset = _to_positive_int(offset)

    filters: Dict[str, Any] = {"disabled": 0, "is_sales_item": 1, "is_fixed_asset": 0}
    if start_after:
        filters["item_name"] = [">", start_after]
    if modified_after:
        try:
            parsed_modified_after = get_datetime(modified_after)
        except Exception:
            frappe.throw(_("modified_after must be a valid ISO datetime"))
        filters["modified"] = [">", parsed_modified_after.isoformat()]

    if item_groups:
        filters["item_group"] = ["in", list(item_groups)]

    or_filters: List[Any] = []
    item_code_for_search: Optional[str] = None
    search_words: List[str] = []
    normalized_search_value = ""
    longest_search_token = ""
    raw_search_value = ""

    if search_value:
        raw_search_value = cstr(search_value).strip()
        data = search_serial_or_batch_or_barcode_number(raw_search_value, search_serial_no, search_batch_no)

        tokens = re.split(r"\s+", raw_search_value)
        seen: List[str] = []
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
        min_search_len = 2

        if use_limit_search:
            if len(raw_search_value) >= min_search_len:
                or_filters = [
                    ["name", "like", f"{base_search_term}%"],
                    ["item_name", "like", f"{base_search_term}%"],
                    ["item_code", "like", f"%{base_search_term}%"],
                ]
                item_code_for_search = base_search_term

            if len(raw_search_value) < min_search_len:
                filters["item_code"] = base_search_term
        elif resolved_item_code:
            filters["item_code"] = resolved_item_code

    if item_group and item_group.upper() != "ALL":
        filters["item_group"] = ["like", f"%{item_group}%"]

    if not posa_show_template_items:
        filters.update(HAS_VARIANTS_EXCLUSION)

    if pos_profile.get("posa_hide_variants_items"):
        filters["variant_of"] = ["is", "not set"]

    search_limit = 0
    if use_limit_search:
        raw_search_limit = pos_profile.get("posa_search_limit")
        search_limit = _to_positive_int(raw_search_limit) or 500

    limit_page_length: Optional[int] = None
    limit_start: Optional[int] = None
    order_by = "item_name asc"

    if limit is not None:
        limit_page_length = limit
        if offset and not start_after:
            limit_start = offset
    elif use_limit_search and not pos_profile.get("posa_force_reload_items"):
        limit_page_length = search_limit

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
        "allow_negative_stock",
    ]
    if include_description:
        fields.append("description")
    if include_image:
        fields.append("image")

    initial_page_start = limit_start or 0
    page_size = limit_page_length or 100

    word_filter_active = bool(normalized_search_value) and len(normalized_search_value) >= 3

    return SearchPlan(
        filters=filters,
        or_filters=or_filters,
        fields=fields,
        limit_page_length=limit_page_length,
        limit_start=limit_start,
        order_by=order_by,
        page_size=page_size,
        initial_page_start=initial_page_start,
        item_code_for_search=item_code_for_search,
        search_words=search_words,
        normalized_search_value=normalized_search_value,
        word_filter_active=word_filter_active,
        include_description=include_description,
        include_image=include_image,
        posa_display_items_in_stock=bool(posa_display_items_in_stock),
        posa_show_template_items=bool(posa_show_template_items),
    )


def _collect_searchable_values(row: Dict[str, Any]) -> List[str]:
    """Return a list of normalised strings used for word filtering."""

    values: List[Any] = [
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

    normalized_values: List[str] = []
    for val in values:
        normalized = cstr(val).strip()
        if normalized:
            normalized_values.append(normalized.lower())
    return normalized_values


def _matches_search_words(row: Dict[str, Any], search_words: Sequence[str], word_filter_active: bool) -> bool:
    """Return True when the given row satisfies the configured word filter."""

    if not word_filter_active or not search_words:
        return True

    searchable_values = _collect_searchable_values(row)
    for word in search_words:
        if not any(word in value for value in searchable_values):
            return False
    return True


def _shape_item_row(
    item: Dict[str, Any],
    detail: Dict[str, Any],
    plan: SearchPlan,
    template_attributes_map: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    variant_attributes_map: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> Optional[Dict[str, Any]]:
    """Merge item and detail data while respecting stock and template settings."""

    item_code = item.get("item_code")
    if not item_code:
        return None

    attributes = ""
    if plan.posa_show_template_items and item.get("has_variants"):
        attributes = (template_attributes_map or {}).get(item.get("name"), [])

    item_attributes: Any = ""
    if plan.posa_show_template_items and item.get("variant_of"):
        item_attributes = (variant_attributes_map or {}).get(item.get("name"), [])

    if (
        plan.posa_display_items_in_stock
        and (not detail.get("actual_qty") or detail.get("actual_qty") < 0)
        and not item.get("has_variants")
    ):
        return None

    row: Dict[str, Any] = {}
    row.update(item)
    row.update(detail or {})
    row.update({"attributes": attributes or "", "item_attributes": item_attributes or ""})
    return row


def _build_attribute_maps(
    items_data: Sequence[Dict[str, Any]],
    plan: SearchPlan,
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, List[Dict[str, Any]]]]:
    """Build per-page template and variant attribute maps to avoid N+1 queries."""

    if not plan.posa_show_template_items or not items_data:
        return {}, {}

    template_names = [item.get("name") for item in items_data if item.get("has_variants") and item.get("name")]
    variant_names = [item.get("name") for item in items_data if item.get("variant_of") and item.get("name")]

    template_attributes_map: Dict[str, List[Dict[str, Any]]] = {}
    variant_attributes_map: Dict[str, List[Dict[str, Any]]] = {}

    if template_names:
        template_rows = frappe.get_all(
            "Item Variant Attribute",
            fields=["parent", "attribute"],
            filters={"parent": ["in", template_names], "parentfield": "attributes"},
        )
        attrs_by_parent: Dict[str, set] = {}
        for row in template_rows:
            parent = row.get("parent")
            attribute = row.get("attribute")
            if not parent or not attribute:
                continue
            attrs_by_parent.setdefault(parent, set()).add(attribute)

        all_attributes = sorted({attr for attrs in attrs_by_parent.values() for attr in attrs})
        attr_docs = {}
        if all_attributes:
            for doc in frappe.get_all(
                "Item Attribute",
                fields=["name", "attribute_name"],
                filters={"name": ["in", all_attributes]},
            ):
                attr_docs[doc.get("name")] = doc

        for parent, attrs in attrs_by_parent.items():
            template_attributes_map[parent] = [
                attr_docs[attr]
                for attr in sorted(attrs)
                if attr in attr_docs
            ]

    if variant_names:
        variant_rows = frappe.get_all(
            "Item Variant Attribute",
            fields=["parent", "attribute", "attribute_value"],
            filters={"parent": ["in", variant_names], "parentfield": "attributes"},
        )
        for row in variant_rows:
            parent = row.get("parent")
            if not parent:
                continue
            variant_attributes_map.setdefault(parent, []).append(
                {
                    "attribute": row.get("attribute"),
                    "attribute_value": row.get("attribute_value"),
                }
            )

    return template_attributes_map, variant_attributes_map


def _run_item_query(
    pos_profile: Dict[str, Any],
    price_list: Optional[str],
    customer: Optional[str],
    plan: SearchPlan,
) -> List[Dict[str, Any]]:
    """Execute the search described by ``plan`` and return shaped rows."""

    result: List[Dict[str, Any]] = []
    page_start = plan.initial_page_start

    while True:
        items_data = frappe.get_all(
            "Item",
            filters=plan.filters,
            or_filters=plan.or_filters or None,
            fields=plan.fields,
            limit_start=page_start,
            limit_page_length=plan.page_size,
            order_by=plan.order_by,
        )

        if not items_data and plan.item_code_for_search and page_start == plan.initial_page_start:
            items_data = frappe.get_all(
                "Item",
                filters=plan.filters,
                or_filters=[
                    ["name", "like", f"%{plan.item_code_for_search}%"],
                    ["item_name", "like", f"%{plan.item_code_for_search}%"],
                    ["item_code", "like", f"%{plan.item_code_for_search}%"],
                ],
                fields=plan.fields,
                limit_start=page_start,
                limit_page_length=plan.page_size,
                order_by=plan.order_by,
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
        template_attributes_map, variant_attributes_map = _build_attribute_maps(items_data, plan)

        for item in items_data:
            detail = detail_map.get(item.get("item_code"), {})
            row = _shape_item_row(
                dict(item),
                detail,
                plan,
                template_attributes_map=template_attributes_map,
                variant_attributes_map=variant_attributes_map,
            )
            if not row:
                continue
            if not _matches_search_words(row, plan.search_words, plan.word_filter_active):
                continue
            result.append(row)
            if plan.limit_page_length and len(result) >= plan.limit_page_length:
                break

        if plan.limit_page_length and len(result) >= plan.limit_page_length:
            break

        page_start += len(items_data)
        if len(items_data) < plan.page_size:
            break

    return result[: plan.limit_page_length] if plan.limit_page_length else result


def _execute_item_search(
    pos_profile_json: str,
    price_list: Optional[str],
    item_group: str,
    search_value: str,
    customer: Optional[str],
    limit,
    offset,
    start_after,
    modified_after,
    include_description: bool,
    include_image: bool,
    item_groups: Optional[Sequence[str]],
) -> List[Dict[str, Any]]:
    """Orchestrate the helpers responsible for executing the search query."""

    pos_profile = json.loads(pos_profile_json)

    if not price_list:
        price_list = pos_profile.get("selling_price_list")

    plan = _build_search_plan(
        pos_profile,
        item_group,
        search_value,
        limit,
        offset,
        start_after,
        modified_after,
        include_description,
        include_image,
        item_groups,
    )

    return _run_item_query(pos_profile, price_list, customer, plan)


def _normalize_profile_context(pos_profile) -> ProfileContext:
    """Return the active profile metadata required by :func:`get_items`."""

    profile_dict, profile_json = _ensure_pos_profile(pos_profile)
    ttl = profile_dict.get("posa_server_cache_duration")
    try:
        ttl = int(ttl) * 60 if ttl else None
    except (TypeError, ValueError):
        ttl = None

    return ProfileContext(
        pos_profile=profile_dict,
        pos_profile_json=profile_json,
        use_price_list_cache=bool(profile_dict.get("posa_use_server_cache")),
        profile_name=profile_dict.get("name"),
        warehouse=profile_dict.get("warehouse"),
        cache_ttl=ttl,
    )


def _prepare_item_groups(profile_name: Optional[str], item_groups) -> ItemGroupContext:
    """Normalise incoming item group filters and expand group hierarchies."""

    groups: List[str]
    if isinstance(item_groups, str):
        try:
            groups = json.loads(item_groups)
        except Exception:
            groups = []
    elif isinstance(item_groups, Sequence):
        groups = list(item_groups)
    else:
        groups = []

    if not groups and profile_name:
        groups = get_item_groups(profile_name)

    groups = expand_item_groups(groups or [])
    groups_tuple = tuple(sorted(groups)) if groups else tuple()

    return ItemGroupContext(groups=groups, groups_tuple=groups_tuple)


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
    started_at = time.perf_counter()
    profile_ctx = _normalize_profile_context(pos_profile)
    groups_ctx = _prepare_item_groups(profile_ctx.profile_name, item_groups)

    @redis_cache(ttl=profile_ctx.cache_ttl or 300)
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
        return _execute_item_search(
            profile_ctx.pos_profile_json,
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

    if profile_ctx.use_price_list_cache:
        result = __get_items(
            profile_ctx.profile_name,
            profile_ctx.warehouse,
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
            groups_ctx.groups_tuple,
        )
        log_perf_event(
            "get_items",
            started_at,
            profile=profile_ctx.profile_name,
            rows=len(result or []),
            cache_path=1,
            search=1 if search_value else 0,
            groups=len(groups_ctx.groups_tuple),
        )
        return result

    result = _execute_item_search(
        profile_ctx.pos_profile_json,
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
        groups_ctx.groups,
    )
    log_perf_event(
        "get_items",
        started_at,
        profile=profile_ctx.profile_name,
        rows=len(result or []),
        cache_path=0,
        search=1 if search_value else 0,
        groups=len(groups_ctx.groups),
    )
    return result


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
