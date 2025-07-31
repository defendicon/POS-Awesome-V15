import {
	isOffline,
	saveCustomerBalance,
	getCachedCustomerBalance,
	getCachedPriceListItems,
	getItemUOMs,
	getCustomerStorage,
	getOfflineCustomers,
	getTaxTemplate,
	getTaxInclusiveSetting,
} from "../../../offline/index.js";

// Import composables
import { useBatchSerial } from "../../composables/useBatchSerial.js";
import { useDiscounts } from "../../composables/useDiscounts.js";
import { useItemAddition } from "../../composables/useItemAddition.js";
import { useStockUtils } from "../../composables/useStockUtils.js";

const { setSerialNo, setBatchQty } = useBatchSerial();
const { updateDiscountAmount, calcPrices, calcItemPrice } = useDiscounts();
const { removeItem, addItem, getNewItem, clearInvoice } = useItemAddition();
const { calcUom, calcStockQty } = useStockUtils();

export default {
	remove_item(item) {
		return removeItem(item, this);
	},

	async add_item(item) {
		return await addItem(item, this);
	},

	// Create a new item object with default and calculated fields
	get_new_item(item) {
		return getNewItem(item, this);
	},

	// Reset all invoice fields to default/empty values
	clear_invoice() {
		return clearInvoice(this);
	},

	// Fetch customer balance from backend or cache
	async fetch_customer_balance() {
		try {
			if (!this.customer) {
				this.customer_balance = 0;
				return;
			}

			// Check if offline and use cached balance
			if (isOffline()) {
				const cachedBalance = getCachedCustomerBalance(this.customer);
				if (cachedBalance !== null) {
					this.customer_balance = cachedBalance;
					return;
				} else {
					// No cached balance available in offline mode
					this.customer_balance = 0;
					this.eventBus.emit("show_message", {
						title: __("Customer balance unavailable offline"),
						text: __("Balance will be updated when connection is restored"),
						color: "warning",
					});
					return;
				}
			}

			// Online mode: fetch from server and cache the result
			const r = await frappe.call({
				method: "posawesome.posawesome.api.customer.get_customer_balance",
				args: { customer: this.customer },
			});

			const balance = r?.message?.balance || 0;
			this.customer_balance = balance;

			// Cache the balance for offline use
			saveCustomerBalance(this.customer, balance);
		} catch (error) {
			console.error("Error fetching balance:", error);

			// Try to use cached balance as fallback
			const cachedBalance = getCachedCustomerBalance(this.customer);
			if (cachedBalance !== null) {
				this.customer_balance = cachedBalance;
				this.eventBus.emit("show_message", {
					title: __("Using cached customer balance"),
					text: __("Could not fetch latest balance from server"),
					color: "warning",
				});
			} else {
				this.eventBus.emit("show_message", {
					title: __("Error fetching customer balance"),
					color: "error",
				});
				this.customer_balance = 0;
			}
		}
	},

	// Cancel the current invoice, optionally delete from backend
	async cancel_invoice() {
		const doc = this.get_invoice_doc();
		this.invoiceType = this.pos_profile.posa_default_sales_order ? "Order" : "Invoice";
		this.invoiceTypes = ["Invoice", "Order"];
		this.posting_date = frappe.datetime.nowdate();
		var vm = this;
		if (doc.name && this.pos_profile.posa_allow_delete) {
			await frappe.call({
				method: "posawesome.posawesome.api.invoices.delete_invoice",
				args: { invoice: doc.name },
				async: true,
				callback: function (r) {
					if (r.message) {
						vm.eventBus.emit("show_message", {
							text: r.message,
							color: "warning",
						});
					}
				},
			});
		}
		this.clear_invoice();
		this.cancel_dialog = false;
	},

	// Load an invoice (or return invoice) from data, set all fields accordingly
	async load_invoice(data = {}) {
		console.log("load_invoice called with data:", {
			is_return: data.is_return,
			return_against: data.return_against,
			customer: data.customer,
			items_count: data.items ? data.items.length : 0,
		});

		this.clear_invoice();
		if (data.is_return) {
			console.log("Processing return invoice");
			// For return without invoice case, check if there's a return_against
			// Only set customer readonly if this is a return with reference to an invoice
			if (data.return_against) {
				console.log("Return has reference to invoice:", data.return_against);
				this.eventBus.emit("set_customer_readonly", true);
			} else {
				console.log("Return without invoice reference, customer can be selected");
				// Allow customer selection for returns without invoice
				this.eventBus.emit("set_customer_readonly", false);
			}
			this.invoiceType = "Return";
			this.invoiceTypes = ["Return"];
		}

		this.invoice_doc = data;
		this.items = data.items || [];
		console.log("Items set:", this.items.length, "items");

		if (this.items.length > 0) {
			this.update_items_details(this.items);
			this.posa_offers = data.posa_offers || [];
			this.items.forEach((item) => {
				if (!item.posa_row_id) {
					item.posa_row_id = this.makeid(20);
				}
				if (item.batch_no) {
					this.set_batch_qty(item, item.batch_no);
				}
			});
		} else {
			console.log("Warning: No items in return invoice");
		}

		this.customer = data.customer;
		this.posting_date = this.formatDateForBackend(data.posting_date || frappe.datetime.nowdate());
		this.discount_amount = data.discount_amount;
		this.additional_discount_percentage = data.additional_discount_percentage;

		if (this.items.length > 0) {
			this.items.forEach((item) => {
				if (item.serial_no) {
					item.serial_no_selected = [];
					const serial_list = item.serial_no.split("\n");
					serial_list.forEach((element) => {
						if (element.length) {
							item.serial_no_selected.push(element);
						}
					});
					item.serial_no_selected_count = item.serial_no_selected.length;
				}
			});
		}

		if (data.is_return) {
			console.log("Setting return values for discounts");
			this.discount_amount = -data.discount_amount;
			this.additional_discount_percentage = -data.additional_discount_percentage;
			this.return_doc = data;
		} else {
			this.eventBus.emit("set_pos_coupons", data.posa_coupons);
		}

		console.log("load_invoice completed, invoice state:", {
			invoiceType: this.invoiceType,
			is_return: this.invoice_doc.is_return,
			items: this.items.length,
			customer: this.customer,
		});
	},

	// Save and clear the current invoice (draft logic)
	save_and_clear_invoice() {
		const doc = this.get_invoice_doc();
		if (doc.name) {
			old_invoice = this.update_invoice(doc);
		} else {
			if (doc.items.length) {
				old_invoice = this.update_invoice(doc);
			} else {
				this.eventBus.emit("show_message", {
					title: `Nothing to save`,
					color: "error",
				});
			}
		}
		if (!old_invoice) {
			this.eventBus.emit("show_message", {
				title: `Error saving the current invoice`,
				color: "error",
			});
		} else {
			this.clear_invoice();
			return old_invoice;
		}
	},

	// Start a new order (or return order) with provided data
	async new_order(data = {}) {
		let old_invoice = null;
		this.eventBus.emit("set_customer_readonly", false);
		this.expanded = [];
		this.posa_offers = [];
		this.eventBus.emit("set_pos_coupons", []);
		this.posa_coupons = [];
		this.return_doc = "";
		if (!data.name && !data.is_return) {
			this.items = [];
			this.customer = this.pos_profile.customer;
			this.invoice_doc = "";
			this.discount_amount = 0;
			this.additional_discount_percentage = 0;
			this.invoiceType = "Invoice";
			this.invoiceTypes = ["Invoice", "Order"];
		} else {
			if (data.is_return) {
				// For return without invoice case, check if there's a return_against
				// Only set customer readonly if this is a return with reference to an invoice
				if (data.return_against) {
					this.eventBus.emit("set_customer_readonly", true);
				} else {
					// Allow customer selection for returns without invoice
					this.eventBus.emit("set_customer_readonly", false);
				}
				this.invoiceType = "Return";
				this.invoiceTypes = ["Return"];
			}
			this.invoice_doc = data;
			this.items = data.items;
			this.update_items_details(this.items);
			this.posa_offers = data.posa_offers || [];
			this.items.forEach((item) => {
				if (!item.posa_row_id) {
					item.posa_row_id = this.makeid(20);
				}
				if (item.batch_no) {
					this.set_batch_qty(item, item.batch_no);
				}
			});
			this.customer = data.customer;
			this.posting_date = this.formatDateForBackend(data.posting_date || frappe.datetime.nowdate());
			this.discount_amount = data.discount_amount;
			this.additional_discount_percentage = data.additional_discount_percentage;
			this.items.forEach((item) => {
				if (item.serial_no) {
					item.serial_no_selected = [];
					const serial_list = item.serial_no.split("\n");
					serial_list.forEach((element) => {
						if (element.length) {
							item.serial_no_selected.push(element);
						}
					});
					item.serial_no_selected_count = item.serial_no_selected.length;
				}
			});
		}
		return old_invoice;
	},

	// Build the invoice document object for backend submission
	get_invoice_doc() {
		let doc = {};
		if (this.invoice_doc.name) {
			doc = { ...this.invoice_doc };
		}

		// Always set these fields first
		if (this.invoiceType === "Order" && this.pos_profile.posa_create_only_sales_order) {
			doc.doctype = "Sales Order";
		} else {
			doc.doctype = "Sales Invoice";
		}
		doc.is_pos = 1;
		doc.ignore_pricing_rule = 1;
		doc.company = doc.company || this.pos_profile.company;
		doc.pos_profile = doc.pos_profile || this.pos_profile.name;

		// Currency related fields
		doc.currency = this.selected_currency || this.pos_profile.currency;
		doc.conversion_rate =
			(this.invoice_doc && this.invoice_doc.conversion_rate) || this.conversion_rate || 1;

		// Use actual price list currency if available
		doc.price_list_currency = this.price_list_currency || doc.currency;

		doc.plc_conversion_rate =
			(this.invoice_doc && this.invoice_doc.plc_conversion_rate) ||
			(doc.price_list_currency === doc.currency ? 1 : this.exchange_rate);

		// Other fields
		doc.campaign = doc.campaign || this.pos_profile.campaign;
		doc.selling_price_list = this.pos_profile.selling_price_list;
		doc.naming_series = doc.naming_series || this.pos_profile.naming_series;
		doc.customer = this.customer;

		// Determine if this is a return invoice
		const isReturn = this.isReturnInvoice;
		doc.is_return = isReturn ? 1 : 0;

		// Calculate amounts in selected currency
		const items = this.get_invoice_items();
		doc.items = items;

		// Calculate totals in selected currency ensuring negative values for returns
		let total = this.Total;
		if (isReturn && total > 0) total = -Math.abs(total);

		doc.total = total;
		doc.net_total = total; // Will adjust later if taxes are inclusive
		doc.base_total = total * (this.exchange_rate || 1);
		doc.base_net_total = total * (this.exchange_rate || 1);

		// Apply discounts with correct sign for returns
		let discountAmount = flt(this.additional_discount);
		if (isReturn && discountAmount > 0) discountAmount = -Math.abs(discountAmount);

		doc.discount_amount = discountAmount;
		doc.base_discount_amount = discountAmount * (this.exchange_rate || 1);

		let discountPercentage = flt(this.additional_discount_percentage);
		if (isReturn && discountPercentage > 0) discountPercentage = -Math.abs(discountPercentage);

		doc.additional_discount_percentage = discountPercentage;

		// Calculate grand total with correct sign for returns
		let grandTotal = this.subtotal;

		// Prepare taxes array
		doc.taxes = [];
		if (this.invoice_doc && this.invoice_doc.taxes) {
			let totalTax = 0;
			this.invoice_doc.taxes.forEach((tax) => {
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
					base_tax_amount: tax.tax_amount * (this.exchange_rate || 1),
					base_total: tax.total * (this.exchange_rate || 1),
				});
			});
			doc.total_taxes_and_charges = totalTax;
		} else if (isOffline()) {
			const tmpl = getTaxTemplate(this.pos_profile.taxes_and_charges);
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
						included_in_print_rate: row.charge_type === "Actual" ? 0 : inclusive ? 1 : 0,
						tax_amount: tax_amount,
						total: runningTotal,
						base_tax_amount: tax_amount * (this.exchange_rate || 1),
						base_total: runningTotal * (this.exchange_rate || 1),
					});
				});
				if (inclusive) {
					doc.net_total = doc.total - totalTax;
					doc.base_net_total = doc.net_total * (this.exchange_rate || 1);
					grandTotal = doc.total;
				} else {
					grandTotal = runningTotal;
				}
				doc.total_taxes_and_charges = totalTax;
			}
		}

		if (isReturn && grandTotal > 0) grandTotal = -Math.abs(grandTotal);

		doc.grand_total = grandTotal;
		doc.base_grand_total = grandTotal * (this.exchange_rate || 1);

		// Apply rounding to get rounded total unless disabled in POS Profile
		if (this.pos_profile.disable_rounded_total) {
			doc.rounded_total = flt(grandTotal, this.currency_precision);
			doc.base_rounded_total = flt(doc.base_grand_total, this.currency_precision);
		} else {
			doc.rounded_total = this.roundAmount(grandTotal);
			doc.base_rounded_total = this.roundAmount(doc.base_grand_total);
		}

		// Add POS specific fields
		doc.posa_pos_opening_shift = this.pos_opening_shift.name;
		doc.payments = this.get_payments();

		// Handle return specific fields
		if (isReturn) {
			if (this.invoice_doc.return_against) {
				doc.return_against = this.invoice_doc.return_against;
			}
			doc.update_stock = 1;

			// Double-check all values are negative
			if (doc.grand_total > 0) doc.grand_total = -Math.abs(doc.grand_total);
			if (doc.base_grand_total > 0) doc.base_grand_total = -Math.abs(doc.base_grand_total);
			if (doc.rounded_total > 0) doc.rounded_total = -Math.abs(doc.rounded_total);
			if (doc.base_rounded_total > 0) doc.base_rounded_total = -Math.abs(doc.base_rounded_total);
			if (doc.total > 0) doc.total = -Math.abs(doc.total);
			if (doc.base_total > 0) doc.base_total = -Math.abs(doc.base_total);
			if (doc.net_total > 0) doc.net_total = -Math.abs(doc.net_total);
			if (doc.base_net_total > 0) doc.base_net_total = -Math.abs(doc.base_net_total);

			// Ensure payments have negative amounts
			if (doc.payments && doc.payments.length) {
				doc.payments.forEach((payment) => {
					if (payment.amount > 0) payment.amount = -Math.abs(payment.amount);
					if (payment.base_amount > 0) payment.base_amount = -Math.abs(payment.base_amount);
				});
			}
		}

		// Add offer details
		doc.posa_offers = this.posa_offers;
		doc.posa_coupons = this.posa_coupons;
		doc.posa_delivery_charges = this.selected_delivery_charge?.name || null;
		doc.posa_delivery_charges_rate = this.delivery_charges_rate || 0;
		doc.posting_date = this.formatDateForBackend(this.posting_date_display);

		// Add flags to ensure proper rate handling
		doc.ignore_pricing_rule = 1;

		// Preserve the real price list currency
		doc.price_list_currency = this.price_list_currency || doc.currency;
		doc.plc_conversion_rate = this.exchange_rate || doc.conversion_rate;
		doc.ignore_default_fields = 1; // Add this to prevent default field updates

		// Add custom fields to track offer rates
		doc.posa_is_offer_applied = this.posa_offers.length > 0 ? 1 : 0;

		// Calculate base amounts using the exchange rate
		const baseCurrency = this.price_list_currency || this.pos_profile.currency;
		if (this.selected_currency !== baseCurrency) {
			// For returns, we need to ensure negative values
			const multiplier = isReturn ? -1 : 1;

			// Convert amounts back to the base currency
			doc.base_total = (total / this.exchange_rate) * multiplier;
			doc.base_net_total = (total / this.exchange_rate) * multiplier;
			doc.base_discount_amount = (discountAmount / this.exchange_rate) * multiplier;
			doc.base_grand_total = (grandTotal / this.exchange_rate) * multiplier;
			doc.base_rounded_total = (grandTotal / this.exchange_rate) * multiplier;
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
				if (this.selected_currency !== baseCurrency) {
					// Convert payment amount to base currency
					payment.base_amount = payment.amount / this.exchange_rate;
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
	},

	// Get invoice doc from order doc (for sales order to invoice conversion)
	async get_invoice_from_order_doc() {
		let doc = {};
		if (this.invoice_doc.doctype == "Sales Order") {
			await frappe.call({
				method: "posawesome.posawesome.api.invoices.create_sales_invoice_from_order",
				args: {
					sales_order: this.invoice_doc.name,
				},
				// async: false,
				callback: function (r) {
					if (r.message) {
						doc = r.message;
					}
				},
			});
		} else {
			doc = this.invoice_doc;
		}
		const Items = [];
		const updatedItemsData = this.get_invoice_items();
		doc.items.forEach((item) => {
			const updatedData = updatedItemsData.find(
				(updatedItem) => updatedItem.item_code === item.item_code,
			);
			if (updatedData) {
				item.item_code = updatedData.item_code;
				item.posa_row_id = updatedData.posa_row_id;
				item.posa_offers = updatedData.posa_offers;
				item.posa_offer_applied = updatedData.posa_offer_applied;
				item.posa_is_offer = updatedData.posa_is_offer;
				item.posa_is_replace = updatedData.posa_is_replace;
				item.is_free_item = updatedData.is_free_item;
				item.qty = flt(updatedData.qty);
				item.rate = flt(updatedData.rate);
				item.uom = updatedData.uom;
				item.amount = flt(updatedData.qty) * flt(updatedData.rate);
				item.conversion_factor = updatedData.conversion_factor;
				item.serial_no = updatedData.serial_no;
				item.discount_percentage = flt(updatedData.discount_percentage);
				item.discount_amount = flt(updatedData.discount_amount);
				item.batch_no = updatedData.batch_no;
				item.posa_notes = updatedData.posa_notes;
				item.posa_delivery_date = this.formatDateForDisplay(updatedData.posa_delivery_date);
				item.price_list_rate = updatedData.price_list_rate;
				Items.push(item);
			}
		});

		doc.items = Items;
		const newItems = [...doc.items];
		const existingItemCodes = new Set(newItems.map((item) => item.item_code));
		updatedItemsData.forEach((updatedItem) => {
			if (!existingItemCodes.has(updatedItem.item_code)) {
				newItems.push(updatedItem);
			}
		});
		doc.items = newItems;
		doc.update_stock = 1;
		doc.is_pos = 1;
		doc.payments = this.get_payments();
		return doc;
	},

	// Prepare items array for invoice doc
	get_invoice_items() {
		const items_list = [];
		const isReturn = this.isReturnInvoice;

		this.items.forEach((item) => {
			const new_item = {
				item_code: item.item_code,
				// Retain the item name for offline invoices
				// Fallback to item_code if item_name is not available
				item_name: item.item_name || item.item_code,
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
				// Link to original Sales Invoice Item when doing returns
				// Needed for backend validation that the item exists in
				// the referenced Sales Invoice
				...(item.sales_invoice_item && { sales_invoice_item: item.sales_invoice_item }),
				discount_percentage: flt(item.discount_percentage),
				batch_no: item.batch_no,
				posa_notes: item.posa_notes,
				posa_delivery_date: this.formatDateForBackend(item.posa_delivery_date),
			};
			if (isReturn && !new_item.sales_invoice_item && item.name) {
				new_item.sales_invoice_item = item.name;
			}

			// Handle currency conversion for rates and amounts
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				// If exchange rate is 300 PKR = 1 USD
				// item.rate is in USD (e.g. 10 USD)
				// base_rate should be in PKR (e.g. 3000 PKR)
				new_item.rate = flt(item.rate); // Keep rate in USD

				// Use pre-stored base_rate if available, otherwise calculate
				new_item.base_rate = item.base_rate || flt(item.rate / this.exchange_rate);

				new_item.price_list_rate = flt(item.price_list_rate); // Keep price list rate in USD
				new_item.base_price_list_rate =
					item.base_price_list_rate || flt(item.price_list_rate / this.exchange_rate);

				// Calculate amounts
				new_item.amount = flt(item.qty) * new_item.rate; // Amount in USD
				new_item.base_amount = new_item.amount / this.exchange_rate; // Convert to base currency

				// Handle discount amount
				new_item.discount_amount = flt(item.discount_amount); // Keep discount in USD
				new_item.base_discount_amount =
					item.base_discount_amount || flt(item.discount_amount / this.exchange_rate);
			} else {
				// Same currency (base currency), make sure we use base rates if available
				new_item.rate = flt(item.rate);
				new_item.base_rate = item.base_rate || flt(item.rate);
				new_item.price_list_rate = flt(item.price_list_rate);
				new_item.base_price_list_rate = item.base_price_list_rate || flt(item.price_list_rate);
				new_item.amount = flt(item.qty) * new_item.rate;
				new_item.base_amount = new_item.amount;
				new_item.discount_amount = flt(item.discount_amount);
				new_item.base_discount_amount = item.base_discount_amount || flt(item.discount_amount);
			}

			// For returns, ensure all amounts are negative
			if (isReturn) {
				new_item.qty = -Math.abs(new_item.qty);
				new_item.amount = -Math.abs(new_item.amount);
				new_item.base_amount = -Math.abs(new_item.base_amount);
				new_item.discount_amount = -Math.abs(new_item.discount_amount);
				new_item.base_discount_amount = -Math.abs(new_item.base_discount_amount);
			}

			items_list.push(new_item);
		});

		return items_list;
	},

	// Prepare items array for order doc
	get_order_items() {
		const items_list = [];
		this.items.forEach((item) => {
			const new_item = {
				item_code: item.item_code,
				// Retain item name to show on offline order documents
				// Use item_code if item_name is missing
				item_name: item.item_name || item.item_code,
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
	},

	// Prepare payments array for invoice doc
	get_payments() {
		const payments = [];
		// Use this.subtotal which is already in selected currency and includes all calculations
		const total_amount = this.subtotal;
		let remaining_amount = total_amount;

		this.pos_profile.payments.forEach((payment, index) => {
			// For the first payment method, assign the full remaining amount
			const payment_amount = index === 0 ? remaining_amount : payment.amount || 0;

			// For return invoices, ensure payment amounts are negative
			const adjusted_amount = this.isReturnInvoice ? -Math.abs(payment_amount) : payment_amount;

			// Handle currency conversion
			// If selected_currency is USD and base is PKR:
			// amount is in USD (e.g. 10 USD)
			// base_amount should be in PKR (e.g. 3000 PKR)
			// So multiply by exchange rate to get base_amount
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			const base_amount =
				this.selected_currency !== baseCurrency
					? this.flt(adjusted_amount / (this.exchange_rate || 1), this.currency_precision)
					: adjusted_amount;

			payments.push({
				amount: adjusted_amount, // Keep in selected currency (e.g. USD)
				base_amount: base_amount, // Convert to base currency (e.g. PKR)
				mode_of_payment: payment.mode_of_payment,
				default: payment.default,
				account: payment.account || "",
				type: payment.type || "Cash",
				currency: this.selected_currency || this.pos_profile.currency,
				conversion_rate: this.conversion_rate || 1,
			});

			remaining_amount -= payment_amount;
		});

		console.log("Generated payments:", {
			currency: this.selected_currency,
			exchange_rate: this.exchange_rate,
			payments: payments.map((p) => ({
				mode: p.mode_of_payment,
				amount: p.amount,
				base_amount: p.base_amount,
			})),
		});

		return payments;
	},

	// Convert amount to selected currency
	convert_amount(amount) {
		const baseCurrency = this.price_list_currency || this.pos_profile.currency;
		if (this.selected_currency === baseCurrency) {
			return amount;
		}
		return this.flt(amount * this.exchange_rate, this.currency_precision);
	},

	// Update invoice in backend
	update_invoice(doc) {
		var vm = this;
		if (isOffline()) {
			// When offline, simply merge the passed doc with the current invoice_doc
			// to allow offline invoice creation without server calls
			vm.invoice_doc = Object.assign({}, vm.invoice_doc || {}, doc);
			return vm.invoice_doc;
		}
		frappe.call({
			method:
				doc.doctype === "Sales Order" && this.pos_profile.posa_create_only_sales_order
					? "posawesome.posawesome.api.sales_orders.update_sales_order"
					: "posawesome.posawesome.api.invoices.update_invoice",
			args: {
				data: doc,
			},
			async: false,
			callback: function (r) {
				if (r.message) {
					vm.invoice_doc = r.message;
					if (r.message.exchange_rate_date) {
						vm.exchange_rate_date = r.message.exchange_rate_date;
						const posting_backend = vm.formatDateForBackend(vm.posting_date_display);
						if (posting_backend !== vm.exchange_rate_date) {
							vm.eventBus.emit("show_message", {
								title: __(
									"Exchange rate date " +
										vm.exchange_rate_date +
										" differs from posting date " +
										posting_backend,
								),
								color: "warning",
							});
						}
					}
				}
			},
		});
		return this.invoice_doc;
	},

	// Update invoice from order in backend
	update_invoice_from_order(doc) {
		var vm = this;
		if (isOffline()) {
			// Offline mode - merge doc locally without server update
			vm.invoice_doc = Object.assign({}, vm.invoice_doc || {}, doc);
			return vm.invoice_doc;
		}
		frappe.call({
			method: "posawesome.posawesome.api.invoices.update_invoice_from_order",
			args: {
				data: doc,
			},
			async: false,
			callback: function (r) {
				if (r.message) {
					vm.invoice_doc = r.message;
					if (r.message.exchange_rate_date) {
						vm.exchange_rate_date = r.message.exchange_rate_date;
						const posting_backend = vm.formatDateForBackend(vm.posting_date_display);
						if (posting_backend !== vm.exchange_rate_date) {
							vm.eventBus.emit("show_message", {
								title: __(
									"Exchange rate date " +
										vm.exchange_rate_date +
										" differs from posting date " +
										posting_backend,
								),
								color: "warning",
							});
						}
					}
				}
			},
		});
		return this.invoice_doc;
	},

	// Process and save invoice (handles update or create)
	process_invoice() {
		const doc = this.get_invoice_doc();
		try {
			const updated_doc = this.update_invoice(doc);
			if (updated_doc && updated_doc.posting_date) {
				this.posting_date = this.formatDateForBackend(updated_doc.posting_date);
			}
			return updated_doc;
		} catch (error) {
			console.error("Error in process_invoice:", error);
			this.eventBus.emit("show_message", {
				title: __(error.message || "Error processing invoice"),
				color: "error",
			});
			return false;
		}
	},

	// Process and save invoice from order
	async process_invoice_from_order() {
		const doc = await this.get_invoice_from_order_doc();
		var up_invoice;
		if (doc.name) {
			up_invoice = await this.update_invoice_from_order(doc);
			return up_invoice;
		} else {
			return this.update_invoice_from_order(doc);
		}
	},

	// Show payment dialog after validation and processing
	async show_payment() {
		try {
			console.log("Starting show_payment process");
			console.log("Invoice state before payment:", {
				invoiceType: this.invoiceType,
				is_return: this.invoice_doc ? this.invoice_doc.is_return : false,
				items_count: this.items.length,
				customer: this.customer,
			});

			if (!this.customer) {
				console.log("Customer validation failed");
				this.eventBus.emit("show_message", {
					title: __(`Select a customer`),
					color: "error",
				});
				return;
			}

			if (!this.items.length) {
				console.log("Items validation failed - no items");
				this.eventBus.emit("show_message", {
					title: __(`Select items to sell`),
					color: "error",
				});
				return;
			}

			console.log("Basic validations passed, proceeding to main validation");
			const isValid = this.validate();
			console.log("Main validation result:", isValid);

			if (!isValid) {
				console.log("Main validation failed");
				return;
			}

			let invoice_doc;
			if (
				this.invoiceType === "Order" &&
				this.pos_profile.posa_create_only_sales_order &&
				!this.new_delivery_date &&
				!this.invoice_doc.posa_delivery_date
			) {
				console.log("Building local Sales Order doc for payment");
				invoice_doc = this.get_invoice_doc();
			} else if (this.invoice_doc.doctype == "Sales Order" && this.invoiceType === "Invoice") {
				console.log("Processing Sales Order payment");
				invoice_doc = await this.process_invoice_from_order();
			} else {
				console.log("Processing regular invoice");
				invoice_doc = this.process_invoice();
			}

			if (!invoice_doc) {
				console.log("Failed to process invoice");
				return;
			}

			// Update invoice_doc with current currency info
			invoice_doc.currency = this.selected_currency || this.pos_profile.currency;
			invoice_doc.conversion_rate = this.conversion_rate || 1;
			invoice_doc.plc_conversion_rate = this.exchange_rate || 1;

			// Preserve totals calculated on the server to ensure taxes are included
			// The process_invoice method already updates the invoice with taxes and
			// totals via the backend. Overriding those values here caused the
			// payment dialog to display amounts without taxes applied. Simply use
			// the values returned from the server instead of recalculating them on
			// the client side.

			// Update totals on the client has been disabled. The original code is
			// kept below for reference and is intentionally commented out to avoid
			// overriding the server calculated values.
			// invoice_doc.total = this.Total;
			// invoice_doc.grand_total = this.subtotal;

			// if (this.pos_profile.disable_rounded_total) {
			//   invoice_doc.rounded_total = flt(this.subtotal, this.currency_precision);
			// } else {
			//   invoice_doc.rounded_total = this.roundAmount(this.subtotal);
			// }
			// invoice_doc.base_total = this.Total * (1 / this.exchange_rate || 1);
			// invoice_doc.base_grand_total = this.subtotal * (1 / this.exchange_rate || 1);
			// if (this.pos_profile.disable_rounded_total) {
			//   invoice_doc.base_rounded_total = flt(invoice_doc.base_grand_total, this.currency_precision);
			// } else {
			//   invoice_doc.base_rounded_total = this.roundAmount(invoice_doc.base_grand_total);
			// }

			// Check if this is a return invoice
			if (this.isReturnInvoice || invoice_doc.is_return) {
				console.log("Preparing RETURN invoice for payment with:", {
					is_return: invoice_doc.is_return,
					invoiceType: this.invoiceType,
					return_against: invoice_doc.return_against,
					items: invoice_doc.items.length,
					grand_total: invoice_doc.grand_total,
				});

				// For return invoices, explicitly ensure all amounts are negative
				invoice_doc.is_return = 1;
				if (invoice_doc.grand_total > 0) invoice_doc.grand_total = -Math.abs(invoice_doc.grand_total);
				if (invoice_doc.rounded_total > 0)
					invoice_doc.rounded_total = -Math.abs(invoice_doc.rounded_total);
				if (invoice_doc.total > 0) invoice_doc.total = -Math.abs(invoice_doc.total);
				if (invoice_doc.base_grand_total > 0)
					invoice_doc.base_grand_total = -Math.abs(invoice_doc.base_grand_total);
				if (invoice_doc.base_rounded_total > 0)
					invoice_doc.base_rounded_total = -Math.abs(invoice_doc.base_rounded_total);
				if (invoice_doc.base_total > 0) invoice_doc.base_total = -Math.abs(invoice_doc.base_total);

				// Ensure all items have negative quantity and amount
				if (invoice_doc.items && invoice_doc.items.length) {
					invoice_doc.items.forEach((item) => {
						if (item.qty > 0) item.qty = -Math.abs(item.qty);
						if (item.stock_qty > 0) item.stock_qty = -Math.abs(item.stock_qty);
						if (item.amount > 0) item.amount = -Math.abs(item.amount);
					});
				}
			}

			// Get payments with correct sign (positive/negative)
			invoice_doc.payments = this.get_payments();
			console.log("Final payment data:", invoice_doc.payments);

			// Double-check return invoice payments are negative
			if ((this.isReturnInvoice || invoice_doc.is_return) && invoice_doc.payments.length) {
				invoice_doc.payments.forEach((payment) => {
					if (payment.amount > 0) payment.amount = -Math.abs(payment.amount);
					if (payment.base_amount > 0) payment.base_amount = -Math.abs(payment.base_amount);
				});
				console.log("Ensured negative payment amounts for return:", invoice_doc.payments);
			}

			console.log("Showing payment dialog with currency:", invoice_doc.currency);
			this.eventBus.emit("show_payment", "true");
			this.eventBus.emit("send_invoice_doc_payment", invoice_doc);
		} catch (error) {
			console.error("Error in show_payment:", error);
			this.eventBus.emit("show_message", {
				title: __("Error processing payment"),
				color: "error",
				message: error.message,
			});
		}
	},

	// Validate invoice before payment/submit (return logic, quantity, rates, etc)
	async validate() {
		console.log("Starting return validation");

		// For all returns, check if amounts are negative
		if (this.isReturnInvoice) {
			console.log("Validating return invoice values");

			// Check if quantities are negative
			const positiveItems = this.items.filter((item) => item.qty >= 0 || item.stock_qty >= 0);
			if (positiveItems.length > 0) {
				console.log(
					"Found positive quantities in return items:",
					positiveItems.map((i) => i.item_code),
				);
				this.eventBus.emit("show_message", {
					title: __(`Return items must have negative quantities`),
					color: "error",
				});

				// Fix the quantities to be negative
				positiveItems.forEach((item) => {
					item.qty = -Math.abs(item.qty);
					item.stock_qty = -Math.abs(item.stock_qty);
				});

				// Force update to reflect changes
				this.$forceUpdate();
			}

			// Ensure total amount is negative
			if (this.subtotal > 0) {
				console.log("Return has positive subtotal:", this.subtotal);
				this.eventBus.emit("show_message", {
					title: __(`Return total must be negative`),
					color: "warning",
				});
			}
		}

		// For return with reference to existing invoice
		if (this.invoice_doc.is_return && this.invoice_doc.return_against) {
			console.log("Return doc:", this.invoice_doc);
			console.log("Current items:", this.items);

			try {
				// Get original invoice items for comparison
				const original_items = await new Promise((resolve, reject) => {
					frappe.call({
						method: "frappe.client.get",
						args: {
							doctype: "Sales Invoice",
							name: this.invoice_doc.return_against,
						},
						callback: (r) => {
							if (r.message) {
								console.log("Original invoice data:", r.message);
								resolve(r.message.items || []);
							} else {
								reject(new Error("Original invoice not found"));
							}
						},
					});
				});

				console.log("Original invoice items:", original_items);
				console.log(
					"Original item codes:",
					original_items.map((item) => ({
						item_code: item.item_code,
						qty: item.qty,
						rate: item.rate,
					})),
				);

				// Validate each return item
				for (const item of this.items) {
					console.log("Validating return item:", {
						item_code: item.item_code,
						rate: item.rate,
						qty: item.qty,
					});

					// Normalize item codes by trimming and converting to uppercase
					const normalized_return_item_code = item.item_code.trim().toUpperCase();

					// Find matching item in original invoice
					const original_item = original_items.find(
						(orig) => orig.item_code.trim().toUpperCase() === normalized_return_item_code,
					);

					if (!original_item) {
						console.log("Item not found in original invoice:", {
							return_item_code: normalized_return_item_code,
							original_items: original_items.map((i) => i.item_code.trim().toUpperCase()),
						});

						this.eventBus.emit("show_message", {
							title: __(`Item ${item.item_code} not found in original invoice`),
							color: "error",
						});
						return false;
					}

					// Compare rates with precision
					const rate_diff = Math.abs(original_item.rate - item.rate);
					console.log("Rate comparison:", {
						return_rate: item.rate,
						orig_rate: original_item.rate,
						difference: rate_diff,
					});

					if (rate_diff > 0.01) {
						this.eventBus.emit("show_message", {
							title: __(`Rate mismatch for item ${item.item_code}`),
							color: "error",
						});
						return false;
					}

					// Compare quantities
					const return_qty = Math.abs(item.qty);
					const orig_qty = original_item.qty;
					console.log("Quantity comparison:", {
						return_qty: return_qty,
						orig_qty: orig_qty,
					});

					if (return_qty > orig_qty) {
						this.eventBus.emit("show_message", {
							title: __(
								`Return quantity cannot be greater than original quantity for item ${item.item_code}`,
							),
							color: "error",
						});
						return false;
					}
				}
			} catch (error) {
				console.error("Error in validation:", error);
				this.eventBus.emit("show_message", {
					title: __(`Error validating return: ${error.message}`),
					color: "error",
				});
				return false;
			}
		}
		return true;
	},

	// Get draft invoices from backend
	get_draft_invoices() {
		var vm = this;
		frappe.call({
			method: "posawesome.posawesome.api.invoices.get_draft_invoices",
			args: {
				pos_opening_shift: this.pos_opening_shift.name,
			},
			async: false,
			callback: function (r) {
				if (r.message) {
					vm.eventBus.emit("open_drafts", r.message);
				}
			},
		});
	},

	// Get draft orders from backend
	get_draft_orders() {
		var vm = this;
		frappe.call({
			method: "posawesome.posawesome.api.sales_orders.search_orders",
			args: {
				company: this.pos_profile.company,
				currency: this.pos_profile.currency,
			},
			async: false,
			callback: function (r) {
				if (r.message) {
					vm.eventBus.emit("open_orders", r.message);
				}
			},
		});
	},

	// Open returns dialog
	open_returns() {
		this.eventBus.emit("open_returns", this.pos_profile.company);
	},

	// Close payment dialog
	close_payments() {
		this.eventBus.emit("show_payment", "false");
	},

	// Update details for all items (fetch from backend)
	async update_items_details(items) {
		if (!items?.length) return;
		if (!this.pos_profile) return;

		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(this.pos_profile),
					items_data: JSON.stringify(items),
				},
			});

			if (response?.message) {
				items.forEach((item) => {
					const updated_item = response.message.find(
						(element) => element.posa_row_id == item.posa_row_id,
					);
					if (updated_item) {
						item.actual_qty = updated_item.actual_qty;
						item.serial_no_data = updated_item.serial_no_data;
						item.batch_no_data = updated_item.batch_no_data;
						item.item_uoms = updated_item.item_uoms;
						item.has_batch_no = updated_item.has_batch_no;
						item.has_serial_no = updated_item.has_serial_no;
					}
				});
			}
		} catch (error) {
			console.error("Error updating items:", error);
			this.eventBus.emit("show_message", {
				title: __("Error updating item details"),
				color: "error",
			});
		}
	},

	// Update details for a single item (fetch from backend)
	update_item_detail(item, force_update = false) {
		console.log("update_item_detail request", {
			code: item.item_code,
			force_update,
		});
		if (!item.item_code) {
			return;
		}
		var vm = this;

		// If a manual rate was set (e.g. via explicit UOM pricing), don't
		// overwrite it on expand unless explicitly forced.
		if (item._manual_rate_set && !force_update) {
			return;
		}

		// Remove this block which was causing the issue - rates should persist regardless of currency
		// if (item.price_list_rate && !item.posa_offer_applied) {
		//   item.rate = item.price_list_rate;
		//   this.$forceUpdate();
		// }

		frappe.call({
			method: "posawesome.posawesome.api.items.get_item_detail",
			args: {
				warehouse: this.pos_profile.warehouse,
				doc: this.get_invoice_doc(),
				price_list: this.selected_price_list || this.pos_profile.selling_price_list,
				item: {
					item_code: item.item_code,
					customer: this.customer,
					doctype: "Sales Invoice",
					name: "New Sales Invoice 1",
					company: this.pos_profile.company,
					conversion_rate: 1,
					currency: this.pos_profile.currency,
					qty: item.qty,
					price_list_rate: item.base_price_list_rate || item.price_list_rate,
					child_docname: "New Sales Invoice Item 1",
					cost_center: this.pos_profile.cost_center,
					pos_profile: this.pos_profile.name,
					uom: item.uom,
					tax_category: "",
					transaction_type: "selling",
					update_stock: this.pos_profile.update_stock,
					price_list: this.get_price_list(),
					has_batch_no: item.has_batch_no,
					serial_no: item.serial_no,
					batch_no: item.batch_no,
					is_stock_item: item.is_stock_item,
				},
			},
			callback: function (r) {
				if (r.message) {
					const data = r.message;
					if (!item.warehouse) {
						item.warehouse = vm.pos_profile.warehouse;
					}
					// Ensure price list currency is synced from server response
					if (data.price_list_currency) {
						vm.price_list_currency = data.price_list_currency;
					}

					if (!item.original_currency) {
						item.original_currency =
							data.price_list_currency || vm.price_list_currency || vm.selected_currency;
					}
					if (!item.original_rate) {
						item.original_rate = data.price_list_rate;
					}
					if (data.batch_no_data) {
						item.batch_no_data = data.batch_no_data;
					}
					if (
						item.has_batch_no &&
						vm.pos_profile.posa_auto_set_batch &&
						!item.batch_no &&
						data.batch_no_data &&
						data.batch_no_data.length > 0
					) {
						item.batch_no_data = data.batch_no_data;
						// Pass null instead of undefined to avoid console warning
						vm.set_batch_qty(item, null, false);
					}

					// First save base rates if not exists or when force update is requested
					// Avoid overriding existing base rates when the selected currency
					// matches the POS Profile currency. This prevents manual or offer
					// adjusted rates from being reset whenever an item row is expanded.
					if (force_update || !item.base_rate) {
						// Always store base rates from server in base currency
						if (data.price_list_rate !== 0 || !item.base_price_list_rate) {
							item.base_price_list_rate = data.price_list_rate;
							if (!item.posa_offer_applied) {
								item.base_rate = data.price_list_rate;
							}
						}
					}

					// Only update rates if no offer is applied
					if (!item.posa_offer_applied) {
						const companyCurrency = vm.pos_profile.currency;
						const baseCurrency = companyCurrency;

						if (
							vm.selected_currency === vm.price_list_currency &&
							vm.selected_currency !== companyCurrency
						) {
							const conv = vm.conversion_rate || 1;
							item.price_list_rate = vm.flt(
								item.base_price_list_rate / conv,
								vm.currency_precision,
							);

							if (!item._manual_rate_set) {
								item.rate = vm.flt(item.base_rate / conv, vm.currency_precision);
							}
						} else if (vm.selected_currency !== baseCurrency) {
							const exchange_rate = vm.exchange_rate || 1;
							item.price_list_rate = vm.flt(
								item.base_price_list_rate * exchange_rate,
								vm.currency_precision,
							);

							item.rate = vm.flt(item.base_rate * exchange_rate, vm.currency_precision);
						} else {
							item.price_list_rate = item.base_price_list_rate;

							if (!item._manual_rate_set) {
								item.rate = item.base_rate;
							}
						}
					} else {
						// For items with offers, only update price_list_rate
						const companyCurrency = vm.pos_profile.currency;
						const baseCurrency = companyCurrency;

						if (
							vm.selected_currency === vm.price_list_currency &&
							vm.selected_currency !== companyCurrency
						) {
							const conv = vm.conversion_rate || 1;
							item.price_list_rate = vm.flt(
								item.base_price_list_rate / conv,
								vm.currency_precision,
							);
						} else if (vm.selected_currency !== baseCurrency) {
							const exchange_rate = vm.exchange_rate || 1;
							item.price_list_rate = vm.flt(
								item.base_price_list_rate * exchange_rate,
								vm.currency_precision,
							);
						} else {
							item.price_list_rate = item.base_price_list_rate;
						}
					}

					// Handle customer discount only if no offer is applied
					if (
						!item.posa_offer_applied &&
						vm.pos_profile.posa_apply_customer_discount &&
						vm.customer_info.posa_discount > 0 &&
						vm.customer_info.posa_discount <= 100 &&
						item.posa_is_offer == 0 &&
						!item.posa_is_replace
					) {
						const discount_percent =
							item.max_discount > 0
								? Math.min(item.max_discount, vm.customer_info.posa_discount)
								: vm.customer_info.posa_discount;

						item.discount_percentage = discount_percent;

						// Calculate discount in selected currency
						const discount_amount = vm.flt(
							(item.price_list_rate * discount_percent) / 100,
							vm.currency_precision,
						);
						item.discount_amount = discount_amount;

						// Also store base discount amount
						item.base_discount_amount = vm.flt(
							(item.base_price_list_rate * discount_percent) / 100,
							vm.currency_precision,
						);

						// Update rates with discount
						item.rate = vm.flt(item.price_list_rate - discount_amount, vm.currency_precision);
						item.base_rate = vm.flt(
							item.base_price_list_rate - item.base_discount_amount,
							vm.currency_precision,
						);
					}

					// Update other item details
					item.last_purchase_rate = data.last_purchase_rate;
					item.projected_qty = data.projected_qty;
					item.reserved_qty = data.reserved_qty;
					item.conversion_factor = data.conversion_factor;
					item.stock_qty = data.stock_qty;
					item.actual_qty = data.actual_qty;
					item.stock_uom = data.stock_uom;
					item.has_serial_no = data.has_serial_no;
					item.has_batch_no = data.has_batch_no;

					// Calculate final amount
					item.amount = vm.flt(item.qty * item.rate, vm.currency_precision);
					item.base_amount = vm.flt(item.qty * item.base_rate, vm.currency_precision);

					// Log updated rates for debugging
					console.log(`Updated rates for ${item.item_code} on expand:`, {
						base_rate: item.base_rate,
						rate: item.rate,
						base_price_list_rate: item.base_price_list_rate,
						price_list_rate: item.price_list_rate,
						exchange_rate: vm.exchange_rate,
						selected_currency: vm.selected_currency,
						default_currency: vm.pos_profile.currency,
					});

					// Force update UI immediately
					vm.$forceUpdate();
				}
			},
		});
	},

	// Fetch customer details (info, price list, etc)
	async fetch_customer_details() {
		var vm = this;
		if (!this.customer) return;

		if (isOffline()) {
			try {
				const cached = (getCustomerStorage() || []).find(
					(c) => c.name === vm.customer || c.customer_name === vm.customer,
				);
				if (cached) {
					vm.customer_info = { ...cached };
					if (vm.pos_profile.posa_force_reload_items && cached.customer_price_list) {
						vm.selected_price_list = cached.customer_price_list;
						vm.eventBus.emit("update_customer_price_list", cached.customer_price_list);
						vm.apply_cached_price_list(cached.customer_price_list);
					}
					return;
				}
				const queued = (getOfflineCustomers() || [])
					.map((e) => e.args)
					.find((c) => c.customer_name === vm.customer);
				if (queued) {
					vm.customer_info = { ...queued, name: queued.customer_name };
					if (vm.pos_profile.posa_force_reload_items && queued.customer_price_list) {
						vm.selected_price_list = queued.customer_price_list;
						vm.eventBus.emit("update_customer_price_list", queued.customer_price_list);
						vm.apply_cached_price_list(queued.customer_price_list);
					}
					return;
				}
			} catch (error) {
				console.error("Failed to fetch cached customer", error);
			}
		}

		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.customers.get_customer_info",
				args: {
					customer: vm.customer,
				},
			});
			const message = r.message;
			if (!r.exc) {
				vm.customer_info = {
					...message,
				};
			}
			// When force reload is enabled, automatically switch to the
			// customer's default price list so that item rates are fetched
			// correctly from the server.
			if (vm.pos_profile.posa_force_reload_items && message.customer_price_list) {
				vm.selected_price_list = message.customer_price_list;
				vm.eventBus.emit("update_customer_price_list", message.customer_price_list);
				vm.apply_cached_price_list(message.customer_price_list);
			}
		} catch (error) {
			console.error("Failed to fetch customer details", error);
		}
	},

	// Get price list for current customer
	get_price_list() {
		// Use the currently selected price list if available,
		// otherwise fall back to the POS Profile selling price list
		return this.selected_price_list || this.pos_profile.selling_price_list;
	},

	// Update price list for customer
	update_price_list() {
		// Only set the POS Profile price list if it has changed
		const price_list = this.pos_profile.selling_price_list;
		if (this.selected_price_list !== price_list) {
			this.selected_price_list = price_list;
			// Clear any customer specific price list to avoid reloading items
			this.eventBus.emit("update_customer_price_list", null);
		}
	},

	// Apply cached price list rates to existing invoice items
	async apply_cached_price_list(price_list) {
		const cached = await getCachedPriceListItems(price_list);
		if (!Array.isArray(cached) || !cached.length) {
			return;
		}

		const map = {};
		cached.forEach((ci) => {
			map[ci.item_code] = ci;
		});

		this.items.forEach((item) => {
			const ci = map[item.item_code];
			if (!ci) return;

			const newRate = ci.rate || ci.price_list_rate;
			const priceCurrency = ci.currency || this.selected_currency;

			if (!item.original_currency) {
				item.original_currency = priceCurrency;
			}
			if (!item.original_rate) {
				item.original_rate = newRate;
			}

			if (priceCurrency === this.selected_currency) {
				const companyCurrency = this.pos_profile.currency;
				if (priceCurrency !== companyCurrency) {
					const conv = this.conversion_rate || 1;
					item.base_price_list_rate = newRate * conv;
					if (!item._manual_rate_set) {
						item.base_rate = newRate * conv;
					}
				} else {
					item.base_price_list_rate = newRate;
					if (!item._manual_rate_set) {
						item.base_rate = newRate;
					}
				}
				item.price_list_rate = newRate;
				if (!item._manual_rate_set) {
					item.rate = newRate;
				}
			} else {
				// Rate in base currency
				if (newRate !== 0 || !item.base_price_list_rate) {
					item.base_price_list_rate = newRate;
					if (!item._manual_rate_set) {
						item.base_rate = newRate;
					}
				}

				const baseCurrency = this.pos_profile.currency;
				if (this.selected_currency !== baseCurrency) {
					const conv = this.exchange_rate || 1;
					const convRate = this.flt(newRate * conv, this.currency_precision);
					if (newRate !== 0 || !item.price_list_rate) {
						item.price_list_rate = convRate;
					}
					if (!item._manual_rate_set && (newRate !== 0 || !item.rate)) {
						item.rate = convRate;
					}
				} else {
					if (newRate !== 0 || !item.price_list_rate) {
						item.price_list_rate = newRate;
					}
					if (!item._manual_rate_set && (newRate !== 0 || !item.rate)) {
						item.rate = newRate;
					}
				}
			}

			// Recalculate final amounts
			item.amount = this.flt(item.qty * item.rate, this.currency_precision);
			item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);
		});

		this.$forceUpdate();
	},

	// Update additional discount amount based on percentage
	update_discount_umount() {
		return updateDiscountAmount(this);
	},

	// Calculate prices and discounts for an item based on field change
	calc_prices(item, value, $event) {
		return calcPrices(item, value, $event, this);
	},

	// Calculate item price and discount fields
	calc_item_price(item) {
		return calcItemPrice(item, this);
	},

	// Update UOM (unit of measure) for an item and recalculate prices
	calc_uom(item, value) {
		return calcUom(item, value, this);
	},

	// Calculate stock quantity for an item
	calc_stock_qty(item, value) {
		return calcStockQty(item, value, this);
	},

	// Set serial numbers for an item (and update qty)
	set_serial_no(item) {
		return setSerialNo(item, this);
	},

	// Set batch number for an item (and update batch data)
	set_batch_qty(item, value, update = true) {
		return setBatchQty(item, value, update, this);
	},

	change_price_list_rate(item) {
		const vm = this;

		const d = new frappe.ui.Dialog({
			title: __("Change Price"),
			fields: [
				{
					fieldname: "new_rate",
					fieldtype: "Float",
					label: __("New Price List Rate"),
					default: item.price_list_rate || item.rate,
					reqd: 1,
				},
			],
			primary_action_label: __("Update"),
			primary_action(values) {
				const rate = flt(values.new_rate);
				frappe.call({
					method: "posawesome.posawesome.api.items.update_price_list_rate",
					args: {
						item_code: item.item_code,
						price_list: vm.get_price_list(),
						rate: rate,
						uom: item.uom,
					},
					callback(r) {
						if (!r.exc) {
							item.price_list_rate = rate;
							item.base_price_list_rate = rate;
							if (!item._manual_rate_set) {
								item.rate = rate;
								item.base_rate = rate;
							}
							vm.calc_item_price(item);
							vm.eventBus.emit("show_message", {
								title: r.message || __("Item price updated"),
								color: "success",
							});
						}
					},
				});
				d.hide();
			},
		});

		d.get_field("new_rate").$input.on("keydown", function (e) {
			if (e.key === "Enter") {
				d.get_primary_btn().click();
			}
		});

		d.show();
	},
};
