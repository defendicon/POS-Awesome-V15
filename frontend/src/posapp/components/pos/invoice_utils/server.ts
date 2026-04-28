import { isOffline } from "../../../../offline/index";
import { _logPriceListDebug, _buildPriceListSnapshot } from "./currency";
import {
	_normalizeReturnDocTotals,
	_collectManualRateOverrides,
	_applyManualRateOverridesToDoc,
	applyReturnDiscountProration,
} from "./item_updates"; // _normalizeReturnDocTotals needs extraction or location check
import { load_invoice } from "./loader";
import { parseBooleanSetting } from "../../../utils/stock";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

const formatStockValidationErrors = (context: any, errors: any[]) => {
	if (!Array.isArray(errors) || errors.length === 0) {
		return "";
	}

	const settings = context?.stock_settings || {};
	const profile = context?.pos_profile || {};
	const type =
		typeof context?.invoiceType === "string"
			? context.invoiceType
			: context?.invoiceType?.value;
	const stockBlockedByProfile =
		!["Order", "Quotation"].includes(type) &&
		parseBooleanSetting(profile?.posa_block_sale_beyond_available_qty);
	const blocking =
		!parseBooleanSetting(settings?.allow_negative_stock) ||
		stockBlockedByProfile;

	const lines = errors
		.map((entry) => {
			const itemCode = entry?.item_code || __("Unknown Item");
			const warehouse = entry?.warehouse || __("Unknown Warehouse");
			const qty = Number.isFinite(Number(entry?.available_qty))
				? Number(entry.available_qty)
				: 0;
			return `${itemCode} (${warehouse}) - ${qty}`;
		})
		.join("\n");

	return blocking
		? __("Insufficient stock:\n{0}", [lines])
		: __("Stock is lower than requested:\n{0}", [lines]);
};

const extractServerErrorMessage = (context: any, error: any) => {
	if (!error) {
		return __("Error processing invoice");
	}

	const tryExtractStockErrors = (raw: any) => {
		try {
			const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
			if (parsed?.errors && Array.isArray(parsed.errors)) {
				return formatStockValidationErrors(context, parsed.errors);
			}
			return null;
		} catch {
			return null;
		}
	};

	if (error?._server_messages) {
		try {
			const parsedMessages = JSON.parse(error._server_messages);
			if (Array.isArray(parsedMessages) && parsedMessages.length) {
				for (const message of parsedMessages) {
					const stockMessage = tryExtractStockErrors(message);
					if (stockMessage) {
						return stockMessage;
					}

					if (typeof message === "string" && message.trim()) {
						return frappe?.utils?.strip_html
							? frappe.utils.strip_html(message)
							: message;
					}
				}
			}
		} catch {
			/* no-op */
		}
	}

	const fromMessage = tryExtractStockErrors(error?.message);
	if (fromMessage) {
		return fromMessage;
	}

	if (typeof error?.message === "string" && error.message.trim()) {
		return error.message;
	}

	return __("Error processing invoice");
};

export async function update_invoice(context: any, doc: any) {
	if (isOffline()) {
		context.invoice_doc = Object.assign({}, context.invoice_doc || {}, doc);
		return context.invoice_doc;
	}

	const method =
		doc.doctype === "Sales Order" && context.pos_profile.posa_create_only_sales_order
			? "posawesome.posawesome.api.sales_orders.update_sales_order"
			: doc.doctype === "Quotation"
				? "posawesome.posawesome.api.quotations.update_quotation"
				: "posawesome.posawesome.api.invoices.update_invoice";

	try {
		_logPriceListDebug(context, "update_invoice_request", {
			customer: context.customer,
			customer_price_list: context.customer_info?.customer_price_list || null,
			pos_profile_price_list: context.pos_profile?.selling_price_list || null,
			effective_price_list: context.get_price_list ? context.get_price_list() : null,
			selected_price_list: context.selected_price_list || null,
			invoice_selling_price_list: doc.selling_price_list,
			items_before: _buildPriceListSnapshot(context, doc.items),
		});
		const response = await frappe.call({
			method,
			args: {
				data: doc,
			},
		});

		const message = response?.message;
		if (message) {
			_logPriceListDebug(context, "update_invoice_response", {
				effective_price_list: context.get_price_list ? context.get_price_list() : null,
				invoice_selling_price_list: message.selling_price_list,
				items_after: _buildPriceListSnapshot(context, message.items),
			});
			if (message.is_return) {
				if (context._normalizeReturnDocTotals) context._normalizeReturnDocTotals(message);
			}
			context.invoice_doc = message;
			if (message.exchange_rate_date) {
				context.exchange_rate_date = message.exchange_rate_date;
				const posting_backend = context.formatDateForBackend
					? context.formatDateForBackend(context.posting_date_display)
					: context.posting_date;
				if (posting_backend !== context.exchange_rate_date) {
					context.toastStore.show({
						title: __(
							"Exchange rate date " +
								context.exchange_rate_date +
								" differs from posting date " +
								posting_backend,
						),
						color: "warning",
					});
				}
			}
		}

		return context.invoice_doc;
	} catch (error) {
		console.error("Error updating invoice:", error);
		throw error;
	}
}

export async function update_invoice_from_order(context: any, doc: any) {
	if (isOffline()) {
		context.invoice_doc = Object.assign({}, context.invoice_doc || {}, doc);
		return context.invoice_doc;
	}

	try {
		const response = await frappe.call({
			method: "posawesome.posawesome.api.invoices.update_invoice_from_order",
			args: {
				data: doc,
			},
		});

		const message = response?.message;
		if (message) {
			if (message.is_return) {
				if (context._normalizeReturnDocTotals) context._normalizeReturnDocTotals(message);
			}
			context.invoice_doc = message;
			if (message.exchange_rate_date) {
				context.exchange_rate_date = message.exchange_rate_date;
				const posting_backend = context.formatDateForBackend
					? context.formatDateForBackend(context.posting_date_display)
					: context.posting_date;
				if (posting_backend !== context.exchange_rate_date) {
					context.toastStore.show({
						title: __(
							"Exchange rate date " +
								context.exchange_rate_date +
								" differs from posting date " +
								posting_backend,
						),
						color: "warning",
					});
				}
			}
		}

		return context.invoice_doc;
	} catch (error) {
		console.error("Error updating invoice from order:", error);
		throw error;
	}
}

export async function process_invoice(context: any) {
	applyReturnDiscountProration(context);
	const doc = context.get_invoice_doc ? context.get_invoice_doc() : {};
	_logPriceListDebug(context, "pre-submit", {
		customer: context.customer,
		customer_price_list: context.customer_info?.customer_price_list || null,
		pos_profile_price_list: context.pos_profile?.selling_price_list || null,
		effective_price_list: context.get_price_list ? context.get_price_list() : null,
		selected_price_list: context.selected_price_list || null,
		invoice_selling_price_list: doc.selling_price_list,
		items_before: _buildPriceListSnapshot(context, doc.items),
	});
	try {
		const updated_doc = await update_invoice(context, doc);
		if (updated_doc && updated_doc.posting_date) {
			context.posting_date = context.formatDateForBackend
				? context.formatDateForBackend(updated_doc.posting_date)
				: updated_doc.posting_date;
		}
		return updated_doc;
	} catch (error: any) {
		console.error("Error in process_invoice:", error);
		const errorMessage = extractServerErrorMessage(context, error);
		context.toastStore.show({
			title: errorMessage,
			color: "error",
		});
		return false;
	}
}

export async function process_invoice_from_order(context: any) {
	try {
		const doc = await context.get_invoice_from_order_doc();
		return await update_invoice_from_order(context, doc);
	} catch (error: any) {
		console.error("Error in process_invoice_from_order:", error);
		const errorMessage = extractServerErrorMessage(context, error);
		context.toastStore.show({
			title: errorMessage,
			color: "error",
		});
		return false;
	}
}

export async function reload_current_invoice_from_backend(context: any) {
	try {
		if (isOffline()) {
			return null;
		}

		const current = context.invoice_doc || {};
		const name = current.name;
		let doctype = current.doctype;
		const effectivePriceList = context.get_price_list ? context.get_price_list() : null;

		_logPriceListDebug(context, "reload_invoice_request", {
			customer: context.customer,
			customer_price_list: context.customer_info?.customer_price_list || null,
			pos_profile_price_list: context.pos_profile?.selling_price_list || null,
			effective_price_list: effectivePriceList,
			invoice_selling_price_list: current.selling_price_list || null,
		});

		if (!doctype) {
			if (context.invoiceType === "Quotation") {
				doctype = "Quotation";
			} else if (context.invoiceType === "Order" && context.pos_profile?.posa_create_only_sales_order) {
				doctype = "Sales Order";
			} else if (context.pos_profile?.create_pos_invoice_instead_of_sales_invoice) {
				doctype = "POS Invoice";
			} else {
				doctype = "Sales Invoice";
			}
		}

		if (!name || !doctype) {
			return null;
		}

		const manualOverrides = context._collectManualRateOverrides
			? context._collectManualRateOverrides(context.items)
			: [];

		const r = await frappe.call({
			method: "frappe.client.get",
			args: { doctype, name },
		});

		const doc = r?.message;
		if (doc) {
			_logPriceListDebug(context, "reload_invoice_response", {
				effective_price_list: effectivePriceList,
				invoice_selling_price_list: doc.selling_price_list,
				items_after: _buildPriceListSnapshot(context, doc.items),
			});
			if (manualOverrides.length && context._applyManualRateOverridesToDoc) {
				context._applyManualRateOverridesToDoc(doc, manualOverrides);
			}

			// delegate to loader.js load_invoice
			await load_invoice(context, doc, {
				preserveAdditionalDiscountPercentage: true,
			});
			return doc;
		}
		return null;
	} catch (error) {
		console.error("Error reloading current invoice from backend:", error);
		context.toastStore.show({
			title: __("Failed to reload invoice from server"),
			color: "warning",
		});
		return null;
	}
}
