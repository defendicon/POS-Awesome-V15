from __future__ import annotations

import json
import logging
import time
from functools import cache

import frappe

# Reusable ORM filter to exclude template items
HAS_VARIANTS_EXCLUSION = {"has_variants": 0}


logger = logging.getLogger(__name__)


def expand_item_groups(item_groups):
    """Expand any parent item groups to include their children.

    This function takes a list of item groups and expands any parent groups
    to include all their descendants, while keeping leaf groups as-is.
    """
    if not item_groups:
        return item_groups

    try:
        from erpnext.utilities.doctype.item_group.item_group import get_child_groups
    except Exception:
        get_child_groups = None

    expanded_groups = set()
    for group in item_groups:
        if not group:
            continue

        # Check if this is a parent group
        is_group = frappe.db.get_value("Item Group", group, "is_group")

        if is_group:
            # If it's a parent group, get all its children
            if get_child_groups:
                try:
                    descendants = get_child_groups(group) or []
                    expanded_groups.update(descendants)
                except Exception:
                    # Fallback to database method
                    descendants = frappe.db.get_descendants("Item Group", group) or []
                    expanded_groups.update(descendants)
            else:
                descendants = frappe.db.get_descendants("Item Group", group) or []
                expanded_groups.update(descendants)
        else:
            # If it's a leaf group, add it directly
            expanded_groups.add(group)

    return list(expanded_groups)


def _ensure_pos_profile(pos_profile):
    """Return a ``(profile_dict, profile_json)`` tuple for the given input.

    The POS profile parameter can arrive as a JSON string, a python ``dict``,
    a bare profile name or even ``None`` (when the frontend has not yet loaded
    the active profile). This helper normalises those inputs so downstream code
    can rely on a fully populated dictionary and a JSON serialised
    representation of the same profile. If no valid profile can be resolved a
    user-facing validation error is raised.
    """
    from frappe import _
    from frappe import as_json

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


def fetch_sales_person_names():
    """Return the list of enabled sales persons allowed for the active POS profile."""

    logger.info("Fetching sales persons...")

    try:
        profile = get_active_pos_profile()
        allowed = []
        if profile:
            allowed = [
                d.get("sales_person") for d in profile.get("posa_sales_persons", []) if d.get("sales_person")
            ]

        filters = {"enabled": 1}
        if allowed:
            filters["name"] = ["in", allowed]

        sales_persons = frappe.get_list(
            "Sales Person",
            filters=filters,
            fields=["name", "sales_person_name"],
            limit_page_length=100000,
        )

        logger.info(
            "Found %s sales persons: %s",
            len(sales_persons),
            json.dumps(sales_persons),
        )

        return sales_persons
    except Exception as exc:
        logger.exception("Error fetching sales persons")
        frappe.log_error(
            f"Error fetching sales persons: {exc}",
            "POS Sales Person Error",
        )
        return []


def is_perf_logging_enabled() -> bool:
    """Return True when lightweight POS performance logging is enabled."""

    return bool(frappe.conf.get("posa_perf_log_enabled"))


def log_perf_event(event: str, started_at: float, **context):
    """Emit a structured performance log line when enabled."""

    if not is_perf_logging_enabled():
        return

    elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
    context_parts = [f"{key}={context[key]}" for key in sorted(context.keys())]
    context_str = " ".join(context_parts)
    logger.info("[POSA_PERF] event=%s elapsed_ms=%s %s", event, elapsed_ms, context_str)


@cache
def get_item_groups(pos_profile: str) -> list[str]:
    """Return all item groups for a POS profile, including descendants.

    The linked groups from the ``POS Item Group`` child table are
    expanded to include all of their descendants. Results are cached
    to avoid duplicate database calls within a process.


    """
    if not pos_profile or not frappe.db.exists("DocType", "POS Item Group"):
        return []

    groups = frappe.get_all(
        "POS Item Group",
        filters={"parent": pos_profile},
        pluck="item_group",
    )

    return expand_item_groups(groups)
