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
        self.set_status()

    def validate_pos_profile_and_cashier(self):
        if self.company != frappe.db.get_value("POS Profile", self.pos_profile, "company"):
            frappe.throw(
                _("POS Profile {} does not belongs to company {}".format(self.pos_profile, self.company))
            )

        if not cint(frappe.db.get_value("User", self.user, "enabled")):
            frappe.throw(_("User {} has been disabled. Please select valid user/cashier".format(self.user)))

    def on_submit(self):
        self.set_status(update=True)


def validate_active_shift(doc):
    if doc.posa_pos_opening_shift and doc.pos_profile and doc.is_pos:
        # check if shift is open
        shift = frappe.get_cached_doc("POS Opening Shift", doc.posa_pos_opening_shift)
        if shift.status != "Open":
            frappe.throw(_("POS Shift {0} is not open").format(shift.name))
        # check if shift is for the same profile
        if shift.pos_profile != doc.pos_profile:
            frappe.throw(_("POS Opening Shift {0} is not for the same POS Profile").format(shift.name))
        # check if shift is for the same company
        if shift.company != doc.company:
            frappe.throw(_("POS Opening Shift {0} is not for the same company").format(shift.name))
