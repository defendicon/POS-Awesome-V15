# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BarcodePrintLog(Document):
    def validate(self):
        if self.verification_status == "Verified" and not self.verified_at:
            self.verified_at = frappe.utils.now_datetime()
            self.verified_by = frappe.session.user

    def before_insert(self):
        if not self.timestamp:
            self.timestamp = frappe.utils.now_datetime()
