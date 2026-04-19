import { isOffline, memory, persist } from "./db";
import { syncOfflineCustomers } from "./customers";
import { reduceCacheUsage } from "./cache";
import { ensureOfflineInvoiceRequest } from "./idempotency";
import { updateLocalStock } from "./stock";
import {
	claimRetryableQueueEntries,
	clearWriteQueueEntries,
	deleteWriteQueueEntryByIndex,
	enqueueWriteQueueEntry,
	getQueuedPayloadCount,
	getQueuedPayloadSnapshots,
	markWriteQueueEntryFailed,
	markWriteQueueEntrySynced,
	type OfflineEntityType,
} from "./writeQueue";

type AnyRecord = Record<string, any>;

const INVOICE_ENTITY: OfflineEntityType = "invoice";

const asBoolean = (value: any): boolean => {
	return (
		value === true ||
		value === 1 ||
		value === "1" ||
		value === "true" ||
		value === "Yes" ||
		value === "yes"
	);
};

let invoiceSyncInProgress = false;

export function validateStockForOfflineInvoice(items: AnyRecord[]) {
	const openingStorage = memory.pos_opening_storage || {};
	const stockSettings = openingStorage?.stock_settings || {};
	const posProfile = openingStorage?.pos_profile || {};

	const allowNegativeStock = asBoolean(stockSettings?.allow_negative_stock);
	if (allowNegativeStock) {
		return { isValid: true, invalidItems: [], errorMessage: "" };
	}

	const blockSaleBeyondAvailableQty = asBoolean(
		posProfile?.posa_block_sale_beyond_available_qty,
	);

	const stockCache = memory.local_stock_cache || {};
	const invalidItems: AnyRecord[] = [];

	items.forEach((item) => {
		if (asBoolean(item?.allow_negative_stock)) {
			return;
		}

		const itemCode = item.item_code;
		const requestedQty = Math.abs(item.qty || 0);
		const currentStock = stockCache[itemCode]?.actual_qty || 0;

		if (!blockSaleBeyondAvailableQty) {
			return;
		}

		if (currentStock - requestedQty < 0) {
			invalidItems.push({
				item_code: itemCode,
				item_name: item.item_name || itemCode,
				requested_qty: requestedQty,
				available_qty: currentStock,
			});
		}
	});

	let errorMessage = "";
	if (invalidItems.length === 1) {
		const item = invalidItems[0];
		if (item) {
			errorMessage = `Not enough stock for ${item.item_name}. You need ${item.requested_qty} but only ${item.available_qty} available.`;
		}
	} else if (invalidItems.length > 1) {
		errorMessage =
			"Insufficient stock for multiple items:\n" +
			invalidItems
				.map(
					(item) =>
						`â€¢ ${item.item_name}: Need ${item.requested_qty}, Have ${item.available_qty}`,
				)
				.join("\n");
	}

	return {
		isValid: invalidItems.length === 0,
		invalidItems,
		errorMessage,
	};
}

function prepareOfflineInvoiceEntry(entry: AnyRecord) {
	ensureOfflineInvoiceRequest(entry);

	if (
		!entry.invoice ||
		!Array.isArray(entry.invoice.items) ||
		!entry.invoice.items.length
	) {
		throw new Error("Cart is empty. Add items before saving.");
	}

	const validation = validateStockForOfflineInvoice(entry.invoice.items);
	if (!validation.isValid) {
		throw new Error(validation.errorMessage);
	}

	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (error) {
		console.error("Failed to serialize offline invoice", error);
		throw error;
	}

	const replaySources = Array.isArray(cleanEntry?.data?.customer_credit_dict)
		? cleanEntry.data.customer_credit_dict.filter(
				(row: AnyRecord) => Number(row?.credit_to_redeem || 0) > 0,
			)
		: [];

	if (
		Number(cleanEntry?.data?.redeemed_customer_credit || 0) > 0 &&
		cleanEntry?.invoice?.customer &&
		replaySources.length
	) {
		cleanEntry.data.customer_balance_replay = {
			customer: cleanEntry.invoice.customer,
			redeemed_customer_credit: cleanEntry.data.redeemed_customer_credit,
			sources: replaySources,
			timestamp: Date.now(),
		};
	}

	return cleanEntry;
}

export async function saveOfflineInvoice(entry: AnyRecord) {
	const cleanEntry = prepareOfflineInvoiceEntry(entry);
	const createdEntry = await enqueueWriteQueueEntry(INVOICE_ENTITY, cleanEntry);

	if (entry.invoice?.items) {
		updateLocalStock(entry.invoice.items);
	}

	return createdEntry;
}

export function getOfflineInvoices() {
	return getQueuedPayloadSnapshots(INVOICE_ENTITY);
}

export async function clearOfflineInvoices() {
	await clearWriteQueueEntries(INVOICE_ENTITY);
}

export async function deleteOfflineInvoice(index: number) {
	await deleteWriteQueueEntryByIndex(INVOICE_ENTITY, index);
}

export function getPendingOfflineInvoiceCount() {
	return getQueuedPayloadCount(INVOICE_ENTITY);
}

export function resetOfflineState() {
	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };
	persist("pos_last_sync_totals");
}

export function setLastSyncTotals(totals: {
	pending: number;
	synced: number;
	drafted: number;
}) {
	memory.pos_last_sync_totals = totals;
	persist("pos_last_sync_totals");
}

export function getLastSyncTotals() {
	return memory.pos_last_sync_totals || { pending: 0, synced: 0, drafted: 0 };
}

export async function syncOfflineInvoices() {
	if (invoiceSyncInProgress) {
		return {
			pending: getPendingOfflineInvoiceCount(),
			synced: 0,
			drafted: 0,
		};
	}

	invoiceSyncInProgress = true;
	try {
		await syncOfflineCustomers();

		const invoices = getOfflineInvoices();
		if (!invoices.length) {
			const totals = { pending: 0, synced: 0, drafted: 0 };
			setLastSyncTotals(totals);
			return totals;
		}

		if (isOffline()) {
			return { pending: invoices.length, synced: 0, drafted: 0 };
		}

		const claimedEntries = await claimRetryableQueueEntries(INVOICE_ENTITY);
		if (!claimedEntries.length) {
			return {
				pending: getPendingOfflineInvoiceCount(),
				synced: 0,
				drafted: 0,
			};
		}

		let synced = 0;
		let drafted = 0;

		for (const entry of claimedEntries) {
			const queuedInvoice = entry.payload;
			try {
				await frappe.call({
					method: "posawesome.posawesome.api.invoices.submit_invoice",
					args: {
						invoice: queuedInvoice.invoice,
						data: queuedInvoice.data,
					},
				});
				synced += 1;
				await markWriteQueueEntrySynced(
					INVOICE_ENTITY,
					Number(entry.queue_id),
					entry.last_attempt_at,
				);
			} catch (error) {
				console.error("Failed to submit invoice, saving as draft", error);
				try {
					await frappe.call({
						method: "posawesome.posawesome.api.invoices.update_invoice",
						args: { data: queuedInvoice.invoice },
					});
					drafted += 1;
					await markWriteQueueEntrySynced(
						INVOICE_ENTITY,
						Number(entry.queue_id),
						entry.last_attempt_at,
					);
				} catch (draftError) {
					console.error("Failed to save invoice as draft", draftError);
					await markWriteQueueEntryFailed(
						INVOICE_ENTITY,
						Number(entry.queue_id),
						draftError,
						entry.last_attempt_at,
					);
				}
			}
		}

		if (synced > 0 && drafted === 0 && getPendingOfflineInvoiceCount() === 0) {
			reduceCacheUsage();
		}

		const totals = {
			pending: getPendingOfflineInvoiceCount(),
			synced,
			drafted,
		};

		if (totals.pending || drafted) {
			setLastSyncTotals(totals);
		} else {
			setLastSyncTotals({ pending: 0, synced: 0, drafted: 0 });
		}

		return totals;
	} finally {
		invoiceSyncInProgress = false;
	}
}
