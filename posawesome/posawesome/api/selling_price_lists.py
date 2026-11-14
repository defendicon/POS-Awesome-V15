import frappe
from frappe.utils import cint


def get_manual_selling_price_list_filters(profile, configured=None):
    """Return the shared eligibility filters for cashier-selected price lists."""
    filters = {"enabled": 1, "selling": 1}
    if not cint(profile.get("posa_allow_multi_currency")) and profile.get("currency"):
        filters["currency"] = profile.get("currency")
    if configured:
        filters["name"] = ["in", configured]
    return filters


def get_configured_selling_price_lists(profile):
    return list(
        dict.fromkeys(
            row.get("price_list")
            for row in (profile.get("posa_allowed_selling_price_lists") or [])
            if row.get("price_list")
        )
    )


@frappe.whitelist()
def get_pos_selling_price_lists(pos_profile):
    from posawesome.posawesome.api.pos_access import get_authorized_pos_profile

    profile = get_authorized_pos_profile(pos_profile)
    if not cint(profile.get("posa_enable_price_list_dropdown")):
        return []
    configured = get_configured_selling_price_lists(profile)
    filters = get_manual_selling_price_list_filters(profile, configured)
    names = frappe.get_all("Price List", filters=filters, pluck="name", order_by="name asc")
    if not configured:
        return names
    eligible = set(names)
    return [name for name in configured if name in eligible]
