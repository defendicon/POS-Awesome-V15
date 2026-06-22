# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

"""SSCC-18 shipping label generation using ERPNext Naming Series for atomic serials."""

import frappe
from frappe import _
from frappe.model.naming import make_autoname


def _calculate_sscc_check_digit(data: str) -> int:
    """GS1 Mod 10 check digit for the 17-digit SSCC body."""
    total = 0
    for i, ch in enumerate(data):
        d = int(ch)
        total += d * 3 if i % 2 == 0 else d
    rem = total % 10
    return 0 if rem == 0 else 10 - rem


def _format_sscc_human(sscc: str) -> str:
    """Format SSCC-18 for human display: (00) 0 1234567 890123456 8"""
    return f"(00) {sscc[0]} {sscc[1:8]} {sscc[8:17]} {sscc[17]}"


@frappe.whitelist()
def get_next_sscc_serials(company_prefix: str = "1234567", extension_digit: str = "0", count: int = 1):
    """Generate SSCC-18 serial numbers using atomic Naming Series counter.

    Args:
        company_prefix: GS1 Company Prefix (typically 7 digits).
        extension_digit: Extension digit 0-9.
        count: Number of SSCC-18 codes to generate.

    Returns:
        List of dicts with keys: sscc18, human_readable, serial_ref.
    """
    if extension_digit not in "0123456789":
        frappe.throw(_("Extension digit must be 0-9"))
    count = max(1, min(100, int(count or 1)))

    series = f"SSCC-{company_prefix}-.#####"

    serials = []
    for _ in range(count):
        name = make_autoname(series)
        serial_ref = int(name.split("-")[-1] or "0")

        padded = str(serial_ref).zfill(9)
        body = f"{extension_digit}{company_prefix}{padded}"
        check = _calculate_sscc_check_digit(body)
        sscc18 = f"{body}{check}"

        serials.append({
            "sscc18": sscc18,
            "human_readable": _format_sscc_human(sscc18),
            "serial_ref": serial_ref,
        })

    return serials
