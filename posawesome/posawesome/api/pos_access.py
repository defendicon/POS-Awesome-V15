from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr

from posawesome.posawesome.api.utils import expand_item_groups, get_active_pos_profile, get_item_groups

POS_PROFILE_MANAGER_ROLES = frozenset(
    {
        "System Manager",
        "Accounts Manager",
        "Sales Manager",
        "Stock Manager",
        "Item Manager",
        "POS Manager",
    }
)
POS_SUPERVISOR_ROLE = "POS Awesome Supervisor"
POS_PRIVILEGED_MANAGER_ROLES = frozenset(
    {
        "System Manager",
        "Accounts Manager",
        "Sales Manager",
        "Stock Manager",
        "POS Manager",
    }
)


def _profile_name(pos_profile: Any) -> str:
    if isinstance(pos_profile, str):
        raw_value = pos_profile.strip()
        if not raw_value:
            return ""
        try:
            decoded_value = json.loads(raw_value)
        except Exception:
            decoded_value = raw_value
        if isinstance(decoded_value, dict):
            return cstr(decoded_value.get("name")).strip()
        return cstr(decoded_value).strip()

    if isinstance(pos_profile, dict):
        return cstr(pos_profile.get("name")).strip()

    if pos_profile is not None and hasattr(pos_profile, "get"):
        return cstr(pos_profile.get("name")).strip()

    return ""


def _permission_denied(message: str):
    frappe.throw(message, frappe.PermissionError)


def get_authenticated_pos_user() -> str:
    user = cstr(getattr(frappe.session, "user", "")).strip()
    if not user or user == "Guest":
        _permission_denied(_("Sign in to access POS data."))
    return user


def get_pos_roles(user: str) -> frozenset[str]:
    """Return canonical roles for a server-resolved user identity."""

    return frozenset(frappe.get_roles(user) or [])


def user_is_pos_profile_manager(user: str) -> bool:
    if user == "Administrator":
        return True
    return bool(get_pos_roles(user).intersection(POS_PROFILE_MANAGER_ROLES))


def user_is_pos_supervisor(user: str) -> bool:
    return POS_SUPERVISOR_ROLE in get_pos_roles(user)


def user_is_pos_privileged_manager(user: str) -> bool:
    if user == "Administrator":
        return True
    return bool(get_pos_roles(user).intersection(POS_PRIVILEGED_MANAGER_ROLES))


def user_can_manage_pos(user: str) -> bool:
    """Return whether a canonical user may perform supervisor-only POS actions."""

    return user_is_pos_privileged_manager(user) or user_is_pos_supervisor(user)


def require_pos_supervisor_or_manager() -> str:
    """Authorize the authenticated session for a supervisor-only POS action."""

    user = get_authenticated_pos_user()
    if not user_can_manage_pos(user):
        _permission_denied(_("A POS supervisor or manager is required for this action."))
    return user


def get_authorized_pos_profile(pos_profile=None, company=None):
    """Return a fresh, canonical POS Profile authorized for the session user."""

    user = get_authenticated_pos_user()
    profile_name = _profile_name(pos_profile)
    if not profile_name:
        active_profile = get_active_pos_profile(user=user)
        profile_name = _profile_name(active_profile)
    if not profile_name:
        frappe.throw(_("No active POS Profile was found for the current user."))
    if not frappe.db.exists("POS Profile", profile_name):
        frappe.throw(_("POS Profile {0} was not found.").format(profile_name))

    profile_doc = frappe.get_doc("POS Profile", profile_name)
    profile_doc.check_permission("read")

    if cint(profile_doc.get("disabled")):
        _permission_denied(_("POS Profile {0} is disabled.").format(profile_name))

    profile_company = cstr(profile_doc.get("company")).strip()
    requested_company = cstr(company).strip()
    if requested_company and requested_company != profile_company:
        _permission_denied(
            _("POS Profile {0} is not available for company {1}.").format(
                profile_name,
                requested_company,
            )
        )

    if profile_company:
        company_doc = frappe.get_doc("Company", profile_company)
        company_doc.check_permission("read")

    if not user_is_pos_profile_manager(user):
        is_assigned = frappe.db.exists(
            "POS Profile User",
            {"parent": profile_name, "user": user},
        )
        if not is_assigned:
            _permission_denied(_("You are not assigned to POS Profile {0}.").format(profile_name))

    return profile_doc


def require_pos_profile_feature(profile_doc, fieldnames, feature_label: str):
    """Require a server-loaded POS Profile to enable a protected feature."""

    if isinstance(fieldnames, str):
        fieldnames = (fieldnames,)

    if not any(cint(profile_doc.get(fieldname)) for fieldname in fieldnames):
        _permission_denied(
            _("{0} is disabled for POS Profile {1}.").format(
                feature_label,
                cstr(profile_doc.get("name")).strip(),
            )
        )
    return profile_doc


def assert_document_in_pos_profile(doc, profile_doc):
    """Keep an existing POS document inside its canonical company/profile boundary."""

    doc.check_permission("read")
    profile_name = cstr(profile_doc.get("name")).strip()
    profile_company = cstr(profile_doc.get("company")).strip()
    document_company = cstr(doc.get("company")).strip()
    document_profile = cstr(doc.get("pos_profile")).strip()

    if document_company and document_company != profile_company:
        _permission_denied(_("This document is not available for POS Profile {0}.").format(profile_name))
    if document_profile and document_profile != profile_name:
        _permission_denied(_("This document is not available for POS Profile {0}.").format(profile_name))
    return doc


def get_authorized_pos_item(item_code, profile_doc):
    """Return an Item the caller may read and the POS Profile may sell."""

    item_code = cstr(item_code).strip()
    if not item_code:
        frappe.throw(_("Item Code is required."))

    item_doc = frappe.get_doc("Item", item_code)
    item_doc.check_permission("read")

    if (
        cint(item_doc.get("disabled"))
        or not cint(item_doc.get("is_sales_item"))
        or cint(item_doc.get("is_fixed_asset"))
    ):
        _permission_denied(_("Item {0} is not available in this POS Profile.").format(item_code))

    profile_name = cstr(profile_doc.get("name")).strip()
    allowed_groups = expand_item_groups(get_item_groups(profile_name) or [])
    if allowed_groups and item_doc.get("item_group") not in allowed_groups:
        _permission_denied(_("Item {0} is not available in this POS Profile.").format(item_code))

    if not cint(profile_doc.get("posa_show_template_items")) and cint(item_doc.get("has_variants")):
        _permission_denied(_("Item {0} is not available in this POS Profile.").format(item_code))

    if cint(profile_doc.get("posa_hide_variants_items")) and item_doc.get("variant_of"):
        _permission_denied(_("Item {0} is not available in this POS Profile.").format(item_code))

    return item_doc


def assert_doctype_read_permission(doctype: str):
    user = get_authenticated_pos_user()
    if not frappe.has_permission(doctype, "read", user=user):
        _permission_denied(_("You are not permitted to read {0}.").format(doctype))
