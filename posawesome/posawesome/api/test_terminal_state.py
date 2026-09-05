import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.api import terminal_state


class FakeCache:
    def __init__(self):
        self.values = {}
        self.get_calls = []
        self.set_calls = []

    def get_value(
        self,
        key,
        generator=None,
        user=None,
        expires=False,
        shared=False,
    ):
        self.get_calls.append(
            {
                "key": key,
                "generator": generator,
                "user": user,
                "expires": expires,
                "shared": shared,
            }
        )
        return self.values.get(key)

    def set_value(self, key, value, **kwargs):
        self.values[key] = value
        self.set_calls.append({"key": key, "value": value, "kwargs": kwargs})


class FakeProfile(dict):
    pass


class TestTerminalState(unittest.TestCase):
    def setUp(self):
        self.now_patcher = patch.object(
            terminal_state,
            "now_datetime",
            return_value="2026-07-12 20:00:00",
        )
        self.now_patcher.start()
        self.addCleanup(self.now_patcher.stop)
        self.cache = FakeCache()
        self.assigned_users = {"cashier@example.com", "supervisor@example.com"}

        def exists(doctype, value):
            if doctype == "POS Profile User":
                return (
                    value.get("parent") == "Main POS"
                    and value.get("user") in self.assigned_users
                )
            return False

        def get_value(doctype, name, fieldname):
            if doctype == "User" and fieldname == "enabled":
                return 1
            return None

        def throw(message, exception=None):
            raise (exception or Exception)(message)

        self.profile = FakeProfile(name="Main POS", company="RetailMind")
        self.fake_frappe = SimpleNamespace(
            session=SimpleNamespace(user="cashier@example.com", sid="session-1"),
            local=SimpleNamespace(session=SimpleNamespace(sid="session-1")),
            cache=self.cache,
            db=SimpleNamespace(exists=exists, get_value=get_value),
            PermissionError=PermissionError,
            throw=throw,
        )

    def test_missing_state_fails_closed_as_locked_without_cashier(self):
        with (
            patch.object(terminal_state, "frappe", self.fake_frappe),
            patch.object(
                terminal_state,
                "get_authorized_pos_profile",
                return_value=self.profile,
            ),
        ):
            result = terminal_state.get_authorized_terminal_state("Main POS")

        self.assertTrue(result["locked"])
        self.assertIsNone(result["active_cashier"])
        self.assertTrue(self.cache.get_calls[-1]["expires"])

    def test_verified_pin_activation_is_server_backed_and_survives_reload(self):
        with patch.object(terminal_state, "frappe", self.fake_frappe):
            activated = terminal_state.activate_verified_cashier(
                self.profile,
                "cashier@example.com",
            )
            writes_before_reload = len(self.cache.set_calls)
            reloaded = terminal_state._read_state("Main POS")

        self.assertFalse(activated["locked"])
        self.assertEqual(reloaded["active_cashier"], "cashier@example.com")
        self.assertEqual(len(self.cache.set_calls), writes_before_reload + 1)
        self.assertEqual(
            self.cache.set_calls[-1]["kwargs"].get("expires_in_sec"),
            terminal_state.TERMINAL_STATE_TTL_SECONDS,
        )

    def test_missing_state_does_not_create_an_unlockable_cache_entry(self):
        with patch.object(terminal_state, "frappe", self.fake_frappe):
            state = terminal_state._read_state("Main POS")

        self.assertTrue(state["locked"])
        self.assertIsNone(state["active_cashier"])
        self.assertEqual(self.cache.set_calls, [])

    def test_lock_persists_and_blocks_authoritative_cashier_accessor(self):
        with (
            patch.object(terminal_state, "frappe", self.fake_frappe),
            patch.object(
                terminal_state,
                "get_authorized_pos_profile",
                return_value=self.profile,
            ),
            patch.object(
                terminal_state,
                "get_authenticated_pos_user",
                return_value="cashier@example.com",
            ),
        ):
            terminal_state.activate_verified_cashier(self.profile, "cashier@example.com")
            locked = terminal_state.lock_authorized_terminal(self.profile)
            with self.assertRaisesRegex(PermissionError, "terminal is locked"):
                terminal_state.get_active_terminal_cashier("Main POS")

        self.assertTrue(locked["locked"])
        self.assertEqual(locked["active_cashier"], "cashier@example.com")

    def test_accessor_returns_only_server_verified_cashier(self):
        authorize = Mock(return_value=self.profile)
        forged_profile = {"name": "Main POS", "active_cashier": "Administrator"}

        with (
            patch.object(terminal_state, "frappe", self.fake_frappe),
            patch.object(terminal_state, "get_authorized_pos_profile", authorize),
            patch.object(
                terminal_state,
                "get_authenticated_pos_user",
                return_value="cashier@example.com",
            ),
        ):
            terminal_state.activate_verified_cashier(self.profile, "cashier@example.com")
            result = terminal_state.get_active_terminal_cashier(forged_profile)

        authorize.assert_called_once_with(forged_profile)
        self.assertEqual(result, "cashier@example.com")

    def test_removed_profile_member_cannot_remain_active_cashier(self):
        with (
            patch.object(terminal_state, "frappe", self.fake_frappe),
            patch.object(
                terminal_state,
                "get_authorized_pos_profile",
                return_value=self.profile,
            ),
            patch.object(
                terminal_state,
                "get_authenticated_pos_user",
                return_value="cashier@example.com",
            ),
        ):
            terminal_state.activate_verified_cashier(self.profile, "cashier@example.com")
            self.assigned_users.clear()
            with self.assertRaisesRegex(PermissionError, "not assigned"):
                terminal_state.get_active_terminal_cashier("Main POS")


if __name__ == "__main__":
    unittest.main()
