declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

export async function validate(context: any) {
	// Await any pending tasks for items (UOM calculation, detail updates, etc.)
	if (context._itemTaskCache instanceof Map && context.getItemTaskPromise) {
		const allTasks: Promise<unknown>[] = [];
		for (const rowId of context._itemTaskCache.keys()) {
			const bucket = context._itemTaskCache.get(rowId) || {};
			Object.values(bucket).forEach((promise) => {
				if (promise instanceof Promise) {
					allTasks.push(promise);
				}
			});
		}
		if (allTasks.length > 0) {
			console.log(`[Validation] Awaiting ${allTasks.length} pending item tasks...`);
			await Promise.allSettled(allTasks);
		}
	}

	// For all returns, check if amounts are negative
	if (context.isReturnInvoice) {
		// Check if quantities are negative
		const positiveItems = context.items.filter((item) => item.qty >= 0 || item.stock_qty >= 0);
		if (positiveItems.length > 0) {
			context.toastStore.show({
				title: __(`Return items must have negative quantities`),
				color: "error",
			});

			// Fix the quantities to be negative
			positiveItems.forEach((item) => {
				item.qty = -Math.abs(item.qty);
				item.stock_qty = -Math.abs(item.stock_qty);
			});

			// Force update to reflect changes
			if (context.$forceUpdate) context.$forceUpdate();
		}

		// Ensure total amount is negative
		if (context.subtotal > 0) {
			context.toastStore.show({
				title: __(`Return total must be negative`),
				color: "warning",
			});
		}
	}

	// For return with reference to existing invoice
	const currentInvoice = context.invoice_doc;
	if (currentInvoice && currentInvoice.is_return && currentInvoice.return_against) {
		try {
			// Get original invoice items for comparison
			const original_items: any[] = await new Promise((resolve, reject) => {
				frappe.call({
					method: "frappe.client.get",
					args: {
						doctype: context.pos_profile.create_pos_invoice_instead_of_sales_invoice
							? "POS Invoice"
							: "Sales Invoice",
						name: currentInvoice.return_against,
					},
					callback: (r) => {
						if (r.message) {
							resolve(r.message.items || []);
						} else {
							reject(new Error("Original invoice not found"));
						}
					},
				});
			});

			// Validate each return item
			for (const item of context.items) {
				// Normalize item codes
				const normalized_return_item_code = item.item_code.trim().toUpperCase();

				// Find matching item in original invoice
				const original_item = original_items.find(
					(orig) => orig.item_code.trim().toUpperCase() === normalized_return_item_code,
				);

				if (!original_item) {
					context.toastStore.show({
						title: __(`Item ${item.item_code} not found in original invoice`),
						color: "error",
					});
					return false;
				}

				// Compare rates with precision
				const rate_diff = Math.abs(original_item.rate - item.rate);

				if (rate_diff > 0.01) {
					context.toastStore.show({
						title: __(`Rate mismatch for item ${item.item_code}`),
						color: "error",
					});
					return false;
				}

				// Compare quantities
				const return_qty = Math.abs(item.qty);
				const orig_qty = original_item.qty;

				if (return_qty > orig_qty) {
					context.toastStore.show({
						title: __(
							`Return quantity cannot be greater than original quantity for item ${item.item_code}`,
						),
						color: "error",
					});
					return false;
				}
			}
		} catch (error: any) {
			console.error("Error in validation:", error);
			context.toastStore.show({
				title: __(`Error validating return: ${error.message}`),
				color: "error",
			});
			return false;
		}
	}
	return true;
}

export async function ensure_auto_batch_selection(context: any) {
	if (!context.pos_profile?.posa_auto_set_batch) {
		return;
	}

	if (!Array.isArray(context.items) || context.items.length === 0) {
		return;
	}

	const pending: any[] = [];
	const ready: any[] = [];

	context.items.forEach((item) => {
		if (!item?.has_batch_no || item.batch_no) {
			return;
		}

		if (Array.isArray(item.batch_no_data) && item.batch_no_data.length > 0) {
			ready.push(item);
		} else {
			pending.push(item);
		}
	});

	ready.forEach((item) => {
		if (context.set_batch_qty) context.set_batch_qty(item, null, false);
	});

	if (pending.length > 0) {
		if (context.update_items_details) await context.update_items_details(pending);
	}

	const refreshTargets = pending.length > 0 ? pending : ready;
	refreshTargets.forEach((item) => {
		if (!item?.has_batch_no || item.batch_no) {
			return;
		}
		if (Array.isArray(item.batch_no_data) && item.batch_no_data.length > 0) {
			if (context.set_batch_qty) context.set_batch_qty(item, null, false);
		}
	});
}
