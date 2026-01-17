# -*- coding: utf-8 -*-
# Copyright (c) 2024, yosys solutions and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe

@frappe.whitelist()
def get_print_formats(doctype):
    print_formats = frappe.get_all("Print Format", filters={"doc_type": doctype}, fields=["name"])
    return [p.name for p in print_formats]
