import { isOffline } from "../../../../offline/index";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

export async function show_payment(context: any) {
	if (context._suppressClosePaymentsTimer) {
		clearTimeout(context._suppressClosePaymentsTimer);
		context._suppressClosePaymentsTimer = null;
	}
	context._suppressClosePayments = true;

	try {
		if (!context.customer) {
			context.toastStore.show({
				title: __(`Select a customer`),
				color: "error",
			});
			return;
		}

		if (!context.items.length) {
			context.toastStore.show({
				title: __(`Select items to sell`),
				color: "error",
			});
			return;
		}

		const isValid = context.validate ? await context.validate() : true;

		if (!isValid) {
			return;
		}

		if (context.ensure_auto_batch_selection) await context.ensure_auto_batch_selection();

		let invoice_doc;
		if (
			context.invoiceType === "Order" &&
			context.pos_profile.posa_create_only_sales_order &&
			!context.new_delivery_date &&
			!(context.invoice_doc && context.invoice_doc.posa_delivery_date)
		) {
			invoice_doc = context.get_invoice_doc();
		} else if (
			context.invoice_doc &&
			context.invoice_doc.doctype === "Sales Order" &&
			context.invoiceType === "Invoice"
		) {
			invoice_doc = await context.process_invoice_from_order();
		} else {
			invoice_doc = await context.process_invoice();
		}

		if (!invoice_doc) {
			return;
		}

		if (!isOffline() && invoice_doc.name) {
			const refreshed = await context.reload_current_invoice_from_backend();
			if (refreshed) {
				invoice_doc = refreshed;
			}
		}

		invoice_doc.currency = context.selected_currency || context.pos_profile.currency;
		invoice_doc.conversion_rate = context.conversion_rate || 1;
		invoice_doc.plc_conversion_rate = context._getPlcConversionRate ? context._getPlcConversionRate() : 1;

		if (invoice_doc.discount_amount !== undefined && invoice_doc.discount_amount !== null) {
			context.discount_amount = context.flt(invoice_doc.discount_amount, context.currency_precision);
			context.additional_discount = context.discount_amount;
		}

		if (
			invoice_doc.additional_discount_percentage !== undefined &&
			invoice_doc.additional_discount_percentage !== null
		) {
			context.additional_discount_percentage = context.flt(
				invoice_doc.additional_discount_percentage,
				context.float_precision,
			);
		}

		if (context.isReturnInvoice || invoice_doc.is_return) {
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

			if (invoice_doc.items && invoice_doc.items.length) {
				invoice_doc.items.forEach((item) => {
					if (item.qty > 0) item.qty = -Math.abs(item.qty);
					if (item.stock_qty > 0) item.stock_qty = -Math.abs(item.stock_qty);
					if (item.amount > 0) item.amount = -Math.abs(item.amount);
				});
			}
		}

		invoice_doc.payments = context.get_payments ? context.get_payments() : [];

		if ((context.isReturnInvoice || invoice_doc.is_return) && invoice_doc.payments.length) {
			invoice_doc.payments.forEach((payment) => {
				if (payment.amount > 0) payment.amount = -Math.abs(payment.amount);
				if (payment.base_amount > 0) payment.base_amount = -Math.abs(payment.base_amount);
			});
		}

		await context.$nextTick();

		const useDesktopPaymentDialog =
			typeof window !== "undefined" && window.innerWidth >= 992;

		if (useDesktopPaymentDialog && context.uiStore?.openPaymentDialog) {
			context.uiStore.openPaymentDialog();
		} else if (context.uiStore?.setActiveView) {
			context.uiStore.closePaymentDialog?.();
			context.uiStore.setActiveView("payment");
		}
		context.eventBus.emit("show_payment", "true");
		context.eventBus.emit("send_invoice_doc_payment", invoice_doc);
	} catch (error: any) {
		console.error("Error in show_payment:", error);
		context.toastStore.show({
			title: __("Error processing payment"),
			color: "error",
			message: error.message,
		});
	} finally {
		context._suppressClosePaymentsTimer = setTimeout(() => {
			context._suppressClosePayments = false;
			context._suppressClosePaymentsTimer = null;
		}, 300);
	}
}

export async function get_draft_invoices(context: any) {
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.invoices.get_draft_invoices",
			args: {
				pos_opening_shift: context.pos_opening_shift.name,
				doctype: context.pos_profile.create_pos_invoice_instead_of_sales_invoice
					? "POS Invoice"
					: "Sales Invoice",
			},
		});
		if (message) {
			context.uiStore.openDrafts(message);
		}
	} catch (error) {
		console.error("Error fetching draft invoices:", error);
		context.toastStore.show({
			title: __("Unable to fetch draft invoices"),
			color: "error",
		});
	}
}

export async function get_draft_orders(context: any) {
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.sales_orders.search_orders",
			args: {
				company: context.pos_profile.company,
				currency: context.pos_profile.currency,
			},
		});
		if (message) {
			context.uiStore.openOrders(message);
		}
	} catch (error) {
		console.error("Error fetching draft orders:", error);
		context.toastStore.show({
			title: __("Unable to fetch draft orders"),
			color: "error",
		});
	}
}


export function open_returns(context: any) {
	context.eventBus.emit("open_returns", context.pos_profile.company);
}

export function close_payments(context: any) {
	if (context._suppressClosePayments) {
		return;
	}

	if (
		typeof context.paymentVisible !== "undefined" &&
		!context.paymentVisible &&
		!context.uiStore?.paymentDialogOpen
	) {
		return;
	}

	if (context.uiStore?.paymentDialogOpen && context.uiStore?.closePaymentDialog) {
		context.uiStore.closePaymentDialog();
	} else if (context.uiStore?.setActiveView) {
		context.uiStore.setActiveView("items");
	}

	context.eventBus.emit("show_payment", "false");
}

export function change_price_list_rate(context: any, item: any) {
	context.eventBus.emit("change_price_list_rate", item);
}
