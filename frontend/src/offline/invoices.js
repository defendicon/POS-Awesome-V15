import { memory, persist, isOffline } from "./db.js";
import { syncOfflineCustomers, updateOfflineInvoicesCustomer } from "./customers.js";
import { updateLocalStock } from "./stock.js";
import { reduceCacheUsage } from "./cache.js";

/* global frappe */

// Flag to avoid concurrent invoice syncs which can cause duplicate submissions
let invoiceSyncInProgress = false;

// Validate stock for offline invoice
export function validateStockForOfflineInvoice(items) {
	const allowNegativeStock = memory.pos_opening_storage?.stock_settings?.allow_negative_stock;
	if (allowNegativeStock) {
		return { isValid: true, invalidItems: [], errorMessage: "" };
	}

	const stockCache = memory.local_stock_cache || {};
	const invalidItems = [];

	items.forEach((item) => {
		const itemCode = item.item_code;
		const requestedQty = Math.abs(item.qty || 0);
		const currentStock = stockCache[itemCode]?.actual_qty || 0;

		if (currentStock - requestedQty < 0) {
			invalidItems.push({
				item_code: itemCode,
				item_name: item.item_name || itemCode,
				requested_qty: requestedQty,
				available_qty: currentStock,
			});
		}
	});

	// Create clean error message
	let errorMessage = "";
	if (invalidItems.length === 1) {
		const item = invalidItems[0];
		errorMessage = `Not enough stock for ${item.item_name}. You need ${item.requested_qty} but only ${item.available_qty} available.`;
	} else if (invalidItems.length > 1) {
		errorMessage =
			"Insufficient stock for multiple items:\n" +
			invalidItems
				.map((item) => `• ${item.item_name}: Need ${item.requested_qty}, Have ${item.available_qty}`)
				.join("\n");
	}

	return {
		isValid: invalidItems.length === 0,
		invalidItems: invalidItems,
		errorMessage: errorMessage,
	};
}

export function saveOfflineInvoice(entry) {
	// Validate that invoice has items before saving
	if (!entry.invoice || !Array.isArray(entry.invoice.items) || !entry.invoice.items.length) {
		throw new Error("Cart is empty. Add items before saving.");
	}

	const validation = validateStockForOfflineInvoice(entry.invoice.items);
	if (!validation.isValid) {
		throw new Error(validation.errorMessage);
	}

	const key = "offline_invoices";
	const entries = memory.offline_invoices;
	// Clone the entry before storing to strip Vue reactivity
	// and other non-serializable properties. IndexedDB only
	// supports structured cloneable data, so reactive proxies
	// cause a DataCloneError without this step.
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline invoice", e);
		throw e;
	}

	entries.push(cleanEntry);
	memory.offline_invoices = entries;
	persist(key);

	// Update local stock quantities
	if (entry.invoice && entry.invoice.items) {
		updateLocalStock(entry.invoice.items);
	}
}

export function getOfflineInvoices() {
	return memory.offline_invoices;
}

export function clearOfflineInvoices() {
	memory.offline_invoices = [];
	persist("offline_invoices");
}

export function deleteOfflineInvoice(index) {
	if (Array.isArray(memory.offline_invoices) && index >= 0 && index < memory.offline_invoices.length) {
		memory.offline_invoices.splice(index, 1);
		persist("offline_invoices");
	}
}

export function getPendingOfflineInvoiceCount() {
	return memory.offline_invoices.length;
}

// Reset cached invoices and customers after syncing
// but preserve the stock cache so offline validation
// still has access to the last known quantities
export function resetOfflineState() {
	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };

	persist("offline_invoices");
	persist("offline_customers");
	persist("offline_payments");
	persist("pos_last_sync_totals");
}

export function setLastSyncTotals(totals) {
	memory.pos_last_sync_totals = totals;
	persist("pos_last_sync_totals");
}

export function getLastSyncTotals() {
    return memory.pos_last_sync_totals || { pending: 0, synced: 0, drafted: 0 };
}

// Add sync function to clear local cache when invoices are successfully synced
export async function syncOfflineInvoices() {
	// Prevent concurrent syncs which can lead to duplicate submissions
	if (invoiceSyncInProgress) {
		return { pending: getPendingOfflineInvoiceCount(), synced: 0, drafted: 0 };
	}
	invoiceSyncInProgress = true;
	try {
		// Ensure any offline customers are synced first so that invoices
		// referencing them do not fail during submission
		await syncOfflineCustomers();

		const invoices = getOfflineInvoices();
		if (!invoices.length) {
			// No invoices to sync; clear last totals to avoid repeated messages
			const totals = { pending: 0, synced: 0, drafted: 0 };
			setLastSyncTotals(totals);
			return totals;
		}
		if (isOffline()) {
			// When offline just return the pending count without attempting a sync
			return { pending: invoices.length, synced: 0, drafted: 0 };
		}

		const failures = [];
		let synced = 0;
		let drafted = 0;

		for (const inv of invoices) {
			try {
				await frappe.call({
					method: "posawesome.posawesome.api.invoices.submit_invoice",
					args: {
						invoice: inv.invoice,
						data: inv.data,
					},
				});
				synced++;
			} catch (error) {
				console.error("Failed to submit invoice, saving as draft", error);
				try {
					await frappe.call({
						method: "posawesome.posawesome.api.invoices.update_invoice",
						args: { data: inv.invoice },
					});
					drafted += 1;
				} catch (draftErr) {
					console.error("Failed to save invoice as draft", draftErr);
					failures.push(inv);
				}
			}
		}

		// Reset saved invoices and totals after successful sync
		if (synced > 0) {
			resetOfflineState();
		}

		const pendingLeft = failures.length;

		if (pendingLeft) {
			memory.offline_invoices = failures;
			persist("offline_invoices");
		} else {
			clearOfflineInvoices();
			if (synced > 0 && drafted === 0) {
				reduceCacheUsage();
			}
		}

		const totals = { pending: pendingLeft, synced, drafted };
		if (pendingLeft || drafted) {
			// Persist totals only if there are invoices still pending or drafted
			setLastSyncTotals(totals);
		} else {
			// Clear totals so success message only shows once
			setLastSyncTotals({ pending: 0, synced: 0, drafted: 0 });
		}
		return totals;
	} finally {
		invoiceSyncInProgress = false;
	}
}
