import {
	isOffline,
	saveCustomerBalance,
	getCachedCustomerBalance,
} from "../../../../offline/index";
import { useDiscounts } from "../../../composables/pos/shared/useDiscounts";

declare const __: (_text: string, _args?: any[]) => string;
declare const flt: (_value: unknown, _precision?: number) => number;
declare const frappe: any;

/**
 * Loader Utils
 * Handles loading invoice data and fetching customer balance.
 *
 * Context requirements:
 * - context.pos_profile
 * - context.additional_discount_percentage
 * - context.selected_delivery_charge
 * - context.delivery_charges_rate
 * - context.additional_discount
 * - context.discount_amount
 * - context.clear_invoice (method)
 * - context.eventBus
 * - context.invoiceType
 * - context.invoiceTypes
 * - context.invoice_doc
 * - context.posa_offers
 * - context.items
 * - context.packed_items
 * - context.makeid (method or import)
 * - context.set_batch_qty (method)
 * - context._snapshotManualValuesFromDocItems (method)
 * - context._restoreManualSnapshots (method)
 * - context.update_items_details (method)
 * - context.customer
 * - context.set_delivery_charges (method)
 * - context.formatDateForBackend (method)
 * - context.delivery_charges
 * - context.Total
 * - context.subtotal
 * - context.return_doc
 * - context.toastStore
 */

export async function fetch_customer_balance(context: any) {
	try {
		if (!context.customer) {
			context.customer_balance = 0;
			return;
		}

		// Check if offline and use cached balance
		if (isOffline()) {
			const cachedBalance = getCachedCustomerBalance(context.customer);
			if (cachedBalance !== null) {
				context.customer_balance = cachedBalance;
				return;
			} else {
				// No cached balance available in offline mode
				context.customer_balance = 0;
				context.toastStore.show({
					title: __("Customer balance unavailable offline"),
					text: __(
						"Balance will be updated when connection is restored",
					),
					color: "warning",
				});
				return;
			}
		}

		// Online mode: fetch from server and cache the result
		const r = await frappe.call({
			method: "posawesome.posawesome.api.customer.get_customer_balance",
			args: { customer: context.customer },
		});

		const balance = r?.message?.balance || 0;
		context.customer_balance = balance;

		// Cache the balanced for offline use
		saveCustomerBalance(context.customer, balance);
	} catch (error) {
		console.error("Error fetching balance:", error);

		// Try to use cached balance as fallback
		const cachedBalance = getCachedCustomerBalance(context.customer);
		if (cachedBalance !== null) {
			context.customer_balance = cachedBalance;
			context.toastStore.show({
				title: __("Using cached customer balance"),
				text: __("Could not fetch latest balance from server"),
				color: "warning",
			});
		} else {
			context.toastStore.show({
				title: __("Error fetching customer balance"),
				color: "error",
			});
			context.customer_balance = 0;
		}
	}
}

export async function load_invoice(
	context: any,
	data: any = {},
	options: any = {},
) {
	const {
		preserveAdditionalDiscountPercentage = false,
		preserveStickies = false,
	} = options || {};
	const usePercentageDiscount = Boolean(
		context.pos_profile?.posa_use_percentage_discount,
	);
	// Note: flt global assumption
	const previousDiscountPercentage: number = usePercentageDiscount
		? flt(context.additional_discount_percentage)
		: 0;
	const shouldPreserveDiscountPercentage =
		usePercentageDiscount &&
		preserveAdditionalDiscountPercentage &&
		Number.isFinite(previousDiscountPercentage);

	// Capture current stickies if requested or if we are loading a draft
	const stickyData = preserveStickies
		? {
				delivery_charge: context.selected_delivery_charge,
				delivery_rate: context.delivery_charges_rate,
				additional_discount: context.additional_discount,
				additional_discount_percentage:
					context.additional_discount_percentage,
			}
		: null;

	if (context.clear_invoice) {
		context.clear_invoice({ preserveStickies });
	}

	// Restore stickies if they aren't provided in the data
	if (preserveStickies && stickyData) {
		if (!data.posa_delivery_charges && stickyData.delivery_charge) {
			context.selected_delivery_charge = stickyData.delivery_charge;
			context.delivery_charges_rate = stickyData.delivery_rate;
		}
		if (
			data.additional_discount === undefined &&
			data.additional_discount_percentage === undefined
		) {
			context.additional_discount = stickyData.additional_discount;
			context.additional_discount_percentage =
				stickyData.additional_discount_percentage;
			context.discount_amount = context.additional_discount;
		}
	}

	if (data?.is_return) {
		if (context._normalizeReturnDocTotals) {
			context._normalizeReturnDocTotals(data);
		}
	}

	if (data.is_return) {
		// For return without invoice case, check if there's a return_against
		// Only set customer readonly if this is a return with reference to an invoice
		if (data.return_against) {
			context.eventBus.emit("set_customer_readonly", true);
		} else {
			// Allow customer selection for returns without invoice
			context.eventBus.emit("set_customer_readonly", false);
		}
		context.invoiceType = "Return";
		context.invoiceTypes = ["Return"];
	} else if (data.doctype === "Quotation") {
		context.invoiceType = "Quotation";
		if (!context.invoiceTypes.includes("Quotation")) {
			context.invoiceTypes = ["Invoice", "Order", "Quotation"];
		}
	} else if (
		data.doctype === "Sales Order" &&
		context.pos_profile?.posa_create_only_sales_order
	) {
		context.invoiceType = "Order";
		if (!context.invoiceTypes.includes("Order")) {
			context.invoiceTypes = ["Invoice", "Order", "Quotation"];
		}
	}

	context.invoice_doc = data;
	context.posa_offers = data.posa_offers || [];
	context.items = data.items || [];
	context.packed_items = data.packed_items || [];

	if (data.is_return && data.return_against) {
		context.items.forEach((item) => {
			item.locked_price = true;
		});
		context.packed_items.forEach((pi) => {
			pi.locked_price = true;
		});
	}

	if (context.items.length > 0) {
		context.items.forEach((item) => {
			if (!item.posa_row_id) {
				// Assuming makeid is available on context or we need to import utility
				item.posa_row_id = context.makeid
					? context.makeid(20)
					: Math.random().toString(36).substr(2, 9);
			}
			if (item.batch_no) {
				if (context.set_batch_qty)
					context.set_batch_qty(item, item.batch_no);
			}
			if (!item.original_item_name) {
				item.original_item_name = item.item_name;
			}
		});

		const manualSnapshots = context._snapshotManualValuesFromDocItems
			? context._snapshotManualValuesFromDocItems(context.items)
			: [];

		// await context.update_items_details(context.items);

		if (manualSnapshots.length && context._restoreManualSnapshots) {
			context._restoreManualSnapshots(context.items, manualSnapshots);
		}
	}

	if (context.packed_items.length > 0) {
		if (context.update_items_details)
			context.update_items_details(context.packed_items);
		context.packed_items.forEach((pi) => {
			if (!pi.posa_row_id) {
				pi.posa_row_id = context.makeid
					? context.makeid(20)
					: Math.random().toString(36).substr(2, 9);
			}
		});
	}

	context.customer = data.customer;
	if (context.set_delivery_charges) await context.set_delivery_charges();

	context.posting_date = context.formatDateForBackend
		? context.formatDateForBackend(
				data.posting_date || frappe.datetime.nowdate(),
			)
		: data.posting_date || new Date().toISOString().slice(0, 10);
	if (data.posa_delivery_charges) {
		context.selected_delivery_charge = context.delivery_charges.find(
			(charge) => charge.name === data.posa_delivery_charges,
		);
		context.delivery_charges_rate = data.posa_delivery_charges_rate;
	}
	let docDiscountAmount = flt(data.discount_amount);
	const docDiscountPercentage =
		data.additional_discount_percentage !== undefined &&
		data.additional_discount_percentage !== null
			? flt(data.additional_discount_percentage)
			: 0;
	const docIsReturn = Boolean(data.is_return);
	if (docIsReturn && !usePercentageDiscount && docDiscountAmount > 0) {
		docDiscountAmount = -Math.abs(docDiscountAmount);
	}
	if (docIsReturn) {
		console.log("[POSA][Returns] Loader discount sync", {
			usePercentageDiscount,
			docDiscountAmount,
			docDiscountPercentage,
			docTotal: data.total,
			docNetTotal: data.net_total,
			docGrandTotal: data.grand_total,
		});
	}

	const { updateDiscountAmount } = useDiscounts();

	if (usePercentageDiscount) {
		let resolvedPercentage = 0;

		if (shouldPreserveDiscountPercentage) {
			resolvedPercentage = previousDiscountPercentage;
		} else if (
			data.additional_discount_percentage !== undefined &&
			data.additional_discount_percentage !== null &&
			Number.isFinite(docDiscountPercentage)
		) {
			resolvedPercentage = docDiscountPercentage;
		} else {
			const totalsForPercentage: number[] = [];

			if (context.Total) {
				const signedTotal = docIsReturn
					? -Math.abs(context.Total)
					: context.Total;
				if (signedTotal) {
					totalsForPercentage.push(signedTotal);
				}
			}

			if (data.total !== undefined && data.total !== null) {
				const docTotal = flt(data.total);
				const signedDocTotal = docIsReturn
					? -Math.abs(docTotal)
					: docTotal;
				if (signedDocTotal) {
					totalsForPercentage.push(signedDocTotal);
				}
			}

			if (data.net_total !== undefined && data.net_total !== null) {
				const docNetTotal = flt(data.net_total);
				const signedNetTotal = docIsReturn
					? -Math.abs(docNetTotal)
					: docNetTotal;
				if (signedNetTotal) {
					totalsForPercentage.push(signedNetTotal);
				}
			}

			const percentageBase = totalsForPercentage.find((value) => value);

			if (percentageBase) {
				resolvedPercentage = context.flt(
					(docDiscountAmount / percentageBase) * 100,
					context.float_precision,
				);
			} else {
				resolvedPercentage = docDiscountPercentage;
			}
		}

		if (!Number.isFinite(resolvedPercentage)) {
			resolvedPercentage = 0;
		}

		if (docIsReturn) {
			resolvedPercentage = -Math.abs(resolvedPercentage);
		} else {
			resolvedPercentage = Math.abs(resolvedPercentage);
		}

		context.additional_discount_percentage = resolvedPercentage;
		updateDiscountAmount(context);

		// Ensure watchers or rounding adjustments don't overwrite the intended value
		if (typeof context.$nextTick === "function") {
			context.$nextTick(() => {
				if (context.pos_profile?.posa_use_percentage_discount) {
					context.additional_discount_percentage = resolvedPercentage;
				}
			});
		}

		context.additional_discount = context.flt(
			context.additional_discount,
			context.currency_precision,
		);
		context.discount_amount = context.additional_discount;
	} else {
		context.discount_amount = docDiscountAmount;
		context.additional_discount_percentage = docDiscountPercentage;
		context.additional_discount = docDiscountAmount;
	}

	if (context.items.length > 0) {
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

	if (data.is_return) {
		context.return_doc = data;
	} else {
		context.eventBus.emit("set_pos_coupons", data.posa_coupons);
	}
}
