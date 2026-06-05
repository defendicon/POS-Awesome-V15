# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BarcodeLabelTemplate(Document):
    def validate(self):
        if self.layout_json:
            try:
                parsed = frappe.parse_json(self.layout_json)
                if not isinstance(parsed, list):
                    frappe.throw("Layout JSON must be a JSON array of label objects")
            except (frappe.exceptions.InvalidJSONError, ValueError, TypeError):
                frappe.throw("Layout JSON is not valid JSON")
