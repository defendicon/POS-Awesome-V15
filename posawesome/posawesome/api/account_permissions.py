from contextlib import contextmanager

import frappe


@contextmanager
def temporarily_ignore_account_permission():
    previous_value = getattr(frappe.flags, "ignore_account_permission", False)
    frappe.flags.ignore_account_permission = True
    try:
        yield
    finally:
        frappe.flags.ignore_account_permission = previous_value
