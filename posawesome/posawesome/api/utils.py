from __future__ import annotations
import frappe

@frappe.whitelist()
def get_active_pos_profile(user=None):
    """Return the active POS profile for the given user."""
    user = user or frappe.session.user

    # 1️⃣ Try to get user-specific POS Profile
    profile = frappe.db.get_value("POS Profile User", {"user": user}, "parent")

    # 2️⃣ If not found, try to get default profile
    if not profile:
        default_profile = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
        if default_profile:
            profile = default_profile

    if not profile:
        frappe.throw("No active POS Profile found for this user.")

    pos_profile = frappe.get_doc("POS Profile", profile).as_dict()

    # 3️⃣ Attach allowed customer groups for POS (important for your issue)
    pos_profile["customer_groups"] = [
        d.customer_group for d in frappe.get_all(
            "POS Customer Group",
            filters={"parent": profile},
            pluck="customer_group"
        )
    ]

    return pos_profile


@frappe.whitelist()
def get_default_warehouse(company=None):
    """Return the default warehouse for the given company."""
    company = company or frappe.defaults.get_default("company")
    if not company:
        return None
    warehouse = frappe.db.get_value("Company", company, "default_warehouse")
    if not warehouse:
        warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
    return warehouse
