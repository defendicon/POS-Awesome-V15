import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

from posawesome.posawesome.api.item_processing.barcode import _parse_scale_barcode_data
from posawesome.posawesome.api.pos_access import (
    get_authorized_pos_item,
    get_authorized_pos_profile,
    require_pos_profile_feature,
)


def _get_allowed_price_lists(profile, customer=None):
    allowed = {cstr(profile.get("selling_price_list")).strip()}
    customer = cstr(customer).strip()
    if customer:
        from posawesome.posawesome.api.customers import get_customer_groups

        customer_doc = frappe.get_doc("Customer", customer)
        customer_doc.check_permission("read")
        if cint(customer_doc.get("disabled")):
            frappe.throw(_("Customer {0} is disabled.").format(customer), frappe.PermissionError)

        allowed_groups = get_customer_groups(profile)
        if allowed_groups and customer_doc.get("customer_group") not in allowed_groups:
            frappe.throw(
                _("Customer {0} is not available in this POS Profile.").format(customer),
                frappe.PermissionError,
            )

        allowed.add(cstr(customer_doc.get("default_price_list")).strip())
        if customer_doc.get("customer_group"):
            allowed.add(
                cstr(
                    frappe.db.get_value(
                        "Customer Group",
                        customer_doc.get("customer_group"),
                        "default_price_list",
                    )
                ).strip()
            )
    allowed.discard("")
    return allowed


@frappe.whitelist()
def update_price_list_rate(item_code, price_list, rate, uom=None, pos_profile=None, customer=None):
    """Create or update Item Price for the given item and price list."""
    item_code = cstr(item_code).strip()
    price_list = cstr(price_list).strip()
    uom = cstr(uom).strip() or None
    if not item_code or not price_list:
        frappe.throw(_("Item Code and Price List are required"))

    profile = get_authorized_pos_profile(pos_profile)
    require_pos_profile_feature(
        profile,
        "posa_allow_price_list_rate_change",
        "Price List rate changes",
    )
    item_doc = get_authorized_pos_item(item_code, profile)

    valid_uoms = {cstr(item_doc.get("stock_uom")).strip()}
    valid_uoms.update(
        cstr(row.get("uom")).strip()
        for row in (item_doc.get("uoms") or [])
        if hasattr(row, "get") and row.get("uom")
    )
    valid_uoms.discard("")
    if uom and uom not in valid_uoms:
        frappe.throw(_("UOM {0} is not configured for Item {1}.").format(uom, item_code))

    allowed_price_lists = _get_allowed_price_lists(profile, customer=customer)
    if price_list not in allowed_price_lists:
        frappe.throw(
            _("Price List {0} is not available in this POS Profile.").format(price_list),
            frappe.PermissionError,
        )
    if not cint(frappe.db.get_value("Price List", price_list, "enabled")) or not cint(
        frappe.db.get_value("Price List", price_list, "selling")
    ):
        frappe.throw(_("Price List {0} is not an enabled selling Price List.").format(price_list))

    rate = flt(rate)
    if rate < 0:
        frappe.throw(_("Price List rate cannot be negative."))
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

    return _("Item Price has been added or updated")


@frappe.whitelist()
def get_price_for_uom(item_code, price_list, uom):
    """Return Item Price for the given item, price list and UOM.

    Tries the exact UOM first; falls back to a price without a UOM if not found.
    """
    if not (item_code and price_list):
        return None

    filters = {"item_code": item_code, "price_list": price_list}

    if uom:
        filters["uom"] = uom
        price = frappe.db.get_value("Item Price", filters, "price_list_rate")
        if price is not None:
            return price

    filters.pop("uom", None)
    filters["uom"] = ["in", ["", None]]
    return frappe.db.get_value("Item Price", filters, "price_list_rate")
