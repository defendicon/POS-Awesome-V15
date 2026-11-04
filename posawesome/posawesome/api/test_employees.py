import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class _DeterministicAttemptLock:
    def __init__(self, events, attempt_key):
        self.events = events
        self.attempt_key = attempt_key

    def acquire(self):
        self.events.append((self.attempt_key, "lock_acquired"))
        return True

    def release(self):
        self.events.append((self.attempt_key, "lock_released"))


class _DeterministicAttemptTracker:
    def __init__(self, state, events, attempt_key, max_failed_attempts):
        self.state = state
        self.events = events
        self.attempt_key = attempt_key
        self.max_failed_attempts = max_failed_attempts

    def is_user_allowed(self):
        self.events.append((self.attempt_key, "checked"))
        return self.state.get(self.attempt_key, 0) < self.max_failed_attempts

    def add_failure_attempt(self):
        self.state[self.attempt_key] = self.state.get(self.attempt_key, 0) + 1
        self.events.append((self.attempt_key, "failed"))

    def add_success_attempt(self):
        self.state.pop(self.attempt_key, None)
        self.events.append((self.attempt_key, "succeeded"))


def _install_frappe_stub():
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message, exception=None: (_ for _ in ()).throw(
        (exception or Exception)(message)
    )
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.session = types.SimpleNamespace(user="cashier@example.com")
    frappe_module.local = types.SimpleNamespace(request_ip="192.0.2.10")
    frappe_module.request = types.SimpleNamespace(remote_addr="192.0.2.10")
    frappe_module.PermissionError = PermissionError
    frappe_module._dict = lambda value=None, **kwargs: types.SimpleNamespace(**(value or {}), **kwargs)
    frappe_module.get_all = lambda *args, **kwargs: []
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.get_roles = lambda user=None: []
    frappe_module.get_traceback = lambda: "traceback"
    frappe_module.log_error = lambda *args, **kwargs: None
    frappe_module.get_meta = lambda doctype: types.SimpleNamespace(
        has_field=lambda fieldname: False
    )
    frappe_module.db = types.SimpleNamespace(
        exists=lambda *args, **kwargs: False,
        has_column=lambda *args, **kwargs: False,
    )
    frappe_module.cache = types.SimpleNamespace()
    sys.modules["frappe"] = frappe_module


def _load_employees_module():
    module_name = "posawesome.posawesome.api.employees"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "employees.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestEmployeesApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_frappe_module = sys.modules.get("frappe")
        cls.original_employees_module = sys.modules.get(
            "posawesome.posawesome.api.employees"
        )
        _install_frappe_stub()
        # Keep these unit tests independent of an installed Frappe site. Every
        # authorization/terminal helper is configured explicitly in setUp.
        access = types.ModuleType("posawesome.posawesome.api.pos_access")
        access.POS_SUPERVISOR_ROLE = "POS Awesome Supervisor"
        access.get_authenticated_pos_user = lambda: ""
        access.get_authorized_pos_profile = lambda profile: {}
        access.user_can_manage_pos = lambda user: False
        terminal = types.ModuleType("posawesome.posawesome.api.terminal_state")
        terminal.activate_verified_cashier = lambda *args: {}
        terminal.get_active_terminal_cashier = lambda *args: ""
        terminal.get_authorized_terminal_state = lambda *args: {}
        terminal.lock_authorized_terminal = lambda *args: {}
        with patch.dict(sys.modules, {access.__name__: access, terminal.__name__: terminal}):
            cls.employees = _load_employees_module()
        cls.production_create_cashier_pin_attempt_tracker = staticmethod(
            cls.employees._create_cashier_pin_attempt_tracker
        )
        cls.production_create_cashier_pin_attempt_lock = staticmethod(
            cls.employees._create_cashier_pin_attempt_lock
        )

    @classmethod
    def tearDownClass(cls):
        if cls.original_frappe_module is None:
            sys.modules.pop("frappe", None)
        else:
            sys.modules["frappe"] = cls.original_frappe_module

        module_name = "posawesome.posawesome.api.employees"
        if cls.original_employees_module is None:
            sys.modules.pop(module_name, None)
        else:
            sys.modules[module_name] = cls.original_employees_module

    def setUp(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.get_authenticated_pos_user = lambda: self.employees.frappe.session.user
        self.employees.get_authorized_pos_profile = lambda profile: {
            "name": self.employees._resolve_profile_name(profile) or "Main POS"
        }
        self.employees.user_can_manage_pos = lambda user: False
        self.employees.activate_verified_cashier = lambda profile, user: {
            "pos_profile": profile.get("name"),
            "active_cashier": user,
            "locked": False,
        }
        self.employees.get_active_terminal_cashier = lambda profile: ""
        self.employees.frappe.local = types.SimpleNamespace(request_ip="192.0.2.10")
        self.employees.frappe.request = types.SimpleNamespace(remote_addr="192.0.2.10")
        self.employees.frappe.log_error = lambda *args, **kwargs: None
        self.employees.frappe.cache = types.SimpleNamespace()
        self.pin_attempt_state = {}
        self.pin_attempt_events = []
        self.employees._create_cashier_pin_attempt_lock = lambda attempt_key: (
            _DeterministicAttemptLock(self.pin_attempt_events, attempt_key)
        )
        self.employees._create_cashier_pin_attempt_tracker = lambda attempt_key: (
            _DeterministicAttemptTracker(
                self.pin_attempt_state,
                self.pin_attempt_events,
                attempt_key,
                self.employees.CASHIER_PIN_MAX_FAILED_ATTEMPTS,
            )
        )
        self.employees.frappe.get_meta = lambda doctype: types.SimpleNamespace(
            has_field=lambda fieldname: False
        )
        self.employees.frappe.db = types.SimpleNamespace(
            exists=lambda *args, **kwargs: False,
            has_column=lambda *args, **kwargs: False,
        )

    def test_get_terminal_employees_returns_profile_users_with_current_flag(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.frappe.get_roles = lambda user=None: []
        self.employees.frappe.get_meta = lambda doctype: types.SimpleNamespace(
            has_field=lambda fieldname: fieldname == "posa_is_pos_supervisor"
        )
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}, {"user": "backup@example.com"}]
            if doctype == "POS Profile User"
            else []
            if doctype == "Has Role"
            else [
                {
                    "name": "cashier@example.com",
                    "full_name": "Main Cashier",
                    "enabled": 1,
                    "posa_is_pos_supervisor": 1,
                },
                {
                    "name": "backup@example.com",
                    "full_name": "Backup Cashier",
                    "enabled": 1,
                    "posa_is_pos_supervisor": 0,
                },
            ]
        )

        class FakeUserDoc:
            def __init__(self, name):
                self.name = name

            def get_password(self, fieldname):
                return "1234" if self.name == "cashier@example.com" else "123456"

        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc(name)

        result = self.employees.get_terminal_employees("Main POS")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["user"], "cashier@example.com")
        self.assertTrue(result[0]["is_current"])
        self.assertTrue(result[0]["is_supervisor"])
        self.assertEqual(result[0]["pin_length"], 4)
        self.assertEqual(result[1]["full_name"], "Backup Cashier")
        self.assertFalse(result[1]["is_current"])
        self.assertFalse(result[1]["is_supervisor"])
        self.assertEqual(result[1]["pin_length"], 6)
        self.assertNotIn("offline_access", result[0])

        offline = types.ModuleType("posawesome.posawesome.api.offline_cashier")
        offline.create_offline_cashier_access = Mock(return_value={"ciphertext": "encrypted-grant"})
        with patch.dict(sys.modules, {offline.__name__: offline}):
            prepared = self.employees.get_terminal_employees("Main POS", include_offline_access="1")
        self.assertEqual(prepared[1]["offline_access"], {"ciphertext": "encrypted-grant"})
        self.assertEqual(offline.create_offline_cashier_access.call_count, 2)
        offline.create_offline_cashier_access.assert_any_call("Main POS", "backup@example.com", "123456")

    def test_get_terminal_employees_marks_supervisor_from_user_role(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.frappe.get_roles = lambda user=None: (
            ["Sales User", "POS Awesome Supervisor"] if user == "cashier@example.com" else ["Sales User"]
        )
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}, {"user": "backup@example.com"}]
            if doctype == "POS Profile User"
            else [{"parent": "cashier@example.com"}]
            if doctype == "Has Role"
            else [
                {
                    "name": "cashier@example.com",
                    "full_name": "Main Cashier",
                    "enabled": 1,
                },
                {
                    "name": "backup@example.com",
                    "full_name": "Backup Cashier",
                    "enabled": 1,
                },
            ]
        )

        result = self.employees.get_terminal_employees("Main POS")

        self.assertTrue(result[0]["is_supervisor"])
        self.assertFalse(result[1]["is_supervisor"])

    def test_orphaned_legacy_column_is_not_requested_after_custom_field_migration(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.frappe.get_roles = lambda user=None: (
            ["POS Awesome Supervisor"] if user == "cashier@example.com" else []
        )
        self.employees.frappe.get_meta = Mock(
            return_value=types.SimpleNamespace(
                has_field=Mock(return_value=False),
            )
        )
        self.employees.frappe.db.has_column = Mock(
            side_effect=AssertionError(
                "physical columns are not valid Frappe field metadata"
            )
        )

        def fake_get_all(doctype, **kwargs):
            if doctype == "POS Profile User":
                return [{"user": "cashier@example.com"}]
            if doctype == "Has Role":
                return [{"parent": "cashier@example.com"}]
            if doctype == "User":
                self.assertNotIn("posa_is_pos_supervisor", kwargs["fields"])
                return [
                    {
                        "name": "cashier@example.com",
                        "full_name": "Main Cashier",
                        "enabled": 1,
                    }
                ]
            return []

        self.employees.frappe.get_all = fake_get_all

        result = self.employees.get_terminal_employees("Main POS")

        self.assertEqual([employee["user"] for employee in result], ["cashier@example.com"])
        self.assertTrue(result[0]["is_supervisor"])
        self.employees.frappe.get_meta.assert_called_once_with("User")
        self.employees.frappe.db.has_column.assert_not_called()

    def test_verify_terminal_employee_pin_accepts_valid_terminal_member(self):
        self.employees.frappe.get_roles = lambda user=None: []

        class FakeUserDoc:
            def __init__(self):
                self.name = "backup@example.com"
                self.full_name = "Backup Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 0
                self.flags = types.SimpleNamespace()

            def get_password(self, fieldname):
                self.last_password_field = fieldname
                return "1234"

        def fake_get_all(doctype, **kwargs):
            if doctype == "POS Profile User":
                return [{"user": "backup@example.com"}]
            if doctype == "User":
                return [{"name": "backup@example.com", "full_name": "Backup Cashier", "enabled": 1}]
            return []

        self.employees.frappe.get_all = fake_get_all
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        self.employees.activate_verified_cashier = Mock(
            return_value={
                "pos_profile": "Main POS",
                "active_cashier": "backup@example.com",
                "locked": False,
            }
        )

        result = self.employees.verify_terminal_employee_pin(
            "Main POS",
            "backup@example.com",
            "1234",
        )

        self.assertEqual(result["user"], "backup@example.com")
        self.assertEqual(result["full_name"], "Backup Cashier")
        self.assertFalse(result["is_supervisor"])
        self.assertFalse(result["terminal_state"]["locked"])
        self.employees.activate_verified_cashier.assert_called_once_with(
            {"name": "Main POS"},
            "backup@example.com",
        )
        self.assertEqual(self.pin_attempt_state, {})
        self.assertIn("succeeded", [event for _, event in self.pin_attempt_events])

    def test_invalid_pin_never_activates_server_terminal_state(self):
        class FakeUserDoc:
            name = "backup@example.com"
            full_name = "Backup Cashier"
            enabled = 1
            posa_is_pos_supervisor = 0

            def get_password(self, fieldname):
                return "1234"

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "backup@example.com"}]
            if doctype == "POS Profile User"
            else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()
        self.employees.activate_verified_cashier = Mock(
            side_effect=AssertionError("invalid PIN must not activate terminal state")
        )

        with self.assertRaisesRegex(Exception, "Invalid cashier PIN"):
            self.employees.verify_terminal_employee_pin(
                "Main POS",
                "backup@example.com",
                "0000",
            )

        self.employees.activate_verified_cashier.assert_not_called()

    def test_pin_attempt_key_is_scoped_and_does_not_expose_identifiers(self):
        identity = {
            "session_user": "terminal@example.com",
            "profile_name": "Main POS",
            "target_user": "cashier@example.com",
            "request_ip": "192.0.2.10",
        }
        base_key = self.employees._cashier_pin_attempt_key(**identity)

        self.assertTrue(base_key.startswith("posawesome:cashier-pin-attempt:v1:"))
        for raw_identifier in identity.values():
            self.assertNotIn(raw_identifier, base_key)

        for field_name, replacement in (
            ("session_user", "other-terminal@example.com"),
            ("profile_name", "Backup POS"),
            ("target_user", "other-cashier@example.com"),
            ("request_ip", "198.51.100.5"),
        ):
            changed_identity = {**identity, field_name: replacement}
            self.assertNotEqual(
                base_key,
                self.employees._cashier_pin_attempt_key(**changed_identity),
            )

    def test_native_tracker_configuration_has_exact_five_failure_window(self):
        tracker_instance = object()
        tracker_class = Mock(return_value=tracker_instance)
        auth_module = types.ModuleType("frappe.auth")
        auth_module.LoginAttemptTracker = tracker_class

        with patch.dict(sys.modules, {"frappe.auth": auth_module}):
            result = self.production_create_cashier_pin_attempt_tracker("attempt-key")

        self.assertIs(result, tracker_instance)
        tracker_class.assert_called_once_with(
            "attempt-key",
            max_consecutive_login_attempts=4,
            lock_interval=300,
        )

    def test_attempt_updates_use_site_scoped_distributed_redis_lock(self):
        lock_instance = object()
        cache = types.SimpleNamespace(
            make_key=Mock(return_value=b"site|attempt-key:lock"),
            lock=Mock(return_value=lock_instance),
        )
        self.employees.frappe.cache = cache

        result = self.production_create_cashier_pin_attempt_lock("attempt-key")

        self.assertIs(result, lock_instance)
        cache.make_key.assert_called_once_with("attempt-key:lock")
        cache.lock.assert_called_once_with(
            b"site|attempt-key:lock",
            timeout=10,
            blocking_timeout=2,
        )

    def test_five_failed_pins_lock_only_that_target_with_generic_error(self):
        class FakeUserDoc:
            name = "backup@example.com"
            full_name = "Backup Cashier"
            enabled = 1
            posa_is_pos_supervisor = 0

            def __init__(self):
                self.password_reads = 0

            def get_password(self, fieldname):
                self.password_reads += 1
                return "1234"

        user_doc = FakeUserDoc()
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "backup@example.com"}]
            if doctype == "POS Profile User"
            else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: user_doc
        self.employees.activate_verified_cashier = Mock()

        for _ in range(self.employees.CASHIER_PIN_MAX_FAILED_ATTEMPTS):
            with self.assertRaises(Exception) as failure:
                self.employees.verify_terminal_employee_pin(
                    "Main POS", "backup@example.com", "0000"
                )
            self.assertEqual(str(failure.exception), "Invalid cashier PIN.")

        with self.assertRaises(Exception) as locked:
            self.employees.verify_terminal_employee_pin(
                "Main POS", "backup@example.com", "1234"
            )

        self.assertEqual(str(locked.exception), "Invalid cashier PIN.")
        self.assertEqual(user_doc.password_reads, 5)
        self.assertEqual(list(self.pin_attempt_state.values()), [5])
        self.employees.activate_verified_cashier.assert_not_called()

    def test_cashier_pin_lockout_is_isolated_to_target_cashier(self):
        class FakeUserDoc:
            enabled = 1
            posa_is_pos_supervisor = 0

            def __init__(self, name, pin):
                self.name = name
                self.full_name = name
                self.pin = pin

            def get_password(self, fieldname):
                return self.pin

        user_docs = {
            "first@example.com": FakeUserDoc("first@example.com", "1111"),
            "second@example.com": FakeUserDoc("second@example.com", "2222"),
        }
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": user} for user in user_docs]
            if doctype == "POS Profile User"
            else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: user_docs[name]
        self.employees.activate_verified_cashier = Mock(
            side_effect=lambda profile, user: {
                "pos_profile": profile["name"],
                "active_cashier": user,
                "locked": False,
            }
        )

        for _ in range(self.employees.CASHIER_PIN_MAX_FAILED_ATTEMPTS):
            with self.assertRaisesRegex(Exception, "Invalid cashier PIN"):
                self.employees.verify_terminal_employee_pin(
                    "Main POS", "first@example.com", "0000"
                )

        with self.assertRaisesRegex(Exception, "Invalid cashier PIN"):
            self.employees.verify_terminal_employee_pin(
                "Main POS", "first@example.com", "1111"
            )

        result = self.employees.verify_terminal_employee_pin(
            "Main POS", "second@example.com", "2222"
        )

        self.assertEqual(result["user"], "second@example.com")
        self.employees.activate_verified_cashier.assert_called_once_with(
            {"name": "Main POS"}, "second@example.com"
        )
        self.assertEqual(len(self.pin_attempt_state), 1)

    def test_successful_pin_resets_prior_failed_attempts(self):
        class FakeUserDoc:
            name = "backup@example.com"
            full_name = "Backup Cashier"
            enabled = 1
            posa_is_pos_supervisor = 0

            def get_password(self, fieldname):
                return "1234"

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "backup@example.com"}]
            if doctype == "POS Profile User"
            else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        for _ in range(4):
            with self.assertRaisesRegex(Exception, "Invalid cashier PIN"):
                self.employees.verify_terminal_employee_pin(
                    "Main POS", "backup@example.com", "0000"
                )

        self.assertEqual(list(self.pin_attempt_state.values()), [4])
        self.employees.verify_terminal_employee_pin(
            "Main POS", "backup@example.com", "1234"
        )
        self.assertEqual(self.pin_attempt_state, {})

        for _ in range(self.employees.CASHIER_PIN_MAX_FAILED_ATTEMPTS):
            with self.assertRaisesRegex(Exception, "Invalid cashier PIN"):
                self.employees.verify_terminal_employee_pin(
                    "Main POS", "backup@example.com", "0000"
                )

        with self.assertRaisesRegex(Exception, "Invalid cashier PIN"):
            self.employees.verify_terminal_employee_pin(
                "Main POS", "backup@example.com", "1234"
            )

    def test_attempt_guard_failure_is_fail_closed_without_client_bypass(self):
        class FakeUserDoc:
            name = "backup@example.com"
            full_name = "Backup Cashier"
            enabled = 1
            posa_is_pos_supervisor = 0

            def get_password(self, fieldname):
                raise AssertionError("PIN must not be read without the attempt lock")

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "backup@example.com"}]
            if doctype == "POS Profile User"
            else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()
        self.employees._create_cashier_pin_attempt_lock = Mock(
            side_effect=RuntimeError("Redis unavailable")
        )
        self.employees.activate_verified_cashier = Mock()

        with self.assertRaises(Exception) as failure:
            self.employees.verify_terminal_employee_pin(
                "Main POS", "backup@example.com", "1234"
            )

        self.assertEqual(str(failure.exception), "Invalid cashier PIN.")
        self.employees.activate_verified_cashier.assert_not_called()

    def test_get_cashier_pin_status_reports_existing_pin(self):
        self.employees.frappe.get_roles = lambda user=None: ["POS Awesome Supervisor"]

        class FakeUserDoc:
            def __init__(self):
                self.name = "cashier@example.com"
                self.full_name = "Main Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 1

            def get_password(self, fieldname):
                self.last_password_field = fieldname
                return "4321"

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        result = self.employees.get_cashier_pin_status("Main POS", "cashier@example.com")

        self.assertTrue(result["has_pin"])
        self.assertTrue(result["is_supervisor"])

    def test_save_cashier_pin_updates_password_field(self):
        self.employees.frappe.get_roles = lambda user=None: []

        class FakeUserDoc:
            def __init__(self):
                self.name = "cashier@example.com"
                self.full_name = "Main Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 0
                self.flags = types.SimpleNamespace()
                self.saved = False
                self.saved_value = None

            def get_password(self, fieldname):
                return ""

            def set(self, fieldname, value):
                self.saved_field = fieldname
                self.saved_value = value

            def save(self, ignore_permissions=False):
                self.saved = ignore_permissions

        user_doc = FakeUserDoc()
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: user_doc

        result = self.employees.save_cashier_pin(
            "Main POS",
            "cashier@example.com",
            "5678",
        )

        self.assertEqual(user_doc.saved_field, "posa_pos_pin")
        self.assertEqual(user_doc.saved_value, "5678")
        self.assertTrue(user_doc.saved)
        self.assertTrue(result["has_pin"])

    def test_save_cashier_pin_requires_current_pin_when_one_exists(self):
        self.employees.frappe.get_roles = lambda user=None: []

        class FakeUserDoc:
            def __init__(self):
                self.name = "cashier@example.com"
                self.full_name = "Main Cashier"
                self.enabled = 1
                self.posa_is_pos_supervisor = 0
                self.flags = types.SimpleNamespace()

            def get_password(self, fieldname):
                return "4321"

            def set(self, fieldname, value):
                raise AssertionError("PIN should not be updated when current PIN is invalid")

            def save(self, ignore_permissions=False):
                raise AssertionError("User doc should not save when current PIN is invalid")

        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: FakeUserDoc()

        with self.assertRaisesRegex(Exception, "Current PIN is incorrect."):
            self.employees.save_cashier_pin(
                "Main POS",
                "cashier@example.com",
                "5678",
                "0000",
            )

    def test_forged_profile_is_rejected_before_terminal_users_are_loaded(self):
        denied = Mock(side_effect=PermissionError("not assigned to Forged POS"))
        self.employees.get_authorized_pos_profile = denied
        self.employees.frappe.get_all = Mock(
            side_effect=AssertionError("terminal users must not load for an unauthorized profile")
        )

        forged_profile = {"name": "Forged POS", "company": "Victim Co"}
        with self.assertRaisesRegex(PermissionError, "not assigned"):
            self.employees.get_terminal_employees(forged_profile)

        denied.assert_called_once_with(forged_profile)
        self.employees.frappe.get_all.assert_not_called()

    def test_ordinary_cashier_cannot_write_another_cashier_pin(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.user_can_manage_pos = Mock(return_value=False)
        self.employees.frappe.get_all = Mock(
            side_effect=AssertionError("target membership must not be queried before authorization")
        )
        self.employees.frappe.get_doc = Mock(
            side_effect=AssertionError("target user must not load before authorization")
        )

        with self.assertRaisesRegex(PermissionError, "only manage your own cashier PIN"):
            self.employees.save_cashier_pin(
                "Main POS",
                "supervisor@example.com",
                "5678",
            )

        self.employees.user_can_manage_pos.assert_called_once_with("cashier@example.com")
        self.employees.frappe.get_all.assert_not_called()
        self.employees.frappe.get_doc.assert_not_called()

    def test_ordinary_cashier_cannot_read_another_cashier_pin_status(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.user_can_manage_pos = Mock(return_value=False)

        with self.assertRaisesRegex(PermissionError, "only manage your own cashier PIN"):
            self.employees.get_cashier_pin_status("Main POS", "manager@example.com")

    def test_supervisor_can_write_assigned_cashier_pin(self):
        self.employees.frappe.session.user = "supervisor@example.com"
        self.employees.user_can_manage_pos = Mock(return_value=True)

        class FakeUserDoc:
            name = "cashier@example.com"
            full_name = "Main Cashier"
            enabled = 1
            posa_is_pos_supervisor = 0
            flags = types.SimpleNamespace()

            def __init__(self):
                self.saved_value = None

            def get_password(self, fieldname):
                return ""

            def set(self, fieldname, value):
                self.saved_value = value

            def save(self, ignore_permissions=False):
                self.saved = ignore_permissions

        user_doc = FakeUserDoc()
        self.employees.frappe.get_all = lambda doctype, **kwargs: (
            [{"user": "cashier@example.com"}] if doctype == "POS Profile User" else []
        )
        self.employees.frappe.get_doc = lambda doctype, name: user_doc
        self.employees.frappe.get_roles = lambda user=None: []

        result = self.employees.save_cashier_pin(
            "Main POS",
            "cashier@example.com",
            "5678",
        )

        self.assertEqual(user_doc.saved_value, "5678")
        self.assertTrue(user_doc.saved)
        self.assertTrue(result["has_pin"])
        self.employees.user_can_manage_pos.assert_called_once_with("supervisor@example.com")

    def test_cashier_may_manage_own_pin_without_supervisor_role(self):
        self.employees.frappe.session.user = "cashier@example.com"
        self.employees.user_can_manage_pos = Mock(
            side_effect=AssertionError("self-service must not require a privileged role")
        )

        self.employees._require_pin_management_access("Main POS", "cashier@example.com")

        self.employees.user_can_manage_pos.assert_not_called()

    def test_server_verified_active_cashier_may_manage_own_pin(self):
        self.employees.frappe.session.user = "terminal-login@example.com"
        self.employees.user_can_manage_pos = Mock(return_value=False)
        self.employees.get_active_terminal_cashier = Mock(
            return_value="cashier@example.com"
        )

        self.employees._require_pin_management_access("Main POS", "cashier@example.com")

        self.employees.get_active_terminal_cashier.assert_called_once_with("Main POS")


if __name__ == "__main__":
    unittest.main()
