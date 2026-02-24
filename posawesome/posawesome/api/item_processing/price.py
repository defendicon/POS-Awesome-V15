import frappe
from frappe import _
from frappe.utils import flt
from posawesome.posawesome.api.item_processing.stock import _assert_stock_lookup_access

@frappe.whitelist()
def update_price_list_rate(item_code, price_list, rate, uom=None, pos_profile=None):
    """Create or update Item Price for the given item and price list."""
    if not item_code or not price_list:
        frappe.throw(_("Item Code and Price List are required"))

    _assert_price_update_allowed(pos_profile)

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
    _assert_stock_lookup_access()
    if not (item_code and price_list and uom):
        return None

    price = frappe.db.get_value(
        "Item Price",
        {
            "item_code": item_code,
            "price_list": price_list,
            "uom": uom,
        },
        "price_list_rate",
    )
    return price


def _assert_price_update_allowed(pos_profile):
    if "System Manager" in frappe.get_roles() or frappe.has_permission("Item Price", "write"):
        return

    profile_name = _extract_profile_name(pos_profile)
    if not profile_name:
        frappe.throw(_("Not permitted to update item prices."))

    profile_doc = frappe.get_doc("POS Profile", profile_name)
    if profile_doc.disabled:
        frappe.throw(_("POS Profile {0} is disabled.").format(profile_doc.name))

    has_access = frappe.db.exists(
        "POS Profile User",
        {"parent": profile_doc.name, "user": frappe.session.user},
    )
    has_explicit_assignments = frappe.db.exists("POS Profile User", {"parent": profile_doc.name})
    if has_explicit_assignments and not has_access:
        frappe.throw(_("You are not assigned to POS Profile {0}.").format(profile_doc.name))

    if not profile_doc.get("posa_allow_price_list_rate_change"):
        frappe.throw(_("Price list rate updates are disabled for POS Profile {0}.").format(profile_doc.name))


def _extract_profile_name(pos_profile):
    if isinstance(pos_profile, dict):
        return frappe.as_unicode(
            pos_profile.get("name")
            or pos_profile.get("pos_profile")
            or pos_profile.get("profile")
            or ""
        ).strip()

    if isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if not raw_value:
            return ""
        try:
            decoded = frappe.parse_json(raw_value)
        except Exception:
            decoded = raw_value
        if isinstance(decoded, dict):
            return _extract_profile_name(decoded)
        return frappe.as_unicode(decoded or "").strip()

    return ""
