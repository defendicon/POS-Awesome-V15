import { isOffline, memory, persist } from "./db";
import { syncOfflineCustomers } from "./customers";
import { ensureOfflineInvoiceRequest } from "./idempotency";
import { captureOfflineInvoiceTime } from "./invoiceTimestamp";
import { requireSubmittedInvoice } from "./invoiceAcknowledgement";
import {
	enqueueInvoiceOutboxEntry,
	getInvoiceOutboxMode,
	syncInvoiceOutboxResource,
	shouldWriteInvoiceOutbox,
	acknowledgeInvoiceOutbox,
} from "./invoiceOutbox";
import { getInvoiceStockQuantity, updateLocalStock } from "./stock";
import {
	claimRetryableQueueEntries,
	enqueueWriteQueueEntry,
	getQueuedPayloadCount,
	getQueuedPayloadSnapshots,
	ensureOfflineQueueReady,
	getQueueEntries,
	markWriteQueueEntryFailed,
	markWriteQueueEntrySynced,
	markWriteQueueInvoiceDraft,
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

function shouldValidateOfflineInvoiceStock(invoice: AnyRecord) {
	if (!invoice || invoice.is_return) {
		return false;
	}

	const doctype = String(invoice.doctype || "").trim();
	if (["Sales Order", "Quotation", "Purchase Order"].includes(doctype)) {
		return false;
	}

	if (doctype === "Sales Invoice") {
		return asBoolean(invoice.update_stock);
	}

	if (doctype === "POS Invoice") {
		return true;
	}

	return true;
}

export function validateStockForOfflineInvoice(
	items: AnyRecord[],
	invoice: AnyRecord = {},
) {
	const openingStorage = memory.pos_opening_storage || {};
	const stockSettings = openingStorage?.stock_settings || {};
	const posProfile = openingStorage?.pos_profile || {};

	if (!shouldValidateOfflineInvoiceStock(invoice)) {
		return { isValid: true, invalidItems: [], errorMessage: "" };
	}

	const allowOfflineWithoutStockVerification = asBoolean(
		posProfile?.posa_allow_offline_sale_without_stock_verification,
	);
	if (allowOfflineWithoutStockVerification) {
		return { isValid: true, invalidItems: [], errorMessage: "" };
	}

	const blockSaleBeyondAvailableQty = asBoolean(
		posProfile?.posa_block_sale_beyond_available_qty,
	);
	const allowGlobalNegativeStock = asBoolean(
		stockSettings?.allow_negative_stock,
	);

	const stockCache = memory.local_stock_cache || {};
	const invalidItems: AnyRecord[] = [];
	const requestedByItem = new Map<string, AnyRecord>();

	items.forEach((item) => {
		if (!asBoolean(item?.is_stock_item)) {
			return;
		}

		const itemCode = item.item_code;
		if (!itemCode || Number(item.qty || 0) < 0) {
			return;
		}

		const itemAllowsNegativeStock = asBoolean(item?.allow_negative_stock);
		if (
			!blockSaleBeyondAvailableQty &&
			(allowGlobalNegativeStock || itemAllowsNegativeStock)
		) {
			return;
		}

		const requestedQty = Math.abs(getInvoiceStockQuantity(item));
		const existing = requestedByItem.get(itemCode);
		if (existing) {
			existing.requested_qty += requestedQty;
			return;
		}

		requestedByItem.set(itemCode, {
			item_code: itemCode,
			item_name: item.item_name || itemCode,
			requested_qty: requestedQty,
		});
	});

	requestedByItem.forEach((item) => {
		const currentStock = Number(
			stockCache[item.item_code]?.actual_qty || 0,
		);

		if (currentStock - item.requested_qty < 0) {
			invalidItems.push({
				item_code: item.item_code,
				item_name: item.item_name,
				requested_qty: item.requested_qty,
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
	captureOfflineInvoiceTime(entry.invoice);
	entry.invoice.items.forEach(getInvoiceStockQuantity);

	const validation = validateStockForOfflineInvoice(
		entry.invoice.items,
		entry.invoice,
	);
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
	ensureOfflineInvoiceRequest(entry);
	await ensureOfflineQueueReady();
	const existing = (
		await getQueueEntries("invoice", { includeSynced: true })
	).find(
		(row) =>
			row.payload.invoice?.posa_client_request_id ===
			entry.invoice.posa_client_request_id,
	);
	if (existing) {
		for (const key of [
			"customer",
			"company",
			"pos_profile",
			"currency",
			"items",
			"payments",
			"grand_total",
		]) {
			if (
				JSON.stringify(existing.payload.invoice[key]) !==
				JSON.stringify(entry.invoice[key])
			)
				throw new Error(
					"This invoice is already queued with different sale data. Review the original queued invoice.",
				);
		}
		return existing;
	}
	const cleanEntry = prepareOfflineInvoiceEntry(entry);
	if (shouldWriteInvoiceOutbox()) {
		await enqueueInvoiceOutboxEntry(cleanEntry);
	}
	const createdEntry = await enqueueWriteQueueEntry(
		INVOICE_ENTITY,
		cleanEntry,
	);

	if (
		createdEntry._queue_created &&
		entry.invoice?.items &&
		shouldValidateOfflineInvoiceStock(entry.invoice)
	) {
		updateLocalStock(entry.invoice.items);
	}

	return createdEntry;
}

export function getOfflineInvoices() {
	return getQueuedPayloadSnapshots(INVOICE_ENTITY);
}

export async function clearOfflineInvoices() {
	const rows = await getQueueEntries(INVOICE_ENTITY);
	if (
		rows.some(
			(row) =>
				row.status !== "pending" ||
				row.retry_count ||
				row.last_attempt_at ||
				(row as any).manual_retry_at,
		)
	)
		throw new Error(
			"Sent or uncertain invoices must be reconciled before removing queued sales.",
		);
	const { deleteUnsentRecoveryInvoice } = await import("./invoiceRecovery");
	for (const row of rows)
		await deleteUnsentRecoveryInvoice(
			row.payload.invoice.posa_client_request_id,
			{
				profile: row.payload.invoice.pos_profile,
				company: row.payload.invoice.company,
			},
		);
}

export async function deleteOfflineInvoice(index: number) {
	const target = getOfflineInvoices()[index];
	if (!target?.invoice) return;
	const { deleteUnsentRecoveryInvoice } = await import("./invoiceRecovery");
	await deleteUnsentRecoveryInvoice(target.invoice.posa_client_request_id, {
		profile: target.invoice.pos_profile,
		company: target.invoice.company,
	});
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
	if (getInvoiceOutboxMode() === "coordinator") {
		const result = await syncInvoiceOutboxResource(
			async (method, args = {}) => {
				const response = await frappe.call({ method, args });
				return typeof response?.message === "undefined"
					? response || {}
					: response.message;
			},
		);
		const totals = {
			pending: Number((result as AnyRecord).pendingCount || 0),
			synced: Number((result as AnyRecord).acknowledged || 0),
			drafted: 0,
		};
		setLastSyncTotals(totals);
		return totals;
	}

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
				if (
					queuedInvoice.invoice?.doctype &&
					!["Sales Invoice", "POS Invoice"].includes(
						queuedInvoice.invoice.doctype,
					)
				)
					throw new Error(
						"This document requires its original online workflow; it cannot be replayed as a sales invoice.",
					);
				const response = await frappe.call({
					method: "posawesome.posawesome.api.offline_sync.invoices.submit_invoice_outbox_entry",
					args: {
						client_request_id: queuedInvoice.invoice.posa_client_request_id,
						invoice: queuedInvoice.invoice,
						data: queuedInvoice.data,
					},
				});
				const serverInvoice =
					response?.message?.invoice || response?.message;
				if (
					serverInvoice?.name &&
					Number(serverInvoice.docstatus ?? serverInvoice.status) ===
						0
				) {
					await markWriteQueueInvoiceDraft(entry, serverInvoice);
					drafted += 1;
					continue;
				}
				requireSubmittedInvoice(response);
				await acknowledgeInvoiceOutbox(
					queuedInvoice.invoice.posa_client_request_id,
					response,
				);
				synced += 1;
				await markWriteQueueEntrySynced(
					INVOICE_ENTITY,
					Number(entry.queue_id),
					entry.last_attempt_at,
				);
			} catch (error) {
				// A lost response can follow a committed submission. Retain the
				// original request ID; never issue a second draft write to guess.
				console.error(
					"Invoice remains queued after unsuccessful submission",
					error,
				);
				await markWriteQueueEntryFailed(
					INVOICE_ENTITY,
					Number(entry.queue_id),
					error,
					entry.last_attempt_at,
				);
			}
		}

		// Completing sync must retain the reference cache for the next outage.

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
