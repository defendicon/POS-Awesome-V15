import frappe
from frappe.utils import cint, cstr, flt
from typing import Any, Dict, Optional


def _get_scale_barcode_settings():
    """Return the Scale Barcode Settings single document if it exists."""

    try:
        return frappe.get_cached_doc("Scale Barcode Settings")
    except frappe.DoesNotExistError:
        return None
    except Exception:
        frappe.log_error("Unable to load Scale Barcode Settings", "POS Awesome")
        return None


def _get_scale_settings_metadata(settings) -> Dict[str, Any]:
    """Return a normalized dictionary for the scale barcode settings."""

    if not settings:
        return {}

    metadata = {
        "prefix": cstr(getattr(settings, "prefix", "") or "").strip(),
        "prefix_included_or_not": cint(getattr(settings, "prefix_included_or_not", 0)),
        "no_of_prefix_characters": cint(getattr(settings, "no_of_prefix_characters", 0)),
        "item_code_starting_digit": cint(getattr(settings, "item_code_starting_digit", 0)),
        "item_code_total_digits": cint(getattr(settings, "item_code_total_digits", 0)),
        "weight_starting_digit": cint(getattr(settings, "weight_starting_digit", 0)),
        "weight_total_digits": cint(getattr(settings, "weight_total_digits", 0)),
        "weight_decimals": cint(getattr(settings, "weight_decimals", 0)),
        "price_included_in_barcode_or_not": cint(getattr(settings, "price_included_in_barcode_or_not", 0)),
        "price_starting_digit": cint(getattr(settings, "price_starting_digit", 0)),
        "price_total_digit": cint(getattr(settings, "price_total_digit", 0)),
        "price_decimals": cint(getattr(settings, "price_decimals", 0)),
    }
    return metadata


def _segment_end(start: int, digits: int, decimals: int = 0) -> int:
    if not start or not digits:
        return 0
    return start + digits + max(decimals, 0) - 1


def _replace_segment(target_chars, start_index: int, value: str):
    """Replace a contiguous segment in ``target_chars``."""

    needed_len = start_index + len(value)
    if len(target_chars) < needed_len:
        target_chars.extend(["0"] * (needed_len - len(target_chars)))
    for idx, ch in enumerate(value):
        target_chars[start_index + idx] = ch


def _normalize_numeric_code(value: str, length: int) -> str:
    digits_only = "".join(ch for ch in cstr(value or "") if ch.isdigit())
    if not digits_only:
        return ""
    if len(digits_only) > length:
        digits_only = digits_only[-length:]
    return digits_only.zfill(length)


def _encode_value_segments(value: float, digits: int, decimals: int, label: str):
    total_digits = max(digits, 0) + max(decimals, 0)
    if total_digits <= 0:
        return "", ""

    scaled_value = int(round(max(flt(value), 0) * (10 ** max(decimals, 0))))
    max_value = (10**total_digits) - 1
    if scaled_value > max_value:
        frappe.throw(f"{label} exceeds barcode capacity for configured scale settings.")

    encoded = str(scaled_value).zfill(total_digits)
    return encoded[:digits], encoded[digits:]


def _calculate_ean13_check_digit(code12: str) -> str:
    if len(code12) != 12 or not code12.isdigit():
        return ""
    total = 0
    for idx, ch in enumerate(code12):
        digit = int(ch)
        if (idx + 1) % 2 == 0:
            total += digit * 3
        else:
            total += digit
    return str((10 - (total % 10)) % 10)


def _get_required_barcode_length(metadata: Dict[str, Any]) -> int:
    required_len = _segment_end(
        cint(metadata.get("item_code_starting_digit")),
        cint(metadata.get("item_code_total_digits")),
    )
    required_len = max(
        required_len,
        _segment_end(
            cint(metadata.get("weight_starting_digit")),
            cint(metadata.get("weight_total_digits")),
            cint(metadata.get("weight_decimals")),
        ),
    )
    if cint(metadata.get("price_included_in_barcode_or_not")):
        required_len = max(
            required_len,
            _segment_end(
                cint(metadata.get("price_starting_digit")),
                cint(metadata.get("price_total_digit")),
                cint(metadata.get("price_decimals")),
            ),
        )
    prefix_len = cint(metadata.get("no_of_prefix_characters"))
    if cint(metadata.get("prefix_included_or_not")) and prefix_len:
        required_len = max(required_len, prefix_len)
    return max(required_len, 0)


def _find_item_scale_template(item_code: str, uom: Optional[str] = None) -> str:
    """Find a scale barcode template from Item Barcode rows for the item."""

    item_code_value = cstr(item_code or "").strip()
    if not item_code_value:
        return ""

    rows = frappe.get_all(
        "Item Barcode",
        filters={"parent": item_code_value},
        fields=["barcode", "posa_uom"],
    )
    if not rows:
        return ""

    requested_uom = cstr(uom or "").strip()
    ordered_rows = rows
    if requested_uom:
        matched = [
            row
            for row in rows
            if cstr(row.get("posa_uom") or "").strip() == requested_uom
        ]
        unmatched = [
            row
            for row in rows
            if cstr(row.get("posa_uom") or "").strip() != requested_uom
        ]
        ordered_rows = matched + unmatched

    for row in ordered_rows:
        barcode = cstr(row.get("barcode") or "").strip()
        if not barcode:
            continue
        parsed = _parse_scale_barcode_data(barcode)
        if parsed and parsed.get("item_code"):
            return barcode

    return ""


def _extract_numeric_segment(barcode: str, start: int, length: int, decimals: int = 0):
    """Extract a numeric value from ``barcode`` using 1-indexed ``start`` and ``length``."""

    if not (start and length):
        return None

    start_index = max(start - 1, 0)
    end_index = start_index + max(length, 0)
    if len(barcode) < end_index:
        return None

    whole = barcode[start_index:end_index]
    decimal_part = ""
    if decimals and decimals > 0:
        decimal_end = end_index + decimals
        if len(barcode) < decimal_end:
            return None
        decimal_part = barcode[end_index:decimal_end]

    number_str = whole
    if decimal_part:
        number_str = f"{whole}.{decimal_part}"

    try:
        return flt(number_str)
    except Exception:
        return None


def _parse_scale_barcode_data(barcode: str) -> Optional[Dict[str, Any]]:
    """Parse barcode data according to the configured scale barcode settings."""

    barcode_value = cstr(barcode or "").strip()
    if not barcode_value:
        return None

    settings = _get_scale_barcode_settings()
    if not settings:
        return None

    prefix_included = cint(settings.prefix_included_or_not)
    prefix_length = cint(settings.no_of_prefix_characters) if prefix_included else 0
    prefix_value = cstr(settings.prefix or "").strip()

    if prefix_value and not barcode_value.startswith(prefix_value):
        return None

    if prefix_included and prefix_length and len(barcode_value) < prefix_length:
        return None

    item_start = cint(settings.item_code_starting_digit)
    item_digits = cint(settings.item_code_total_digits)
    if not (item_start and item_digits):
        return None

    item_start_index = max(item_start - 1, 0)
    item_end_index = item_start_index + item_digits
    if len(barcode_value) < item_end_index:
        return None

    item_code = barcode_value[item_start_index:item_end_index]
    data: Dict[str, Any] = {"barcode": barcode_value, "item_code": item_code}

    qty = _extract_numeric_segment(
        barcode_value,
        cint(settings.weight_starting_digit),
        cint(settings.weight_total_digits),
        cint(settings.weight_decimals),
    )
    if qty is not None:
        data["qty"] = qty

    if cint(settings.price_included_in_barcode_or_not):
        price = _extract_numeric_segment(
            barcode_value,
            cint(settings.price_starting_digit),
            cint(settings.price_total_digit),
            cint(settings.price_decimals),
        )
        if price is not None:
            data["price"] = price

    return data


@frappe.whitelist()
def parse_scale_barcode(barcode: str):
    """Public API to parse a scale barcode and return decoded data."""

    settings = _get_scale_barcode_settings()
    metadata: Optional[Dict[str, Any]] = _get_scale_settings_metadata(settings) if settings else None

    data = _parse_scale_barcode_data(barcode)

    if not data:
        return {"settings": metadata} if metadata else None

    if metadata:
        data["settings"] = metadata

    return data


@frappe.whitelist()
def build_scale_barcode(
    barcode_template: Optional[str] = None,
    item_code: Optional[str] = None,
    uom: Optional[str] = None,
    qty: Optional[float] = None,
    weight_grams: Optional[float] = None,
    price: Optional[float] = None,
):
    """Build a scale barcode using Scale Barcode Settings."""

    settings = _get_scale_barcode_settings()
    if not settings:
        return None

    metadata = _get_scale_settings_metadata(settings)
    item_start = cint(metadata.get("item_code_starting_digit"))
    item_digits = cint(metadata.get("item_code_total_digits"))
    weight_start = cint(metadata.get("weight_starting_digit"))
    weight_digits = cint(metadata.get("weight_total_digits"))
    weight_decimals = cint(metadata.get("weight_decimals"))

    if not (item_start and item_digits and weight_start and weight_digits):
        frappe.throw("Scale Barcode Settings are incomplete. Please configure item and weight segments.")

    qty_value = None
    if weight_grams is not None and cstr(weight_grams) != "":
        qty_value = flt(weight_grams) / 1000
    elif qty is not None and cstr(qty) != "":
        qty_value = flt(qty)
    else:
        qty_value = 0

    item_code_value = cstr(item_code or "").strip()
    template_value = cstr(barcode_template or "").strip()
    parsed_template = _parse_scale_barcode_data(template_value) if template_value else None
    if not parsed_template:
        lookup_template = _find_item_scale_template(item_code_value, uom=uom)
        if lookup_template:
            template_value = lookup_template
            parsed_template = _parse_scale_barcode_data(template_value)

    required_len = _get_required_barcode_length(metadata)
    if template_value:
        chars = list(template_value)
    else:
        base_len = max(required_len, 12)
        chars = ["0"] * base_len

    if len(chars) < required_len:
        chars.extend(["0"] * (required_len - len(chars)))

    prefix = cstr(metadata.get("prefix") or "").strip()
    prefix_len = cint(metadata.get("no_of_prefix_characters")) or len(prefix)
    if prefix:
        normalized_prefix = (prefix + ("0" * max(prefix_len, 0)))[: max(prefix_len, 0)]
        if normalized_prefix:
            _replace_segment(chars, 0, normalized_prefix)

    item_code_source = cstr((parsed_template or {}).get("item_code") or "").strip()
    if not item_code_source and len(chars) >= (item_start - 1 + item_digits):
        item_code_source = "".join(chars[item_start - 1 : item_start - 1 + item_digits])
    if not item_code_source:
        item_code_source = item_code_value
    if not item_code_source:
        return {
            "barcode": template_value,
            "item_code": item_code_value,
            "qty": qty_value,
            "price": None,
            "settings": metadata,
            "warning": "missing_item_code_segment",
        }

    normalized_item_code = _normalize_numeric_code(item_code_source, item_digits)
    if not normalized_item_code:
        return {
            "barcode": template_value,
            "item_code": item_code_value or item_code_source,
            "qty": qty_value,
            "price": None,
            "settings": metadata,
            "warning": "missing_numeric_item_code",
        }
    _replace_segment(chars, item_start - 1, normalized_item_code)

    if parsed_template and parsed_template.get("qty") is not None and weight_grams is None and qty is None:
        qty_value = flt(parsed_template.get("qty"))

    qty_whole, qty_decimal = _encode_value_segments(qty_value, weight_digits, weight_decimals, "Weight")
    _replace_segment(chars, weight_start - 1, qty_whole + qty_decimal)

    if cint(metadata.get("price_included_in_barcode_or_not")):
        price_start = cint(metadata.get("price_starting_digit"))
        price_digits = cint(metadata.get("price_total_digit"))
        price_decimals = cint(metadata.get("price_decimals"))
        if price_start and price_digits and price is not None and cstr(price) != "":
            price_whole, price_decimal = _encode_value_segments(
                flt(price),
                price_digits,
                price_decimals,
                "Price",
            )
            _replace_segment(chars, price_start - 1, price_whole + price_decimal)

    barcode = "".join(chars)
    if barcode.isdigit():
        if len(barcode) == 12:
            barcode = barcode + _calculate_ean13_check_digit(barcode)
        elif len(barcode) == 13:
            barcode = barcode[:12] + _calculate_ean13_check_digit(barcode[:12])

    parsed_barcode = _parse_scale_barcode_data(barcode)
    result = {
        "barcode": barcode,
        "item_code": (parsed_barcode or {}).get("item_code") or normalized_item_code,
        "qty": (parsed_barcode or {}).get("qty") if parsed_barcode else qty_value,
        "price": (parsed_barcode or {}).get("price") if parsed_barcode else None,
        "settings": metadata,
    }
    return result


@frappe.whitelist()
def get_items_from_barcode(selling_price_list, currency, barcode):
    scale_data = _parse_scale_barcode_data(barcode)
    item_code = None
    scale_qty = None
    scale_price = None

    if scale_data:
        item_code = scale_data.get("item_code")
        scale_qty = scale_data.get("qty")
        scale_price = scale_data.get("price")

    if not item_code:
        search_item = frappe.db.get_value(
            "Item Barcode",
            {"barcode": barcode},
            ["parent as item_code", "posa_uom"],
            as_dict=1,
        )
        if not search_item:
            return None
        item_code = search_item.item_code
        item_uom = search_item.posa_uom
    else:
        item_uom = None

    if not item_code:
        return None

    try:
        # OPTIMIZE: Remove redundant DB query from exists()
        # frappe.get_cached_doc will raise DoesNotExistError if item is missing
        # saving one DB round-trip per scan.
        item_doc = frappe.get_cached_doc("Item", item_code)
    except frappe.DoesNotExistError:
        return None

    if not item_uom:
        item_uom = getattr(item_doc, "stock_uom", None)

    rate = None
    if scale_price is not None:
        rate = flt(scale_price)
    else:
        rate = frappe.db.get_value(
            "Item Price",
            {
                "item_code": item_code,
                "price_list": selling_price_list,
                "currency": currency,
            },
            "price_list_rate",
        )

    return {
        "item_code": item_doc.name,
        "item_name": item_doc.item_name,
        "barcode": barcode,
        "rate": rate or 0,
        "price_list_rate": rate or 0,
        "uom": item_uom or item_doc.stock_uom,
        "currency": currency,
        "scale_qty": scale_qty,
        "scale_price": scale_price,
    }


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
