"""PIN-encrypted, profile-scoped cashier grants for disconnected terminals."""

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime

import frappe
from frappe import _

ACCESS_SECONDS = 24 * 60 * 60
REPLAY_SECONDS = 30 * 24 * 60 * 60
PIN_ITERATIONS = 600_000


def _secret():
    from frappe.utils.password import get_encryption_key

    return get_encryption_key().encode()


def _digest(value):
    return hmac.new(_secret(), value.encode(), hashlib.sha256).hexdigest()


def _pin_version(user, pin):
    return _digest(json.dumps(["offline-cashier-pin-v1", user, pin]))


def create_offline_cashier_access(profile_name, user, pin):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from posawesome.posawesome.api.pos_access import get_authenticated_pos_user

    issued = int(time.time())
    claims = {
        "version": 1,
        "session_user": get_authenticated_pos_user(),
        "pos_profile": profile_name,
        "cashier": user,
        "pin_version": _pin_version(user, pin),
        "issued_at": issued,
        "expires_at": issued + ACCESS_SECONDS,
    }
    payload = base64.urlsafe_b64encode(json.dumps(claims, sort_keys=True).encode()).decode()
    token = f"{payload}.{_digest(payload)}"
    salt, iv = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, PIN_ITERATIONS, 32)
    ciphertext = AESGCM(key).encrypt(iv, token.encode(), None)
    return {
        "version": 1,
        "iterations": PIN_ITERATIONS,
        "salt": base64.b64encode(salt).decode(),
        "iv": base64.b64encode(iv).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "expires_at": claims["expires_at"],
    }


def validate_offline_cashier(token, pos_profile, captured_at):
    """Replay only a signed grant; never trust a client-supplied cashier name."""
    from posawesome.posawesome.api.employees import _get_user_doc, _get_user_pin
    from posawesome.posawesome.api.pos_access import get_authenticated_pos_user
    from posawesome.posawesome.api.terminal_state import validate_assigned_terminal_cashier

    try:
        payload, signature = str(token).split(".")
        if not hmac.compare_digest(signature, _digest(payload)):
            raise ValueError("signature")
        claims = json.loads(base64.urlsafe_b64decode(payload))
        captured = datetime.fromisoformat(str(captured_at).replace("Z", "+00:00"))
        if captured.tzinfo is None:
            raise ValueError("timezone")
        sold_at = captured.timestamp()
        now = time.time()
        if (
            claims["version"] != 1
            or claims["session_user"] != get_authenticated_pos_user()
            or claims["pos_profile"] != pos_profile
            or not claims["issued_at"] <= sold_at <= claims["expires_at"]
            or sold_at > now + 300
            or now - sold_at > REPLAY_SECONDS
        ):
            raise ValueError("scope or validity")
        user = validate_assigned_terminal_cashier(pos_profile, claims["cashier"])
        pin = _get_user_pin(_get_user_doc(user))
        if not pin or not hmac.compare_digest(claims["pin_version"], _pin_version(user, pin)):
            raise ValueError("PIN changed")
        return user
    except (ValueError, TypeError, KeyError, OverflowError):
        frappe.throw(
            _("Offline cashier access is invalid or expired. Review the queued invoice before retrying."),
            frappe.PermissionError,
        )
