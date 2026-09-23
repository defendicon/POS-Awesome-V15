from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate


EXCHANGE_DOCTYPE = "POS Item Exchange"


def execute(filters=None):
    filters = frappe._dict(filters or {})
    _validate_filters(filters)
    _check_permission()

    data = frappe.get_list(
        EXCHANGE_DOCTYPE,
        fields=_fieldnames(),
        filters=_database_filters(filters),
        order_by="creation desc",
        limit_page_length=0,
    )
    data = _prepare_rows(data)
    return get_columns(), data, None, _get_chart(data), _get_report_summary(data)


def _check_permission():
    if not frappe.has_permission(EXCHANGE_DOCTYPE, "read"):
        frappe.throw(_("Not permitted to view item exchange audit records."), frappe.PermissionError)


def _validate_filters(filters):
    if filters.get("from_date") and filters.get("to_date"):
        if getdate(filters.from_date) > getdate(filters.to_date):
            frappe.throw(_("From Date cannot be after To Date."))


def _database_filters(filters):
    database_filters = []
    for fieldname in (
        "company",
        "pos_profile",
        "pos_opening_shift",
        "customer",
        "status",
        "settlement_type",
        "currency",
        "original_invoice",
    ):
        if filters.get(fieldname):
            database_filters.append([fieldname, "=", filters.get(fieldname)])

    if filters.get("cashier"):
        database_filters.append(["owner", "=", filters.cashier])

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    if from_date:
        database_filters.append(["creation", ">=", from_date])
    if to_date:
        database_filters.append(["creation", "<", add_days(to_date, 1)])

    return database_filters


def _fieldnames():
    return [
        "name",
        "client_request_id",
        "creation",
        "owner as cashier",
        "status",
        "company",
        "pos_profile",
        "pos_opening_shift",
        "customer",
        "original_invoice",
        "return_invoice",
        "replacement_invoice",
        "currency",
        "return_total",
        "sale_total",
        "allocated_amount",
        "difference_amount",
        "settlement_type",
        "reconciliation_journal",
    ]


def _prepare_rows(data):
    for row in data:
        difference = flt(row.get("difference_amount"))
        row["customer_paid"] = difference if row.get("settlement_type") == "Customer Payment" else 0
        row["customer_credit"] = abs(difference) if row.get("settlement_type") == "Customer Credit" else 0
    return data


def _column(label, fieldname, fieldtype="Data", options=None, width=120):
    column = {"label": label, "fieldname": fieldname, "fieldtype": fieldtype, "width": width}
    if options:
        column["options"] = options
    return column


def get_columns():
    return [
        _column(_("Exchange"), "name", "Link", EXCHANGE_DOCTYPE, 165),
        _column(_("Exchange Date"), "creation", "Datetime", width=150),
        _column(_("Status"), "status", width=95),
        _column(_("Company"), "company", "Link", "Company", 140),
        _column(_("POS Profile"), "pos_profile", "Link", "POS Profile", 130),
        _column(_("Opening Shift"), "pos_opening_shift", "Link", "POS Opening Shift", 145),
        _column(_("Cashier"), "cashier", "Link", "User", 170),
        _column(_("Customer"), "customer", "Link", "Customer", 150),
        _column(_("Original Invoice"), "original_invoice", "Link", "Sales Invoice", 165),
        _column(_("Return Invoice"), "return_invoice", "Link", "Sales Invoice", 165),
        _column(_("Replacement Invoice"), "replacement_invoice", "Link", "Sales Invoice", 175),
        _column(_("Currency"), "currency", "Link", "Currency", 85),
        _column(_("Return Credit"), "return_total", "Currency", "currency", 125),
        _column(_("Replacement Sale"), "sale_total", "Currency", "currency", 135),
        _column(_("Allocated Credit"), "allocated_amount", "Currency", "currency", 125),
        _column(_("Customer Paid"), "customer_paid", "Currency", "currency", 120),
        _column(_("Customer Credit"), "customer_credit", "Currency", "currency", 125),
        _column(_("Net Difference"), "difference_amount", "Currency", "currency", 125),
        _column(_("Settlement Type"), "settlement_type", width=135),
        _column(_("Reconciliation Journal"), "reconciliation_journal", "Link", "Journal Entry", 180),
        _column(_("Request ID"), "client_request_id", width=210),
    ]


def _get_chart(data):
    labels = ["Customer Payment", "Customer Credit", "Even Exchange"]
    counts = {
        label: sum(
            1
            for row in data
            if row.get("status") == "Completed" and row.get("settlement_type") == label
        )
        for label in labels
    }
    return {
        "data": {
            "labels": [_(label) for label in labels],
            "datasets": [{"name": _("Exchanges"), "values": [counts[label] for label in labels]}],
        },
        "type": "donut",
    }


def _get_report_summary(data):
    completed = [row for row in data if row.get("status") == "Completed"]
    cancelled_count = sum(1 for row in data if row.get("status") == "Cancelled")
    summary = [
        {"label": _("Total Exchanges"), "value": len(data), "datatype": "Int", "indicator": "Blue"},
        {"label": _("Completed"), "value": len(completed), "datatype": "Int", "indicator": "Green"},
        {"label": _("Cancelled"), "value": cancelled_count, "datatype": "Int", "indicator": "Red"},
    ]

    currencies = {row.get("currency") for row in completed if row.get("currency")}
    if len(currencies) == 1:
        currency = currencies.pop()
        summary.extend(
            [
                _currency_summary(
                    _("Return Credit"),
                    sum(flt(row.get("return_total")) for row in completed),
                    currency,
                    "Orange",
                ),
                _currency_summary(
                    _("Replacement Sales"),
                    sum(flt(row.get("sale_total")) for row in completed),
                    currency,
                    "Blue",
                ),
                _currency_summary(
                    _("Customer Paid"),
                    sum(flt(row.get("customer_paid")) for row in completed),
                    currency,
                    "Green",
                ),
                _currency_summary(
                    _("Customer Credit"),
                    sum(flt(row.get("customer_credit")) for row in completed),
                    currency,
                    "Orange",
                ),
            ]
        )
    return summary


def _currency_summary(label, value, currency, indicator):
    return {
        "label": label,
        "value": value,
        "datatype": "Currency",
        "currency": currency,
        "indicator": indicator,
    }
