# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

"""API for Barcode Print Log audit trail and verification."""

import frappe
from frappe import _
from frappe.utils import now_datetime


@frappe.whitelist()
def batch_create_print_logs(entries):
    """Bulk insert print logs using frappe.db.bulk_insert for performance."""
    if not entries:
        return []
    parsed = frappe.parse_json(entries) if isinstance(entries, str) else entries
    if not isinstance(parsed, list):
        frappe.throw(_("Entries must be a JSON array"))

    docs = []
    now = now_datetime()
    for entry in parsed:
        doc = frappe.get_doc({
            "doctype": "Barcode Print Log",
            "posting_date": entry.get("posting_date") or now.strftime("%Y-%m-%d"),
            "timestamp": entry.get("timestamp") or now,
            "item_code": entry.get("item_code"),
            "item_name": entry.get("item_name"),
            "barcode": entry.get("barcode"),
            "barcode_type": entry.get("barcode_type"),
            "qty": entry.get("qty", 1),
            "uom": entry.get("uom"),
            "price": entry.get("price", 0),
            "symbology": entry.get("symbology"),
            "label_size": entry.get("label_size"),
            "user": entry.get("user") or frappe.session.user,
            "company": entry.get("company"),
            "pos_profile": entry.get("pos_profile"),
            "print_method": entry.get("print_method"),
            "status": entry.get("status", "Sent"),
            "error_message": entry.get("error_message"),
            "reference_doctype": entry.get("reference_doctype"),
            "reference_docname": entry.get("reference_docname"),
            "batch_no": entry.get("batch_no"),
            "serial_no": entry.get("serial_no"),
            "warehouse": entry.get("warehouse"),
        })
        docs.append(doc)

    _BULK_FIELDS = (
        "posting_date", "timestamp", "item_code", "item_name", "barcode", "barcode_type",
        "qty", "uom", "price", "symbology", "label_size", "user", "company", "pos_profile",
        "print_method", "status", "error_message", "reference_doctype", "reference_docname",
        "batch_no", "serial_no", "warehouse",
    )
    rows = [[d.get(f) for f in _BULK_FIELDS] for d in docs]
    frappe.db.bulk_insert("Barcode Print Log", fields=list(_BULK_FIELDS), values=rows, ignore_duplicates=True)
    return [d.name for d in docs]


@frappe.whitelist()
def verify_barcode(log_id, scanned_barcode, status="Verified"):
    """Mark a print log as verified or mismatched."""
    if not log_id or not scanned_barcode:
        frappe.throw(_("Log ID and scanned barcode are required"))
    doc = frappe.get_doc("Barcode Print Log", log_id)
    doc.verification_status = status
    doc.scanned_barcode = scanned_barcode
    doc.verified_at = now_datetime()
    doc.verified_by = frappe.session.user
    doc.save(ignore_permissions=True)
    return {"name": doc.name, "verification_status": doc.verification_status}


@frappe.whitelist()
def get_print_logs(filters=None, limit=50, offset=0):
    """Return filtered print logs with stats."""
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    limit = min(int(limit or 50), 500)
    offset = int(offset or 0)

    conditions = []
    values = {}

    if filters.get("user"):
        conditions.append("`user` = %(user)s")
        values["user"] = filters["user"]
    if filters.get("date"):
        conditions.append("`posting_date` = %(date)s")
        values["date"] = filters["date"]
    if filters.get("verification_status"):
        if isinstance(filters["verification_status"], list):
            conditions.append("`verification_status` IN %(vstatus)s")
            values["vstatus"] = tuple(filters["verification_status"])
        else:
            conditions.append("`verification_status` = %(vstatus)s")
            values["vstatus"] = filters["verification_status"]
    if filters.get("status"):
        conditions.append("`status` = %(status)s")
        values["status"] = filters["status"]
    if filters.get("barcode"):
        conditions.append("`barcode` LIKE %(barcode)s")
        values["barcode"] = f"%{filters['barcode']}%"

    where = " AND ".join(conditions) if conditions else "1=1"

    logs = frappe.db.sql(
        f"""SELECT name, item_code, item_name, barcode, barcode_type, qty,
                   print_method, status, verification_status, user, timestamp,
                   scanned_barcode, verified_at, verified_by, company, pos_profile
            FROM `tabBarcode Print Log`
            WHERE {where}
            ORDER BY timestamp DESC
            LIMIT {limit} OFFSET {offset}""",
        values,
        as_dict=True,
    )

    total = frappe.db.sql(
        f"""SELECT COUNT(*) as cnt FROM `tabBarcode Print Log` WHERE {where}""",
        values,
        as_dict=True,
    )[0]["cnt"]

    stats = frappe.db.sql(
        f"""SELECT
                COUNT(*) as total,
                SUM(CASE WHEN verification_status = 'Verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN verification_status = 'Mismatch' THEN 1 ELSE 0 END) as mismatch,
                SUM(CASE WHEN verification_status = 'Unverified' THEN 1 ELSE 0 END) as unverified,
                SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) as failed
            FROM `tabBarcode Print Log`
            WHERE {where}""",
        values,
        as_dict=True,
    )[0]

    return {"logs": logs, "total": total, "stats": stats}


@frappe.whitelist()
def get_print_stats(filters=None):
    """Aggregate print statistics for dashboard."""
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})

    conditions = []
    values = {}
    if filters.get("user"):
        conditions.append("`user` = %(user)s")
        values["user"] = filters["user"]
    if filters.get("date_from"):
        conditions.append("`posting_date` >= %(date_from)s")
        values["date_from"] = filters["date_from"]
    if filters.get("date_to"):
        conditions.append("`posting_date` <= %(date_to)s")
        values["date_to"] = filters["date_to"]
    where = " AND ".join(conditions) if conditions else "1=1"

    rows = frappe.db.sql(
        f"""SELECT
                DATE(`timestamp`) as day,
                COUNT(*) as prints,
                COUNT(DISTINCT `user`) as users,
                SUM(CASE WHEN `verification_status` = 'Verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN `verification_status` = 'Mismatch' THEN 1 ELSE 0 END) as mismatch,
                SUM(CASE WHEN `status` = 'Failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN `print_method` = 'Browser' THEN 1 ELSE 0 END) as browser,
                SUM(CASE WHEN `print_method` = 'QZ HTML' THEN 1 ELSE 0 END) as qz_html,
                SUM(CASE WHEN `print_method` = 'QZ Raw' THEN 1 ELSE 0 END) as qz_raw,
                SUM(CASE WHEN `print_method` = 'PDF' THEN 1 ELSE 0 END) as pdf
            FROM `tabBarcode Print Log`
            WHERE {where}
            GROUP BY DATE(`timestamp`)
            ORDER BY day DESC
            LIMIT 30""",
        values,
        as_dict=True,
    )

    return {"daily": rows}
