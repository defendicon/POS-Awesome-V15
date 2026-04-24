from __future__ import annotations

import frappe
from frappe import _


def _resolve_profile_name(pos_profile=None) -> str:
	if isinstance(pos_profile, dict):
		return str(pos_profile.get("name") or "").strip()

	if isinstance(pos_profile, str):
		return pos_profile.strip()

	return ""


def _get_terminal_users(profile_name: str) -> list[str]:
	rows = frappe.get_all(
		"POS Profile User",
		filters={"parent": profile_name},
		fields=["user"],
		order_by="idx asc, creation asc",
		ignore_permissions=True,
	)
	return [row.get("user") for row in rows if row.get("user")]


def _ensure_terminal_user(profile_name: str, user: str):
	terminal_users = _get_terminal_users(profile_name)
	if user not in terminal_users:
		frappe.throw(_("Selected cashier is not assigned to this POS profile."))
	return terminal_users


def _get_user_doc(user: str):
	user_doc = frappe.get_doc("User", user)
	if not int(getattr(user_doc, "enabled", 1) or 0):
		frappe.throw(_("Selected cashier is disabled."))
	return user_doc


def _get_user_pin(user_doc) -> str:
	try:
		return str(user_doc.get_password("posa_pos_pin") or "").strip()
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			f"POS Awesome: failed to read cashier PIN for user {getattr(user_doc, 'name', '')}",
		)
		return ""


def _is_pos_supervisor(user_doc) -> bool:
	return bool(getattr(user_doc, "posa_is_pos_supervisor", 0))


def _validate_new_pin(new_pin: str) -> str:
	pin = str(new_pin or "").strip()
	if not pin:
		frappe.throw(_("Enter a new PIN."))
	if not pin.isdigit():
		frappe.throw(_("PIN must contain digits only."))
	if len(pin) < 4 or len(pin) > 8:
		frappe.throw(_("PIN must be between 4 and 8 digits."))
	return pin


@frappe.whitelist()
def get_terminal_employees(pos_profile=None):
	profile_name = _resolve_profile_name(pos_profile)
	if not profile_name:
		frappe.throw(_("POS profile is required to load terminal employees."))

	users = _get_terminal_users(profile_name)
	if not users:
		return []

	user_rows = frappe.get_all(
		"User",
		filters={"name": ["in", users], "enabled": 1},
		fields=["name", "full_name", "enabled", "posa_is_pos_supervisor"],
		order_by="full_name asc, name asc",
		ignore_permissions=True,
	)
	user_map = {row.get("name"): row for row in user_rows}
	current_user = frappe.session.user

	employees = []
	for user in users:
		row = user_map.get(user)
		if not row:
			continue
		employees.append(
			{
				"user": row.get("name"),
				"full_name": row.get("full_name") or row.get("name"),
				"enabled": row.get("enabled", 1),
				"is_current": row.get("name") == current_user,
				"is_supervisor": bool(row.get("posa_is_pos_supervisor")),
			}
		)

	return employees


@frappe.whitelist()
def verify_terminal_employee_pin(pos_profile=None, user=None, pin=None):
	profile_name = _resolve_profile_name(pos_profile)
	if not profile_name:
		frappe.throw(_("POS profile is required to verify cashier access."))

	user = str(user or "").strip()
	pin = str(pin or "").strip()
	if not user or not pin:
		frappe.throw(_("Cashier and PIN are required."))

	_ensure_terminal_user(profile_name, user)
	user_doc = _get_user_doc(user)
	stored_pin = _get_user_pin(user_doc)

	if not stored_pin or stored_pin != pin:
		frappe.throw(_("Invalid cashier PIN."))

	return {
		"user": user_doc.name,
		"full_name": user_doc.full_name or user_doc.name,
		"enabled": user_doc.enabled,
		"is_supervisor": _is_pos_supervisor(user_doc),
	}


@frappe.whitelist()
def get_cashier_pin_status(pos_profile=None, user=None):
	profile_name = _resolve_profile_name(pos_profile)
	if not profile_name:
		frappe.throw(_("POS profile is required to manage cashier PIN."))

	user = str(user or "").strip()
	if not user:
		frappe.throw(_("Cashier is required."))

	_ensure_terminal_user(profile_name, user)
	user_doc = _get_user_doc(user)
	existing_pin = _get_user_pin(user_doc)

	return {
		"user": user_doc.name,
		"full_name": user_doc.full_name or user_doc.name,
		"has_pin": bool(existing_pin),
		"is_supervisor": _is_pos_supervisor(user_doc),
	}


@frappe.whitelist()
def save_cashier_pin(pos_profile=None, user=None, new_pin=None, current_pin=None):
	profile_name = _resolve_profile_name(pos_profile)
	if not profile_name:
		frappe.throw(_("POS profile is required to save cashier PIN."))

	user = str(user or "").strip()
	if not user:
		frappe.throw(_("Cashier is required."))

	_ensure_terminal_user(profile_name, user)
	user_doc = _get_user_doc(user)
	existing_pin = _get_user_pin(user_doc)
	next_pin = _validate_new_pin(new_pin)

	if existing_pin and str(current_pin or "").strip() != existing_pin:
		frappe.throw(_("Current PIN is incorrect."))

	if not hasattr(user_doc, "flags") or user_doc.flags is None:
		user_doc.flags = frappe._dict() if hasattr(frappe, "_dict") else type("Flags", (), {})()
	user_doc.flags.ignore_permissions = True
	user_doc.set("posa_pos_pin", next_pin)
	user_doc.save(ignore_permissions=True)

	return {
		"user": user_doc.name,
		"full_name": user_doc.full_name or user_doc.name,
		"has_pin": True,
		"is_supervisor": _is_pos_supervisor(user_doc),
	}
