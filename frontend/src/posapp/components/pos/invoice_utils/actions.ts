import { useItemAddition } from "../../../composables/pos/items/useItemAddition";
import { get_invoice_doc, get_invoice_items, get_payments } from "./document";
import { _logPriceListDebug, _buildPriceListSnapshot } from "./currency";
import { applyReturnDiscountProration } from "./item_updates";
import { prepareDocumentFlowAction } from "../../../utils/documentSources";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

/**
 * Action Utils
 * Handles high-level invoice actions like adding, removing items, saving, and canceling.
 *
 * Context requirements:
 * - context.schedulePricingRuleApplication (method)
 * - context.customer
 * - context.customer_info
 * - context.pos_profile
 * - context.get_price_list (method)
 * - context.selected_price_list
 * - context.invoice_doc
 * - context.eventBus
 * - context.toastStore
 * - context.float_precision
 * - context.get_invoice_doc (proxy to document.js)
 * - context.invoiceType (setter)
 * - context.invoiceTypes (setter)
 * - context.posting_date (setter)
 * - context.clear_invoice (method/proxy)
 * - context.customersStore
 * - context.cancel_dialog (setter)
 * - context.update_invoice (method)
 * - context.items
 * - context.posa_offers
 * - context.posa_coupons
 * - context.return_doc
 * - context.discount_amount
 * - context.additional_discount_percentage
 * - context._normalizeReturnDocTotals (method)
 * - context.makeid (method)
 * - context.set_batch_qty (method)
 * - context.formatDateForBackend (method)
 * - context.update_items_details (method)
 */

let itemAdditionApi: ReturnType<typeof useItemAddition> | null = null;

function getItemAdditionApi() {
	if (!itemAdditionApi) {
		itemAdditionApi = useItemAddition();
	}
	return itemAdditionApi;
}

export function remove_item(context: any, item: any) {
	const { removeItem } = getItemAdditionApi();
	const result = removeItem(item, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	applyReturnDiscountProration(context);
	return result;
}

export async function add_item(context: any, item: any, options: any = {}) {
	const { addItem } = getItemAdditionApi();
	// Build price context for debug
	const priceContext = {
		customer: context.customer,
		customer_price_list: context.customer_info?.customer_price_list || null,
		pos_profile_price_list: context.pos_profile?.selling_price_list || null,
		effective_price_list: context.get_price_list
			? context.get_price_list()
			: null,
		selected_price_list: context.selected_price_list || null,
		invoice_selling_price_list:
			context.invoice_doc?.selling_price_list || null,
		item_before: _buildPriceListSnapshot(context, [item]),
	};

	const res = await addItem(item, context);

	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	applyReturnDiscountProration(context);

	// Log debug info
	_logPriceListDebug(context, "add_item", {
		...priceContext,
		item_after: _buildPriceListSnapshot(context, [item]),
	});

	const shouldNotify =
		options?.notifyOnSuccess === true &&
		!options?.skipNotification &&
		context.toastStore;

	if (shouldNotify) {
		const rawQty =
			typeof item?.qty === "number" ? item.qty : parseFloat(item?.qty);
		const shouldAnnounce = Number.isFinite(rawQty) ? rawQty > 0 : true;

		if (shouldAnnounce) {
			const addedQty = Number.isFinite(rawQty) ? Math.abs(rawQty) : 1;
			const rawPrecision = Number(context.float_precision);
			const precision = Number.isInteger(rawPrecision)
				? Math.min(Math.max(rawPrecision, 0), 6)
				: 2;
			const displayQty = Number.isInteger(addedQty)
				? addedQty
				: Number(addedQty.toFixed(precision));
			const itemName = item?.item_name || item?.item_code || __("Item");
			const detail = __("{0} (Qty: {1})", [itemName, displayQty]);

			context.toastStore.show({
				title: __("Item {0} added to invoice", [itemName]),
				summary: __("Items added to invoice"),
				detail,
				color: "success",
				groupId: "invoice-item-added",
			});
		}
	}

	return res;
}

export function get_new_item(context: any, item: any) {
	const { getNewItem } = getItemAdditionApi();
	return getNewItem(item, context);
}

export function clear_invoice(context: any, options: any = {}) {
	const { clearInvoice } = getItemAdditionApi();
	return clearInvoice(context, options);
}

export async function cancel_invoice(context: any) {
	const { clearInvoice } = getItemAdditionApi();
	// We can directly call get_invoice_doc from document.js if we pass context
	// Or assume context has the method proxied.
	// Since we are refactoring, let's call the util directly if possible, or rely on context.
	const doc = get_invoice_doc(context);

	context.posting_date = frappe.datetime.nowdate();

	if (doc.name && context.pos_profile.posa_allow_delete) {
		await frappe.call({
			method: "posawesome.posawesome.api.invoices.delete_invoice",
			args: { invoice: doc.name },
			async: true,
			callback: function (r) {
				if (r.message) {
					context.toastStore.show({
						text: r.message,
						color: "warning",
					});
				}
			},
		});
	}

	// Use the clear_invoice logic
	clearInvoice(context);

	context.customer = context.pos_profile?.customer || "";
	if (context.customersStore?.setSelectedCustomer) {
		context.customersStore.setSelectedCustomer(context.customer || null);
	}
	if (context.eventBus) {
		context.eventBus.emit("focus_item_search");
	}
	context.cancel_dialog = false;
}

export async function save_and_clear_invoice(context: any) {
	const { clearInvoice } = getItemAdditionApi();
	let old_invoice = null;
	const doc = get_invoice_doc(context);

	try {
		if (doc.name) {
			old_invoice = await context.update_invoice(doc);
		} else if (doc.items.length) {
			old_invoice = await context.update_invoice(doc);
		} else {
			context.toastStore.show({
				title: `Nothing to save`,
				color: "error",
			});
		}
	} catch (error) {
		console.error("Error saving and clearing invoice:", error);
	}

	if (!old_invoice) {
		context.toastStore.show({
			title: `Error saving the current invoice`,
			color: "error",
		});
	} else {
		clearInvoice(context);
		if (context.eventBus) {
			context.eventBus.emit("focus_item_search");
		}
		return old_invoice;
	}
}

export async function new_order(context: any, data: any = {}) {
	if (context.eventBus) context.eventBus.emit("set_customer_readonly", false);
	context.expanded = [];
	context.posa_offers = [];
	if (context.eventBus) context.eventBus.emit("set_pos_coupons", []);
	context.posa_coupons = [];
	context.return_doc = "";

	if (!data.name && !data.is_return) {
		context.items = [];
		context.customer = context.pos_profile.customer;
		context.invoice_doc = "";
		context.discount_amount = 0;
		context.additional_discount_percentage = 0;
		context.invoiceType = "Invoice";
		context.invoiceTypes = ["Invoice", "Order", "Quotation"];
	} else {
		if (data.is_return) {
			if (context._normalizeReturnDocTotals) {
				context._normalizeReturnDocTotals(data);
			}
			if (data.return_against) {
				if (context.eventBus)
					context.eventBus.emit("set_customer_readonly", true);
			} else {
				if (context.eventBus)
					context.eventBus.emit("set_customer_readonly", false);
			}
			context.invoiceType = "Return";
			context.invoiceTypes = ["Return"];
		}
		context.invoice_doc = data;
		context.posa_offers = data.posa_offers || [];
		context.items = data.items;

		context.items.forEach((item) => {
			if (!item.posa_row_id) {
				item.posa_row_id = context.makeid
					? context.makeid(20)
					: Math.random().toString(36).substr(2, 9);
			}
			if (item.batch_no) {
				if (context.set_batch_qty)
					context.set_batch_qty(item, item.batch_no);
			}
		});

		context.customer = data.customer;
		context.posting_date = context.formatDateForBackend
			? context.formatDateForBackend(
					data.posting_date || frappe.datetime.nowdate(),
				)
			: data.posting_date || new Date().toISOString().slice(0, 10);
		context.discount_amount = data.discount_amount;

		if (
			data.is_return &&
			context.pos_profile?.posa_use_percentage_discount
		) {
			context.additional_discount_percentage = -Math.abs(
				context.flt
					? context.flt(
							Number.parseFloat(data.additional_discount_percentage),
							context.float_precision,
						)
					: Number.parseFloat(data.additional_discount_percentage),
			);
		} else {
			context.additional_discount_percentage =
				context.flt
					? context.flt(
							data.additional_discount_percentage,
							context.float_precision,
						)
					: data.additional_discount_percentage;
		}

		context.items.forEach((item) => {
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
}

export async function get_invoice_from_order_doc(context: any) {
	let doc: any = {};
	if (context.invoice_doc?.doctype == "Sales Order") {
		const prepared = await prepareDocumentFlowAction({
			action: "order_to_invoice",
			source: "order",
			record: {
				...context.invoice_doc,
				source: "order",
				source_doctype: "Sales Order",
				source_docstatus:
					context.invoice_doc?.source_docstatus ??
					context.invoice_doc?.docstatus ??
					1,
			},
			currentInvoiceDoctype: context.pos_profile?.create_pos_invoice_instead_of_sales_invoice
				? "POS Invoice"
				: "Sales Invoice",
		});
		doc = prepared?.prepared_doc || context.invoice_doc;
	} else {
		doc = context.invoice_doc;
	}
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
		doc = {};
	}
	const sourceItems =
		context.invoice_doc &&
		typeof context.invoice_doc === "object" &&
		Array.isArray(context.invoice_doc.items)
			? context.invoice_doc.items
			: [];
	doc.items = Array.isArray(doc.items)
		? doc.items
		: sourceItems;
	const items: any[] = [];
	const updatedItemsData: any[] = get_invoice_items(context);
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
			item.qty = Number.parseFloat(updatedData.qty);
			item.rate = Number.parseFloat(updatedData.rate);
			item.uom = updatedData.uom;
			item.amount =
				Number.parseFloat(updatedData.qty) *
				Number.parseFloat(updatedData.rate);
			item.conversion_factor = updatedData.conversion_factor;
			item.serial_no = updatedData.serial_no;
			item.discount_percentage = Number.parseFloat(
				updatedData.discount_percentage,
			);
			item.discount_amount = Number.parseFloat(
				updatedData.discount_amount,
			);
			item.batch_no = updatedData.batch_no;
			item.posa_notes = updatedData.posa_notes;
			item.posa_delivery_date = context.formatDateForDisplay
				? context.formatDateForDisplay(updatedData.posa_delivery_date)
				: updatedData.posa_delivery_date;
			item.price_list_rate = updatedData.price_list_rate;
			items.push(item);
		}
	});

	doc.items = items;
	const newItems: any[] = [...doc.items];
	const existingItemCodes = new Set(newItems.map((item) => item.item_code));
	updatedItemsData.forEach((updatedItem) => {
		if (!existingItemCodes.has(updatedItem.item_code)) {
			newItems.push(updatedItem);
		}
	});
	doc.items = newItems;
	doc.update_stock = 1;
	doc.is_pos = 1;
	doc.payments = get_payments(context);
	return doc;
}
