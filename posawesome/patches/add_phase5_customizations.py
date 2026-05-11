"""
Combined patch — Phase-5 POS Awesome customizations.

Adds:
  - Sales Invoice / POS Invoice : posa_receipt_barcode (Data, read-only)
  - DB index on Customer.mobile_no (speeds Feature-6 phone search)
  - Normalizes mobile_no on every existing Customer using customer_mobile.normalize_mobile
  - Boots the LPG Price Change workflow (idempotent)
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

from posawesome.posawesome.api.customer_mobile import normalize_mobile
from posawesome.posawesome.api.lpg_workflow_install import install_lpg_workflow


def execute():
    _add_receipt_barcode_fields()
    _index_customer_mobile()
    _normalize_existing_mobiles()
    install_lpg_workflow()


def _add_receipt_barcode_fields():
    for doctype in ("Sales Invoice", "POS Invoice"):
        full_name = f"{doctype}-posa_receipt_barcode"
        if frappe.db.exists("Custom Field", full_name):
            continue
        create_custom_field(
            doctype,
            {
                "fieldname": "posa_receipt_barcode",
                "label": "Receipt Barcode Payload",
                "fieldtype": "Data",
                "insert_after": "posa_is_printed",
                "read_only": 1,
                "no_copy": 1,
                "print_hide": 1,
                "description": "Code128 payload: <invoice_name>|<total_kg>",
                "allow_on_submit": 1,
            },
        )


def _index_customer_mobile():
    """Adds a (non-unique) DB index to speed phone-based lookups."""
    try:
        frappe.db.add_index("Customer", ["mobile_no"], "idx_customer_mobile_no")
    except Exception as e:
        frappe.log_error(f"add_index Customer.mobile_no failed: {e}", "posawesome.patches")


def _normalize_existing_mobiles():
    """Best-effort normalization for legacy customer mobile numbers."""
    rows = frappe.db.sql(
        "SELECT name, mobile_no FROM `tabCustomer` WHERE mobile_no IS NOT NULL AND mobile_no != ''",
        as_dict=True,
    )
    updated = 0
    for r in rows:
        canonical = normalize_mobile(r["mobile_no"])
        if canonical and canonical != r["mobile_no"]:
            try:
                frappe.db.set_value(
                    "Customer", r["name"], "mobile_no", canonical,
                    update_modified=False,
                )
                updated += 1
            except Exception:
                # Skip rows that collide — log only.
                frappe.log_error(
                    f"Could not normalize mobile for {r['name']}: {r['mobile_no']} -> {canonical}",
                    "posawesome.patches",
                )
    frappe.db.commit()
    print(f"[posawesome] normalized {updated} customer mobile numbers")
