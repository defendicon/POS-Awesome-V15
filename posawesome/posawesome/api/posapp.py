# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe
import urllib.parse
from frappe.utils import nowdate, flt, cstr, getdate
from frappe import _
from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
from erpnext.stock.get_item_details import get_item_details
from erpnext.accounts.doctype.pos_profile.pos_profile import get_item_groups
from frappe.utils.background_jobs import enqueue
from erpnext.accounts.party import get_party_bank_account
from erpnext.stock.doctype.batch.batch import (
    get_batch_no,
    get_batch_qty,
)
from erpnext.accounts.doctype.payment_request.payment_request import (
    get_dummy_message,
    get_existing_payment_request_amount,
)

from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
from erpnext.accounts.doctype.loyalty_program.loyalty_program import (
    get_loyalty_program_details_with_points,
)
from posawesome.posawesome.doctype.pos_coupon.pos_coupon import check_coupon_code
from posawesome.posawesome.doctype.delivery_charges.delivery_charges import (
    get_applicable_delivery_charges as _get_applicable_delivery_charges,
)
from frappe.utils.caching import redis_cache
from frappe.utils.print_format import validate_print_permission
from frappe.translate import print_language


def set_batch_nos(doc, warehouse_field, throw=False):
    """Automatically select `batch_no` for outgoing items in item table"""
    for d in doc.items:
        qty = d.get("qty") or 0
        has_batch_no = frappe.db.get_value("Item", d.item_code, "has_batch_no")
        warehouse = d.get(warehouse_field, None)
        if has_batch_no and warehouse and qty > 0:
            if not d.batch_no:
                d.batch_no = get_batch_no(d.item_code, warehouse, qty, throw, d.serial_no)
            else:
                batch_qty = get_batch_qty(batch_no=d.batch_no, warehouse=warehouse)
                if flt(batch_qty, d.precision("qty")) < flt(qty, d.precision("qty")):
                    frappe.throw(
                        _(
                            "Row #{0}: The batch {1} has only {2} qty. Please select another batch which has {3} qty available or split the row into multiple rows, to deliver/issue from multiple batches"
                        ).format(d.idx, d.batch_no, batch_qty, qty)
                    )


@frappe.whitelist()
def get_sales_person_names():
    sales_persons = frappe.get_list(
        "Sales Person",
        filters={"enabled": 1},
        fields=["name", "sales_person_name"],
        limit_page_length=100000,
    )
    return sales_persons


@frappe.whitelist()
def get_opening_dialog_data():
    data = {}
    data["companies"] = frappe.get_list("Company", limit_page_length=0, order_by="name")
    data["pos_profiles_data"] = frappe.get_list(
        "POS Profile",
        filters={"disabled": 0},
        fields=["name", "company", "currency"],
        limit_page_length=0,
        order_by="name",
    )

    pos_profiles_list = []
    for i in data["pos_profiles_data"]:
        pos_profiles_list.append(i.name)

    payment_method_table = (
        "POS Payment Method" if get_version() == 13 else "Sales Invoice Payment"
    )
    data["payments_method"] = frappe.get_list(
        payment_method_table,
        filters={"parent": ["in", pos_profiles_list]},
        fields=["*"],
        limit_page_length=0,
        order_by="parent",
        ignore_permissions=True,
    )
    # set currency from pos profile
    for mode in data["payments_method"]:
        mode["currency"] = frappe.get_cached_value(
            "POS Profile", mode["parent"], "currency"
        )

    return data


@frappe.whitelist()
def create_opening_voucher(pos_profile, company, balance_details):
    balance_details = json.loads(balance_details)

    new_pos_opening = frappe.get_doc(
        {
            "doctype": "POS Opening Shift",
            "period_start_date": frappe.utils.get_datetime(),
            "posting_date": frappe.utils.getdate(),
            "user": frappe.session.user,
            "pos_profile": pos_profile,
            "company": company,
            "docstatus": 1,
        }
    )
    new_pos_opening.set("balance_details", balance_details)
    new_pos_opening.insert(ignore_permissions=True)

    data = {}
    data["pos_opening_shift"] = new_pos_opening.as_dict()
    update_opening_shift_data(data, new_pos_opening.pos_profile)
    return data


@frappe.whitelist()
def check_opening_shift(user):
    open_vouchers = frappe.db.get_all(
        "POS Opening Shift",
        filters={
            "user": user,
            "pos_closing_shift": ["in", ["", None]],
            "docstatus": 1,
            "status": "Open",
        },
        fields=["name", "pos_profile"],
        order_by="period_start_date desc",
    )
    data = ""
    if len(open_vouchers) > 0:
        data = {}
        data["pos_opening_shift"] = frappe.get_doc(
            "POS Opening Shift", open_vouchers[0]["name"]
        )
        update_opening_shift_data(data, open_vouchers[0]["pos_profile"])
    return data


def update_opening_shift_data(data, pos_profile):
    data["pos_profile"] = frappe.get_doc("POS Profile", pos_profile)
    data["company"] = frappe.get_doc("Company", data["pos_profile"].company)
    allow_negative_stock = frappe.get_value(
        "Stock Settings", None, "allow_negative_stock"
    )
    data["stock_settings"] = {}
    data["stock_settings"].update({"allow_negative_stock": allow_negative_stock})


def get_version():
    branch_name = get_app_branch("erpnext")
    if "12" in branch_name:
        return 12
    elif "13" in branch_name:
        return 13
    else:
        return 13


def get_app_branch(app):
    """Returns branch of an app"""
    import subprocess

    try:
        branch = subprocess.check_output(
            "cd ../apps/{0} && git rev-parse --abbrev-ref HEAD".format(app), shell=True
        )
        branch = branch.decode("utf-8")
        branch = branch.strip()
        return branch
    except Exception:
        return ""


@frappe.whitelist()
def submit_invoice(invoice, data):
    data = json.loads(data)
    invoice = json.loads(invoice)
    pdf_link = download_pdf("Sales Invoice", invoice.get("name"), format= "POS SI Receipt VAT")
    invoice_doc = frappe.get_doc("Sales Invoice", invoice.get("name"))
    invoice_doc.custom_pdf_link = pdf_link["message"]
    invoice_doc.update(invoice)
    if invoice.get("posa_delivery_date"):
        invoice_doc.update_stock = 0
    mop_cash_list = [
        i.mode_of_payment
        for i in invoice_doc.payments
        if "cash" in i.mode_of_payment.lower() and i.type == "Cash"
    ]
    if len(mop_cash_list) > 0:
        cash_account = get_bank_cash_account(mop_cash_list[0], invoice_doc.company)
    else:
        cash_account = {
            "account": frappe.get_value(
                "Company", invoice_doc.company, "default_cash_account"
            )
        }

    # creating advance payment
    if data.get("credit_change"):
        advance_payment_entry = frappe.get_doc(
            {
                "doctype": "Payment Entry",
                "mode_of_payment": "Cash",
                "paid_to": cash_account["account"],
                "payment_type": "Receive",
                "party_type": "Customer",
                "party": invoice_doc.get("customer"),
                "paid_amount": invoice_doc.get("credit_change"),
                "received_amount": invoice_doc.get("credit_change"),
                "company": invoice_doc.get("company"),
            }
        )

        advance_payment_entry.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        advance_payment_entry.save()
        advance_payment_entry.submit()

    # calculating cash
    total_cash = 0
    if data.get("redeemed_customer_credit"):
        total_cash = invoice_doc.total - float(data.get("redeemed_customer_credit"))

    is_payment_entry = 0
    if data.get("redeemed_customer_credit"):
        for row in data.get("customer_credit_dict"):
            if row["type"] == "Advance" and row["credit_to_redeem"]:
                advance = frappe.get_doc("Payment Entry", row["credit_origin"])

                advance_payment = {
                    "reference_type": "Payment Entry",
                    "reference_name": advance.name,
                    "remarks": advance.remarks,
                    "advance_amount": advance.unallocated_amount,
                    "allocated_amount": row["credit_to_redeem"],
                }

                invoice_doc.append("advances", advance_payment)
                invoice_doc.is_pos = 0
                is_payment_entry = 1

    payments = invoice_doc.payments

    if frappe.get_value("POS Profile", invoice_doc.pos_profile, "posa_auto_set_batch"):
        set_batch_nos(invoice_doc, "warehouse", throw=True)
    set_batch_nos_for_bundels(invoice_doc, "warehouse", throw=True)

    invoice_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    invoice_doc.posa_is_printed = 1
    invoice_doc.save()

    if data.get("due_date"):
        frappe.db.set_value(
            "Sales Invoice",
            invoice_doc.name,
            "due_date",
            data.get("due_date"),
            update_modified=False,
        )

    if frappe.get_value(
        "POS Profile",
        invoice_doc.pos_profile,
        "posa_allow_submissions_in_background_job",
    ):
        invoices_list = frappe.get_all(
            "Sales Invoice",
            filters={
                "posa_pos_opening_shift": invoice_doc.posa_pos_opening_shift,
                "docstatus": 0,
                "posa_is_printed": 1,
            },
        )
        for invoice in invoices_list:
            enqueue(
                method=submit_in_background_job,
                queue="short",
                timeout=1000,
                is_async=True,
                kwargs={
                    "invoice": invoice.name,
                    "data": data,
                    "is_payment_entry": is_payment_entry,
                    "total_cash": total_cash,
                    "cash_account": cash_account,
                    "payments": payments,
                },
            )
    else:
        invoice_doc.submit()
        redeeming_customer_credit(
            invoice_doc, data, is_payment_entry, total_cash, cash_account, payments
        )

    # Create appointment if submit and rebook is enabled
    if invoice.get("custom_is_submit_and_rebook"):
        # Get customer details
        customer_doc = frappe.get_doc("Customer", invoice_doc.customer)
        email = customer_doc.email_id
        phone = customer_doc.mobile_no

        # Get customer country code if available
        country_code = ""
        if hasattr(customer_doc, "custom_country_code"):
            country_code = customer_doc.custom_country_code or ""

        # Create appointment
        appointment = frappe.new_doc("Appointment")
        appointment.customer_email = email
        appointment.customer_name = invoice_doc.customer
        appointment.status = "Open"
        appointment.appointment_with = "Customer"
        appointment.party = invoice_doc.customer
        appointment.custom_sales_invoice = invoice_doc.name
        appointment.customer_phone_number = f"{country_code}{phone}" if country_code else phone

        # Add service staff from invoice items
        for item in invoice_doc.items:
            if item.get("custom_hair_stylist_1"):
                appointment.append(
                    "custom_service_staff",
                    {
                        "service_item": item.get("item_code"),
                        "sales_person": item.get("custom_hair_stylist_1"),
                    },
                )
            if item.get("custom_hair_stylist_2"):
                appointment.append(
                    "custom_service_staff",
                    {
                        "service_item": item.get("item_code"),
                        "sales_person": item.get("custom_hair_stylist_2"),
                    },
                )
            if item.get("custom_hair_stylist_3"):
                appointment.append(
                    "custom_service_staff",
                    {
                        "service_item": item.get("item_code"),
                        "sales_person": item.get("custom_hair_stylist_3"),
                    },
                )

        appointment.flags.ignore_permissions = True
        appointment.flags.ignore_mandatory = True
        appointment.save()

        # Return appointment URL for frontend
        url = f"{frappe.utils.get_url()}/app/appointment/{appointment.name}"
        return {"name": invoice_doc.name, "status": invoice_doc.docstatus, "url": url}
    
    return {"name": invoice_doc.name, "status": invoice_doc.docstatus, "url": ""}


def set_batch_nos_for_bundels(doc, warehouse_field, throw=False):
    """Automatically select `batch_no` for outgoing items in item table"""
    for d in doc.packed_items:
        qty = d.get("stock_qty") or d.get("transfer_qty") or d.get("qty") or 0
        has_batch_no = frappe.db.get_value("Item", d.item_code, "has_batch_no")
        warehouse = d.get(warehouse_field, None)
        if has_batch_no and warehouse and qty > 0:
            if not d.batch_no:
                d.batch_no = get_batch_no(
                    d.item_code, warehouse, qty, throw, d.serial_no
                )
            else:
                batch_qty = get_batch_qty(batch_no=d.batch_no, warehouse=warehouse)
                if flt(batch_qty, d.precision("qty")) < flt(qty, d.precision("qty")):
                    frappe.throw(
                        _(
                            "Row #{0}: The batch {1} has only {2} qty. Please select another batch which has {3} qty available or split the row into multiple rows, to deliver/issue from multiple batches"
                        ).format(d.idx, d.batch_no, batch_qty, qty)
                    )


def redeeming_customer_credit(
    invoice_doc, data, is_payment_entry, total_cash, cash_account, payments
):
    # redeeming customer credit with journal voucher
    today = nowdate()
    if data.get("redeemed_customer_credit"):
        cost_center = frappe.get_value(
            "POS Profile", invoice_doc.pos_profile, "cost_center"
        )
        if not cost_center:
            cost_center = frappe.get_value(
                "Company", invoice_doc.company, "cost_center"
            )
        if not cost_center:
            frappe.throw(
                _("Cost Center is not set in pos profile {}").format(
                    invoice_doc.pos_profile
                )
            )
        for row in data.get("customer_credit_dict"):
            if row["type"] == "Invoice" and row["credit_to_redeem"]:
                outstanding_invoice = frappe.get_doc(
                    "Sales Invoice", row["credit_origin"]
                )

                jv_doc = frappe.get_doc(
                    {
                        "doctype": "Journal Entry",
                        "voucher_type": "Journal Entry",
                        "posting_date": today,
                        "company": invoice_doc.company,
                    }
                )

                jv_debit_entry = {
                    "account": outstanding_invoice.debit_to,
                    "party_type": "Customer",
                    "party": invoice_doc.customer,
                    "reference_type": "Sales Invoice",
                    "reference_name": outstanding_invoice.name,
                    "debit_in_account_currency": row["credit_to_redeem"],
                    "cost_center": cost_center,
                }

                jv_credit_entry = {
                    "account": invoice_doc.debit_to,
                    "party_type": "Customer",
                    "party": invoice_doc.customer,
                    "reference_type": "Sales Invoice",
                    "reference_name": invoice_doc.name,
                    "credit_in_account_currency": row["credit_to_redeem"],
                    "cost_center": cost_center,
                }

                jv_doc.append("accounts", jv_debit_entry)
                jv_doc.append("accounts", jv_credit_entry)

                jv_doc.flags.ignore_permissions = True
                frappe.flags.ignore_account_permission = True
                jv_doc.set_missing_values()
                jv_doc.save()
                jv_doc.submit()

    if is_payment_entry and total_cash > 0:
        for payment in payments:
            if not payment.amount:
                continue
            payment_entry_doc = frappe.get_doc(
                {
                    "doctype": "Payment Entry",
                    "posting_date": today,
                    "payment_type": "Receive",
                    "party_type": "Customer",
                    "party": invoice_doc.customer,
                    "paid_amount": payment.amount,
                    "received_amount": payment.amount,
                    "paid_from": invoice_doc.debit_to,
                    "paid_to": payment.account,
                    "company": invoice_doc.company,
                    "mode_of_payment": payment.mode_of_payment,
                    "reference_no": invoice_doc.posa_pos_opening_shift,
                    "reference_date": today,
                }
            )

            payment_reference = {
                "allocated_amount": payment.amount,
                "due_date": data.get("due_date"),
                "reference_doctype": "Sales Invoice",
                "reference_name": invoice_doc.name,
            }

            payment_entry_doc.append("references", payment_reference)
            payment_entry_doc.flags.ignore_permissions = True
            frappe.flags.ignore_account_permission = True
            payment_entry_doc.save()
            payment_entry_doc.submit()


def submit_in_background_job(kwargs):
    invoice = kwargs.get("invoice")
    invoice_doc = kwargs.get("invoice_doc")
    data = kwargs.get("data")
    is_payment_entry = kwargs.get("is_payment_entry")
    total_cash = kwargs.get("total_cash")
    cash_account = kwargs.get("cash_account")
    payments = kwargs.get("payments")

    invoice_doc = frappe.get_doc("Sales Invoice", invoice)
    invoice_doc.submit()
    redeeming_customer_credit(
        invoice_doc, data, is_payment_entry, total_cash, cash_account, payments
    )


def download_pdf(
    doctype,
    name,
    format=None,
    doc=None,
    no_letterhead=0,
    language=None,
    letterhead=None,
):
    doc = doc or frappe.get_doc(doctype, name)
    validate_print_permission(doc)

    with print_language(language):
        pdf_file = frappe.get_print(
            doctype,
            name,
            format,
            doc=doc,
            as_pdf=True,
            letterhead=letterhead,
            no_letterhead=no_letterhead,
        )

    # Correct file path in Frappe
    file_name = f"{name.replace(' ', '-').replace('/', '-')}.pdf"
    file_path = frappe.get_site_path(
        "public", "files", file_name
    )  # Saves to public/files/

    # Save PDF to the correct location
    with open(file_path, "wb") as f:
        f.write(pdf_file)

    # Create a new file record in Frappe
    file_doc = frappe.get_doc(
        {
            "doctype": "File",
            "file_url": f"/files/{file_name}",
            "attached_to_doctype": doctype,
            "attached_to_name": name,
            "is_private": 0,
        }
    )
    file_doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"message": file_doc.file_url}  # Return the file URL


def get_customer_groups(pos_profile):
    """Get customer groups from POS Profile"""
    customer_groups = []
    if pos_profile.get("customer_group"):
        customer_groups = [pos_profile.get("customer_group")]
    return customer_groups


def get_customer_territories(pos_profile):
    """Get customer territories from POS Profile"""
    customer_territories = []
    if pos_profile.get("customer_territory"):
        customer_territories = [pos_profile.get("customer_territory")]
    return customer_territories


def get_customer_types(pos_profile):
    """Get customer types from POS Profile"""
    customer_types = []
    if pos_profile.get("customer_type"):
        customer_types = [pos_profile.get("customer_type")]
    return customer_types


def get_customer_group_condition(pos_profile):
    """Get customer group condition for filtering"""
    cond = "disabled = 0"
    customer_groups = get_customer_groups(pos_profile)
    if customer_groups:
        cond = " customer_group in (%s)" % (", ".join(["%s"] * len(customer_groups)))
        return cond % tuple(customer_groups)
    return cond


def get_customer_territory_condition(pos_profile):
    """Get customer territory condition for filtering"""
    customer_territories = get_customer_territories(pos_profile)
    if customer_territories:
        return " territory in (%s)" % (", ".join(["%s"] * len(customer_territories))) % tuple(customer_territories)
    return ""


def get_customer_type_condition(pos_profile):
    """Get customer type condition for filtering"""
    customer_types = get_customer_types(pos_profile)
    if customer_types:
        return " customer_type in (%s)" % (", ".join(["%s"] * len(customer_types))) % tuple(customer_types)
    return ""


@frappe.whitelist()
def get_customer_names(pos_profile, query=None):
    """Get customer names filtered by POS Profile settings"""
    pos_profile = json.loads(pos_profile) if isinstance(pos_profile, str) else pos_profile
    condition = ""
    condition += get_customer_group_condition(pos_profile)
    condition += get_customer_territory_condition(pos_profile)
    condition += get_customer_type_condition(pos_profile)
    
    if query:
        condition += f""" AND (name LIKE '%{query}%' 
        OR customer_name LIKE '%{query}%' 
        OR mobile_no LIKE '%{query}%'
        OR custom_search_mobile_no LIKE '%{query}%'
        OR email_id LIKE '%{query}%'
        OR tax_id LIKE '%{query}%'
        ) """
    
    customers = frappe.db.sql(
        """
        SELECT name, mobile_no, custom_search_mobile_no, email_id, tax_id, customer_name, 
               primary_address, customer_group, custom_customer_id, custom_customer_name,
               territory, customer_type
        FROM `tabCustomer`
        WHERE {0}
        ORDER by name LIMIT 1000
        """.format(condition),
        as_dict=1,
    )
    
    if pos_profile.get('customer'):
        try:
            default_customer = frappe.get_doc("Customer", pos_profile.get('customer'))
            customers.append(default_customer)
        except frappe.DoesNotExistError:
            pass
        
    return customers
