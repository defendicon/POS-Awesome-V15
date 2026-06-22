import frappe

POS_SUPERVISOR_ROLE = "POS Awesome Supervisor"
LEGACY_SUPERVISOR_FIELD = "posa_is_pos_supervisor"


def _ensure_role():
    if frappe.db.exists("Role", POS_SUPERVISOR_ROLE):
        return

    frappe.get_doc(
        {
            "doctype": "Role",
            "role_name": POS_SUPERVISOR_ROLE,
            "desk_access": 1,
            "is_custom": 1,
        }
    ).insert(ignore_permissions=True)


def _legacy_field_exists() -> bool:
    # Check the Custom Field doc, NOT the DB column: Frappe does not drop the
    # column when a Custom Field is deleted, so `has_column` stays True after a
    # previous migration removed the field. Querying it via get_all() would then
    # raise FieldError (the field is gone from the User meta). Guarding on the
    # Custom Field keeps this patch safe to re-run on already-migrated sites.
    return bool(frappe.db.exists("Custom Field", f"User-{LEGACY_SUPERVISOR_FIELD}"))


def _assign_role(user: str):
    if not user:
        return

    if frappe.db.exists(
        "Has Role",
        {
            "parent": user,
            "parenttype": "User",
            "role": POS_SUPERVISOR_ROLE,
        },
    ):
        return

    user_doc = frappe.get_doc("User", user)
    user_doc.append("roles", {"role": POS_SUPERVISOR_ROLE})
    user_doc.save(ignore_permissions=True)


def _remove_legacy_field():
    field_name = f"User-{LEGACY_SUPERVISOR_FIELD}"
    if not frappe.db.exists("Custom Field", field_name):
        return

    frappe.delete_doc("Custom Field", field_name, ignore_permissions=True, force=True)
    frappe.clear_cache(doctype="User")


def execute():
    _ensure_role()

    if _legacy_field_exists():
        users = frappe.get_all(
            "User",
            filters={LEGACY_SUPERVISOR_FIELD: 1},
            pluck="name",
            ignore_permissions=True,
        )
        for user in users:
            _assign_role(user)

    _remove_legacy_field()
