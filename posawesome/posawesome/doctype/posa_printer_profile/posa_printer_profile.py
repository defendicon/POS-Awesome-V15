# Copyright (c) 2026, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from posawesome.posawesome.api.printer_api import validate_printer_endpoint


class POSAPrinterProfile(Document):
    def validate(self):
        endpoint = validate_printer_endpoint(self.ip_address, self.port)
        if endpoint:
            self.ip_address, self.port = endpoint
        self.validate_default_per_group()

    def validate_default_per_group(self):
        if self.is_default and self.printer_group:
            existing = frappe.db.get_value(
                "POSA Printer Profile",
                filters={
                    "printer_group": self.printer_group,
                    "is_default": 1,
                    "name": ["!=", self.name],
                    "disabled": 0,
                },
            )
            if existing:
                frappe.db.set_value("POSA Printer Profile", existing, "is_default", 0)
