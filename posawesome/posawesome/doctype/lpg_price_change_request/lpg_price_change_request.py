# Copyright (c) 2026, Sungas — POS Awesome customization
# For license information, see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now


class LPGPriceChangeRequest(Document):
    def validate(self):
        self._stamp_requester()
        self._stamp_current_rate()
        self._validate_qty_window()
        self._track_approval_stamps()

    def on_submit(self):
        # Submit only allowed when fully approved (state machine enforces this).
        if self.workflow_state == "Approved":
            self._upsert_tier()

    # ------------------------------------------------------------------
    def _stamp_requester(self):
        if self.is_new() and not self.requester:
            self.requester = frappe.session.user

    def _stamp_current_rate(self):
        if self.is_new() and not self.current_rate:
            # Pick existing tier rate if present, else 0.
            tier = frappe.db.get_value(
                "LPG Outlet Price Tier",
                {
                    "item_code": self.item_code,
                    "customer_group": self.customer_group,
                    "territory": self.territory,
                    "enabled": 1,
                },
                "rate",
                order_by="modified desc",
            )
            self.current_rate = flt(tier or 0)

    def _validate_qty_window(self):
        if self.min_qty and self.max_qty and self.max_qty > 0 and self.min_qty > self.max_qty:
            frappe.throw(_("Min Qty cannot exceed Max Qty."))

    def _track_approval_stamps(self):
        """Record who approved at each stage, when the workflow state advances."""
        before = self.get_doc_before_save()
        old_state = before.workflow_state if before else None
        new_state = self.workflow_state

        if old_state == new_state:
            return

        user = frappe.session.user
        if new_state == "Pending Head of Sales":
            self.plant_manager = user
            self.plant_manager_approved_on = now()
        elif new_state == "Pending Head of Finance":
            self.head_of_sales = user
            self.head_of_sales_approved_on = now()
        elif new_state == "Approved":
            self.head_of_finance = user
            self.head_of_finance_approved_on = now()

    # ------------------------------------------------------------------
    def _upsert_tier(self):
        """Create or update the LPG Outlet Price Tier from this approved request."""
        existing = frappe.db.get_value(
            "LPG Outlet Price Tier",
            {
                "item_code": self.item_code,
                "customer_group": self.customer_group,
                "territory": self.territory,
                "min_qty": self.min_qty or 0,
            },
            "name",
        )
        if existing:
            tier = frappe.get_doc("LPG Outlet Price Tier", existing)
            tier.rate = self.proposed_rate
            tier.max_qty = self.max_qty or 0
            tier.valid_from = self.valid_from
            tier.valid_to = self.valid_to
            tier.enabled = 1
            tier.notes = (
                (tier.notes or "")
                + f"\nUpdated by PCR {self.name} on {now()} (was {self.current_rate})"
            ).strip()
            tier.save(ignore_permissions=True)
        else:
            tier = frappe.get_doc({
                "doctype": "LPG Outlet Price Tier",
                "item_code": self.item_code,
                "customer_group": self.customer_group,
                "territory": self.territory,
                "min_qty": self.min_qty or 0,
                "max_qty": self.max_qty or 0,
                "rate": self.proposed_rate,
                "currency": frappe.db.get_single_value("Global Defaults", "default_currency") or "NGN",
                "valid_from": self.valid_from,
                "valid_to": self.valid_to,
                "enabled": 1,
                "notes": f"Created by PCR {self.name} on {now()}",
            })
            tier.insert(ignore_permissions=True)

        # Stamp the link back.
        self.db_set("created_tier", tier.name)
