# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import cint
from posawesome.posawesome.api.status_updater import StatusUpdater


MANAGER_ROLES = {"System Manager", "Administrator"}


def _is_manager():
    return bool(MANAGER_ROLES.intersection(set(frappe.get_roles() or [])))


class POSOpeningShift(StatusUpdater):
    def validate(self):
        self.validate_pos_profile_and_cashier()
        self.set_status()

    def validate_pos_profile_and_cashier(self):
        pos_profile = frappe.get_doc("POS Profile", self.pos_profile)
        if cint(pos_profile.disabled):
            frappe.throw(_("POS Profile {0} is disabled.").format(pos_profile.name))

        if self.company != pos_profile.company:
            frappe.throw(
                _("POS Profile {} does not belongs to company {}".format(self.pos_profile, self.company))
            )

        has_assignments = frappe.db.exists("POS Profile User", {"parent": pos_profile.name})
        has_user_assignment = frappe.db.exists(
            "POS Profile User",
            {"parent": pos_profile.name, "user": self.user},
        )
        if has_assignments and not has_user_assignment:
            frappe.throw(_("User {0} is not assigned to POS Profile {1}.").format(self.user, pos_profile.name))

        if self.user != frappe.session.user and not _is_manager():
            frappe.throw(_("You are not allowed to create opening shifts for another user."))

        if not cint(frappe.db.get_value("User", self.user, "enabled")):
            frappe.throw(_("User {} has been disabled. Please select valid user/cashier".format(self.user)))

    def on_submit(self):
        self.set_status(update=True)
