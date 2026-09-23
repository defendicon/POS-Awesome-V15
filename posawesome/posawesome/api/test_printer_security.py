import unittest
from inspect import unwrap
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.api import printer_api


class TestPrinterSecurity(unittest.TestCase):
    def setUp(self):
        self.fake_frappe = SimpleNamespace(
            PermissionError=PermissionError,
            has_permission=Mock(return_value=True),
            throw=lambda message, exception=None: (_ for _ in ()).throw((exception or Exception)(message)),
        )

    def test_private_printer_endpoint_is_canonicalized(self):
        with (
            patch.object(printer_api, "frappe", self.fake_frappe),
            patch.object(printer_api, "_", side_effect=lambda value: value),
        ):
            self.assertEqual(
                printer_api.validate_printer_endpoint("192.168.1.10", 9100),
                ("192.168.1.10", 9100),
            )

    def test_metadata_loopback_public_dns_and_non_printer_ports_are_rejected(self):
        invalid_endpoints = (
            ("169.254.169.254", 80),
            ("100.64.0.1", 9100),
            ("127.0.0.1", 9100),
            ("8.8.8.8", 443),
            ("printer.internal", 9100),
            ("192.168.1.10", 22),
            ("192.168.1.10", "9100.0"),
            ("::ffff:127.0.0.1", 9100),
        )
        with (
            patch.object(printer_api, "frappe", self.fake_frappe),
            patch.object(printer_api, "_", side_effect=lambda value: value),
        ):
            for address, port in invalid_endpoints:
                with self.subTest(address=address, port=port):
                    with self.assertRaises(Exception):
                        printer_api.validate_printer_endpoint(address, port)

    def test_operational_access_is_required_before_empty_failover_result(self):
        with patch.object(
            printer_api,
            "_require_operational_printer_access",
            side_effect=PermissionError("denied"),
        ):
            with self.assertRaises(PermissionError):
                unwrap(printer_api.get_printers_for_failover)("")

    def test_printer_profile_permission_is_required(self):
        self.fake_frappe.has_permission.return_value = False
        with (
            patch.object(printer_api, "frappe", self.fake_frappe),
            patch.object(printer_api, "get_authenticated_pos_user", return_value="cashier@example.com"),
            patch.object(printer_api, "_", side_effect=lambda value: value),
        ):
            with self.assertRaisesRegex(PermissionError, "not permitted"):
                printer_api._require_printer_permission("write")

    def test_connection_uses_tcp_probe_without_http_request(self):
        connection = Mock()
        connection.__enter__ = Mock(return_value=connection)
        connection.__exit__ = Mock(return_value=False)
        with (
            patch.object(printer_api, "_require_printer_permission"),
            patch.object(
                printer_api,
                "validate_printer_endpoint",
                return_value=("192.168.1.10", 9100),
            ),
            patch.object(printer_api.socket, "create_connection", return_value=connection) as probe,
        ):
            result = unwrap(printer_api.test_connection)(
                "Receipt Printer",
                ip_address="192.168.1.10",
                port=9100,
            )

        self.assertTrue(result["success"])
        probe.assert_called_once_with(("192.168.1.10", 9100), timeout=5)


if __name__ == "__main__":
    unittest.main()
