"""Shared helpers for bulk item data retrieval used by POS Awesome APIs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import frappe
from erpnext.setup.utils import get_exchange_rate
from erpnext.stock.doctype.batch.batch import get_batch_qty
from frappe.utils import flt, nowdate
from frappe.utils.caching import redis_cache


def _resolve_cache_ttl(ttl: Optional[int]) -> int:
    """Return a numeric TTL value while falling back to the default window."""

    return int(ttl) if ttl else 300


def _cache_wrapper(store: Dict[int, Callable[..., Any]], ttl: Optional[int], fn: Callable[..., Any]):
    """Memoize the redis cache decorator for a given TTL to avoid re-wrapping."""

    resolved_ttl = _resolve_cache_ttl(ttl)
    cached = store.get(resolved_ttl)
    if cached is None:
        cached = redis_cache(ttl=resolved_ttl)(fn)
        store[resolved_ttl] = cached
    return cached


def _normalize_codes(codes: Iterable[str]) -> Tuple[str, ...]:
    """Return a sorted tuple of unique item codes while dropping falsy values."""

    return tuple(sorted({code for code in codes if code}))


_price_cache: Dict[int, Callable[..., Any]] = {}
_bin_cache: Dict[int, Callable[..., Any]] = {}
_meta_cache: Dict[int, Callable[..., Any]] = {}
_barcode_cache: Dict[int, Callable[..., Any]] = {}
_uom_cache: Dict[int, Callable[..., Any]] = {}
_batch_cache: Dict[int, Callable[..., Any]] = {}
_serial_cache: Dict[int, Callable[..., Any]] = {}


def _fetch_item_prices(
    price_list: str,
    currency: str,
    item_codes: Tuple[str, ...],
    customer: str,
    today: str,
):
    """Return raw Item Price rows honoring date, currency and customer filters."""

    if not item_codes:
        return []

    params = {
        "price_list": price_list,
        "currency": currency,
        "item_codes": item_codes,
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


def get_item_prices(
    price_list: str,
    currency: str,
    item_codes: Sequence[str],
    customer: Optional[str],
    today: Optional[str] = None,
    ttl: Optional[int] = None,
):
    """Fetch Item Price data with optional redis caching based on TTL."""

    cached = _cache_wrapper(_price_cache, ttl, _fetch_item_prices)
    return cached(price_list, currency, tuple(item_codes), customer or "", today or nowdate())


def _fetch_bin_qty(warehouse: str, item_codes: Tuple[str, ...]):
    """Return stock quantities for each item, expanding warehouse groups."""

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


def get_bin_qty(warehouse: Optional[str], item_codes: Sequence[str], ttl: Optional[int] = None):
    """Return cached Bin quantities when a warehouse and codes are provided."""

    cached = _cache_wrapper(_bin_cache, ttl, _fetch_bin_qty)
    return cached(warehouse, tuple(item_codes))


def _fetch_item_meta(item_codes: Tuple[str, ...]):
    """Return Item metadata required for batch/serial checks."""

    if not item_codes:
        return []
    return frappe.get_all(
        "Item",
        fields=["name", "has_batch_no", "has_serial_no", "stock_uom"],
        filters={"name": ["in", item_codes]},
    )


def get_item_meta(item_codes: Sequence[str], ttl: Optional[int] = None):
    """Fetch Item metadata with caching support."""

    cached = _cache_wrapper(_meta_cache, ttl, _fetch_item_meta)
    return cached(tuple(item_codes))


def _fetch_barcodes(item_codes: Tuple[str, ...]):
    """Return barcode rows mapped to the parent item."""

    if not item_codes:
        return []
    return frappe.get_all(
        "Item Barcode",
        fields=["parent", "barcode", "posa_uom"],
        filters={"parent": ["in", item_codes]},
    )


def get_barcodes(item_codes: Sequence[str], ttl: Optional[int] = None):
    """Fetch Item Barcode entries while respecting the configured TTL."""

    cached = _cache_wrapper(_barcode_cache, ttl, _fetch_barcodes)
    return cached(tuple(item_codes))


def _fetch_uoms(item_codes: Tuple[str, ...]):
    """Return UOM conversion rows for the supplied item codes."""

    if not item_codes:
        return []
    return frappe.get_all(
        "UOM Conversion Detail",
        fields=["parent", "uom", "conversion_factor"],
        filters={"parent": ["in", item_codes]},
    )


def get_uoms(item_codes: Sequence[str], ttl: Optional[int] = None):
    """Fetch UOM Conversion Detail rows with redis caching support."""

    cached = _cache_wrapper(_uom_cache, ttl, _fetch_uoms)
    return cached(tuple(item_codes))


def _fetch_batches(warehouse: str, item_codes: Tuple[str, ...]):
    """Collect positive batch quantities per item for the given warehouse."""

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


def get_batches(warehouse: Optional[str], item_codes: Sequence[str], ttl: Optional[int] = None):
    """Fetch batch availability constrained to the provided warehouse."""

    cached = _cache_wrapper(_batch_cache, ttl, _fetch_batches)
    return cached(warehouse, tuple(item_codes))


def _fetch_serials(warehouse: str, item_codes: Tuple[str, ...]):
    """Return active serial numbers scoped to a warehouse."""

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


def get_serials(warehouse: Optional[str], item_codes: Sequence[str], ttl: Optional[int] = None):
    """Fetch serial number data while honouring the redis cache TTL."""

    cached = _cache_wrapper(_serial_cache, ttl, _fetch_serials)
    return cached(warehouse, tuple(item_codes))


@dataclass(frozen=True)
class ItemLookupData:
    price_map: Dict[str, Dict[str, frappe._dict]]
    stock_map: Dict[str, float]
    meta_map: Dict[str, frappe._dict]
    uom_map: Dict[str, List[Dict[str, Any]]]
    barcode_map: Dict[str, List[Dict[str, Any]]]
    batch_map: Dict[str, List[Dict[str, Any]]]
    serial_map: Dict[str, List[Dict[str, Any]]]


def _select_price(
    price_rows: Dict[str, frappe._dict],
    requested_uom: Optional[str],
    stock_uom: Optional[str],
) -> frappe._dict:
    """Select the most appropriate price row for the requested item context."""

    if not price_rows:
        return frappe._dict()

    if requested_uom and requested_uom in price_rows:
        return price_rows[requested_uom]

    if stock_uom and stock_uom in price_rows:
        return price_rows[stock_uom]

    if "None" in price_rows:
        return price_rows["None"]

    # fall back to first available rate
    return next(iter(price_rows.values()), frappe._dict())


def _ensure_stock_uom(uoms: List[Dict[str, Any]], stock_uom: Optional[str]) -> List[Dict[str, Any]]:
    """Make sure the stock UOM is always present in the UOM listing."""

    uoms = list(uoms or [])
    if stock_uom and not any(u.get("uom") == stock_uom for u in uoms):
        uoms.append({"uom": stock_uom, "conversion_factor": 1.0})
    return uoms


def merge_item_row(
    item: Dict[str, Any],
    lookup_data: ItemLookupData,
    price_list_currency: Optional[str],
    exchange_rate: float,
) -> Dict[str, Any]:
    """Merge lookup data into a POS item row for downstream consumption."""

    item_code = item.get("item_code")
    if not item_code:
        return dict(item)

    meta = lookup_data.meta_map.get(item_code, frappe._dict())
    uoms = _ensure_stock_uom(lookup_data.uom_map.get(item_code, []), meta.get("stock_uom"))
    price_row = _select_price(lookup_data.price_map.get(item_code, {}), item.get("uom"), meta.get("stock_uom"))
    price_currency = price_row.get("currency") if price_row else None

    row = dict(item)
    row.update(
        {
            "item_uoms": uoms,
            "item_barcode": lookup_data.barcode_map.get(item_code, []),
            "actual_qty": lookup_data.stock_map.get(item_code, 0) or 0,
            "has_batch_no": meta.get("has_batch_no"),
            "has_serial_no": meta.get("has_serial_no"),
            "batch_no_data": lookup_data.batch_map.get(item_code, []),
            "serial_no_data": lookup_data.serial_map.get(item_code, []),
            "rate": price_row.get("price_list_rate") if price_row else 0,
            "price_list_rate": price_row.get("price_list_rate") if price_row else 0,
            "currency": price_currency or price_list_currency,
            "price_list_currency": price_list_currency,
            "plc_conversion_rate": exchange_rate,
            "conversion_rate": exchange_rate,
        }
    )
    return row


class ItemDetailAggregator:
    """Aggregate item lookup data and build detail rows."""

    def __init__(
        self,
        pos_profile: Dict[str, Any],
        price_list: Optional[str] = None,
        customer: Optional[str] = None,
    ) -> None:
        self.pos_profile = pos_profile
        self.customer = customer
        self.price_list = price_list or pos_profile.get("selling_price_list")
        self.cache_ttl = self._resolve_ttl()
        self.today = nowdate()
        self.warehouse = pos_profile.get("warehouse")
        self.price_list_currency = self._determine_price_list_currency()
        self.exchange_rate = self._compute_exchange_rate()

    def _resolve_ttl(self) -> Optional[int]:
        """Convert the POS profile cache duration to seconds."""

        ttl = self.pos_profile.get("posa_server_cache_duration")
        if not ttl:
            return None
        try:
            return int(ttl) * 60
        except Exception:
            return None

    def _determine_price_list_currency(self) -> Optional[str]:
        """Resolve the currency backing the active selling price list."""

        if not self.price_list:
            return self.pos_profile.get("currency")
        return frappe.db.get_value("Price List", self.price_list, "currency") or self.pos_profile.get("currency")

    def _compute_exchange_rate(self) -> float:
        """Compute the price list to company currency exchange rate."""

        company = self.pos_profile.get("company")
        allow_multi_currency = self.pos_profile.get("posa_allow_multi_currency") or 0
        company_currency = frappe.db.get_value("Company", company, "default_currency") if company else None
        price_list_currency = self.price_list_currency or self.pos_profile.get("currency")

        if (
            company_currency
            and price_list_currency
            and price_list_currency != company_currency
            and allow_multi_currency
        ):
            try:
                return get_exchange_rate(price_list_currency, company_currency, self.today)
            except Exception:
                frappe.log_error(
                    f"Missing exchange rate from {price_list_currency} to {company_currency}",
                    "POS Awesome",
                )
        return 1

    def _prepare_lookup(self, item_codes: Iterable[str]) -> ItemLookupData:
        """Collect and organise lookup rows for the provided item codes."""

        item_codes_tuple = _normalize_codes(item_codes)
        if not item_codes_tuple:
            return ItemLookupData({}, {}, {}, {}, {}, {}, {})

        price_rows = []
        if self.price_list:
            price_rows = get_item_prices(
                self.price_list,
                self.price_list_currency or self.pos_profile.get("currency"),
                item_codes_tuple,
                self.customer,
                today=self.today,
                ttl=self.cache_ttl,
            )
        # Stock, metadata, UOM and barcode data are reused both for batches and the
        # final merged item rows, so collect them up front.
        stock_rows = get_bin_qty(self.warehouse, item_codes_tuple, ttl=self.cache_ttl)
        meta_rows = get_item_meta(item_codes_tuple, ttl=self.cache_ttl)
        uom_rows = get_uoms(item_codes_tuple, ttl=self.cache_ttl)
        barcode_rows = get_barcodes(item_codes_tuple, ttl=self.cache_ttl)

        batch_items = [row.name for row in meta_rows if row.get("has_batch_no")]
        serial_items = [row.name for row in meta_rows if row.get("has_serial_no")]
        batch_rows = get_batches(self.warehouse, _normalize_codes(batch_items), ttl=self.cache_ttl)
        serial_rows = get_serials(self.warehouse, _normalize_codes(serial_items), ttl=self.cache_ttl)

        price_map: Dict[str, Dict[str, frappe._dict]] = {}
        for row in price_rows:
            price_map.setdefault(row.item_code, {})[row.get("uom") or "None"] = row

        stock_map = {row.item_code: row.actual_qty for row in stock_rows}
        meta_map = {row.name: row for row in meta_rows}

        uom_map: Dict[str, List[Dict[str, object]]] = {}
        for row in uom_rows:
            uom_map.setdefault(row.parent, []).append(
                {"uom": row.uom, "conversion_factor": row.conversion_factor}
            )

        barcode_map: Dict[str, List[Dict[str, object]]] = {}
        for row in barcode_rows:
            barcode_map.setdefault(row.parent, []).append({"barcode": row.barcode, "posa_uom": row.posa_uom})

        batch_map: Dict[str, List[Dict[str, object]]] = {}
        for row in batch_rows:
            batch_map.setdefault(row.item_code, []).append(
                {
                    "batch_no": row.batch_no,
                    "batch_qty": row.batch_qty,
                    "expiry_date": row.expiry_date,
                    "batch_price": row.batch_price,
                    "manufacturing_date": row.manufacturing_date,
                }
            )

        serial_map: Dict[str, List[Dict[str, object]]] = {}
        for row in serial_rows:
            serial_map.setdefault(row.item_code, []).append({"serial_no": row.serial_no})

        return ItemLookupData(
            price_map=price_map,
            stock_map=stock_map,
            meta_map=meta_map,
            uom_map=uom_map,
            barcode_map=barcode_map,
            batch_map=batch_map,
            serial_map=serial_map,
        )

    def build_details(self, items_data: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
        """Produce enriched item detail rows for all non-template items."""

        item_codes = [
            item.get("item_code")
            for item in items_data
            if item.get("item_code") and not item.get("has_variants")
        ]
        lookup_data = self._prepare_lookup(item_codes)

        result = []
        for item in items_data:
            if not item.get("item_code") or item.get("has_variants"):
                continue
            result.append(
                merge_item_row(item, lookup_data, self.price_list_currency or self.pos_profile.get("currency"), self.exchange_rate)
            )
        return result


__all__ = [
    "ItemDetailAggregator",
    "ItemLookupData",
    "get_item_prices",
    "get_bin_qty",
    "get_item_meta",
    "get_barcodes",
    "get_uoms",
    "get_batches",
    "get_serials",
    "merge_item_row",
]
