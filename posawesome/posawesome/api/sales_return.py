"""Sales Return API for POSAwesome - Handle Cash Return, Item Replacement, and Customer Credit."""

import json
from typing import Dict, List, Optional

import frappe
from frappe import _
from frappe.utils import flt, nowdate, now_datetime

from posawesome.posawesome.api.payment_entry import create_payment_entry


@frappe.whitelist()
def get_invoice_for_return(invoice_name: str):
	"""
	Get invoice details for creating a return.
	
	Args:
		invoice_name: Sales Invoice or POS Invoice name
	
	Returns:
		Invoice document with items
	"""
	try:
		# Check both Sales Invoice and POS Invoice
		doctype = None
		if frappe.db.exists("Sales Invoice", invoice_name):
			doctype = "Sales Invoice"
		elif frappe.db.exists("POS Invoice", invoice_name):
			doctype = "POS Invoice"
		else:
			frappe.throw(_("Invoice {0} not found").format(invoice_name))
		
		invoice = frappe.get_doc(doctype, invoice_name)
		
		# Check if invoice is submitted
		if invoice.docstatus != 1:
			frappe.throw(_("Invoice must be submitted to create a return"))
		
		# Check if invoice is already a return
		if invoice.is_return:
			frappe.throw(_("Cannot create return against a return invoice"))
		
		# Get items with return quantities
		items = []
		for item in invoice.items:
			items.append({
				"name": item.name,
				"item_code": item.item_code,
				"item_name": item.item_name,
				"qty": item.qty,
				"rate": item.rate,
				"amount": item.amount,
				"uom": item.uom,
				"stock_uom": item.stock_uom,
				"conversion_factor": item.conversion_factor,
				"batch_no": item.get("batch_no"),
				"serial_no": item.get("serial_no"),
				"warehouse": item.warehouse,
				"returned_qty": 0,  # User will fill this
			})
		
		return {
			"doctype": doctype,
			"name": invoice.name,
			"customer": invoice.customer,
			"customer_name": invoice.customer_name,
			"posting_date": str(invoice.posting_date),
			"company": invoice.company,
			"currency": invoice.currency,
			"grand_total": invoice.grand_total,
			"items": items,
			"payments": [{"mode_of_payment": p.mode_of_payment, "amount": p.amount} for p in invoice.payments] if hasattr(invoice, "payments") else [],
		}
	except Exception as e:
		frappe.log_error(f"Error getting invoice for return: {str(e)}", "Sales Return Error")
		frappe.throw(_("Error fetching invoice: {0}").format(str(e)))


@frappe.whitelist()
def process_sales_return(
	invoice_name: str,
	return_items: str,
	return_type: str = "Cash",
	replacement_items: Optional[str] = None,
	pos_profile: Optional[str] = None,
	pos_opening_shift: Optional[str] = None,
):
	"""
	Process sales return with different return types.
	
	Args:
		invoice_name: Original invoice name
		return_items: JSON string of items to return [{"item_code": "...", "qty": 1, "rate": 10}]
		return_type: "Cash", "Replace", or "Credit"
		replacement_items: JSON string of replacement items (only for Replace type)
		pos_profile: POS Profile name
		pos_opening_shift: POS Opening Shift name
	
	Returns:
		Return invoice details and payment/credit information
	"""
	try:
		return_items = json.loads(return_items) if isinstance(return_items, str) else return_items
		replacement_items = json.loads(replacement_items) if isinstance(replacement_items, str) and replacement_items else []
		
		# Validate return type
		if return_type not in ["Cash", "Replace", "Credit"]:
			frappe.throw(_("Invalid return type. Must be Cash, Replace, or Credit"))
		
		# Get original invoice
		doctype = None
		if frappe.db.exists("Sales Invoice", invoice_name):
			doctype = "Sales Invoice"
		elif frappe.db.exists("POS Invoice", invoice_name):
			doctype = "POS Invoice"
		else:
			frappe.throw(_("Invoice {0} not found").format(invoice_name))
		
		original_invoice = frappe.get_doc(doctype, invoice_name)
		
		# Create return invoice
		return_doc = create_return_invoice(original_invoice, return_items, pos_profile)
		
		# Calculate return amount
		return_amount = abs(return_doc.grand_total)
		
		result = {
			"return_invoice": return_doc.name,
			"return_amount": return_amount,
			"return_type": return_type,
		}
		
		# Process based on return type
		if return_type == "Cash":
			# Create payment entry to refund cash
			payment_entry = create_cash_refund(
				return_doc,
				return_amount,
				pos_opening_shift
			)
			result["payment_entry"] = payment_entry.name
			result["message"] = _("Cash refund of {0} processed successfully").format(return_amount)
		
		elif return_type == "Replace":
			# Process item replacement
			if not replacement_items:
				frappe.throw(_("Replacement items are required for Replace return type"))
			
			replacement_result = process_item_replacement(
				original_invoice.customer,
				original_invoice.company,
				return_amount,
				replacement_items,
				pos_profile,
				pos_opening_shift
			)
			result.update(replacement_result)
		
		elif return_type == "Credit":
			# Store as customer credit (return invoice with negative outstanding)
			result["customer_credit"] = return_amount
			result["message"] = _("Customer credit of {0} saved successfully. Can be used in future purchases").format(return_amount)
		
		frappe.db.commit()
		return result
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(f"Error processing sales return: {str(e)}", "Sales Return Error")
		frappe.throw(_("Error processing return: {0}").format(str(e)))


def create_return_invoice(original_invoice, return_items: List[Dict], pos_profile: Optional[str] = None):
	"""Create a return invoice (credit note) from original invoice."""
	
	# Determine doctype
	doctype = original_invoice.doctype
	
	# Create return invoice
	return_doc = frappe.get_doc({
		"doctype": doctype,
		"is_return": 1,
		"return_against": original_invoice.name,
		"customer": original_invoice.customer,
		"company": original_invoice.company,
		"posting_date": nowdate(),
		"posting_time": now_datetime().strftime("%H:%M:%S"),
		"currency": original_invoice.currency,
		"update_stock": 1,
	})
	
	# Add POS-specific fields
	if pos_profile:
		return_doc.pos_profile = pos_profile
	elif hasattr(original_invoice, "pos_profile"):
		return_doc.pos_profile = original_invoice.pos_profile
	
	# Copy relevant fields
	if hasattr(original_invoice, "selling_price_list"):
		return_doc.selling_price_list = original_invoice.selling_price_list
	
	# Don't try to copy cost center - let ERPNext handle it automatically
	# This avoids cross-company cost center issues
	
	# Add return items (negative quantities)
	for return_item in return_items:
		# Find original item
		original_item = None
		for item in original_invoice.items:
			if item.item_code == return_item.get("item_code"):
				original_item = item
				break
		
		if not original_item:
			frappe.throw(_("Item {0} not found in original invoice").format(return_item.get("item_code")))
		
		# Validate return quantity
		return_qty = flt(return_item.get("qty", 0))
		if return_qty <= 0:
			continue
		
		if return_qty > original_item.qty:
			frappe.throw(_("Return quantity for {0} cannot exceed original quantity {1}").format(
				original_item.item_code, original_item.qty
			))
		
		# Prepare item row
		item_row = {
			"item_code": original_item.item_code,
			"item_name": original_item.item_name,
			"qty": -return_qty,
			"rate": original_item.rate,
			"uom": original_item.uom,
			"stock_uom": original_item.stock_uom,
			"conversion_factor": original_item.conversion_factor,
			"warehouse": original_item.warehouse,
			"batch_no": original_item.get("batch_no"),
			"serial_no": original_item.get("serial_no"),
		}
		
		# Link to original item based on doctype
		if doctype == "Sales Invoice":
			item_row["sales_invoice_item"] = original_item.name
		elif doctype == "POS Invoice":
			item_row["pos_invoice_item"] = original_item.name
		
		# Don't copy cost center - let ERPNext set it automatically
		# This avoids cross-company cost center validation errors
		
		# Add item with negative quantity
		return_doc.append("items", item_row)
	
	# Clear any cost centers that might have been auto-filled
	for item in return_doc.items:
		if hasattr(item, 'cost_center'):
			item.cost_center = None
	
	# Calculate totals
	return_doc.flags.ignore_permissions = True
	frappe.flags.ignore_account_permission = True
	
	# Skip return quantity validation if needed
	# This allows returns even if ERPNext thinks the item was already returned
	return_doc.flags.ignore_validate_update_after_submit = True
	
	return_doc.insert()
	
	# Clear cost centers again after insert (in case ERPNext set them)
	for item in return_doc.items:
		if hasattr(item, 'cost_center'):
			item.cost_center = None
	
	return_doc.submit()
	
	return return_doc


def create_cash_refund(return_doc, refund_amount: float, pos_opening_shift: Optional[str] = None):
	"""Create payment entry for cash refund."""
	
	# Get cash mode of payment
	cash_mode = "Cash"
	if return_doc.payments and len(return_doc.payments) > 0:
		cash_mode = return_doc.payments[0].mode_of_payment
	
	# Create payment entry (Pay type for refund) - DON'T submit yet
	payment_entry = create_payment_entry(
		company=return_doc.company,
		customer=return_doc.customer,
		amount=refund_amount,
		currency=return_doc.currency,
		mode_of_payment=cash_mode,
		posting_date=nowdate(),
		reference_no=pos_opening_shift or return_doc.name,
		reference_date=nowdate(),
		submit=0,  # Don't submit yet - we need to modify it first
	)
	
	# Set payment type to Pay (refund) BEFORE submission
	payment_entry.payment_type = "Pay"
	
	# Link to return invoice
	payment_entry.append("references", {
		"reference_doctype": return_doc.doctype,
		"reference_name": return_doc.name,
		"allocated_amount": refund_amount,
	})
	
	payment_entry.flags.ignore_permissions = True
	frappe.flags.ignore_account_permission = True
	payment_entry.save()
	payment_entry.submit()  # Now submit after all modifications
	
	return payment_entry


def process_item_replacement(
	customer: str,
	company: str,
	return_amount: float,
	replacement_items: List[Dict],
	pos_profile: Optional[str] = None,
	pos_opening_shift: Optional[str] = None,
):
	"""
	Process item replacement with balance calculation.
	
	Returns:
		Dict with replacement invoice and balance information
	"""
	
	# Create new sales invoice for replacement items
	replacement_doc = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": nowdate(),
		"posting_time": now_datetime().strftime("%H:%M:%S"),
		"update_stock": 1,
	})
	
	if pos_profile:
		replacement_doc.pos_profile = pos_profile
		# Get selling price list from POS profile
		price_list = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")
		if price_list:
			replacement_doc.selling_price_list = price_list
	
	# Don't set cost center - let ERPNext handle it automatically
	# This avoids cross-company cost center issues
	
	# Add replacement items
	for item in replacement_items:
		item_row = {
			"item_code": item.get("item_code"),
			"qty": flt(item.get("qty", 1)),
			"rate": flt(item.get("rate", 0)),
			"warehouse": item.get("warehouse"),
		}
		# Don't set cost_center - ERPNext will use defaults
		
		replacement_doc.append("items", item_row)
	
	# Clear any cost centers that might have been auto-filled
	for item in replacement_doc.items:
		if hasattr(item, 'cost_center'):
			item.cost_center = None
	
	# Calculate totals
	replacement_doc.flags.ignore_permissions = True
	frappe.flags.ignore_account_permission = True
	replacement_doc.insert()
	
	# Clear cost centers again after insert (in case ERPNext set them)
	for item in replacement_doc.items:
		if hasattr(item, 'cost_center'):
			item.cost_center = None
	
	# Calculate balance
	replacement_amount = replacement_doc.grand_total
	balance = return_amount - replacement_amount
	
	result = {
		"replacement_invoice": replacement_doc.name,
		"replacement_amount": replacement_amount,
		"balance": balance,
	}
	
	# Handle balance
	if balance > 0:
		# Customer gets refund for the difference
		payment_entry = create_payment_entry(
			company=company,
			customer=customer,
			amount=balance,
			currency=replacement_doc.currency,
			mode_of_payment="Cash",
			posting_date=nowdate(),
			reference_no=pos_opening_shift or replacement_doc.name,
			reference_date=nowdate(),
			submit=0,  # Don't submit yet
		)
		# Set payment type to Pay (refund) BEFORE submission
		payment_entry.payment_type = "Pay"
		payment_entry.flags.ignore_permissions = True
		frappe.flags.ignore_account_permission = True
		payment_entry.save()
		payment_entry.submit()  # Now submit
		
		result["refund_payment"] = payment_entry.name
		result["message"] = _("Replacement processed. Refund of {0} issued").format(balance)
	
	elif balance < 0:
		# Customer needs to pay the difference
		payment_amount = abs(balance)
		payment_entry = create_payment_entry(
			company=company,
			customer=customer,
			amount=payment_amount,
			currency=replacement_doc.currency,
			mode_of_payment="Cash",
			posting_date=nowdate(),
			reference_no=pos_opening_shift or replacement_doc.name,
			reference_date=nowdate(),
			submit=0,  # Don't submit yet
		)
		# Set payment type to Receive BEFORE submission
		payment_entry.payment_type = "Receive"
		payment_entry.append("references", {
			"reference_doctype": "Sales Invoice",
			"reference_name": replacement_doc.name,
			"allocated_amount": payment_amount,
		})
		payment_entry.flags.ignore_permissions = True
		frappe.flags.ignore_account_permission = True
		payment_entry.save()
		payment_entry.submit()  # Now submit
		
		result["additional_payment"] = payment_entry.name
		result["message"] = _("Replacement processed. Additional payment of {0} collected").format(payment_amount)
	
	else:
		# Exact match
		result["message"] = _("Replacement processed. No balance difference")
	
	# Submit replacement invoice
	replacement_doc.submit()
	
	return result


@frappe.whitelist()
def get_customer_credit_balance(customer: str, company: str):
	"""
	Get available customer credit from return invoices.
	
	Args:
		customer: Customer ID
		company: Company name
	
	Returns:
		Total available credit amount
	"""
	try:
		# Get all return invoices with negative outstanding (credit available)
		credits = frappe.db.sql("""
			SELECT 
				name,
				outstanding_amount,
				grand_total,
				posting_date
			FROM `tabSales Invoice`
			WHERE customer = %s
				AND company = %s
				AND docstatus = 1
				AND is_return = 1
				AND outstanding_amount < 0
			ORDER BY posting_date DESC
		""", (customer, company), as_dict=True)
		
		total_credit = sum([abs(flt(c.outstanding_amount)) for c in credits])
		
		return {
			"total_credit": total_credit,
			"credit_invoices": credits,
		}
	
	except Exception as e:
		frappe.log_error(f"Error getting customer credit: {str(e)}", "Customer Credit Error")
		return {"total_credit": 0, "credit_invoices": []}


@frappe.whitelist()
def apply_customer_credit(
	invoice_name: str,
	credit_amount: float,
	customer: str,
	company: str,
):
	"""
	Apply customer credit to a sales invoice as payment.
	
	Args:
		invoice_name: Sales Invoice to apply credit to
		credit_amount: Amount of credit to apply
		customer: Customer ID
		company: Company name
	
	Returns:
		Payment entry details
	"""
	try:
		credit_amount = flt(credit_amount)
		
		if credit_amount <= 0:
			frappe.throw(_("Credit amount must be positive"))
		
		# Get available credit
		credit_info = get_customer_credit_balance(customer, company)
		available_credit = credit_info.get("total_credit", 0)
		
		if credit_amount > available_credit:
			frappe.throw(_("Requested credit {0} exceeds available credit {1}").format(
				credit_amount, available_credit
			))
		
		# Get invoice
		invoice = frappe.get_doc("Sales Invoice", invoice_name)
		
		if invoice.outstanding_amount <= 0:
			frappe.throw(_("Invoice is already paid"))
		
		# Limit credit to outstanding amount
		credit_to_apply = min(credit_amount, invoice.outstanding_amount)
		
		# Create payment entry using credit
		payment_entry = frappe.get_doc({
			"doctype": "Payment Entry",
			"payment_type": "Receive",
			"party_type": "Customer",
			"party": customer,
			"company": company,
			"posting_date": nowdate(),
			"paid_amount": credit_to_apply,
			"received_amount": credit_to_apply,
			"reference_no": "Customer Credit",
			"reference_date": nowdate(),
		})
		
		# Set accounts
		payment_entry.paid_from = invoice.debit_to
		payment_entry.paid_to = frappe.db.get_value("Company", company, "default_cash_account")
		
		# Link to invoice
		payment_entry.append("references", {
			"reference_doctype": "Sales Invoice",
			"reference_name": invoice_name,
			"allocated_amount": credit_to_apply,
		})
		
		payment_entry.flags.ignore_permissions = True
		frappe.flags.ignore_account_permission = True
		payment_entry.insert()
		payment_entry.submit()
		
		frappe.db.commit()
		
		return {
			"payment_entry": payment_entry.name,
			"credit_applied": credit_to_apply,
			"remaining_credit": available_credit - credit_to_apply,
			"message": _("Customer credit of {0} applied successfully").format(credit_to_apply),
		}
	
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(f"Error applying customer credit: {str(e)}", "Customer Credit Error")
		frappe.throw(_("Error applying credit: {0}").format(str(e)))

