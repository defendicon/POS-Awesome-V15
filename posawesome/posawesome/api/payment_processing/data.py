import frappe
from frappe import _
from frappe.utils import nowdate, getdate, flt, cint
from erpnext.accounts.party import get_party_account
from erpnext.controllers.accounts_controller import get_advance_payment_entries_for_regional

MAX_OUTSTANDING_PAGE_LENGTH = 500


def _resolve_party_inputs(customer=None, party=None, party_type=None):
    resolved_party = party if party is not None else customer
    return resolved_party, (party_type or "Customer")


def _get_open_sales_invoices(
    customer,
    company,
    currency=None,
    pos_profile=None,
    include_all_currencies=False,
):
    filters = {
        "customer": customer,
        "company": company,
        "docstatus": 1,
        "outstanding_amount": (">", 0),
    }
    if currency and not include_all_currencies:
        filters["currency"] = currency
    if pos_profile:
        filters["pos_profile"] = pos_profile

    return frappe.get_list(
        "Sales Invoice",
        filters=filters,
        fields=[
            "name",
            "posting_date",
            "due_date",
            "outstanding_amount",
            "rounded_total",
            "base_rounded_total",
            "grand_total",
            "base_grand_total",
            "currency",
            "pos_profile",
            "customer_name",
        ],
        order_by="posting_date desc, name desc",
    )


def _get_open_purchase_invoices(
    supplier,
    company,
    currency=None,
    include_all_currencies=False,
):
    filters = {
        "supplier": supplier,
        "company": company,
        "docstatus": 1,
        "outstanding_amount": (">", 0),
    }
    if currency and not include_all_currencies:
        filters["currency"] = currency

    return frappe.get_list(
        "Purchase Invoice",
        filters=filters,
        fields=[
            "name",
            "posting_date",
            "due_date",
            "outstanding_amount",
            "rounded_total",
            "base_rounded_total",
            "grand_total",
            "base_grand_total",
            "currency",
            "supplier_name",
        ],
        order_by="posting_date desc, name desc",
    )


def _coerce_text_filter(value, field_label):
    if value is None:
        return None
    if isinstance(value, (list, tuple, dict, set)):
        frappe.throw(_("Invalid {0} filter").format(field_label))

    coerced = str(value).strip()
    if not coerced:
        return None
    return coerced


def _coerce_non_negative_int(value, default=0):
    try:
        parsed = cint(value)
    except Exception:
        return default
    return max(parsed, 0)


def _coerce_bool(value, default=False):
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return bool(value)

    if isinstance(value, str):
        lowered = value.strip().lower()
        if not lowered:
            return default
        if lowered in {"1", "true", "yes", "y", "on", "t"}:
            return True
        if lowered in {"0", "false", "no", "n", "off", "f"}:
            return False
        try:
            return bool(int(lowered))
        except Exception:
            return default

    return default


@frappe.whitelist()
def get_outstanding_invoices(customer=None, company=None, currency=None, pos_profile=None,
                             include_all_currencies=False, page_start=0, page_length=None,
                             party=None, party_type="Customer"):
    """
    Fetch outstanding invoices with optional multi-currency support.
    
    Args:
        include_all_currencies (bool): If True, returns invoices in ALL currencies instead of filtering
    """
    try:
        customer = _coerce_text_filter(customer, _("Customer"))
        party = _coerce_text_filter(party, _("Party"))
        customer, party_type = _resolve_party_inputs(customer=customer, party=party, party_type=party_type)
        company = _coerce_text_filter(company, _("Company"))
        currency = _coerce_text_filter(currency, _("Currency"))
        pos_profile = _coerce_text_filter(pos_profile, _("POS Profile"))
        include_all_currencies = _coerce_bool(include_all_currencies, default=False)

        if not customer or not company:
            return []

        page_start = _coerce_non_negative_int(page_start, default=0)
        page_length = _coerce_non_negative_int(page_length, default=0)
        if page_length:
            page_length = min(page_length, MAX_OUTSTANDING_PAGE_LENGTH)

        label_doctype = "Supplier" if party_type == "Supplier" else "Customer"
        label_field = "supplier_name" if party_type == "Supplier" else "customer_name"
        customer_name = frappe.get_cached_value(label_doctype, customer, label_field)

        invoice_rows = (
            _get_open_purchase_invoices(
                supplier=customer,
                company=company,
                currency=currency,
                include_all_currencies=include_all_currencies,
            )
            if party_type == "Supplier"
            else _get_open_sales_invoices(
                customer=customer,
                company=company,
                currency=currency,
                pos_profile=pos_profile,
                include_all_currencies=include_all_currencies,
            )
        )

        normalized_rows = []
        for invoice in invoice_rows:
            outstanding_amount = flt(invoice.get("outstanding_amount"))
            if outstanding_amount <= 0:
                continue

            row_currency = invoice.get("currency") or currency

            normalized_rows.append(
                frappe._dict(
                    {
                        "voucher_no": invoice.get("name"),
                        "voucher_type": "Purchase Invoice" if party_type == "Supplier" else "Sales Invoice",
                        "outstanding_amount": outstanding_amount,
                        "invoice_amount": flt(
                            invoice.get("rounded_total")
                            or invoice.get("base_rounded_total")
                            or invoice.get("grand_total")
                            or invoice.get("base_grand_total")
                            or outstanding_amount
                        ),
                        "due_date": invoice.get("due_date") or invoice.get("posting_date"),
                        "posting_date": invoice.get("posting_date"),
                        "currency": row_currency,
                        "pos_profile": invoice.get("pos_profile") if party_type == "Customer" else None,
                        "customer": customer,
                        "customer_name": (
                            invoice.get("supplier_name") if party_type == "Supplier" else invoice.get("customer_name")
                        ) or customer_name,
                        "party": customer,
                        "party_name": (
                            invoice.get("supplier_name") if party_type == "Supplier" else invoice.get("customer_name")
                        ) or customer_name,
                        "party_type": party_type,
                    }
                )
            )

        normalized_rows = sorted(
            normalized_rows,
            key=lambda inv: (
                getdate(inv.get("posting_date")) if inv.get("posting_date") else getdate(nowdate()),
                inv.get("voucher_no"),
            ),
            reverse=True,
        )

        if page_length:
            return normalized_rows[page_start: page_start + page_length]

        return normalized_rows
    except Exception as e:
        frappe.logger().error(f"Error in get_outstanding_invoices: {str(e)}")
        return []


@frappe.whitelist()
def get_unallocated_payments(
    customer,
    company,
    currency=None,
    mode_of_payment=None,
    include_all_currencies=False,
    party=None,
    party_type="Customer",
):
    customer = _coerce_text_filter(customer, _("Customer"))
    party = _coerce_text_filter(party, _("Party"))
    customer, party_type = _resolve_party_inputs(customer=customer, party=party, party_type=party_type)
    company = _coerce_text_filter(company, _("Company"))
    currency = _coerce_text_filter(currency, _("Currency"))
    mode_of_payment = _coerce_text_filter(mode_of_payment, _("Mode of Payment"))
    include_all_currencies = _coerce_bool(include_all_currencies, default=False)

    if not customer or not company:
        return []

    label_doctype = "Supplier" if party_type == "Supplier" else "Customer"
    label_field = "supplier_name" if party_type == "Supplier" else "customer_name"
    customer_name = frappe.get_cached_value(label_doctype, customer, label_field)
    party_account = get_party_account(party_type, customer, company)

    filters = {
        "party": customer,
        "company": company,
        "docstatus": 1,
        "party_type": party_type,
        "payment_type": "Pay" if party_type == "Supplier" else "Receive",
        "unallocated_amount": [">", 0],
    }
    if currency and not include_all_currencies:
        filters["paid_to_account_currency" if party_type == "Supplier" else "paid_from_account_currency"] = currency
    if mode_of_payment:
        filters.update({"mode_of_payment": mode_of_payment})
    unallocated_payment = frappe.get_list(
        "Payment Entry",
        filters=filters,
        fields=[
            "name",
            "paid_amount",
            "party_name as customer_name",
            "received_amount",
            "posting_date",
            "unallocated_amount",
            "mode_of_payment",
            (
                "paid_to_account_currency as currency"
                if party_type == "Supplier"
                else "paid_from_account_currency as currency"
            ),
            ("paid_to as account" if party_type == "Supplier" else "paid_from as account"),
        ],
        order_by="posting_date asc",
    )

    # If strict currency filtering produces no rows, fall back to all
    # currencies for visibility.
    if (
        not include_all_currencies
        and currency
        and not unallocated_payment
    ):
        fallback_filters = dict(filters)
        fallback_filters.pop(
            "paid_to_account_currency" if party_type == "Supplier" else "paid_from_account_currency",
            None,
        )
        unallocated_payment = frappe.get_list(
            "Payment Entry",
            filters=fallback_filters,
            fields=[
                "name",
                "paid_amount",
                "party_name as customer_name",
                "received_amount",
                "posting_date",
                "unallocated_amount",
                "mode_of_payment",
                (
                    "paid_to_account_currency as currency"
                    if party_type == "Supplier"
                    else "paid_from_account_currency as currency"
                ),
                ("paid_to as account" if party_type == "Supplier" else "paid_from as account"),
            ],
            order_by="posting_date asc",
        )
    for payment in unallocated_payment:
        payment["voucher_type"] = "Payment Entry"
        payment["is_credit_note"] = 0
        payment["party_type"] = party_type
        payment["party_name"] = payment.get("customer_name")

    if party_type == "Supplier":
        return unallocated_payment

    # Reconciliation fetch that also includes advances linked to Sales Order,
    # not only Payment Entries with unallocated_amount > 0.
    condition = frappe._dict(
        {
            "company": company,
            "get_payments": True,
        }
    )
    regional_entries = get_advance_payment_entries_for_regional(
        "Customer",
        customer,
        [party_account],
        "Sales Order",
        against_all_orders=True,
        condition=condition,
    )

    existing_keys = {(row.get("voucher_type"), row.get("name")) for row in unallocated_payment}
    for row in regional_entries or []:
        reference_type = row.get("reference_type")
        reference_name = row.get("reference_name")
        amount = flt(row.get("amount"))

        if not reference_type or not reference_name or amount <= 0:
            continue

        key = (reference_type, reference_name)
        if key in existing_keys:
            continue

        mode_of_payment_label = row.get("mode_of_payment")
        if reference_type == "Sales Invoice":
            mode_of_payment_label = _("Credit Note")
        elif reference_type == "Journal Entry":
            mode_of_payment_label = _("Journal Entry")

        unallocated_payment.append(
            {
                "name": reference_name,
                "paid_amount": amount,
                "received_amount": amount,
                "customer_name": customer_name,
                "party_name": customer_name,
                "posting_date": row.get("posting_date"),
                "unallocated_amount": amount,
                "mode_of_payment": mode_of_payment_label,
                "currency": row.get("currency") or currency,
                "voucher_type": reference_type,
                "is_credit_note": 1 if reference_type == "Sales Invoice" else 0,
                "reference_row": row.get("reference_row"),
                "account": row.get("account") or party_account,
                "remarks": row.get("remarks"),
                "cost_center": row.get("cost_center"),
                "exchange_rate": flt(row.get("exchange_rate")) or 1,
                "is_advance": row.get("is_advance"),
            }
        )
        existing_keys.add(key)

    journal_conditions = [
        "je.docstatus = 1",
        "je.company = %(company)s",
        "jea.party_type = 'Customer'",
        "jea.party = %(customer)s",
        "jea.account = %(party_account)s",
        "(jea.reference_type IS NULL OR jea.reference_type = '' OR jea.reference_type = 'Sales Order')",
        "(jea.reference_name IS NULL OR jea.reference_name = '')",
        "(jea.credit_in_account_currency - jea.debit_in_account_currency) > 0",
    ]
    params = {
        "company": company,
        "customer": customer,
        "party_account": party_account,
    }

    if currency and not include_all_currencies:
        journal_conditions.append("jea.account_currency = %(currency)s")
        params["currency"] = currency

    journal_entries = frappe.db.sql(
        f"""
            SELECT
                je.name AS name,
                je.posting_date AS posting_date,
                je.remark AS remarks,
                jea.name AS reference_row,
                jea.account AS account,
                jea.account_currency AS currency,
                (jea.credit_in_account_currency - jea.debit_in_account_currency) AS unallocated_amount,
                jea.cost_center AS cost_center,
                jea.exchange_rate AS exchange_rate,
                jea.is_advance AS is_advance
            FROM `tabJournal Entry` je
            INNER JOIN `tabJournal Entry Account` jea ON jea.parent = je.name
            WHERE {' AND '.join(journal_conditions)}
            ORDER BY je.posting_date ASC
        """,
        params,
        as_dict=True,
    )

    for journal in journal_entries:
        amount = flt(journal.get("unallocated_amount"))
        if amount <= 0:
            continue

        key = ("Journal Entry", journal.get("name"))
        if key in existing_keys:
            continue

        unallocated_payment.append(
            {
                "name": journal.get("name"),
                "paid_amount": amount,
                "received_amount": amount,
                "customer_name": customer_name,
                "party_name": customer_name,
                "posting_date": journal.get("posting_date"),
                "unallocated_amount": amount,
                "mode_of_payment": _("Journal Entry"),
                "currency": journal.get("currency") or currency,
                "voucher_type": "Journal Entry",
                "is_credit_note": 0,
                "reference_row": journal.get("reference_row"),
                "account": journal.get("account") or party_account,
                "remarks": journal.get("remarks"),
                "cost_center": journal.get("cost_center"),
                "exchange_rate": flt(journal.get("exchange_rate")) or 1,
                "is_advance": journal.get("is_advance"),
            }
        )
        existing_keys.add(key)

    credit_notes = frappe.get_list(
        "Sales Invoice",
        filters={
            "customer": customer,
            "company": company,
            "docstatus": 1,
            "is_return": 1,
            "outstanding_amount": ("<", 0),
        },
        fields=[
            "name",
            "posting_date",
            "customer_name",
            "return_against",
            "outstanding_amount",
            "currency",
            "conversion_rate",
            "remarks",
        ],
        order_by="posting_date asc",
    )

    for note in credit_notes:
        outstanding_credit = abs(flt(note.outstanding_amount or 0))
        if not outstanding_credit:
            continue

        unallocated_payment.append(
            {
                "name": note.name,
                "paid_amount": outstanding_credit,
                "received_amount": outstanding_credit,
                "customer_name": note.customer_name,
                "party_name": note.customer_name,
                "posting_date": note.posting_date,
                "unallocated_amount": outstanding_credit,
                "mode_of_payment": _("Credit Note"),
                "currency": note.currency or currency,
                "voucher_type": "Sales Invoice",
                "is_credit_note": 1,
                "return_against": note.return_against,
                "reference_invoice": note.return_against,
                "conversion_rate": note.conversion_rate,
                "remarks": note.remarks,
            }
        )

    unallocated_payment = sorted(
        unallocated_payment,
        key=lambda pay: (
            getdate(pay.get("posting_date")) if pay.get("posting_date") else getdate(nowdate()),
            pay.get("name"),
        ),
    )

    return unallocated_payment

@frappe.whitelist()
def get_available_pos_profiles(company, currency):
    pos_profiles_list = frappe.get_list(
        "POS Profile",
        filters={"disabled": 0, "company": company, "currency": currency},
        page_length=1000,
        pluck="name",
    )
    return pos_profiles_list


@frappe.whitelist()
def get_unreconciled_entries(
    customer,
    company,
    currency=None,
    pos_profile=None,
    mode_of_payment=None,
    include_all_currencies=False,
):
    return {
        "invoices": get_outstanding_invoices(
            customer=customer,
            company=company,
            currency=currency,
            pos_profile=pos_profile,
            include_all_currencies=include_all_currencies,
        ),
        "payments": get_unallocated_payments(
            customer=customer,
            company=company,
            currency=currency,
            mode_of_payment=mode_of_payment,
            include_all_currencies=include_all_currencies,
        ),
    }
