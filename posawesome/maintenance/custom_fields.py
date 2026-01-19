import json
from pathlib import Path

import frappe
from frappe.utils.fixtures import sync_fixtures


def _load_custom_field_names():
    fixture_path = Path(
        frappe.get_app_path("posawesome", "fixtures", "custom_field.json")
    )
    if not fixture_path.exists():
        return []

    data = json.loads(fixture_path.read_text())
    return [item.get("name") for item in data if item.get("name")]


def _parse_custom_field_name(name):
    if "-" not in name:
        return None
    doctype, fieldname = name.split("-", 1)
    return doctype, fieldname


def reset_custom_field_fixtures():
    custom_field_names = _load_custom_field_names()
    if not custom_field_names:
        return

    parsed_fields = [
        parsed
        for parsed in (_parse_custom_field_name(name) for name in custom_field_names)
        if parsed
    ]

    for doctype, fieldname in parsed_fields:
        frappe.db.delete(
            "Property Setter",
            {"doc_type": doctype, "field_name": fieldname},
        )

    for name in custom_field_names:
        frappe.db.delete("Custom Field", {"name": name})

    sync_fixtures("posawesome")
