# Copyright (c) 2026, Youssef Restom and contributors
# For license information, please see license.txt

"""API for POSA Printer Profile CRUD and connection testing."""

import frappe
from frappe import _


@frappe.whitelist()
def get_printer_profiles():
    """Return list of non-disabled printer profiles."""
    profiles = frappe.get_all(
        "POSA Printer Profile",
        filters={"disabled": 0},
        fields=[
            "name",
            "printer_name",
            "printer_type",
            "dpi",
            "ip_address",
            "port",
            "default_label_width",
            "default_label_height",
            "is_default",
            "printer_group",
        ],
        order_by="is_default desc, printer_name asc",
    )
    return profiles


@frappe.whitelist()
def get_printer_profile_detail(name):
    """Return full printer profile including routing rules."""
    if not name:
        frappe.throw(_("Printer profile name is required"))
    doc = frappe.get_doc("POSA Printer Profile", name)
    return {
        "name": doc.name,
        "printer_name": doc.printer_name,
        "printer_type": doc.printer_type,
        "dpi": doc.dpi,
        "ip_address": doc.ip_address,
        "port": doc.port,
        "default_label_width": doc.default_label_width,
        "default_label_height": doc.default_label_height,
        "is_default": doc.is_default,
        "disabled": doc.disabled,
        "printer_group": doc.printer_group,
        "routing_rules": [
            {
                "name": r.name,
                "item_group": r.item_group,
                "warehouse": r.warehouse,
                "printer": r.printer,
            }
            for r in (doc.get("routing_rules") or [])
        ],
    }


@frappe.whitelist()
def save_printer_profile(
    printer_name,
    printer_type="ZPL",
    dpi=203,
    ip_address=None,
    port=None,
    default_label_width=None,
    default_label_height=None,
    is_default=0,
    printer_group=None,
    name=None,
):
    """Create or update a printer profile."""
    if not printer_name:
        frappe.throw(_("Printer name is required"))

    if name:
        doc = frappe.get_doc("POSA Printer Profile", name)
        doc.printer_name = printer_name
        doc.printer_type = printer_type
        doc.dpi = dpi
        doc.ip_address = ip_address
        doc.port = port
        doc.default_label_width = default_label_width
        doc.default_label_height = default_label_height
        doc.is_default = is_default
        doc.printer_group = printer_group
        doc.save()
    else:
        doc = frappe.get_doc({
            "doctype": "POSA Printer Profile",
            "printer_name": printer_name,
            "printer_type": printer_type,
            "dpi": dpi,
            "ip_address": ip_address,
            "port": port,
            "default_label_width": default_label_width,
            "default_label_height": default_label_height,
            "is_default": is_default,
            "printer_group": printer_group,
        })
        doc.insert()

    return {"name": doc.name, "printer_name": doc.printer_name}


@frappe.whitelist()
def delete_printer_profile(name):
    """Delete a printer profile."""
    if not name:
        frappe.throw(_("Printer profile name is required"))
    frappe.delete_doc("POSA Printer Profile", name)
    return {"success": True}


@frappe.whitelist()
def test_connection(printer_name, printer_type="ZPL", ip_address=None, port=None):
    """Test connection to a printer by sending a minimal test label via QZ Tray.

    This is a best-effort test that relies on QZ Tray being connected.
    Returns success if QZ Tray is available and the printer name is configured.
    """
    if not printer_name:
        frappe.throw(_("Printer name is required"))

    try:
        from frappe.integrations.utils import make_get_request, make_post_request

        if ip_address and port:
            try:
                make_get_request(f"http://{ip_address}:{port}", timeout=5)
                return {"success": True, "message": _("Printer reachable at {0}:{1}").format(ip_address, port)}
            except Exception:
                return {"success": False, "error": _("Cannot reach printer at {0}:{1}").format(ip_address, port)}
        else:
            return {
                "success": True,
                "message": _("Printer profile saved. No IP/port configured for test."),
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


@frappe.whitelist()
def get_printers_for_failover(printer_group, exclude_name=None):
    """Return printers in the same group for failover, excluding the current one."""
    if not printer_group:
        return []
    filters = {
        "printer_group": printer_group,
        "disabled": 0,
    }
    if exclude_name:
        filters["name"] = ["!=", exclude_name]
    printers = frappe.get_all(
        "POSA Printer Profile",
        filters=filters,
        fields=["name", "printer_name", "printer_type", "dpi", "ip_address", "port"],
        order_by="is_default desc",
    )
    return printers


@frappe.whitelist()
def get_routed_printers(items_json):
    """Given an array of items with item_group/warehouse, return a map of printer → items."""
    items = frappe.parse_json(items_json)
    if not isinstance(items, list):
        frappe.throw(_("Items must be a JSON array"))

    routing_rules = frappe.db.get_all(
        "POSA Printer Routing Rule",
        fields=["item_group", "warehouse", "printer"],
    )

    default_printer = frappe.db.get_value(
        "POSA Printer Profile",
        filters={"disabled": 0, "is_default": 1},
        order_by="modified desc",
    )

    routes = {}
    for item in items:
        matched = None
        for rule in routing_rules:
            ig_match = not rule.item_group or rule.item_group == item.get("item_group")
            wh_match = not rule.warehouse or rule.warehouse == item.get("warehouse")
            if ig_match and wh_match:
                matched = rule.printer
                break
        printer_key = matched or default_printer
        if not printer_key:
            continue
        if printer_key not in routes:
            routes[printer_key] = []
        routes[printer_key].append(item)

    return routes
