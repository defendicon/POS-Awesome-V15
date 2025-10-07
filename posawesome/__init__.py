# -*- coding: utf-8 -*-
from __future__ import unicode_literals

try:
    import frappe
except ModuleNotFoundError:  # pragma: no cover - frappe may not be installed during setup
    frappe = None

__version__ = "15.9.2"


def console(*data):
    if frappe:
        frappe.publish_realtime("toconsole", data, user=frappe.session.user)
