import frappe


def get_shift_movements(pos_opening_shift, movement_type=None, status=None, limit_start=0, limit_page_length=50):
    filters = {"pos_opening_shift": pos_opening_shift}
    if movement_type:
        filters["movement_type"] = movement_type

    if status:
        normalized = str(status).strip().lower()
        if normalized == "submitted":
            filters["docstatus"] = 1
        elif normalized == "cancelled":
            filters["docstatus"] = 2
        elif normalized == "draft":
            filters["docstatus"] = 0

    return frappe.get_all(
        "POS Cash Movement",
        filters=filters,
        fields=[
            "name",
            "posting_date",
            "company",
            "pos_profile",
            "pos_opening_shift",
            "user",
            "movement_type",
            "amount",
            "source_account",
            "target_account",
            "expense_account",
            "remarks",
            "journal_entry",
            "docstatus",
            "modified",
            "owner",
        ],
        order_by="modified desc",
        start=limit_start,
        page_length=limit_page_length,
    )


def get_submitted_expenses(pos_opening_shift, limit_start=0, limit_page_length=50):
    return get_shift_movements(
        pos_opening_shift=pos_opening_shift,
        movement_type="Expense",
        status="submitted",
        limit_start=limit_start,
        limit_page_length=limit_page_length,
    )
