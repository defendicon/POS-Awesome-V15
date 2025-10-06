from __future__ import annotations

from functools import cache

import frappe

# Reusable ORM filter to exclude template items
HAS_VARIANTS_EXCLUSION = {"has_variants": 0}


@frappe.whitelist()
def get_active_pos_profile(user=None):
	"""Return the active POS profile for the given user."""
	user = user or frappe.session.user
	profile = frappe.db.get_value("POS Profile User", {"user": user}, "parent")
	if not profile:
		profile = frappe.db.get_single_value("POS Settings", "pos_profile")
	if not profile:
		return None
	return frappe.get_doc("POS Profile", profile).as_dict()


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


@cache
def get_item_groups(pos_profile: str) -> list[str]:
	"""Return all item groups for a POS profile, including descendants.

	The linked groups from the ``POS Profile Item Group`` child table are
	expanded to include all of their descendants using ERPNext's
	``get_child_groups`` utility. Results are cached to avoid duplicate
	database calls within a process. If the child DocType is missing, an
	empty list is returned instead of raising a database error.
	"""

	if not pos_profile or not frappe.db.exists("DocType", "POS Profile Item Group"):
		return []

	try:
		from erpnext.utilities.doctype.item_group.item_group import get_child_groups
	except Exception:
		get_child_groups = None

	groups = frappe.get_all(
		"POS Profile Item Group",
		filters={"parent": pos_profile},
		pluck="item_group",
	)

	all_groups: set[str] = set()
	for group in groups:
		if not group:
			continue
		if get_child_groups:
			try:
				descendants = get_child_groups(group) or []
			except Exception:
				descendants = []
		else:
			descendants = frappe.db.get_descendants("Item Group", group) or []

		all_groups.add(group)
		all_groups.update(descendants)

	return list(all_groups)
