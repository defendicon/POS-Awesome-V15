import {
	getTaxTemplate,
	getTaxInclusiveSetting,
	isOffline,
} from "../../../../offline/index";
import { _getPlcConversionRate } from "./currency";

declare const flt: (_value: unknown, _precision?: number) => number;

function normalizeBackendDate(context: any, value: any): string | null {
	if (value === null || typeof value === "undefined" || value === "") {
		return null;
	}

	const candidate =
		value && typeof value === "object" && "value" in value ? value.value : value;
	if (!candidate) {
		return null;
	}

	return context.formatDateForBackend
		? context.formatDateForBackend(candidate)
		: candidate;
}

function resolveOrderDeliveryDate(context: any, sourceDoc: any): string | null {
	return normalizeBackendDate(
		context,
		sourceDoc?.posa_delivery_date ||
			sourceDoc?.delivery_date ||
			context.new_delivery_date,
	);
}

/**
 * Document Utils
 * Handles creation of backend-compatible invoice documents from current state.
 *
 * Context requirements:
 * - context.invoiceType
 * - context.pos_profile
 * - context.selected_currency
 * - context.conversion_rate
 * - context.company
 * - context.price_list_currency
 * - context.get_price_list (method)
 * - context.customer_info
 * - context.customer
 * - context.isReturnInvoice (getter)
 * - context.get_invoice_items (method - local in this file now?)
 * - context.Total
 * - context.subtotal
 * - context.additional_discount
 * - context.additional_discount_percentage
 * - context.roundAmount (method)
 * - context.pos_opening_shift
 * - context.posa_offers
 * - context.posa_coupons
 * - context.selected_delivery_charge
 * - context.delivery_charges_rate
 * - context.formatDateForBackend (method)
 */

export function get_invoice_doc(context: any) {
	let doc: any = {};
	const sourceDoc = context.invoice_doc || {};

	if (sourceDoc.name) {
		doc = { ...sourceDoc };
	}

	// Always set these fields first
	if (context.invoiceType === "Quotation") {
		doc.doctype = "Quotation";
	} else if (
		context.invoiceType === "Order" &&
		context.pos_profile?.posa_create_only_sales_order
	) {
		doc.doctype = "Sales Order";
	} else if (
		context.pos_profile?.create_pos_invoice_instead_of_sales_invoice
	) {
		doc.doctype = "POS Invoice";
	} else {
		doc.doctype = "Sales Invoice";
	}
	doc.is_pos = 1;
	doc.ignore_pricing_rule = 0;
	doc.company = doc.company || context.pos_profile?.company || null;
	doc.pos_profile = doc.pos_profile || context.pos_profile?.name || null;
	doc.posa_show_custom_name_marker_on_print =
		context.pos_profile?.posa_show_custom_name_marker_on_print ?? null;

	// Keep stock update explicit for invoice doctypes so submit-time checks are predictable.
	if (doc.doctype === "Sales Invoice" || doc.doctype === "POS Invoice") {
		const profileUpdateStock = context.pos_profile?.update_stock;
		const defaultUpdateStock =
			profileUpdateStock === 0 ||
			profileUpdateStock === "0" ||
			profileUpdateStock === false
				? 0
				: 1;
		const isOrderInvoiceFlow =
			context.invoiceType === "Order" &&
			!context.pos_profile?.posa_create_only_sales_order;
		doc.update_stock = isOrderInvoiceFlow ? 0 : defaultUpdateStock;
	}

	// Currency related fields
	doc.currency =
		context.selected_currency || context.pos_profile?.currency || null;
	doc.conversion_rate =
		context.conversion_rate ||
		(sourceDoc && sourceDoc.conversion_rate) ||
		1;

	// Use actual price list currency if available
	doc.price_list_currency = context.price_list_currency;
	doc.plc_conversion_rate = _getPlcConversionRate(context);

	// Other fields
	doc.campaign = doc.campaign || context.pos_profile?.campaign || null;
	doc.selling_price_list = context.get_price_list
		? context.get_price_list()
		: context.selected_price_list;
	doc.naming_series =
		doc.naming_series || context.pos_profile?.naming_series || null;
	const customerDetails =
		context.customer_info && typeof context.customer_info === "object"
			? context.customer_info
			: {};
	const resolvedCustomer =
		context.customer || customerDetails.customer || doc.customer || null;
	doc.customer = resolvedCustomer;
	if (!doc.customer_name && customerDetails.customer_name) {
		doc.customer_name = customerDetails.customer_name;
	}
	if (doc.doctype === "Quotation") {
		doc.quotation_to = doc.quotation_to || "Customer";
		if (resolvedCustomer) {
			doc.party_name = resolvedCustomer;
		}
	}

	// Determine if this is a return invoice
	const isReturn = context.isReturnInvoice;
	doc.is_return = isReturn ? 1 : 0;

	// Calculate amounts in selected currency
	const items = get_invoice_items(context);
	doc.items = items;
	doc.packed_items = (context.packed_items || []).map((pi) => ({
		parent_item: pi.parent_item,
		item_code: pi.item_code,
		item_name: pi.item_name,
		qty: flt(pi.qty),
		uom: pi.uom,
		warehouse: pi.warehouse,
		batch_no: pi.batch_no,
		serial_no: pi.serial_no,
		rate: flt(pi.rate),
	}));

	// Calculate totals in selected currency ensuring negative values for returns
	let total = context.Total;
	if (isReturn && total > 0) total = -Math.abs(total);

	doc.total = total;
	doc.net_total = total; // Will adjust later if taxes are inclusive
	doc.base_total = total * (context.conversion_rate || 1);
	doc.base_net_total = total * (context.conversion_rate || 1);

	// Apply discounts with correct sign for returns
	let discountAmount = flt(context.additional_discount);
	if (isReturn && discountAmount > 0)
		discountAmount = -Math.abs(discountAmount);

	doc.discount_amount = discountAmount;
	doc.base_discount_amount = discountAmount * (context.conversion_rate || 1);

	let discountPercentage = flt(context.additional_discount_percentage);
	if (context.pos_profile?.posa_use_percentage_discount) {
		discountPercentage = Math.abs(discountPercentage);
	} else if (isReturn && discountPercentage > 0) {
		discountPercentage = -Math.abs(discountPercentage);
	}

	doc.additional_discount_percentage = discountPercentage;

	// Calculate grand total with correct sign for returns
	let grandTotal = context.subtotal;

	// Prepare taxes array
	doc.taxes = [];
	if (context.invoice_doc && context.invoice_doc.taxes) {
		let totalTax = 0;
		context.invoice_doc.taxes.forEach((tax) => {
			if (tax.tax_amount) {
				grandTotal += flt(tax.tax_amount);
				totalTax += flt(tax.tax_amount);
			}
			doc.taxes.push({
				account_head: tax.account_head,
				charge_type: tax.charge_type || "On Net Total",
				description: tax.description,
				rate: tax.rate,
				included_in_print_rate: tax.included_in_print_rate || 0,
				tax_amount: tax.tax_amount,
				total: tax.total,
				base_tax_amount:
					tax.tax_amount * (context.conversion_rate || 1),
				base_total: tax.total * (context.conversion_rate || 1),
			});
		});
		doc.total_taxes_and_charges = totalTax;
	} else if (isOffline()) {
		const tmpl = getTaxTemplate(context.pos_profile.taxes_and_charges);
		if (tmpl && Array.isArray(tmpl.taxes)) {
			const inclusive = getTaxInclusiveSetting();
			let runningTotal = grandTotal;
			let totalTax = 0;
			tmpl.taxes.forEach((row) => {
				let tax_amount = 0;
				if (row.charge_type === "Actual") {
					tax_amount = flt(row.tax_amount || 0);
				} else if (inclusive) {
					tax_amount = flt((doc.total * flt(row.rate)) / 100);
				} else {
					tax_amount = flt((doc.net_total * flt(row.rate)) / 100);
				}
				if (!inclusive) {
					runningTotal += tax_amount;
				}
				totalTax += tax_amount;
				doc.taxes.push({
					account_head: row.account_head,
					charge_type: row.charge_type || "On Net Total",
					description: row.description,
					rate: row.rate,
					included_in_print_rate:
						row.charge_type === "Actual" ? 0 : inclusive ? 1 : 0,
					tax_amount: tax_amount,
					total: runningTotal,
					base_tax_amount:
						tax_amount * (context.conversion_rate || 1),
					base_total: runningTotal * (context.conversion_rate || 1),
				});
			});
			if (inclusive) {
				doc.net_total = doc.total - totalTax;
				doc.base_net_total =
					doc.net_total * (context.conversion_rate || 1);
				grandTotal = doc.total;
			} else {
				grandTotal = runningTotal;
			}
			doc.total_taxes_and_charges = totalTax;
		}
	}

	if (isReturn && grandTotal > 0) grandTotal = -Math.abs(grandTotal);

	doc.grand_total = grandTotal;
	doc.base_grand_total = grandTotal * (context.conversion_rate || 1);

	// Apply rounding to get rounded total unless disabled in POS Profile
	if (context.pos_profile.disable_rounded_total) {
		doc.rounded_total = flt(grandTotal, context.currency_precision);
		doc.base_rounded_total = flt(
			doc.base_grand_total,
			context.currency_precision,
		);
	} else {
		doc.rounded_total = context.roundAmount
			? context.roundAmount(grandTotal)
			: Math.round(grandTotal);
		doc.base_rounded_total = context.roundAmount
			? context.roundAmount(doc.base_grand_total)
			: Math.round(doc.base_grand_total);
	}

	// Add POS specific fields
	doc.posa_pos_opening_shift = context.pos_opening_shift?.name || null;
	doc.payments = get_payments(context);

	// Handle return specific fields
	if (isReturn) {
		if (context.invoice_doc.return_against) {
			doc.return_against = context.invoice_doc.return_against;
		}
		doc.update_stock = 1;

		// Double-check all values are negative
		if (doc.grand_total > 0) doc.grand_total = -Math.abs(doc.grand_total);
		if (doc.base_grand_total > 0)
			doc.base_grand_total = -Math.abs(doc.base_grand_total);
		if (doc.rounded_total > 0)
			doc.rounded_total = -Math.abs(doc.rounded_total);
		if (doc.base_rounded_total > 0)
			doc.base_rounded_total = -Math.abs(doc.base_rounded_total);
		if (doc.total > 0) doc.total = -Math.abs(doc.total);
		if (doc.base_total > 0) doc.base_total = -Math.abs(doc.base_total);
		if (doc.net_total > 0) doc.net_total = -Math.abs(doc.net_total);
		if (doc.base_net_total > 0)
			doc.base_net_total = -Math.abs(doc.base_net_total);

		// Ensure payments have negative amounts
		if (doc.payments && doc.payments.length) {
			doc.payments.forEach((payment) => {
				if (payment.amount > 0)
					payment.amount = -Math.abs(payment.amount);
				if (payment.base_amount > 0)
					payment.base_amount = -Math.abs(payment.base_amount);
			});
		}
	}

	// Add offer details
	doc.posa_offers = context.posa_offers;
	doc.posa_coupons = context.posa_coupons;
	doc.posa_delivery_charges = context.selected_delivery_charge?.name || null;
	doc.posa_delivery_charges_rate = context.delivery_charges_rate || 0;
	doc.posa_notes = sourceDoc.posa_notes ?? null;
	doc.posa_authorization_code = sourceDoc.posa_authorization_code ?? null;
	doc.posa_return_valid_upto = sourceDoc.posa_return_valid_upto ?? null;
	doc.posting_date = context.formatDateForBackend
		? context.formatDateForBackend(context.posting_date_display)
		: context.posting_date_display;

	// Sales Order/Quotation require delivery dates at validation time.
	if (doc.doctype === "Sales Order" || doc.doctype === "Quotation") {
		const orderDeliveryDate = resolveOrderDeliveryDate(context, sourceDoc);
		doc.posa_delivery_date = orderDeliveryDate;
		if (orderDeliveryDate) {
			doc.delivery_date = orderDeliveryDate;
		}
	}

	// Add flags to ensure proper rate handling
	doc.ignore_pricing_rule = 0;

	// Preserve the real price list currency
	doc.price_list_currency = context.price_list_currency;
	doc.ignore_default_fields = 1; // Add this to prevent default field updates

	// Add custom fields to track offer rates
	doc.posa_is_offer_applied = context.posa_offers.length > 0 ? 1 : 0;

	// Calculate base amounts using the exchange rate
	const companyCurrency =
		(context.company && context.company.default_currency) ||
		context.pos_profile?.currency ||
		null;
	if (context.selected_currency !== companyCurrency) {
		// For returns, we need to ensure negative values
		const multiplier = isReturn ? -1 : 1;

		// Convert amounts back to the base currency
		doc.base_total = total * (context.conversion_rate || 1) * multiplier;
		doc.base_net_total =
			total * (context.conversion_rate || 1) * multiplier;
		doc.base_discount_amount =
			discountAmount * (context.conversion_rate || 1) * multiplier;
		doc.base_grand_total =
			grandTotal * (context.conversion_rate || 1) * multiplier;
		doc.base_rounded_total =
			grandTotal * (context.conversion_rate || 1) * multiplier;
	} else {
		// Same currency, just ensure negative values for returns
		const multiplier = isReturn ? -1 : 1;
		// When in base currency, the base amounts are the same as the regular amounts
		doc.base_total = total * multiplier;
		doc.base_net_total = total * multiplier;
		doc.base_discount_amount = discountAmount * multiplier;
		doc.base_grand_total = grandTotal * multiplier;
		doc.base_rounded_total = grandTotal * multiplier;
	}

	// Ensure payments have correct base amounts
	if (doc.payments && doc.payments.length) {
		doc.payments.forEach((payment) => {
			if (context.selected_currency !== companyCurrency) {
				// Convert payment amount to base currency
				payment.base_amount =
					payment.amount * (context.conversion_rate || 1);
			} else {
				payment.base_amount = payment.amount;
			}

			// For returns, ensure negative values
			if (isReturn) {
				payment.amount = -Math.abs(payment.amount);
				payment.base_amount = -Math.abs(payment.base_amount);
			}
		});
	}

	return doc;
}

export function get_invoice_items(context: any) {
	const items_list: any[] = [];
	const isReturn = context.isReturnInvoice;
	const omitFreebies = !isOffline();
	const requiresDeliveryDate =
		context.invoiceType === "Order" ||
		context.invoiceType === "Quotation" ||
		context.invoice_doc?.doctype === "Sales Order" ||
		context.invoice_doc?.doctype === "Quotation";
	const parentDeliveryDate = requiresDeliveryDate
		? resolveOrderDeliveryDate(context, context.invoice_doc || {})
		: null;

	context.items.forEach((item) => {
		if (omitFreebies && item && item.auto_free_source) {
			return;
		}
		const itemDeliveryDate = normalizeBackendDate(
			context,
			item.posa_delivery_date ||
				(requiresDeliveryDate
					? item.delivery_date || parentDeliveryDate
					: item.delivery_date),
		);
		const new_item = {
			item_code: item.item_code,
			// Retain the item name for offline invoices
			// Fallback to item_code if item_name is not available
			item_name: item.item_name || item.item_code,
			name_overridden: item.name_overridden ? 1 : 0,
			posa_row_id: item.posa_row_id,
			posa_offers: item.posa_offers,
			posa_offer_applied: item.posa_offer_applied,
			posa_is_offer: item.posa_is_offer,
			posa_is_replace: item.posa_is_replace,
			is_free_item: item.is_free_item,
			qty: flt(item.qty),
			uom: item.uom,
			conversion_factor: item.conversion_factor,
			serial_no: item.serial_no,
			// Link to original invoice item when doing returns
			// Needed for backend validation that the item exists in
			// the referenced Sales or POS Invoice
			...(item.sales_invoice_item && {
				sales_invoice_item: item.sales_invoice_item,
			}),
			...(item.pos_invoice_item && {
				pos_invoice_item: item.pos_invoice_item,
			}),
			// Explicitly include stock status to optimize backend validation loops
			// where O(N) cache lookups occur if this flag is missing.
			is_stock_item: item.is_stock_item,
			discount_percentage: flt(item.discount_percentage),
			batch_no: item.batch_no,
			posa_notes: item.posa_notes,
			posa_delivery_date: itemDeliveryDate,
		};

		if (requiresDeliveryDate && itemDeliveryDate) {
			new_item.delivery_date = itemDeliveryDate;
		}

		// Handle currency conversion for rates and amounts
		const companyCurrency = context.pos_profile.currency;
		if (context.selected_currency !== companyCurrency) {
			// item.rate is in SC and base_rate should be in CC.
			new_item.rate = flt(item.rate); // Keep rate in USD

			// Use pre-stored base_rate if available, otherwise calculate
			new_item.base_rate =
				item.base_rate ||
				flt(item.rate * (context.conversion_rate || 1));

			new_item.price_list_rate = flt(item.price_list_rate); // Keep price list rate in USD
			new_item.base_price_list_rate =
				item.base_price_list_rate ??
				flt(item.price_list_rate * (context.conversion_rate || 1));

			// Calculate amounts
			new_item.amount = flt(item.qty) * new_item.rate; // Amount in USD
			new_item.base_amount =
				new_item.amount * (context.conversion_rate || 1); // Convert to base currency

			// Handle discount amount
			new_item.discount_amount = flt(item.discount_amount); // Keep discount in USD
			new_item.base_discount_amount =
				item.base_discount_amount ||
				flt(item.discount_amount * (context.conversion_rate || 1));
		} else {
			// Same currency (base currency), make sure we use base rates if available
			new_item.rate = flt(item.rate);
			new_item.base_rate = item.base_rate || flt(item.rate);
			new_item.price_list_rate = flt(item.price_list_rate);
			new_item.base_price_list_rate =
				item.base_price_list_rate ?? flt(item.price_list_rate);
			new_item.amount = flt(item.qty) * new_item.rate;
			new_item.base_amount = new_item.amount;
			new_item.discount_amount = flt(item.discount_amount);
			new_item.base_discount_amount =
				item.base_discount_amount || flt(item.discount_amount);
		}

		// For returns, ensure all amounts are negative
		if (isReturn) {
			new_item.qty = -Math.abs(new_item.qty);
			new_item.amount = -Math.abs(new_item.amount);
			new_item.base_amount = -Math.abs(new_item.base_amount);
			new_item.discount_amount = -Math.abs(new_item.discount_amount);
			new_item.base_discount_amount = -Math.abs(
				new_item.base_discount_amount,
			);
		}

		items_list.push(new_item);
	});

	return items_list;
}

export function get_order_items(context: any) {
	const items_list: any[] = [];
	context.items.forEach((item) => {
		const new_item = {
			item_code: item.item_code,
			// Retain item name to show on offline order documents
			// Use item_code if item_name is missing
			item_name: item.item_name || item.item_code,
			name_overridden: item.name_overridden ? 1 : 0,
			posa_row_id: item.posa_row_id,
			posa_offers: item.posa_offers,
			posa_offer_applied: item.posa_offer_applied,
			posa_is_offer: item.posa_is_offer,
			posa_is_replace: item.posa_is_replace,
			is_free_item: item.is_free_item,
			qty: flt(item.qty),
			rate: flt(item.rate),
			uom: item.uom,
			amount: flt(item.qty) * flt(item.rate),
			conversion_factor: item.conversion_factor,
			serial_no: item.serial_no,
			discount_percentage: flt(item.discount_percentage),
			discount_amount: flt(item.discount_amount),
			batch_no: item.batch_no,
			posa_notes: item.posa_notes,
			posa_delivery_date: item.posa_delivery_date,
			price_list_rate: item.price_list_rate,
		};
		items_list.push(new_item);
	});

	return items_list;
}

export function get_payments(context: any) {
	if (
		context.isReturnInvoice &&
		Array.isArray(context.invoice_doc?.payments) &&
		context.invoice_doc.payments.length
	) {
		const total_amount = Math.abs(context.subtotal);
		const sourcePayments = context.invoice_doc.payments.filter(
			(payment) => payment?.mode_of_payment,
		);
		const sourceTotal = sourcePayments.reduce(
			(sum, payment) =>
				sum +
				Math.abs(
					context.flt(
						payment.amount || 0,
						context.currency_precision,
					),
				),
			0,
		);

		if (sourcePayments.length && sourceTotal > 0 && total_amount > 0) {
			// const baseCurrency = context.pos_profile.currency; // Unused
			let remaining_amount = total_amount;

			return sourcePayments.map((payment, index) => {
				const share =
					Math.abs(
						context.flt(
							payment.amount || 0,
							context.currency_precision,
						),
					) / sourceTotal;
				let payment_amount =
					index === sourcePayments.length - 1
						? remaining_amount
						: context.flt(
								total_amount * share,
								context.currency_precision,
							);
				payment_amount = -Math.abs(payment_amount);
				remaining_amount = context.flt(
					remaining_amount - Math.abs(payment_amount),
					context.currency_precision,
				);

				return {
					mode_of_payment: payment.mode_of_payment,
					amount: payment_amount,
					account: payment.account,
					type: payment.type,
					base_amount: payment_amount, // Will be fixed in get_invoice_doc if needed
				};
			});
		}
	}

	if (!context.invoice_doc || !Array.isArray(context.invoice_doc.payments)) {
		const profilePayments = Array.isArray(context.pos_profile?.payments)
			? context.pos_profile.payments
			: [];

		if (!profilePayments.length) {
			return [];
		}

		return profilePayments
			.filter((payment) => payment?.mode_of_payment)
			.map((payment, index) => ({
				mode_of_payment: payment.mode_of_payment,
				amount: 0,
				account: payment.account,
				type: payment.type,
				default:
					payment.default === 1 ||
					payment.default === true ||
					index === 0
						? 1
						: 0,
				base_amount: 0,
			}));
	}

	if (!context.invoice_doc.payments.length) {
		const profilePayments = Array.isArray(context.pos_profile?.payments)
			? context.pos_profile.payments
			: [];
		if (!profilePayments.length) {
			return [];
		}
		return profilePayments
			.filter((payment) => payment?.mode_of_payment)
			.map((payment, index) => ({
				mode_of_payment: payment.mode_of_payment,
				amount: 0,
				account: payment.account,
				type: payment.type,
				default:
					payment.default === 1 ||
					payment.default === true ||
					index === 0
						? 1
						: 0,
				base_amount: 0,
			}));
	}

	return context.invoice_doc.payments;
}
