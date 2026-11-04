import json

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, nowdate

LOCKED_FIELD = "retailmind_locked_for_sale"
NON_DISCOUNTABLE_FIELD = "retailmind_non_discountable"
CONTROLLED_FIELD = "retailmind_controlled_item"
SHORT_NAME_FIELD = "retailmind_short_name"
PHARMACY_SEARCH_FIELDS = (
    "retailmind_old_pos_pack",
    "retailmind_old_pos_company_code",
    "retailmind_old_pos_generic_code",
    "retailmind_old_pos_generic_name",
    "retailmind_old_pos_rack",
    "retailmind_units_per_pack",
)
LOSS_EPSILON = 0.0001
SALE_FLOOR_POLICY_FIELDS = (
    "posa_enable_below_cost_guard",
    "posa_below_cost_action",
    "posa_minimum_margin_percentage",
    "posa_missing_cost_action",
)
SALE_FLOOR_ACTIONS = {"Block", "POS Supervisor Override", "Warning Only"}
MISSING_COST_ACTIONS = {"Allow", "Block"}


def item_control_fields():
    return [
        LOCKED_FIELD,
        NON_DISCOUNTABLE_FIELD,
        CONTROLLED_FIELD,
        SHORT_NAME_FIELD,
    ]


def item_has_field(fieldname):
    try:
        return bool(frappe.get_meta("Item").has_field(fieldname))
    except Exception:
        return False


def installed_item_control_fields():
    return [field for field in item_control_fields() if item_has_field(field)]


def installed_item_search_fields():
    return [
        field
        for field in [*item_control_fields(), *PHARMACY_SEARCH_FIELDS]
        if item_has_field(field)
    ]


def get_item_control_flags(item_codes):
    codes = sorted({str(code).strip() for code in item_codes or [] if code})
    if not codes:
        return {}

    fields = ["item_code", "item_name", *installed_item_control_fields()]
    rows = frappe.get_all(
        "Item",
        filters={"item_code": ["in", codes]},
        fields=fields,
        limit_page_length=len(codes),
    )
    return {row.get("item_code"): row for row in rows if row.get("item_code")}


def collect_item_sale_control_errors(items, is_return=False):
    if is_return:
        return []

    item_rows = list(items or [])
    flags_by_code = get_item_control_flags(
        [row.get("item_code") if hasattr(row, "get") else None for row in item_rows]
    )
    errors = []

    for row in item_rows:
        item_code = row.get("item_code") if hasattr(row, "get") else None
        if not item_code:
            continue

        flags = flags_by_code.get(item_code) or {}
        item_name = row.get("item_name") or flags.get("item_name") or item_code

        if flags.get(LOCKED_FIELD):
            errors.append(
                {
                    "item_code": item_code,
                    "item_name": item_name,
                    "policy": "block",
                    "reason": "locked_for_sale",
                    "message": _("Item {0} is locked for sale.").format(item_name),
                }
            )
            continue

        if flags.get(NON_DISCOUNTABLE_FIELD) and (
            abs(flt(row.get("discount_percentage"))) > 0.0001
            or abs(flt(row.get("discount_amount"))) > 0.0001
        ):
            errors.append(
                {
                    "item_code": item_code,
                    "item_name": item_name,
                    "policy": "block",
                    "reason": "non_discountable",
                    "message": _("Item {0} does not allow POS discounts.").format(item_name),
                }
            )

    return errors


def _resolve_buying_price_list(pos_profile=None):
    if pos_profile and frappe.get_meta("POS Profile").has_field("buying_price_list"):
        profile_buying = frappe.db.get_value("POS Profile", pos_profile, "buying_price_list")
        if profile_buying:
            return profile_buying
    return (
        frappe.db.get_single_value("Buying Settings", "buying_price_list")
        or frappe.db.get_value("Price List", {"buying": 1}, "name")
        or ("Standard Buying" if frappe.db.exists("Price List", "Standard Buying") else None)
    )


def _get_buying_price_rows(item_codes, pos_profile=None):
    codes = sorted({str(code).strip() for code in item_codes or [] if code})
    if not codes:
        return None, []

    price_list = _resolve_buying_price_list(pos_profile)
    if not price_list:
        return None, []

    rows = frappe.get_all(
        "Item Price",
        filters={
            "price_list": price_list,
            "item_code": ["in", codes],
            "buying": 1,
        },
        fields=[
            "name",
            "item_code",
            "price_list",
            "price_list_rate",
            "currency",
            "uom",
            "customer",
            "supplier",
            "valid_from",
            "valid_upto",
            "modified",
        ],
        order_by="valid_from desc, modified desc",
        limit_page_length=0,
    )
    return price_list, list(rows or [])


def resolve_sale_floor_policy(pos_profile=None):
    """Return POS Profile policy with defaults that preserve the existing hard block."""

    values = {}
    if pos_profile:
        meta = frappe.get_meta("POS Profile")
        installed_fields = [field for field in SALE_FLOOR_POLICY_FIELDS if meta.has_field(field)]
        if installed_fields:
            values = frappe.db.get_value(
                "POS Profile",
                pos_profile,
                installed_fields,
                as_dict=True,
            ) or {}

    enabled_value = values.get("posa_enable_below_cost_guard")
    enabled = True if enabled_value in (None, "") else bool(cint(enabled_value))
    action = cstr(values.get("posa_below_cost_action") or "Block").strip()
    if action not in SALE_FLOOR_ACTIONS:
        action = "Block"
    missing_cost_action = cstr(values.get("posa_missing_cost_action") or "Allow").strip()
    if missing_cost_action not in MISSING_COST_ACTIONS:
        missing_cost_action = "Allow"
    return {
        "enabled": enabled,
        "action": action,
        "minimum_margin_percentage": max(
            flt(values.get("posa_minimum_margin_percentage")), 0
        ),
        "missing_cost_action": missing_cost_action,
    }
def _is_price_row_valid(row, posting_date):
    """Return whether an Item Price is general-purpose and active on the invoice date."""

    if row.get("customer") or row.get("supplier"):
        return False
    date_text = str(posting_date or nowdate())[:10]
    valid_from = str(row.get("valid_from") or "")[:10]
    valid_upto = str(row.get("valid_upto") or "")[:10]
    return (not valid_from or valid_from <= date_text) and (
        not valid_upto or valid_upto >= date_text
    )


def _get_item_uom_context(item_rows):
    """Load authoritative stock UOMs and conversion factors for invoice items."""

    codes = sorted(
        {
            str(row.get("item_code")).strip()
            for row in item_rows
            if hasattr(row, "get") and row.get("item_code")
        }
    )
    if not codes:
        return {}, {}

    item_meta = frappe.get_all(
        "Item",
        filters={"item_code": ["in", codes]},
        fields=["item_code", "stock_uom"],
        limit_page_length=len(codes),
    )
    stock_uoms = {
        row.get("item_code"): row.get("stock_uom")
        for row in item_meta or []
        if row.get("item_code")
    }
    conversions = frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": ["in", codes], "parenttype": "Item"},
        fields=["parent", "uom", "conversion_factor"],
        limit_page_length=0,
    )
    conversion_factors = {
        (row.get("parent"), row.get("uom")): flt(row.get("conversion_factor"))
        for row in conversions or []
        if row.get("parent") and row.get("uom") and flt(row.get("conversion_factor")) > 0
    }
    for item_code, stock_uom in stock_uoms.items():
        if stock_uom:
            conversion_factors[(item_code, stock_uom)] = 1.0
    return stock_uoms, conversion_factors


def _convert_floor_to_invoice_currency(
    rate,
    source_currency,
    invoice_currency,
    company,
    posting_date,
    invoice_conversion_rate=None,
):
    """Normalize a buying-list rate into the invoice currency via company currency."""

    rate = flt(rate)
    if rate <= 0 or not source_currency or not invoice_currency:
        return rate
    if source_currency == invoice_currency:
        return rate

    company_currency = (
        frappe.db.get_value("Company", company, "default_currency") if company else None
    )
    if not company_currency:
        frappe.throw(
            _("Cannot validate the buying floor because the company currency is missing.")
        )

    from erpnext.setup.utils import get_exchange_rate

    source_to_company = (
        1
        if source_currency == company_currency
        else flt(get_exchange_rate(source_currency, company_currency, posting_date))
    )
    invoice_to_company = (
        1
        if invoice_currency == company_currency
        else flt(invoice_conversion_rate)
        or flt(get_exchange_rate(invoice_currency, company_currency, posting_date))
    )
    if source_to_company <= 0 or invoice_to_company <= 0:
        frappe.throw(
            _(
                "Cannot validate the buying floor because the exchange rate between {0} and {1} is missing."
            ).format(source_currency, invoice_currency)
        )
    return rate * source_to_company / invoice_to_company


def resolve_buying_floors(items, pos_profile=None, invoice_doc=None):
    """Resolve authoritative per-line buying floors from Item Price master data.

    Client-provided ``trade_price``/``buying_rate`` values are intentionally ignored.
    Exact-UOM prices win; otherwise a stock-UOM/general price is converted using the
    Item master conversion factor. All returned rates use the invoice currency.
    """

    item_rows = list(items or [])
    price_list, price_rows = _get_buying_price_rows(
        [row.get("item_code") for row in item_rows if hasattr(row, "get")],
        pos_profile=pos_profile,
    )
    if not price_list or not price_rows:
        return {}

    posting_date = (
        invoice_doc.get("posting_date") if invoice_doc and hasattr(invoice_doc, "get") else None
    ) or nowdate()
    invoice_currency = (
        invoice_doc.get("currency") if invoice_doc and hasattr(invoice_doc, "get") else None
    )
    company = invoice_doc.get("company") if invoice_doc and hasattr(invoice_doc, "get") else None
    invoice_conversion_rate = (
        invoice_doc.get("conversion_rate")
        if invoice_doc and hasattr(invoice_doc, "get")
        else None
    )
    price_list_currency = frappe.db.get_value("Price List", price_list, "currency")
    stock_uoms, conversion_factors = _get_item_uom_context(item_rows)

    rows_by_item = {}
    for price_row in price_rows:
        if flt(price_row.get("price_list_rate")) <= 0 or not _is_price_row_valid(
            price_row, posting_date
        ):
            continue
        if price_list_currency and price_row.get("currency") not in (None, "", price_list_currency):
            continue
        rows_by_item.setdefault(price_row.get("item_code"), []).append(price_row)

    floors = {}
    for index, row in enumerate(item_rows):
        item_code = row.get("item_code") if hasattr(row, "get") else None
        if not item_code:
            continue
        selected_uom = row.get("uom") or stock_uoms.get(item_code)
        stock_uom = stock_uoms.get(item_code) or row.get("stock_uom") or selected_uom
        factor = conversion_factors.get((item_code, selected_uom))
        if factor is None and selected_uom == stock_uom:
            factor = 1.0

        candidates = rows_by_item.get(item_code, [])
        exact = next((candidate for candidate in candidates if candidate.get("uom") == selected_uom), None)
        base = next(
            (
                candidate
                for candidate in candidates
                if candidate.get("uom") in (stock_uom, None, "")
            ),
            None,
        )
        selected_price = exact or base
        if not selected_price or (not exact and not factor):
            continue

        floor = flt(selected_price.get("price_list_rate"))
        if not exact:
            floor *= factor
        source_currency = selected_price.get("currency") or price_list_currency or invoice_currency
        normalized_floor = _convert_floor_to_invoice_currency(
            floor,
            source_currency,
            invoice_currency or source_currency,
            company,
            posting_date,
            invoice_conversion_rate=invoice_conversion_rate,
        )
        if normalized_floor is None or normalized_floor <= 0:
            continue
        floors[index] = {
            "rate": normalized_floor,
            "source_rate": flt(selected_price.get("price_list_rate")),
            "source_currency": source_currency,
            "invoice_currency": invoice_currency or source_currency,
            "uom": selected_uom,
            "price_list": price_list,
            "item_price": selected_price.get("name"),
        }
    return floors


def collect_below_buying_price_errors(
    items, is_return=False, pos_profile=None, invoice_doc=None, policy=None
):
    if is_return:
        return []

    item_rows = list(items or [])
    policy = policy or resolve_sale_floor_policy(pos_profile)
    if not policy.get("enabled"):
        return []
    buying_floors = resolve_buying_floors(
        item_rows,
        pos_profile=pos_profile,
        invoice_doc=invoice_doc,
    )
    errors = []
    invoice_discount_percentage = (
        max(flt(invoice_doc.get("additional_discount_percentage")), 0)
        if invoice_doc and hasattr(invoice_doc, "get")
        else 0
    )
    invoice_discount_amount = (
        max(flt(invoice_doc.get("discount_amount")), 0)
        if invoice_doc and hasattr(invoice_doc, "get")
        else 0
    )
    eligible_row_total = sum(
        abs(flt(item.get("rate")) * flt(item.get("qty")))
        for item in item_rows
        if hasattr(item, "get")
        and not item.get("is_return")
        and not item.get("posa_is_replace")
        and flt(item.get("qty")) > 0
    )

    for index, row in enumerate(item_rows):
        item_code = row.get("item_code") if hasattr(row, "get") else None
        if not item_code:
            continue
        if row.get("posa_is_replace") or flt(row.get("qty")) < 0:
            continue

        floor_info = buying_floors.get(index) or {}
        floor = flt(floor_info.get("rate"))
        if floor <= 0:
            if policy.get("missing_cost_action") == "Block":
                item_name = row.get("item_name") or item_code
                errors.append(
                    {
                        "item_code": item_code,
                        "item_name": item_name,
                        "policy": "block",
                        "reason": "missing_buying_price",
                        "message": _(
                            "Item {0} cannot be sold because no valid buying floor is available."
                        ).format(item_name),
                    }
                )
            continue

        minimum_margin = flt(policy.get("minimum_margin_percentage"))
        minimum_selling_rate = floor * (1 + minimum_margin / 100)

        selling_rate = abs(flt(row.get("rate")))
        if invoice_discount_percentage > 0:
            selling_rate *= max(1 - invoice_discount_percentage / 100, 0)
        elif invoice_discount_amount > 0 and eligible_row_total > 0:
            selling_rate *= max(1 - invoice_discount_amount / eligible_row_total, 0)
        if selling_rate + LOSS_EPSILON >= minimum_selling_rate:
            continue

        item_name = row.get("item_name") or item_code
        errors.append(
            {
                "item_code": item_code,
                "item_name": item_name,
                "policy": policy.get("action", "Block").lower().replace(" ", "_"),
                "reason": "below_buying_price",
                "selling_rate": selling_rate,
                "buying_rate": floor,
                "minimum_selling_rate": minimum_selling_rate,
                "minimum_margin_percentage": minimum_margin,
                "buying_price_list": floor_info.get("price_list"),
                "buying_price_uom": floor_info.get("uom"),
                "buying_price_currency": floor_info.get("invoice_currency"),
                "message": _(
                    "Item {0} cannot be sold at {1}; the minimum permitted rate is {2}."
                ).format(item_name, selling_rate, minimum_selling_rate),
            }
        )

    return errors


def _set_invoice_value(invoice_doc, fieldname, value):
    meta = getattr(invoice_doc, "meta", None)
    if meta is not None and hasattr(meta, "has_field") and not meta.has_field(fieldname):
        return
    if hasattr(invoice_doc, "set"):
        invoice_doc.set(fieldname, value)
    elif isinstance(invoice_doc, dict):
        invoice_doc[fieldname] = value
    else:
        setattr(invoice_doc, fieldname, value)


def _authorize_below_cost_override(pos_profile):
    """Authorize the server-resolved session user or active terminal cashier."""

    from posawesome.posawesome.api.employees import _get_user_doc, _is_pos_supervisor
    from posawesome.posawesome.api.pos_access import get_authenticated_pos_user
    from posawesome.posawesome.api.terminal_state import get_active_terminal_cashier

    session_user = get_authenticated_pos_user()
    if _is_pos_supervisor(_get_user_doc(session_user)):
        return session_user

    cashier = get_active_terminal_cashier(pos_profile)
    if _is_pos_supervisor(_get_user_doc(cashier)):
        return cashier
    frappe.throw(
        _("A POS supervisor is required to override a below-cost sale."),
        frappe.PermissionError,
    )


def _apply_below_cost_override(invoice_doc, errors):
    reason = cstr(invoice_doc.get("posa_below_cost_override_reason")).strip()
    if not reason:
        frappe.throw(_("A reason is required to override a below-cost sale."))
    actor = _authorize_below_cost_override(invoice_doc.get("pos_profile"))
    details = [
        {
            "item_code": error.get("item_code"),
            "selling_rate": error.get("selling_rate"),
            "buying_rate": error.get("buying_rate"),
            "minimum_selling_rate": error.get("minimum_selling_rate"),
            "minimum_margin_percentage": error.get("minimum_margin_percentage"),
            "uom": error.get("buying_price_uom"),
            "currency": error.get("buying_price_currency"),
        }
        for error in errors
    ]
    _set_invoice_value(invoice_doc, "posa_below_cost_override", 1)
    _set_invoice_value(invoice_doc, "posa_below_cost_override_by", actor)
    _set_invoice_value(
        invoice_doc,
        "posa_below_cost_override_details",
        json.dumps(details, separators=(",", ":"), sort_keys=True),
    )


def validate_invoice_item_sale_controls(invoice_doc, *, require_override=True):
    """Validate sale controls, deferring only pending approval for draft hooks.

    Submission APIs use the strict default even while preparing a draft. Document
    hooks may defer approval until submit so PAY can open the payment dialog.
    """
    flags = getattr(invoice_doc, "flags", None)
    if flags is not None and getattr(flags, "posa_item_sale_controls_validated", False):
        return

    errors = collect_item_sale_control_errors(
        invoice_doc.get("items") or [],
        is_return=bool(invoice_doc.get("is_return")),
    )
    policy = resolve_sale_floor_policy(invoice_doc.get("pos_profile"))
    floor_errors = collect_below_buying_price_errors(
        invoice_doc.get("items") or [],
        is_return=bool(invoice_doc.get("is_return")),
        pos_profile=invoice_doc.get("pos_profile"),
        invoice_doc=invoice_doc,
        policy=policy,
    )
    missing_cost_errors = [
        error for error in floor_errors if error.get("reason") == "missing_buying_price"
    ]
    below_cost_errors = [
        error for error in floor_errors if error.get("reason") != "missing_buying_price"
    ]
    if not below_cost_errors or policy.get("action") != "POS Supervisor Override":
        _set_invoice_value(invoice_doc, "posa_below_cost_override", 0)
        _set_invoice_value(invoice_doc, "posa_below_cost_override_by", None)
        _set_invoice_value(invoice_doc, "posa_below_cost_override_details", None)
        if not floor_errors:
            _set_invoice_value(invoice_doc, "posa_below_cost_override_reason", None)
    if below_cost_errors and policy.get("action") == "Warning Only":
        floor_errors = missing_cost_errors
    elif below_cost_errors and policy.get("action") == "POS Supervisor Override":
        if cint(invoice_doc.get("posa_below_cost_override")):
            _apply_below_cost_override(invoice_doc, below_cost_errors)
            floor_errors = missing_cost_errors
        elif not require_override:
            # A pending draft is not an approval; never retain client audit claims.
            _set_invoice_value(invoice_doc, "posa_below_cost_override_by", None)
            _set_invoice_value(invoice_doc, "posa_below_cost_override_details", None)
            floor_errors = missing_cost_errors
        else:
            below_cost_errors[0]["message"] = _(
                "This sale is below the permitted floor and requires a POS supervisor override."
            )
    errors.extend(floor_errors)
    if errors:
        frappe.throw(errors[0].get("message"))

    # A deferred draft check must not suppress strict validation on the same
    # document when it is subsequently submitted (including direct doc.submit()).
    if flags is not None and require_override:
        flags.posa_item_sale_controls_validated = True


def validate_pos_invoice_item_sale_controls(invoice_doc):
    """Apply POS sale controls from document hooks without affecting non-POS invoices."""
    doctype = getattr(invoice_doc, "doctype", None) or invoice_doc.get("doctype")
    is_pos_document = (
        doctype == "POS Invoice"
        or bool(invoice_doc.get("is_pos"))
        or bool(invoice_doc.get("pos_profile"))
    )
    if not is_pos_document:
        return

    validate_invoice_item_sale_controls(
        invoice_doc, require_override=cint(invoice_doc.get("docstatus")) != 0
    )
