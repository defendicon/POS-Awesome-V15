import frappe
from frappe import _
from frappe.utils import nowdate, getdate, flt
from erpnext.accounts.party import get_party_account
from erpnext.accounts.utils import get_outstanding_invoices as get_erpnext_outstanding_invoices

@frappe.whitelist()
def get_outstanding_invoices(customer=None, company=None, currency=None, pos_profile=None,
                             include_all_currencies=False):
    """
    Fetch outstanding invoices with optional multi-currency support.
    
    Args:
        include_all_currencies (bool): If True, returns invoices in ALL currencies instead of filtering
    """
    try:
        if not customer or not company:
            return []

        party_account = get_party_account("Customer", customer, company)
        customer_name = frappe.get_cached_value("Customer", customer, "customer_name")

        outstanding_invoices = get_erpnext_outstanding_invoices(
            "Customer",
            customer,
            [party_account],
        )

        sales_invoice_meta = {}
        sales_invoice_names = [
            row.get("voucher_no")
            for row in outstanding_invoices
            if row.get("voucher_type") == "Sales Invoice"
        ]
        if sales_invoice_names:
            sales_invoice_meta = {
                row.get("name"): row
                for row in frappe.get_all(
                    "Sales Invoice",
                    filters={"name": ("in", sales_invoice_names)},
                    fields=["name", "pos_profile", "currency", "customer_name"],
                )
            }

        normalized_rows = []
        for invoice in outstanding_invoices:
            outstanding_amount = flt(invoice.get("outstanding_amount"))
            if outstanding_amount <= 0:
                continue

            voucher_type = invoice.get("voucher_type")
            voucher_no = invoice.get("voucher_no")
            meta = sales_invoice_meta.get(voucher_no) if voucher_type == "Sales Invoice" else {}

            row_currency = invoice.get("currency") or (meta or {}).get("currency")
            if currency and not include_all_currencies and row_currency != currency:
                continue

            row_pos_profile = (meta or {}).get("pos_profile")
            if pos_profile and voucher_type == "Sales Invoice" and row_pos_profile != pos_profile:
                continue

            normalized_rows.append(
                frappe._dict(
                    {
                        "voucher_no": voucher_no,
                        "voucher_type": voucher_type,
                        "outstanding_amount": outstanding_amount,
                        "invoice_amount": flt(invoice.get("invoice_amount")) or outstanding_amount,
                        "due_date": invoice.get("due_date") or invoice.get("posting_date"),
                        "posting_date": invoice.get("posting_date"),
                        "currency": row_currency,
                        "pos_profile": row_pos_profile,
                        "customer": customer,
                        "customer_name": (meta or {}).get("customer_name") or customer_name,
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
):
    filters = {
        "party": customer,
        "company": company,
        "docstatus": 1,
        "party_type": "Customer",
        "payment_type": "Receive",
        "unallocated_amount": [">", 0],
    }
    if currency and not include_all_currencies:
        filters["paid_from_account_currency"] = currency
    if mode_of_payment:
        filters.update({"mode_of_payment": mode_of_payment})
    unallocated_payment = frappe.get_all(
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
            "paid_from_account_currency as currency",
            "paid_from as account",
        ],
        order_by="posting_date asc",
    )

    # Keep POSPay parity with ERPNext reconciliation tool: if strict currency
    # filter produced no rows, fallback to all currencies for visibility.
    if (
        not include_all_currencies
        and currency
        and not unallocated_payment
    ):
        fallback_filters = dict(filters)
        fallback_filters.pop("paid_from_account_currency", None)
        unallocated_payment = frappe.get_all(
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
                "paid_from_account_currency as currency",
                "paid_from as account",
            ],
            order_by="posting_date asc",
        )
    for payment in unallocated_payment:
        payment["voucher_type"] = "Payment Entry"
        payment["is_credit_note"] = 0

    party_account = get_party_account("Customer", customer, company)
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

    customer_name = frappe.get_cached_value("Customer", customer, "customer_name")
    for journal in journal_entries:
        amount = flt(journal.get("unallocated_amount"))
        if amount <= 0:
            continue

        unallocated_payment.append(
            {
                "name": journal.get("name"),
                "paid_amount": amount,
                "received_amount": amount,
                "customer_name": customer_name,
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

    credit_notes = frappe.get_all(
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
