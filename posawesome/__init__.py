# -*- coding: utf-8 -*-
from __future__ import unicode_literals

try:
    import frappe
except ModuleNotFoundError:  # pragma: no cover - frappe may not be installed during setup
    frappe = None

from posawesome.posawesome.erpnext_patches.account_defaults import install as install_account_defaults_patch

__version__ = "15.18.0"

install_account_defaults_patch()


def console(*data):
    if frappe:
        frappe.publish_realtime("toconsole", data, user=frappe.session.user)
