# -*- coding: utf-8 -*-
from __future__ import unicode_literals

try:
    import frappe
except (
    ModuleNotFoundError
):  # pragma: no cover - frappe may not be installed during setup
    frappe = None

__version__ = "15.8.4"


def console(*data):
    if frappe:
        frappe.publish_realtime("toconsole", data, user=frappe.session.user)
