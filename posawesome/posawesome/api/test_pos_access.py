import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from posawesome.posawesome.api import pos_access


class FakeDoc(dict):
    def __init__(self, *args, denied_permissions=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.denied_permissions = set(denied_permissions or [])
        self.permission_checks = []

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc

    def check_permission(self, permission_type):
        self.permission_checks.append(permission_type)
        if permission_type in self.denied_permissions:
            raise PermissionError(f"missing {permission_type} permission")


class TestPosAccess(unittest.TestCase):
    def setUp(self):
        self.profile = FakeDoc(
            name="POS-1",
            company="RetailMind",
            disabled=0,
            posa_allow_item_quick_edit=0,
            posa_show_template_items=0,
            posa_hide_variants_items=0,
        )
        self.company = FakeDoc(name="RetailMind")
        self.item = FakeDoc(
            name="ITEM-1",
            item_code="ITEM-1",
            item_group="Medicines",
            disabled=0,
            is_sales_item=1,
            is_fixed_asset=0,
            has_variants=0,
            variant_of="",
        )
        self.assigned_users = {"cashier@example.com"}
        self.docs = {
            ("POS Profile", "POS-1"): self.profile,
            ("Company", "RetailMind"): self.company,
            ("Item", "ITEM-1"): self.item,
        }

        def exists(doctype, value):
            if doctype == "POS Profile":
                return (doctype, value) in self.docs
            if doctype == "POS Profile User":
                return value.get("parent") == "POS-1" and value.get("user") in self.assigned_users
            return False

        def get_doc(doctype, name):
            return self.docs[(doctype, name)]

        def throw(message, exception=None):
            raise (exception or Exception)(message)

        self.fake_frappe = SimpleNamespace(
            session=SimpleNamespace(user="cashier@example.com"),
            PermissionError=PermissionError,
            db=SimpleNamespace(exists=exists),
            get_doc=get_doc,
            get_roles=lambda user: ["Sales User", "POS Awesome Supervisor"],
            has_permission=lambda *args, **kwargs: True,
            throw=throw,
        )

    def test_forged_profile_fields_are_discarded(self):
        forged_profile = {
            "name": "POS-1",
            "company": "Attacker Co",
            "posa_allow_item_quick_edit": 1,
        }
        with patch.object(pos_access, "frappe", self.fake_frappe):
            result = pos_access.get_authorized_pos_profile(forged_profile, company="RetailMind")

        self.assertIs(result, self.profile)
        self.assertEqual(result.get("posa_allow_item_quick_edit"), 0)
        self.assertEqual(self.profile.permission_checks, ["read"])
        self.assertEqual(self.company.permission_checks, ["read"])

    def test_guest_is_rejected_before_profile_lookup(self):
        self.fake_frappe.session.user = "Guest"
        get_doc = Mock(side_effect=AssertionError("must not load a document for Guest"))
        self.fake_frappe.get_doc = get_doc

        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "Sign in"):
                pos_access.get_authorized_pos_profile("POS-1")

        get_doc.assert_not_called()

    def test_unassigned_cashier_cannot_select_another_profile(self):
        self.assigned_users.clear()
        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "not assigned"):
                pos_access.get_authorized_pos_profile("POS-1")

    def test_administrator_keeps_access_without_profile_assignment(self):
        self.assigned_users.clear()
        self.fake_frappe.session.user = "Administrator"
        self.fake_frappe.get_roles = lambda user: []

        with patch.object(pos_access, "frappe", self.fake_frappe):
            result = pos_access.get_authorized_pos_profile("POS-1")

        self.assertIs(result, self.profile)

    def test_supervisor_role_does_not_bypass_profile_assignment(self):
        self.assigned_users.clear()
        self.fake_frappe.get_roles = lambda user: ["POS Awesome Supervisor"]

        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "not assigned"):
                pos_access.get_authorized_pos_profile("POS-1")

    def test_pos_manager_may_access_unassigned_profile(self):
        self.assigned_users.clear()
        self.fake_frappe.get_roles = lambda user: ["POS Manager"]

        with patch.object(pos_access, "frappe", self.fake_frappe):
            result = pos_access.get_authorized_pos_profile("POS-1")

        self.assertIs(result, self.profile)

    def test_supervisor_or_manager_gate_uses_authenticated_session_identity(self):
        self.fake_frappe.session.user = "cashier@example.com"
        self.fake_frappe.get_roles = lambda user: ["Sales User"]

        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "POS supervisor or manager"):
                pos_access.require_pos_supervisor_or_manager()

        self.fake_frappe.session.user = "supervisor@example.com"
        self.fake_frappe.get_roles = lambda user: ["POS Awesome Supervisor"]
        with patch.object(pos_access, "frappe", self.fake_frappe):
            self.assertEqual(
                pos_access.require_pos_supervisor_or_manager(),
                "supervisor@example.com",
            )

    def test_item_manager_profile_access_does_not_grant_pin_or_dashboard_authority(self):
        self.fake_frappe.session.user = "item-manager@example.com"
        self.fake_frappe.get_roles = lambda user: ["Item Manager"]

        with patch.object(pos_access, "frappe", self.fake_frappe):
            self.assertTrue(pos_access.user_is_pos_profile_manager("item-manager@example.com"))
            self.assertFalse(pos_access.user_can_manage_pos("item-manager@example.com"))
            with self.assertRaisesRegex(PermissionError, "POS supervisor or manager"):
                pos_access.require_pos_supervisor_or_manager()

    def test_requested_company_must_match_canonical_profile_company(self):
        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "not available for company"):
                pos_access.get_authorized_pos_profile("POS-1", company="Other Co")

    def test_item_must_be_readable_and_in_an_allowed_profile_group(self):
        with (
            patch.object(pos_access, "frappe", self.fake_frappe),
            patch.object(pos_access, "get_item_groups", return_value=["Medicines"]),
            patch.object(pos_access, "expand_item_groups", side_effect=lambda groups: groups),
        ):
            result = pos_access.get_authorized_pos_item("ITEM-1", self.profile)

        self.assertIs(result, self.item)
        self.assertEqual(self.item.permission_checks, ["read"])

    def test_item_outside_profile_group_is_rejected(self):
        with (
            patch.object(pos_access, "frappe", self.fake_frappe),
            patch.object(pos_access, "get_item_groups", return_value=["Other Group"]),
            patch.object(pos_access, "expand_item_groups", side_effect=lambda groups: groups),
        ):
            with self.assertRaisesRegex(PermissionError, "not available"):
                pos_access.get_authorized_pos_item("ITEM-1", self.profile)

    def test_doctype_permission_is_required_for_raw_history_queries(self):
        self.fake_frappe.has_permission = lambda *args, **kwargs: False
        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "not permitted to read Sales Invoice"):
                pos_access.assert_doctype_read_permission("Sales Invoice")

    def test_disabled_profile_feature_is_rejected(self):
        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "disabled for POS Profile POS-1"):
                pos_access.require_pos_profile_feature(
                    self.profile,
                    "posa_allow_item_quick_edit",
                    "Item quick edit",
                )

    def test_existing_document_must_match_profile_boundary(self):
        foreign_doc = FakeDoc(company="Other Co", pos_profile="POS-2")
        with patch.object(pos_access, "frappe", self.fake_frappe):
            with self.assertRaisesRegex(PermissionError, "not available for POS Profile POS-1"):
                pos_access.assert_document_in_pos_profile(foreign_doc, self.profile)

        self.assertEqual(foreign_doc.permission_checks, ["read"])


if __name__ == "__main__":
    unittest.main()
