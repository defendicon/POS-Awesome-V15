"""
Feature 6 — Phone-or-name autocomplete for POS Awesome.

Provides a single fast endpoint that POS Awesome's customer search input can
call as the cashier types. Matches on:
    - Customer name (LIKE / FULLTEXT)
    - Mobile number (exact OR LIKE on canonical form)
    - Customer code (the docname)
    - Email

Returns the top N matches with the fields POS Awesome needs to auto-populate
the customer panel (mobile, group, territory, balance hint).
"""

from __future__ import annotations

import frappe
from frappe import _

from posawesome.posawesome.api.customer_mobile import normalize_mobile
from posawesome.posawesome.api.customers import get_customer_group_condition


@frappe.whitelist()
def search_customers_by_phone_or_name(
    query: str = "",
    pos_profile: str = "",
    limit: int = 20,
) -> list[dict]:
    """
    Return up to `limit` matching customers, prioritizing phone-number hits.

    The query is matched against (in priority order):
        1. mobile_no exact (canonical form)
        2. mobile_no starts-with
        3. name (docname) starts-with
        4. customer_name LIKE
        5. email_id LIKE
    """
    query = (query or "").strip()
    if not query:
        return []

    limit = min(int(limit or 20), 100)

    # Customer-group restriction from POS Profile, if provided.
    group_clause = ""
    if pos_profile:
        try:
            import json

            condition = get_customer_group_condition(json.loads(pos_profile))
            if condition:
                # condition is already a SQL fragment like `customer_group in (...)`.
                group_clause = f"AND ({condition})"
        except Exception:
            pass  # Fall back to no group filter if pos_profile is malformed.

    canonical_phone = normalize_mobile(query)
    like = f"%{query}%"
    starts = f"{query}%"
    phone_starts = f"{canonical_phone}%" if canonical_phone else f"%{query}%"

    rows = frappe.db.sql(
        f"""
        SELECT
            name,
            customer_name,
            mobile_no,
            email_id,
            customer_group,
            territory,
            CASE
                WHEN mobile_no = %(canonical)s          THEN 0
                WHEN mobile_no LIKE %(phone_starts)s     THEN 1
                WHEN name LIKE %(starts)s                THEN 2
                WHEN customer_name LIKE %(starts)s       THEN 3
                WHEN customer_name LIKE %(like)s         THEN 4
                WHEN email_id LIKE %(like)s              THEN 5
                ELSE 6
            END AS rank
        FROM `tabCustomer`
        WHERE disabled = 0
          AND (
                mobile_no = %(canonical)s
             OR mobile_no LIKE %(phone_starts)s
             OR name LIKE %(starts)s
             OR customer_name LIKE %(like)s
             OR email_id LIKE %(like)s
          )
          {group_clause}
        ORDER BY rank ASC, customer_name ASC
        LIMIT %(limit)s
        """,
        {
            "canonical": canonical_phone or query,
            "phone_starts": phone_starts,
            "starts": starts,
            "like": like,
            "limit": limit,
        },
        as_dict=True,
    )

    # Strip the synthetic rank column before returning.
    for r in rows:
        r.pop("rank", None)
    return rows
