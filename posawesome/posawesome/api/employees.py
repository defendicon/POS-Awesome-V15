from __future__ import annotations

import hashlib
import hmac
import json

import frappe
from frappe import _

from posawesome.posawesome.api.pos_access import (
    POS_SUPERVISOR_ROLE,
    get_authenticated_pos_user,
    get_authorized_pos_profile,
    user_can_manage_pos,
)
from posawesome.posawesome.api.terminal_state import (
    activate_verified_cashier,
    get_active_terminal_cashier,
    get_authorized_terminal_state,
    lock_authorized_terminal,
)

CASHIER_PIN_MAX_FAILED_ATTEMPTS = 5
CASHIER_PIN_LOCK_INTERVAL_SECONDS = 5 * 60
CASHIER_PIN_ATTEMPT_LOCK_TIMEOUT_SECONDS = 10
CASHIER_PIN_ATTEMPT_LOCK_WAIT_SECONDS = 2
CASHIER_PIN_ATTEMPT_KEY_VERSION = "v1"


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


def _get_user_pin_length(user: str) -> int:
    try:
        pin_length = len(_get_user_pin(_get_user_doc(user)))
    except Exception:
        return 0
    return pin_length if 4 <= pin_length <= 8 else 0


def _get_cashier_pin_request_ip() -> str:
    try:
        request_ip = getattr(frappe.local, "request_ip", None)
    except Exception:
        request_ip = None

    if not request_ip:
        try:
            request_ip = getattr(frappe.request, "remote_addr", None)
        except Exception:
            request_ip = None

    return str(request_ip or "unknown").strip() or "unknown"


def _cashier_pin_attempt_key(
    session_user: str,
    profile_name: str,
    target_user: str,
    request_ip: str,
) -> str:
    identity = json.dumps(
        {
            "endpoint": "verify_terminal_employee_pin",
            "ip": request_ip,
            "pos_profile": profile_name,
            "session_user": session_user,
            "target_cashier": target_user,
            "version": CASHIER_PIN_ATTEMPT_KEY_VERSION,
        },
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    return f"posawesome:cashier-pin-attempt:{CASHIER_PIN_ATTEMPT_KEY_VERSION}:{digest}"


def _create_cashier_pin_attempt_tracker(attempt_key: str):
    from frappe.auth import LoginAttemptTracker

    # Frappe locks only when failures are greater than its configured
    # threshold, so one less produces an exact five-failure endpoint limit.
    return LoginAttemptTracker(
        attempt_key,
        max_consecutive_login_attempts=CASHIER_PIN_MAX_FAILED_ATTEMPTS - 1,
        lock_interval=CASHIER_PIN_LOCK_INTERVAL_SECONDS,
    )


def _create_cashier_pin_attempt_lock(attempt_key: str):
    lock_key = frappe.cache.make_key(f"{attempt_key}:lock")
    return frappe.cache.lock(
        lock_key,
        timeout=CASHIER_PIN_ATTEMPT_LOCK_TIMEOUT_SECONDS,
        blocking_timeout=CASHIER_PIN_ATTEMPT_LOCK_WAIT_SECONDS,
    )


def _log_cashier_pin_guard_error(action: str, target_user: str):
    try:
        frappe.log_error(
            frappe.get_traceback(),
            f"POS Awesome: cashier PIN attempt guard failed during {action} for {target_user}",
        )
    except Exception:
        pass


def _verify_cashier_pin_with_attempt_guard(
    user_doc,
    supplied_pin: str,
    attempt_key: str,
) -> bool:
    target_user = str(getattr(user_doc, "name", "") or "").strip()
    attempt_lock = None
    lock_acquired = False
    verified = False

    try:
        attempt_lock = _create_cashier_pin_attempt_lock(attempt_key)
        lock_acquired = bool(attempt_lock.acquire())
    except Exception:
        _log_cashier_pin_guard_error("lock acquisition", target_user)
        return False

    if not lock_acquired:
        return False

    try:
        tracker = _create_cashier_pin_attempt_tracker(attempt_key)
        if not tracker.is_user_allowed():
            return False

        stored_pin = _get_user_pin(user_doc)
        if not stored_pin or not hmac.compare_digest(stored_pin, supplied_pin):
            tracker.add_failure_attempt()
            return False

        tracker.add_success_attempt()
        verified = True
    except Exception:
        _log_cashier_pin_guard_error("attempt update", target_user)
        verified = False
    finally:
        try:
            attempt_lock.release()
        except Exception:
            _log_cashier_pin_guard_error("lock release", target_user)
            verified = False

    return verified


def _is_pos_supervisor(user_doc) -> bool:
    user = getattr(user_doc, "name", None)
    if user and POS_SUPERVISOR_ROLE in _get_roles_for_user(user):
        return True
    return bool(getattr(user_doc, "posa_is_pos_supervisor", 0))


def _get_roles_for_user(user: str) -> set[str]:
    get_roles = getattr(frappe, "get_roles", None)
    if not callable(get_roles):
        return set()

    try:
        return set(get_roles(user) or [])
    except Exception:
        if hasattr(frappe, "log_error"):
            frappe.log_error(
                frappe.get_traceback(),
                f"POS Awesome: failed to read roles for user {user}",
            )
        return set()


def _get_pos_supervisor_users(users: list[str]) -> set[str]:
    if not users:
        return set()

    try:
        rows = frappe.get_all(
            "Has Role",
            filters={
                "parent": ["in", users],
                "parenttype": "User",
                "role": POS_SUPERVISOR_ROLE,
            },
            fields=["parent"],
            ignore_permissions=True,
        )
        return {row.get("parent") for row in rows if row.get("parent")}
    except Exception:
        if hasattr(frappe, "log_error"):
            frappe.log_error(
                frappe.get_traceback(),
                "POS Awesome: failed to batch-load cashier supervisor roles",
            )
        return {
            user for user in users if POS_SUPERVISOR_ROLE in _get_roles_for_user(user)
        }


def _has_legacy_supervisor_field() -> bool:
    try:
        meta = frappe.get_meta("User")
        has_field = getattr(meta, "has_field", None)
        if callable(has_field):
            return bool(has_field("posa_is_pos_supervisor"))
    except Exception:
        pass

    try:
        return bool(
            frappe.db.exists(
                "Custom Field",
                {
                    "dt": "User",
                    "fieldname": "posa_is_pos_supervisor",
                },
            )
        )
    except Exception:
        return False


def _as_user_doc(row):
    if hasattr(frappe, "_dict"):
        return frappe._dict(row)
    return type("UserRow", (), row)()


def _validate_new_pin(new_pin: str) -> str:
    pin = str(new_pin or "").strip()
    if not pin:
        frappe.throw(_("Enter a new PIN."))
    if not pin.isdigit():
        frappe.throw(_("PIN must contain digits only."))
    if len(pin) < 4 or len(pin) > 8:
        frappe.throw(_("PIN must be between 4 and 8 digits."))
    return pin


def _authorize_terminal_profile(pos_profile) -> str:
    profile_doc = get_authorized_pos_profile(pos_profile)
    return str(profile_doc.get("name") or "").strip()


def _require_pin_management_access(profile_name: str, target_user: str) -> str:
    session_user = get_authenticated_pos_user()
    if target_user == session_user or user_can_manage_pos(session_user):
        return session_user

    try:
        active_cashier = get_active_terminal_cashier(profile_name)
    except frappe.PermissionError:
        active_cashier = ""
    if target_user != active_cashier:
        frappe.throw(
            _("You may only manage your own cashier PIN unless you are a POS supervisor or manager."),
            frappe.PermissionError,
        )
    return session_user


@frappe.whitelist()
def get_terminal_employees(pos_profile=None):
    profile_name = _authorize_terminal_profile(pos_profile)

    users = _get_terminal_users(profile_name)
    if not users:
        return []

    fields = ["name", "full_name", "enabled"]
    if _has_legacy_supervisor_field():
        fields.append("posa_is_pos_supervisor")

    user_rows = frappe.get_all(
        "User",
        filters={"name": ["in", users], "enabled": 1},
        fields=fields,
        order_by="full_name asc, name asc",
        ignore_permissions=True,
    )
    user_map = {row.get("name"): row for row in user_rows}
    supervisor_users = _get_pos_supervisor_users(list(user_map))
    pin_lengths = {user: _get_user_pin_length(user) for user in user_map}
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
                "pin_length": pin_lengths.get(user, 0),
                "is_current": row.get("name") == current_user,
                "is_supervisor": user in supervisor_users
                or bool(row.get("posa_is_pos_supervisor", 0)),
                "can_override_below_cost": user in supervisor_users
                or bool(row.get("posa_is_pos_supervisor", 0)),
            }
        )

    return employees


@frappe.whitelist()
def verify_terminal_employee_pin(pos_profile=None, user=None, pin=None):
    profile_doc = get_authorized_pos_profile(pos_profile)
    profile_name = str(profile_doc.get("name") or "").strip()

    user = str(user or "").strip()
    pin = str(pin or "").strip()
    if not user or not pin:
        frappe.throw(_("Cashier and PIN are required."))

    _ensure_terminal_user(profile_name, user)
    user_doc = _get_user_doc(user)
    attempt_key = _cashier_pin_attempt_key(
        get_authenticated_pos_user(),
        profile_name,
        user,
        _get_cashier_pin_request_ip(),
    )
    if not _verify_cashier_pin_with_attempt_guard(user_doc, pin, attempt_key):
        frappe.throw(_("Invalid cashier PIN."))

    result = {
        "user": user_doc.name,
        "full_name": user_doc.full_name or user_doc.name,
        "enabled": user_doc.enabled,
        "is_supervisor": _is_pos_supervisor(user_doc),
        "can_override_below_cost": _is_pos_supervisor(user_doc),
    }
    result["terminal_state"] = activate_verified_cashier(profile_doc, user_doc.name)
    return result


@frappe.whitelist()
def get_terminal_state(pos_profile=None):
    return get_authorized_terminal_state(pos_profile)


@frappe.whitelist()
def lock_terminal(pos_profile=None):
    profile_doc = get_authorized_pos_profile(pos_profile)
    return lock_authorized_terminal(profile_doc)


@frappe.whitelist()
def get_cashier_pin_status(pos_profile=None, user=None):
    profile_name = _authorize_terminal_profile(pos_profile)

    user = str(user or "").strip()
    if not user:
        frappe.throw(_("Cashier is required."))

    _require_pin_management_access(profile_name, user)
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
    profile_name = _authorize_terminal_profile(pos_profile)

    user = str(user or "").strip()
    if not user:
        frappe.throw(_("Cashier is required."))

    _require_pin_management_access(profile_name, user)
    _ensure_terminal_user(profile_name, user)
    user_doc = _get_user_doc(user)
    existing_pin = _get_user_pin(user_doc)
    next_pin = _validate_new_pin(new_pin)

    supplied_current_pin = str(current_pin or "").strip()
    if existing_pin and not hmac.compare_digest(existing_pin, supplied_current_pin):
        frappe.throw(_("Current PIN is incorrect."))

    if not hasattr(user_doc, "flags") or user_doc.flags is None:
        user_doc.flags = frappe._dict() if hasattr(frappe, "_dict") else type("Flags", (), {})()
    user_doc.flags.ignore_permissions = True
    user_doc.set("posa_pos_pin", next_pin)
    user_doc.save(ignore_permissions=True)

    result = {
        "user": user_doc.name,
        "full_name": user_doc.full_name or user_doc.name,
        "has_pin": True,
        "is_supervisor": _is_pos_supervisor(user_doc),
    }
    if not existing_pin and user == get_authenticated_pos_user():
        result.update(verify_terminal_employee_pin(profile_name, user, next_pin))
    return result
