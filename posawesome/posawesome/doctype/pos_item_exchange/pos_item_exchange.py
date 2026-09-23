import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr


LINKED_DOCUMENTS = (
    ("Journal Entry", "reconciliation_journal", _("Reconciliation Journal")),
    (None, "replacement_invoice", _("Replacement Invoice")),
    (None, "return_invoice", _("Return Invoice")),
)


class POSItemExchange(Document):
    def on_trash(self):
        if cstr(self.status) != "Cancelled":
            frappe.throw(_("Cancel the item exchange before deleting it."))

        submitted = _submitted_linked_documents(self)
        if submitted:
            frappe.throw(
                _("Cannot delete this exchange while linked documents are submitted: {0}").format(
                    ", ".join(submitted)
                )
            )


def _linked_document_rows(exchange_doc):
    invoice_type = cstr(exchange_doc.get("invoice_type") or "Sales Invoice")
    for fixed_doctype, fieldname, label in LINKED_DOCUMENTS:
        name = cstr(exchange_doc.get(fieldname)).strip()
        if not name:
            continue
        yield fixed_doctype or invoice_type, name, label


def _submitted_linked_documents(exchange_doc):
    submitted = []
    for doctype, name, _label in _linked_document_rows(exchange_doc):
        if frappe.db.exists(doctype, name) and cint(
            frappe.db.get_value(doctype, name, "docstatus")
        ) == 1:
            submitted.append(f"{doctype} {name}")
    return submitted


def _cancel_linked_document(doctype, name, label):
    if not frappe.db.exists(doctype, name):
        return {"doctype": doctype, "name": name, "status": "Missing"}

    linked_doc = frappe.get_doc(doctype, name)
    docstatus = cint(linked_doc.docstatus)
    if docstatus == 1:
        # The caller has already passed the stricter delete permission check on
        # the exchange record. Use that single authorization boundary so a
        # System Manager does not also need every accounting role involved in
        # the linked documents.
        linked_doc.flags.ignore_permissions = True
        linked_doc.cancel()
        status = "Cancelled"
    elif docstatus == 2:
        status = "Already Cancelled"
    else:
        frappe.throw(
            _("{0} {1} is still a draft. Resolve it before cancelling the exchange.").format(
                label, name
            )
        )

    return {"doctype": doctype, "name": name, "status": status}


@frappe.whitelist()
def cancel_item_exchange(name):
    exchange_doc = frappe.get_doc("POS Item Exchange", name)
    exchange_doc.check_permission("delete")

    if cstr(exchange_doc.status) == "Cancelled":
        submitted = _submitted_linked_documents(exchange_doc)
        if submitted:
            frappe.throw(
                _("Exchange is marked cancelled but linked documents remain submitted: {0}").format(
                    ", ".join(submitted)
                )
            )
        return {"name": exchange_doc.name, "status": "Cancelled", "documents": []}

    if cstr(exchange_doc.status) != "Completed":
        frappe.throw(_("Only completed item exchanges can be cancelled."))

    cancelled_documents = []
    for doctype, document_name, label in _linked_document_rows(exchange_doc):
        cancelled_documents.append(
            _cancel_linked_document(doctype, document_name, label)
        )

    submitted = _submitted_linked_documents(exchange_doc)
    if submitted:
        frappe.throw(
            _("Exchange cancellation is incomplete. Submitted documents remain: {0}").format(
                ", ".join(submitted)
            )
        )

    exchange_doc.db_set("status", "Cancelled", update_modified=True)
    return {
        "name": exchange_doc.name,
        "status": "Cancelled",
        "documents": cancelled_documents,
    }
