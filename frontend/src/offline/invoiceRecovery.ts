import { db, isOffline } from "./db";
import {
	ensureOfflineQueueReady,
	getQueueEntries,
	refreshQueueMemory,
	markWriteQueueEntrySyncedByIdempotencyKey,
} from "./writeQueue";
import {
	getInvoiceOutboxRows,
	removeInvoiceIntentJournal,
	acknowledgeInvoiceOutbox,
} from "./invoiceOutbox";
import { requireSubmittedInvoice } from "./invoiceAcknowledgement";
import { getInvoiceStockQuantity, updateLocalStock } from "./stock";
import { getStoredCustomer } from "./customers";

type RecordData = Record<string, any>;
export interface InvoiceRecoveryScope {
	profile: string;
	company?: string;
}

export const invoiceRequestId = (invoice: RecordData) =>
	String(invoice?.posa_client_request_id || "");
export function invoiceMatchesScope(
	invoice: RecordData,
	scope: InvoiceRecoveryScope,
) {
	return (
		invoice?.pos_profile === scope.profile &&
		(!scope.company || invoice?.company === scope.company)
	);
}

export async function getInvoiceRecoveryRows(scope: InvoiceRecoveryScope) {
	await ensureOfflineQueueReady();
	const [legacy, outbox] = await Promise.all([
		getQueueEntries("invoice"),
		getInvoiceOutboxRows({ includeTerminal: true }),
	]);
	const records = new Map<string, RecordData>();
	for (const row of legacy) {
		if (!invoiceMatchesScope(row.payload.invoice, scope)) continue;
		const id = invoiceRequestId(row.payload.invoice) || row.idempotency_key;
		records.set(id, {
			...row.payload,
			request_id: id,
			queue_id: row.queue_id,
			status: row.status,
			retry_count: row.retry_count,
			last_error: row.last_error,
			created_at: row.created_at,
		});
	}
	for (const row of outbox) {
		if (!invoiceMatchesScope(row.invoice, scope)) continue;
		if (row.status === "acknowledged") {
			records.delete(row.client_request_id);
			continue;
		}
		const previous = records.get(row.client_request_id);
		records.set(row.client_request_id, {
			...previous,
			invoice: row.invoice,
			data: row.data,
			request_id: row.client_request_id,
			outbox_id: row.outbox_id,
			status:
				row.status === "pending" && previous
					? previous.status
					: row.status,
			retry_count: Math.max(previous?.retry_count || 0, row.retry_count),
			last_error: row.last_error || previous?.last_error,
			created_at: row.created_at,
		});
	}
	const customerNames = new Map<string, string>();
	await Promise.all(
		[...new Set([...records.values()].map((row) => row.invoice.customer))]
			.filter(Boolean)
			.map(async (customer) => {
				const stored = await getStoredCustomer(customer);
				if (stored?.customer_name)
					customerNames.set(customer, stored.customer_name);
			}),
	);
	return [...records.values()]
		.map(
			(row): RecordData => ({
				...row,
				// Display metadata only: never rewrite the queued invoice or customer ID.
				customer_label:
					(row.invoice.customer_name !== row.invoice.customer &&
						row.invoice.customer_name) ||
					customerNames.get(row.invoice.customer) ||
					row.invoice.customer_name ||
					row.invoice.customer,
			}),
		)
		.sort((a, b) =>
			String(a.created_at).localeCompare(String(b.created_at)),
		);
}

function isLiveLease(row: RecordData, timeField: string) {
	return (
		row.status === "syncing" &&
		Date.now() - Date.parse(row[timeField] || "") < 5 * 60_000
	);
}

/** Preserve the request ID and invoice; reset delivery attempts, never clone a sale. */
export async function retryInvoiceRecovery(
	requestId: string,
	scope: InvoiceRecoveryScope,
) {
	await ensureOfflineQueueReady();
	const queue = db.table("write_queue"),
		outbox = db.table("invoice_outbox");
	await db.transaction("rw", queue, outbox, async () => {
		const legacy = await queue
			.where("idempotency_key")
			.equals(`invoice:${requestId}`)
			.first();
		const entry = await outbox
			.where("client_request_id")
			.equals(requestId)
			.first();
		if (!legacy && !entry)
			throw new Error("Queued invoice was not found. Refresh the list.");
		for (const row of [legacy, entry].filter(Boolean)) {
			if (
				!invoiceMatchesScope(row.payload?.invoice || row.invoice, scope)
			)
				throw new Error(
					"Invoice belongs to another POS Profile or company.",
				);
			if (
				isLiveLease(row, row.payload ? "last_attempt_at" : "updated_at")
			)
				throw new Error(
					"This invoice is already syncing. Wait for the current attempt.",
				);
		}
		if (legacy?.status === "synced" || entry?.status === "acknowledged")
			throw new Error(
				"Invoice is already acknowledged. Refresh the list.",
			);
		if (legacy)
			await queue.put({
				...legacy,
				status: "pending",
				retry_count: 0,
				next_attempt_at: null,
				last_attempt_at: null,
				manual_retry_at: new Date().toISOString(),
			});
		else if (entry)
			await queue.add({
				entity_type: "invoice",
				resource: "invoice",
				payload: { invoice: entry.invoice, data: entry.data },
				idempotency_key: `invoice:${requestId}`,
				status: "pending",
				retry_count: 0,
				created_at: entry.created_at,
				last_attempt_at: null,
				last_error: entry.last_error,
				manual_retry_at: new Date().toISOString(),
			});
		if (entry)
			await outbox.put({
				...entry,
				status: "pending",
				retry_count: 0,
				next_retry_at: null,
				nextAttemptAt: null,
				updated_at: new Date().toISOString(),
				manual_retry_at: new Date().toISOString(),
			});
	});
	await refreshQueueMemory("invoice");
}

export async function getPendingInvoiceRecoveryCount() {
	await ensureOfflineQueueReady();
	const [legacy, outbox] = await Promise.all([
		getQueueEntries("invoice"),
		getInvoiceOutboxRows({ includeTerminal: true }),
	]);
	const acknowledged = new Set(
		outbox
			.filter((row) => row.status === "acknowledged")
			.map((row) => row.client_request_id),
	);
	return new Set([
		...legacy
			.map((row) => invoiceRequestId(row.payload.invoice))
			.filter((id) => !acknowledged.has(id)),
		...outbox
			.filter((row) => row.status !== "acknowledged")
			.map((row) => row.client_request_id),
	]).size;
}

export async function reconcileRecoveryInvoice(
	requestId: string,
	scope: InvoiceRecoveryScope,
) {
	if (isOffline())
		throw new Error("Reconnect before reconciling a server invoice.");
	const row = (await getInvoiceRecoveryRows(scope)).find(
		(entry) => entry.request_id === requestId,
	);
	if (!row)
		throw new Error("Queued invoice was not found. Refresh the list.");
	if (row.status === "syncing")
		throw new Error(
			"Wait for the active sync attempt before reconciliation.",
		);
	const response = await frappe.call({
		method: "posawesome.posawesome.api.offline_sync.invoices.reconcile_invoice_outbox_entry",
		args: {
			client_request_id: requestId,
			company: scope.company || row.invoice.company,
			pos_profile: scope.profile,
			document_type: row.invoice.doctype || "Sales Invoice",
		},
	});
	requireSubmittedInvoice(response);
	await acknowledgeInvoiceOutbox(requestId, response);
	await markWriteQueueEntrySyncedByIdempotencyKey(
		"invoice",
		`invoice:${requestId}`,
	);
}

export async function deleteUnsentRecoveryInvoice(
	requestId: string,
	scope: InvoiceRecoveryScope,
) {
	await ensureOfflineQueueReady();
	const queue = db.table("write_queue"),
		outbox = db.table("invoice_outbox");
	let releasedItems: RecordData[] = [];
	await db.transaction("rw", queue, outbox, async () => {
		const legacy = await queue
			.where("idempotency_key")
			.equals(`invoice:${requestId}`)
			.first();
		const entry = await outbox
			.where("client_request_id")
			.equals(requestId)
			.first();
		if (!legacy && !entry) throw new Error("Queued invoice was not found.");
		for (const row of [legacy, entry].filter(Boolean)) {
			if (
				!invoiceMatchesScope(row.payload?.invoice || row.invoice, scope)
			)
				throw new Error(
					"Invoice belongs to another POS Profile or company.",
				);
			if (
				row.status !== "pending" ||
				row.retry_count ||
				row.last_attempt_at ||
				row.manual_retry_at
			)
				throw new Error(
					"This invoice may already exist on the server. Reconcile it before deleting.",
				);
		}
		// Online dispatch intents may already be on the server even with a pending
		// local status. Only invoices durably saved by the offline checkout qualify.
		if (!legacy?.payload?.invoice?._posa_offline_created_at)
			throw new Error(
				"Only an unsent offline sale can be removed locally.",
			);
		const invoice = legacy.payload.invoice;
		if (
			(invoice.doctype === "POS Invoice" ||
				Number(invoice.update_stock)) &&
			Array.isArray(invoice.items)
		)
			releasedItems = invoice.items;
		if (legacy) await queue.delete(legacy.queue_id);
		if (entry) await outbox.delete(entry.outbox_id);
	});
	removeInvoiceIntentJournal(requestId);
	if (releasedItems.length)
		updateLocalStock(
			releasedItems.map((item) => ({
				...item,
				qty: -Number(item.qty || 0),
				stock_qty: -getInvoiceStockQuantity(item),
			})),
		);
	await refreshQueueMemory("invoice");
}
