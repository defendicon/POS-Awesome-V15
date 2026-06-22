# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint
from frappe.model.document import Document
from posawesome.posawesome.api.status_updater import StatusUpdater


class POSOpeningShift(StatusUpdater):
    def validate(self):
        self.validate_pos_profile_and_cashier()
        self.validate_unique_open_shift()
        self.set_status()

    def validate_unique_open_shift(self):
        """Reject creating a second open shift for the same user + POS Profile.

        Note: this is a best-effort guard at validate time. A truly
        race-proof solution would also need a DB-level partial unique
        constraint on (user, pos_profile, status='Open'); recommended as a
        follow-up.
        """
        existing = frappe.db.get_value(
            "POS Opening Shift",
            {
                "user": self.user,
                "pos_profile": self.pos_profile,
                "status": "Open",
                "docstatus": 1,
                "name": ["!=", self.name],
            },
            "name",
        )
        if existing:
            frappe.throw(
                _(
                    "User {0} already has an open POS shift {1} for POS Profile {2}. "
                    "Close it before opening a new one."
                ).format(self.user, existing, self.pos_profile)
            )

    def validate_pos_profile_and_cashier(self):
        if self.company != frappe.db.get_value("POS Profile", self.pos_profile, "company"):
            frappe.throw(
                _("POS Profile {} does not belongs to company {}".format(self.pos_profile, self.company))
            )

        if not cint(frappe.db.get_value("User", self.user, "enabled")):
            frappe.throw(_("User {} has been disabled. Please select valid user/cashier".format(self.user)))

    def on_submit(self):
        self.set_status(update=True)
