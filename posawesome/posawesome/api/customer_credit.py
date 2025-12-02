"""Customer Credit Payment Method Integration for POSAwesome."""

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def get_customer_credit_for_payment(customer: str, company: str):
	"""
	Get available customer credit to use as payment method.
	
	Args:
		customer: Customer ID
		company: Company name
	
	Returns:
		Dict with available credit amount
	"""
	try:
		# Get all return invoices with negative outstanding (credit available)
		credits = frappe.db.sql("""
			SELECT 
				SUM(ABS(outstanding_amount)) as total_credit
			FROM `tabSales Invoice`
			WHERE customer = %s
				AND company = %s
				AND docstatus = 1
				AND is_return = 1
				AND outstanding_amount < 0
		""", (customer, company), as_dict=True)
		
		total_credit = flt(credits[0].total_credit) if credits and credits[0].total_credit else 0
		
		return {
			"available_credit": total_credit,
			"can_use_credit": total_credit > 0,
		}
	
	except Exception as e:
		frappe.log_error(f"Error getting customer credit for payment: {str(e)}", "Customer Credit Payment Error")
		return {
			"available_credit": 0,
			"can_use_credit": False,
		}


@frappe.whitelist()
def apply_credit_to_invoice(invoice_name: str, credit_amount: float):
	"""
	Apply customer credit to an invoice by creating a payment entry.
	
	Args:
		invoice_name: Sales Invoice name
		credit_amount: Amount of credit to apply
	
	Returns:
		Payment entry details
	"""
	try:
		credit_amount = flt(credit_amount)
		
		if credit_amount <= 0:
			frappe.throw(_("Credit amount must be positive"))
		
		# Get invoice
		invoice = frappe.get_doc("Sales Invoice", invoice_name)
		
		# Get customer credit
		credit_info = get_customer_credit_for_payment(invoice.customer, invoice.company)
		available_credit = credit_info.get("available_credit", 0)
		
		if credit_amount > available_credit:
			frappe.throw(_("Requested credit {0} exceeds available credit {1}").format(
				credit_amount, available_credit
			))
		
		if credit_amount > invoice.outstanding_amount:
			credit_amount = invoice.outstanding_amount
		
		# Get return invoices to allocate from
		return_invoices = frappe.db.sql("""
			SELECT 
				name,
				outstanding_amount
			FROM `tabSales Invoice`
			WHERE customer = %s
				AND company = %s
				AND docstatus = 1
				AND is_return = 1
				AND outstanding_amount < 0
			ORDER BY posting_date ASC
		""", (invoice.customer, invoice.company), as_dict=True)
		
		# Create payment entry
		from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
		
		# Use the first return invoice as reference
		if return_invoices:
			payment_entry = get_payment_entry(
				"Sales Invoice",
				return_invoices[0].name,
				party_amount=credit_amount
			)
			
			# Clear existing references and add our invoice
			payment_entry.references = []
			payment_entry.append("references", {
				"reference_doctype": "Sales Invoice",
				"reference_name": invoice_name,
				"allocated_amount": credit_amount,
			})
			
			payment_entry.remarks = f"Customer Credit Applied from Return Invoice(s)"
			payment_entry.flags.ignore_permissions = True
			frappe.flags.ignore_account_permission = True
			payment_entry.insert()
			payment_entry.submit()
			
			frappe.db.commit()
			
			return {
				"success": True,
				"payment_entry": payment_entry.name,
				"credit_applied": credit_amount,
				"message": _("Customer credit of {0} applied successfully").format(credit_amount),
			}
		else:
			frappe.throw(_("No return invoices found for customer credit"))
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(f"Error applying credit to invoice: {str(e)}", "Customer Credit Payment Error")
		frappe.throw(_("Error applying credit: {0}").format(str(e)))

