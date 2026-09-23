import unittest
from inspect import unwrap
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.api import quotations, sales_orders, shifts
from posawesome.posawesome.api.item_processing import price


class FakeDoc(dict):
    def __init__(self, **values):
        super().__init__(**values)
        self.flags = SimpleNamespace(ignore_permissions=False)
        self.permission_checks = []

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc

    def check_permission(self, permission_type):
        self.permission_checks.append(permission_type)


class TestCriticalPosWrites(unittest.TestCase):
    def setUp(self):
        self.profile = FakeDoc(
            name="POS-1",
            company="RetailMind",
            selling_price_list="Standard Selling",
            payments=[{"mode_of_payment": "Cash"}],
        )

    def test_sales_order_payload_uses_canonical_profile_values(self):
        with (
            patch.object(sales_orders, "get_authorized_pos_profile", return_value=self.profile),
            patch.object(sales_orders, "require_pos_profile_feature") as feature_gate,
        ):
            payload, profile = sales_orders._authorized_sales_order_payload(
                {
                    "doctype": "Sales Invoice",
                    "company": "RetailMind",
                    "pos_profile": "POS-1",
                }
            )

        self.assertIs(profile, self.profile)
        self.assertEqual(payload["doctype"], "Sales Order")
        self.assertEqual(payload["company"], "RetailMind")
        self.assertEqual(payload["pos_profile"], "POS-1")
        feature_gate.assert_called_once()

    def test_quotation_payload_uses_canonical_profile_values(self):
        with (
            patch.object(quotations, "get_authorized_pos_profile", return_value=self.profile),
            patch.object(quotations, "require_pos_profile_feature") as feature_gate,
        ):
            payload, profile = quotations._authorized_quotation_payload(
                {
                    "doctype": "Sales Invoice",
                    "company": "RetailMind",
                    "pos_profile": "POS-1",
                }
            )

        self.assertIs(profile, self.profile)
        self.assertEqual(payload["doctype"], "Quotation")
        self.assertEqual(payload["company"], "RetailMind")
        self.assertEqual(payload["pos_profile"], "POS-1")
        feature_gate.assert_called_once()

    def test_sales_order_rejects_payment_method_outside_profile(self):
        fake_frappe = SimpleNamespace(
            PermissionError=PermissionError,
            throw=lambda message, exception=None: (_ for _ in ()).throw((exception or Exception)(message)),
        )
        with (
            patch.object(sales_orders, "frappe", fake_frappe),
            patch.object(sales_orders, "get_authorized_pos_profile", return_value=self.profile),
            patch.object(sales_orders, "require_pos_profile_feature"),
        ):
            with self.assertRaisesRegex(PermissionError, "not available"):
                sales_orders._authorized_sales_order_payload(
                    {
                        "company": "RetailMind",
                        "pos_profile": "POS-1",
                        "payments": [{"mode_of_payment": "Wire Transfer", "amount": 10}],
                    }
                )

    def test_price_update_rejects_a_price_list_outside_profile_context(self):
        fake_frappe = SimpleNamespace(
            PermissionError=PermissionError,
            throw=lambda message, exception=None: (_ for _ in ()).throw((exception or Exception)(message)),
        )
        with (
            patch.object(price, "frappe", fake_frappe),
            patch.object(price, "get_authorized_pos_profile", return_value=self.profile),
            patch.object(price, "require_pos_profile_feature"),
            patch.object(
                price,
                "get_authorized_pos_item",
                return_value=FakeDoc(stock_uom="Nos", uoms=[]),
            ),
            patch.object(price, "_get_allowed_price_lists", return_value={"Standard Selling"}),
        ):
            with self.assertRaisesRegex(PermissionError, "not available"):
                unwrap(price.update_price_list_rate)(
                    "ITEM-1",
                    "Wholesale",
                    100,
                    pos_profile="POS-1",
                )

    def test_opening_shift_uses_session_and_canonical_profile(self):
        created = {}

        class OpeningDoc(FakeDoc):
            def set(self, fieldname, value):
                self[fieldname] = value

            def insert(self, ignore_permissions=False):
                self.inserted_with_permissions_ignored = ignore_permissions

            def as_dict(self):
                return dict(self)

        def get_doc(value, name=None):
            if isinstance(value, dict):
                created.update(value)
                return OpeningDoc(**value)
            return FakeDoc(name=name)

        fake_frappe = SimpleNamespace(
            PermissionError=PermissionError,
            db=SimpleNamespace(exists=Mock(return_value=False)),
            get_doc=get_doc,
            throw=lambda message, exception=None: (_ for _ in ()).throw((exception or Exception)(message)),
            utils=SimpleNamespace(get_datetime=lambda: "now", getdate=lambda: "today"),
        )
        with (
            patch.object(shifts, "frappe", fake_frappe),
            patch.object(shifts, "get_authorized_pos_profile", return_value=self.profile),
            patch.object(shifts, "get_authenticated_pos_user", return_value="cashier@example.com"),
            patch.object(shifts, "update_opening_shift_data"),
        ):
            unwrap(shifts.create_opening_voucher)(
                "POS-1",
                "RetailMind",
                [{"mode_of_payment": "Cash", "opening_amount": 10}],
            )

        self.assertEqual(created["user"], "cashier@example.com")
        self.assertEqual(created["pos_profile"], "POS-1")
        self.assertEqual(created["company"], "RetailMind")

    def test_opening_shift_rejects_profile_external_payment_method(self):
        fake_frappe = SimpleNamespace(
            PermissionError=PermissionError,
            throw=lambda message, exception=None: (_ for _ in ()).throw((exception or Exception)(message)),
        )
        with (
            patch.object(shifts, "frappe", fake_frappe),
            patch.object(shifts, "get_authorized_pos_profile", return_value=self.profile),
            patch.object(shifts, "get_authenticated_pos_user", return_value="cashier@example.com"),
        ):
            with self.assertRaisesRegex(PermissionError, "outside this POS Profile"):
                unwrap(shifts.create_opening_voucher)(
                    "POS-1",
                    "RetailMind",
                    [{"mode_of_payment": "Wire Transfer", "opening_amount": 10}],
                )


if __name__ == "__main__":
    unittest.main()
