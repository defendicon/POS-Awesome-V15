import frappe
from frappe import _
from frappe.utils import cstr, flt, json

from posawesome.posawesome.doctype.pos_closing_shift.closing_processing.data import (
    _ensure_opening_shift_access,
    get_payments_entries,
    get_pos_invoices,
)
from posawesome.posawesome.doctype.pos_closing_shift.closing_processing.utils import get_base_value


EDITABLE_CLOSING_SHIFT_FIELDS = {
    "period_end_date",
    "grand_total",
    "net_total",
    "total_quantity",
    "pos_transactions",
    "payment_reconciliation",
    "taxes",
    "pos_payments",
}


def _extract_opening_shift_name(opening_shift):
    payload = opening_shift
    if isinstance(payload, str):
        raw_value = cstr(payload).strip()
        if not raw_value:
            frappe.throw(_("POS Opening Shift is required."))
        try:
            payload = json.loads(raw_value)
        except Exception:
            payload = raw_value

    if isinstance(payload, dict):
        opening_shift_name = cstr(payload.get("name")).strip()
    else:
        opening_shift_name = cstr(getattr(payload, "name", payload)).strip()

    if not opening_shift_name:
        frappe.throw(_("POS Opening Shift is required."))
    return opening_shift_name


def _extract_closing_shift_payload(closing_shift):
    payload = closing_shift
    if isinstance(payload, str):
        raw_value = cstr(payload).strip()
        if not raw_value:
            frappe.throw(_("POS Closing Shift is required."))
        try:
            payload = json.loads(raw_value)
        except Exception:
            payload = {"name": raw_value}

    if isinstance(payload, dict):
        return payload

    closing_shift_name = cstr(getattr(payload, "name", "")).strip()
    if not closing_shift_name:
        frappe.throw(_("POS Closing Shift is required."))
    return {"name": closing_shift_name}


@frappe.whitelist()
def make_closing_shift_from_opening(opening_shift):
    opening_shift_name = _extract_opening_shift_name(opening_shift)
    opening_shift_doc = _ensure_opening_shift_access(opening_shift_name, require_owner=True)

    if opening_shift_doc.docstatus != 1 or opening_shift_doc.status != "Open":
        frappe.throw(_("Selected POS Opening Shift should be submitted and open."))

    use_pos_invoice = frappe.db.get_value(
        "POS Profile",
        opening_shift_doc.pos_profile,
        "create_pos_invoice_instead_of_sales_invoice",
    )
    doctype = "POS Invoice" if use_pos_invoice else "Sales Invoice"

    closing_shift = frappe.new_doc("POS Closing Shift")
    closing_shift.pos_opening_shift = opening_shift_doc.name
    closing_shift.period_start_date = opening_shift_doc.period_start_date
    closing_shift.period_end_date = frappe.utils.get_datetime()
    closing_shift.pos_profile = opening_shift_doc.pos_profile
    closing_shift.user = opening_shift_doc.user
    closing_shift.company = opening_shift_doc.company
    closing_shift.grand_total = 0
    closing_shift.net_total = 0
    closing_shift.total_quantity = 0

    company_currency = frappe.get_cached_value("Company", closing_shift.company, "default_currency")
    cash_mode_of_payment = (
        frappe.get_value(
            "POS Profile",
            opening_shift_doc.pos_profile,
            "posa_cash_mode_of_payment",
        )
        or "Cash"
    )

    invoices = get_pos_invoices(opening_shift_doc.name, doctype)

    pos_transactions = []
    taxes = []
    payments = []
    pos_payments_table = []

    for detail in opening_shift_doc.get("balance_details") or []:
        mode_of_payment = detail.get("mode_of_payment")
        if not mode_of_payment:
            continue
        opening_amount = flt(detail.get("amount"))
        payments.append(
            frappe._dict(
                {
                    "mode_of_payment": mode_of_payment,
                    "opening_amount": opening_amount,
                    "expected_amount": opening_amount,
                }
            )
        )

    invoice_field = "pos_invoice" if doctype == "POS Invoice" else "sales_invoice"

    for d in invoices:
        conversion_rate = d.get("conversion_rate")
        pos_transactions.append(
            frappe._dict(
                {
                    invoice_field: d.name,
                    "posting_date": d.posting_date,
                    "grand_total": get_base_value(d, "grand_total", "base_grand_total", conversion_rate),
                    "transaction_currency": d.get("currency") or company_currency,
                    "transaction_amount": flt(d.get("grand_total")),
                    "customer": d.customer,
                }
            )
        )
        base_grand_total = get_base_value(d, "grand_total", "base_grand_total", conversion_rate)
        base_net_total = get_base_value(d, "net_total", "base_net_total", conversion_rate)
        closing_shift.grand_total += base_grand_total
        closing_shift.net_total += base_net_total
        closing_shift.total_quantity += flt(d.total_qty)

        for t in d.taxes:
            existing_tax = [tx for tx in taxes if tx.account_head == t.account_head and tx.rate == t.rate]
            if existing_tax:
                existing_tax[0].amount += get_base_value(
                    t, "tax_amount", "base_tax_amount", d.get("conversion_rate")
                )
            else:
                taxes.append(
                    frappe._dict(
                        {
                            "account_head": t.account_head,
                            "rate": t.rate,
                            "amount": get_base_value(
                                t, "tax_amount", "base_tax_amount", d.get("conversion_rate")
                            ),
                        }
                    )
                )

        for p in d.payments:
            existing_pay = [pay for pay in payments if pay.mode_of_payment == p.mode_of_payment]
            if existing_pay:
                conversion_rate = d.get("conversion_rate")
                if existing_pay[0].mode_of_payment == cash_mode_of_payment:
                    amount = get_base_value(p, "amount", "base_amount", conversion_rate) - get_base_value(
                        d, "change_amount", "base_change_amount", conversion_rate
                    )
                else:
                    amount = get_base_value(p, "amount", "base_amount", conversion_rate)
                existing_pay[0].expected_amount += flt(amount)
            else:
                payments.append(
                    frappe._dict(
                        {
                            "mode_of_payment": p.mode_of_payment,
                            "opening_amount": 0,
                            "expected_amount": get_base_value(
                                p, "amount", "base_amount", d.get("conversion_rate")
                            ),
                        }
                    )
                )

    pos_payments = get_payments_entries(opening_shift_doc.name)

    for py in pos_payments:
        pos_payments_table.append(
            frappe._dict(
                {
                    "payment_entry": py.name,
                    "mode_of_payment": py.mode_of_payment,
                    "paid_amount": py.paid_amount,
                    "posting_date": py.posting_date,
                    "customer": py.party,
                }
            )
        )
        existing_pay = [pay for pay in payments if pay.mode_of_payment == py.mode_of_payment]
        multiplier = -1 if py.payment_type == "Pay" else 1
        signed_amount = multiplier * abs(get_base_value(py, "paid_amount", "base_paid_amount"))
        if existing_pay:
            existing_pay[0].expected_amount += signed_amount
        else:
            payments.append(
                frappe._dict(
                    {
                        "mode_of_payment": py.mode_of_payment,
                        "opening_amount": 0,
                        "expected_amount": signed_amount,
                    }
                )
            )

    cash_movements = frappe.get_all(
        "POS Cash Movement",
        filters={"pos_opening_shift": opening_shift_doc.name, "docstatus": 1},
        fields=["amount"],
    )
    cash_movement_total = sum(flt(row.get("amount")) for row in cash_movements)
    if cash_movement_total:
        existing_cash = [pay for pay in payments if pay.mode_of_payment == cash_mode_of_payment]
        if existing_cash:
            existing_cash[0].expected_amount -= cash_movement_total
        else:
            payments.append(
                frappe._dict(
                    {
                        "mode_of_payment": cash_mode_of_payment,
                        "opening_amount": 0,
                        "expected_amount": -cash_movement_total,
                    }
                )
            )

    closing_shift.set("pos_transactions", pos_transactions)
    closing_shift.set("payment_reconciliation", payments)
    closing_shift.set("taxes", taxes)
    closing_shift.set("pos_payments", pos_payments_table)

    return closing_shift


@frappe.whitelist()
def submit_closing_shift(closing_shift):
    payload = _extract_closing_shift_payload(closing_shift)
    closing_shift_name = cstr(payload.get("name")).strip()
    if not closing_shift_name:
        frappe.throw(_("POS Closing Shift name is required."))

    closing_shift_doc = frappe.get_doc("POS Closing Shift", closing_shift_name)
    _ensure_opening_shift_access(closing_shift_doc.pos_opening_shift, require_owner=True)

    if closing_shift_doc.docstatus != 0:
        frappe.throw(_("Only draft POS Closing Shift documents can be submitted."))

    for fieldname in EDITABLE_CLOSING_SHIFT_FIELDS:
        if fieldname in payload:
            closing_shift_doc.set(fieldname, payload.get(fieldname))

    closing_shift_doc.flags.ignore_permissions = True
    closing_shift_doc.save()
    closing_shift_doc.submit()
    return closing_shift_doc.name
