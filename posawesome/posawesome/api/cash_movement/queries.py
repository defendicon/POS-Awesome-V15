import frappe
from frappe import _
from frappe.utils import cint


MAX_PAGE_LENGTH = 200
MAX_SEARCH_TEXT_LENGTH = 100
VALID_MOVEMENT_TYPES = {"Expense", "Deposit"}
STATUS_TO_DOCSTATUS = {
    "submitted": 1,
    "cancelled": 2,
    "draft": 0,
    "all": None,
}


def _sanitize_pagination(limit_start, limit_page_length):
    limit_start = cint(limit_start)
    limit_page_length = cint(limit_page_length)

    if limit_start < 0:
        limit_start = 0
    if limit_page_length <= 0:
        limit_page_length = 50
    if limit_page_length > MAX_PAGE_LENGTH:
        limit_page_length = MAX_PAGE_LENGTH

    return limit_start, limit_page_length


def get_shift_movements(
    pos_opening_shift,
    movement_type=None,
    status=None,
    search_text=None,
    limit_start=0,
    limit_page_length=50,
):
    filters = {"pos_opening_shift": pos_opening_shift}
    if movement_type:
        movement_type = str(movement_type).strip()
        if movement_type.lower() == "all":
            movement_type = ""
        if movement_type and movement_type not in VALID_MOVEMENT_TYPES:
            frappe.throw(_("Invalid movement type filter."))
        if movement_type:
            filters["movement_type"] = movement_type

    if status:
        normalized = str(status).strip().lower()
        if normalized not in STATUS_TO_DOCSTATUS:
            frappe.throw(_("Invalid cash movement status filter."))
        docstatus = STATUS_TO_DOCSTATUS[normalized]
        if docstatus is not None:
            filters["docstatus"] = docstatus

    limit_start, limit_page_length = _sanitize_pagination(limit_start, limit_page_length)

    query = (search_text or "").strip()
    or_filters = None
    if query:
        if len(query) > MAX_SEARCH_TEXT_LENGTH:
            frappe.throw(_("Search text cannot exceed {0} characters.").format(MAX_SEARCH_TEXT_LENGTH))
        like_query = f"%{query}%"
        or_filters = [
            {"name": ["like", like_query]},
            {"against_name": ["like", like_query]},
            {"remarks": ["like", like_query]},
            {"source_account": ["like", like_query]},
            {"target_account": ["like", like_query]},
            {"expense_account": ["like", like_query]},
            {"journal_entry": ["like", like_query]},
            {"user": ["like", like_query]},
        ]

    return frappe.get_all(
        "POS Cash Movement",
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name",
            "posting_date",
            "company",
            "pos_profile",
            "pos_opening_shift",
            "user",
            "movement_type",
            "amount",
            "against_name",
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
