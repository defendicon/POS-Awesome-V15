# Copyright (c) 2025, Contributors
# For license information, please see license.txt

import json

import frappe


@frappe.whitelist()
def search_quotations(company, currency, quotation_name=None):
    filters = {
        "docstatus": 1,
        "company": company,
        "currency": currency,
    }
    if quotation_name:
        filters["name"] = ["like", f"%{quotation_name}%"]
    quotations = frappe.get_list(
        "Quotation",
        filters=filters,
        fields=["name"],
        limit_page_length=0,
        order_by="customer_name",
    )
    data = []
    for q in quotations:
        data.append(frappe.get_doc("Quotation", q["name"]))
    return data


@frappe.whitelist()
def update_quotation(data):
    data = json.loads(data)
    if data.get("name") and frappe.db.exists("Quotation", data.get("name")):
        q_doc = frappe.get_doc("Quotation", data.get("name"))
        q_doc.update(data)
    else:
        q_doc = frappe.get_doc(data)
    q_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    q_doc.docstatus = 0
    q_doc.save()
    return q_doc


@frappe.whitelist()
def submit_quotation(order):
    order = json.loads(order)
    if order.get("name") and frappe.db.exists("Quotation", order.get("name")):
        q_doc = frappe.get_doc("Quotation", order.get("name"))
        q_doc.update(order)
    else:
        q_doc = frappe.get_doc(order)
    q_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    q_doc.save()
    q_doc.submit()
    return {"name": q_doc.name, "status": q_doc.docstatus}
