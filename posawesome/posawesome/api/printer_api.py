# Copyright (c) 2026, Youssef Restom and contributors
# For license information, please see license.txt

"""API for POSA Printer Profile CRUD and connection testing."""

import ipaddress
import socket

import frappe
from frappe import _
from frappe.utils import cstr

from posawesome.posawesome.api.pos_access import (
    get_authenticated_pos_user,
    get_authorized_pos_profile,
)

PRINTER_PROBE_PORTS = frozenset({80, 443, 515, 631, 9100, 9101, 9102})
PRIVATE_PRINTER_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("fc00::/7"),
)


def _require_printer_permission(permission_type):
    user = get_authenticated_pos_user()
    if not frappe.has_permission("POSA Printer Profile", permission_type, user=user):
        frappe.throw(
            _("You are not permitted to {0} printer profiles.").format(permission_type),
            frappe.PermissionError,
        )
    return user


def _require_operational_printer_access():
    """Authorize a POS user without granting Printer Profile document access."""

    return get_authorized_pos_profile()


def validate_printer_endpoint(ip_address=None, port=None, *, allow_empty=True):
    """Return a canonical private printer endpoint safe for a TCP reachability probe."""

    raw_address = cstr(ip_address).strip()
    raw_port = cstr(port).strip()
    if not raw_address and not raw_port and allow_empty:
        return None
    if not raw_address or not raw_port:
        frappe.throw(_("Both printer IP address and port are required."))

    try:
        address = ipaddress.ip_address(raw_address)
    except ValueError:
        frappe.throw(_("Printer IP address must be a valid IP literal."))

    if getattr(address, "ipv4_mapped", None):
        address = address.ipv4_mapped

    if (
        not any(
            address.version == network.version and address in network for network in PRIVATE_PRINTER_NETWORKS
        )
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or address.is_reserved
    ):
        frappe.throw(_("Printer IP address must be a private network address."))

    if not raw_port.isascii() or not raw_port.isdigit():
        frappe.throw(_("Printer port must be a whole number."))
    resolved_port = int(raw_port)
    if resolved_port not in PRINTER_PROBE_PORTS:
        frappe.throw(
            _("Printer port must be one of: {0}.").format(
                ", ".join(str(value) for value in sorted(PRINTER_PROBE_PORTS))
            )
        )
    return str(address), resolved_port


@frappe.whitelist()
def get_printer_profiles():
    """Return list of non-disabled printer profiles."""
    _require_operational_printer_access()
    profiles = frappe.get_all(
        "POSA Printer Profile",
        filters={"disabled": 0},
        fields=[
            "name",
            "printer_name",
            "printer_type",
            "dpi",
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
    _require_printer_permission("read")
    doc = frappe.get_doc("POSA Printer Profile", name)
    doc.check_permission("read")
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

    _require_printer_permission("write" if name else "create")
    endpoint = validate_printer_endpoint(ip_address, port)
    if endpoint:
        ip_address, port = endpoint

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
        doc = frappe.get_doc(
            {
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
            }
        )
        doc.insert()

    return {"name": doc.name, "printer_name": doc.printer_name}


@frappe.whitelist()
def delete_printer_profile(name):
    """Delete a printer profile."""
    if not name:
        frappe.throw(_("Printer profile name is required"))
    _require_printer_permission("delete")
    frappe.delete_doc("POSA Printer Profile", name)
    return {"success": True}


@frappe.whitelist()
def test_connection(printer_name, printer_type="ZPL", ip_address=None, port=None):
    """Perform a bounded TCP reachability probe against a private printer endpoint."""
    if not printer_name:
        frappe.throw(_("Printer name is required"))

    _require_printer_permission("write")
    endpoint = validate_printer_endpoint(ip_address, port)
    if not endpoint:
        return {
            "success": True,
            "message": _("Printer profile saved. No IP/port configured for test."),
        }

    host, resolved_port = endpoint
    try:
        with socket.create_connection((host, resolved_port), timeout=5):
            pass
        return {
            "success": True,
            "message": _("Printer reachable at {0}:{1}").format(host, resolved_port),
        }
    except OSError:
        return {
            "success": False,
            "error": _("Cannot reach printer at {0}:{1}").format(host, resolved_port),
        }


@frappe.whitelist()
def get_printers_for_failover(printer_group, exclude_name=None):
    """Return printers in the same group for failover, excluding the current one."""
    _require_operational_printer_access()
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
        fields=["name", "printer_name", "printer_type", "dpi"],
        order_by="is_default desc",
    )
    return printers


@frappe.whitelist()
def get_routed_printers(items_json):
    """Given an array of items with item_group/warehouse, return a map of printer → items."""
    _require_operational_printer_access()
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
