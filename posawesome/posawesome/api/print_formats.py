# -*- coding: utf-8 -*-
# Copyright (c) 2024, yosys solutions and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.utils import cstr

@frappe.whitelist()
def get_print_formats(doctype):
    doctype = cstr(doctype).strip()
    if not doctype or not frappe.db.exists("DocType", doctype):
        return []
    if not frappe.has_permission(doctype, "read") and "System Manager" not in frappe.get_roles():
        frappe.throw(frappe._("Not permitted to access print formats for {0}.").format(doctype))
    print_formats = frappe.get_all("Print Format", filters={"doc_type": doctype}, fields=["name"])
    return [p.name for p in print_formats]
