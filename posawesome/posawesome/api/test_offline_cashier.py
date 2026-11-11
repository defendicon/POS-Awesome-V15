import base64
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class TestOfflineCashier(unittest.TestCase):
    def setUp(self):
        frappe = ModuleType("frappe")
        frappe._ = lambda value: value
        frappe.PermissionError = PermissionError
        frappe.ValidationError = ValueError
        frappe.get_cached_doc = Mock(return_value={})
        frappe.throw = lambda message, exc: (_ for _ in ()).throw(exc(message))
        access = ModuleType("posawesome.posawesome.api.pos_access")
        access.get_authenticated_pos_user = Mock(return_value="terminal@example.com")
        employees = ModuleType("posawesome.posawesome.api.employees")
        employees._get_user_doc = Mock(return_value=object())
        employees._get_user_pin = Mock(return_value="1234")
        terminal = ModuleType("posawesome.posawesome.api.terminal_state")
        terminal.validate_assigned_terminal_cashier = Mock(side_effect=lambda profile, user: user)
        self.modules = patch.dict(sys.modules, {
            "frappe": frappe,
            access.__name__: access,
            employees.__name__: employees,
            terminal.__name__: terminal,
        })
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.access, self.employees, self.terminal = access, employees, terminal
        self.frappe = frappe
        spec = importlib.util.spec_from_file_location("offline_cashier_under_test", Path(__file__).with_name("offline_cashier.py"))
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.secret = patch.object(self.module, "_secret", return_value=b"test-site-key")
        self.secret.start()
        self.addCleanup(self.secret.stop)
        with patch.object(self.module.time, "time", return_value=1793786400):
            self.grant = self.module.create_offline_cashier_access("Main POS", "backup@example.com", "1234")
        key = hashlib.pbkdf2_hmac("sha256", b"1234", base64.b64decode(self.grant["salt"]), self.grant["iterations"], 32)
        self.token = AESGCM(key).decrypt(base64.b64decode(self.grant["iv"]), base64.b64decode(self.grant["ciphertext"]), None).decode()
        self.captured = "2026-11-04T12:00:00+00:00"

    def validate(self, token=None, profile="Main POS", captured=None):
        return self.module.validate_offline_cashier(token or self.token, profile, captured or self.captured)

    def test_encrypted_grant_has_no_plaintext_pin_or_token(self):
        self.assertNotIn(self.token, json.dumps(self.grant))
        self.assertNotIn("pin", self.grant)
        claims = json.loads(base64.urlsafe_b64decode(self.token.split(".")[0]))
        self.assertEqual(claims["cashier"], "backup@example.com")
        self.assertEqual(claims["expires_at"] - claims["issued_at"], 86400)

    def test_original_cashier_replays_after_access_expiry(self):
        # The sale happened while access was valid; reconnect happens two days later.
        with patch.object(self.module.time, "time", return_value=1794000000):
            self.assertEqual(self.validate(), "backup@example.com")
        self.terminal.validate_assigned_terminal_cashier.assert_called_once_with("Main POS", "backup@example.com")

    def test_profile_duration_applies_to_new_grants_only(self):
        self.frappe.get_cached_doc.return_value = {self.module.ACCESS_HOURS_FIELD: 2}
        with patch.object(self.module.time, "time", return_value=1793786400):
            grant = self.module.create_offline_cashier_access("Main POS", "backup@example.com", "1234")
        self.frappe.get_cached_doc.assert_called_with("POS Profile", "Main POS")
        self.assertEqual(grant["expires_at"], 1793786400 + 7200)
        key = hashlib.pbkdf2_hmac("sha256", b"1234", base64.b64decode(grant["salt"]), grant["iterations"], 32)
        token = AESGCM(key).decrypt(base64.b64decode(grant["iv"]), base64.b64decode(grant["ciphertext"]), None).decode()
        during_access = datetime.fromtimestamp(grant["expires_at"] - 1, timezone.utc).isoformat()
        after_access = datetime.fromtimestamp(grant["expires_at"] + 1, timezone.utc).isoformat()
        with patch.object(self.module.time, "time", return_value=1794000000):
            self.assertEqual(self.validate(token=token, captured=during_access), "backup@example.com")
            self.assertEqual(self.validate(captured=after_access), "backup@example.com")
            with self.assertRaises(PermissionError):
                self.validate(token=token, captured=after_access)

    def test_invalid_profile_duration_rejected_on_save_and_grant_issue(self):
        for value in (0, -1, 169, 1.5, "invalid", "NaN", "inf"):
            with self.subTest(value=value):
                profile = {self.module.ACCESS_HOURS_FIELD: value}
                self.frappe.get_cached_doc.return_value = profile
                with self.assertRaisesRegex(ValueError, "whole number"):
                    self.module.validate_offline_cashier_settings(profile)
                with self.assertRaisesRegex(ValueError, "whole number"):
                    self.module.create_offline_cashier_access("Main POS", "backup@example.com", "1234")

    def test_tampered_token_is_rejected(self):
        with self.assertRaises(PermissionError):
            self.validate(token=self.token + "x")

    def test_other_profile_and_session_are_rejected(self):
        with self.assertRaises(PermissionError):
            self.validate(profile="Other POS")
        self.access.get_authenticated_pos_user.return_value = "other@example.com"
        with self.assertRaises(PermissionError):
            self.validate()

    def test_sale_after_expiry_and_without_timezone_is_rejected(self):
        for captured in ("2026-11-08T12:00:00+00:00", "2026-11-04T12:00:00"):
            with self.assertRaises(PermissionError):
                self.validate(captured=captured)

    def test_changed_pin_and_disabled_cashier_are_rejected(self):
        with patch.object(self.module.time, "time", return_value=1794000000):
            self.employees._get_user_pin.return_value = "5678"
            with self.assertRaises(PermissionError):
                self.validate()
            self.employees._get_user_pin.return_value = "1234"
            self.terminal.validate_assigned_terminal_cashier.side_effect = PermissionError("Disabled")
            with self.assertRaisesRegex(PermissionError, "Disabled"):
                self.validate()

    def test_future_sale_and_old_replay_are_rejected(self):
        for now in (1793786400, 1798000000):
            with patch.object(self.module.time, "time", return_value=now):
                with self.assertRaises(PermissionError):
                    self.validate()


if __name__ == "__main__":
    unittest.main()
