from collections import defaultdict

import frappe
from frappe.utils import cint

ITEM_CHILD_DOCTYPES = {
    "Sales Invoice": "Sales Invoice Item",
    "POS Invoice": "POS Invoice Item",
    "Sales Order": "Sales Order Item",
    "Quotation": "Quotation Item",
    "Delivery Note": "Delivery Note Item",
}


def attach_document_item_previews(rows, doctype, preview_limit=4):
    """Attach a bounded, display-only item projection to document list rows."""
    if not rows:
        return rows

    child_doctype = ITEM_CHILD_DOCTYPES.get(doctype)
    if not child_doctype:
        return rows

    names = [row.get("name") for row in rows if row.get("name")]
    if not names:
        return rows

    preview_limit = max(cint(preview_limit), 1)
    filters = {"parent": ["in", names]}
    preview_rows = frappe.get_all(
        child_doctype,
        filters={**filters, "idx": ["<=", preview_limit]},
        fields=["parent", "item_code", "item_name", "qty", "uom", "rate", "amount", "idx"],
        order_by="parent asc, idx asc",
    )
    count_rows = frappe.get_all(
        child_doctype,
        filters=filters,
        fields=["parent", "count(name) as items_count"],
        group_by="parent",
    )

    previews_by_parent = defaultdict(list)
    for item in preview_rows or []:
        previews_by_parent[item.get("parent")].append(item)
    counts_by_parent = {entry.get("parent"): cint(entry.get("items_count")) for entry in count_rows or []}

    for row in rows:
        name = row.get("name")
        row["item_preview"] = previews_by_parent.get(name, [])
        row["items_count"] = counts_by_parent.get(name, len(row["item_preview"]))
    return rows
