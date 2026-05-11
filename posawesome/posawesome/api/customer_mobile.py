"""
Feature 5 — Customer mobile-number uniqueness.

This module provides:
    1. `normalize_mobile(raw)` — canonicalizes "+234 80..." / "080..." / "234..." to a
       single canonical form ("234XXXXXXXXXX"). Used both at write-time and lookup.
    2. `enforce_unique_mobile(doc, method)` — Customer.validate hook that:
        - normalizes `mobile_no` in place
        - rejects duplicates (excluding the current doc)

The patch `enforce_customer_mobile_unique.py` adds a non-unique DB index on
`mobile_no` to speed up the lookup and writes any duplicates to a log doctype
without blocking migration.
"""

from __future__ import annotations

import re

import frappe
from frappe import _


_DIGITS = re.compile(r"\D+")


def normalize_mobile(raw: str | None) -> str:
    """
    Canonicalize a Nigerian mobile number to 234XXXXXXXXXX form.

    - "+234 803 123 4567"  -> "2348031234567"
    - "08031234567"        -> "2348031234567"
    - "8031234567"         -> "2348031234567"
    - "234-803-123-4567"   -> "2348031234567"
    - ""                   -> ""
    """
    if not raw:
        return ""
    digits = _DIGITS.sub("", str(raw))
    if not digits:
        return ""
    if digits.startswith("234"):
        return digits
    if digits.startswith("0") and len(digits) == 11:
        return "234" + digits[1:]
    if len(digits) == 10:
        return "234" + digits
    return digits  # Unknown prefix — keep as-is rather than mangle


def enforce_unique_mobile(doc, method=None):
    """Customer.validate hook — normalizes + enforces global uniqueness."""
    if not getattr(doc, "mobile_no", None):
        return  # Mobile-no is required for *new* customers via UI but legacy
                # imports may have empty — don't block them retroactively.

    canonical = normalize_mobile(doc.mobile_no)
    doc.mobile_no = canonical

    if not canonical:
        return

    # Look for any *other* customer with the same canonical mobile.
    existing = frappe.db.sql(
        """
        SELECT name FROM `tabCustomer`
        WHERE mobile_no = %s
          AND name != %s
          AND disabled = 0
        LIMIT 1
        """,
        (canonical, doc.name or ""),
    )
    if existing:
        frappe.throw(
            _("A customer with mobile number {0} already exists: {1}").format(
                canonical, existing[0][0]
            ),
            title=_("Duplicate Mobile Number"),
        )
