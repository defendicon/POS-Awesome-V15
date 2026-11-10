import {
	db,
	memory,
	persist,
	registerPostHydrationTask,
	startupInitPromise,
} from "./db";
import {
	ensureOfflineQueueReady,
	SYNCING_LEASE_MS,
	getQueueEntries,
	markWriteQueueEntrySyncedByIdempotencyKey,
} from "./writeQueue";
import { requireSubmittedInvoice } from "./invoiceAcknowledgement";
import { captureOfflineInvoiceTime } from "./invoiceTimestamp";

type AnyRecord = Record<string, any>;

export type InvoiceOutboxMode = "off" | "dual_write" | "coordinator";
export type InvoiceOutboxStatus =
	| "pending"
	| "syncing"
	| "retrying"
	| "acknowledged"
	| "dead_letter";

export interface InvoiceOutboxEntry {
	outbox_id?: number;
	client_request_id: string;
	resource?: "invoice_outbox";
	status: InvoiceOutboxStatus;
	invoice: AnyRecord;
	data: AnyRecord;
	created_at: string;
	updated_at: string;
	next_retry_at: string | null;
	nextAttemptAt?: string | null;
	retry_count: number;
	last_error: string | null;
	invoice_name: string | null;
	acknowledged_at: string | null;
}

const TABLE = "invoice_outbox";
const JOURNAL_PREFIX = "posa_invoice_intent_";
const MAX_RETRY_COUNT = 5;
const INITIAL_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60 * 1_000;
const TERMINAL_STATUSES = new Set<InvoiceOutboxStatus>([
	"acknowledged",
	"dead_letter",
]);

function nowIso() {
	return new Date().toISOString();
}

function cloneSerializable<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

function toErrorMessage(error: unknown) {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error || "Unknown error");
	}
}

async function ensureOutboxReady() {
	if (!db.isOpen()) {
		await startupInitPromise;
	}
	if (!db.isOpen()) {
		await db.open();
	}
}

export function getInvoiceOutboxMode(): InvoiceOutboxMode {
	const mode = memory.invoice_outbox_mode;
	return mode === "dual_write" || mode === "coordinator" ? mode : "off";
}

export function setInvoiceOutboxMode(mode: InvoiceOutboxMode) {
	memory.invoice_outbox_mode = mode;
	persist("invoice_outbox_mode", mode);
}

export function shouldWriteInvoiceOutbox() {
	return getInvoiceOutboxMode() !== "off";
}

function getClientRequestId(entry: AnyRecord) {
	return String(
		entry?.invoice?.posa_client_request_id ||
			entry?.data?.idempotency_key ||
			entry?.data?.client_request_id ||
			"",
	).trim();
}

function journalKey(clientRequestId: string) {
	return `${JOURNAL_PREFIX}${encodeURIComponent(clientRequestId)}`;
}

export function persistInvoiceIntentJournal(entry: AnyRecord) {
	const cleanEntry = cloneSerializable(entry);
	if (["Sales Invoice", "POS Invoice"].includes(cleanEntry.invoice?.doctype))
		captureOfflineInvoiceTime(cleanEntry.invoice);
	const clientRequestId = getClientRequestId(cleanEntry);
	if (!clientRequestId) {
		throw new Error("Invoice intent journal requires a client_request_id");
	}
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(
			journalKey(clientRequestId),
			JSON.stringify(cleanEntry),
		);
	}
	return clientRequestId;
}

export function removeInvoiceIntentJournal(clientRequestId: string) {
	const normalizedId = String(clientRequestId || "").trim();
	if (normalizedId && typeof localStorage !== "undefined") {
		localStorage.removeItem(journalKey(normalizedId));
	}
}

async function recoverInvoiceIntentJournal() {
	if (typeof localStorage === "undefined") return;
	const entries: AnyRecord[] = [];
	for (let index = 0; index < localStorage.length; index += 1) {
		const key = localStorage.key(index);
		if (!key?.startsWith(JOURNAL_PREFIX)) continue;
		try {
			const entry = JSON.parse(localStorage.getItem(key) || "null");
			if (entry) entries.push(entry);
		} catch (error) {
			console.warn(
				"Ignoring invalid invoice intent journal entry",
				error,
			);
		}
	}
	for (const entry of entries) {
		await enqueueInvoiceOutboxEntry(entry);
	}
}

export async function enqueueInvoiceOutboxEntry(entry: AnyRecord) {
	await ensureOutboxReady();
	const cleanEntry = cloneSerializable(entry);
	const clientRequestId = getClientRequestId(cleanEntry);
	if (!clientRequestId) {
		throw new Error("Invoice outbox entry requires a client_request_id");
	}
	if (
		["Sales Invoice", "POS Invoice"].includes(cleanEntry.invoice?.doctype)
	) {
		const journal =
			typeof localStorage !== "undefined"
				? localStorage.getItem(journalKey(clientRequestId))
				: null;
		try {
			const captured = journal ? JSON.parse(journal)?.invoice : null;
			if (
				captured?._posa_offline_created_at &&
				!cleanEntry.invoice._posa_offline_created_at
			) {
				for (const field of [
					"_posa_offline_created_at",
					"posting_date",
					"posting_time",
					"set_posting_time",
				])
					cleanEntry.invoice[field] = captured[field];
			}
		} catch (error) {
			console.warn("Unable to read invoice recovery timestamp", error);
		}
		captureOfflineInvoiceTime(cleanEntry.invoice);
	}

	const table = db.table(TABLE);
	return db.transaction("rw", table, async () => {
		const existing = (await table
			.where("client_request_id")
			.equals(clientRequestId)
			.first()) as InvoiceOutboxEntry | undefined;
		if (existing) {
			if (
				existing.status === "syncing" ||
				existing.status === "acknowledged"
			)
				return existing;
			const refreshed = {
				...existing,
				invoice: cleanEntry.invoice,
				data: cleanEntry.data || {},
				updated_at: nowIso(),
			};
			await table.put(refreshed);
			return refreshed;
		}

		const timestamp = nowIso();
		const outboxEntry: InvoiceOutboxEntry = {
			client_request_id: clientRequestId,
			resource: "invoice_outbox",
			status: "pending",
			invoice: cleanEntry.invoice,
			data: cleanEntry.data || {},
			created_at: timestamp,
			updated_at: timestamp,
			next_retry_at: null,
			nextAttemptAt: null,
			retry_count: 0,
			last_error: null,
			invoice_name: null,
			acknowledged_at: null,
		};
		const outboxId = await table.add(outboxEntry);
		return { ...outboxEntry, outbox_id: outboxId };
	});
}

export async function getInvoiceOutboxRows(
	options: { includeTerminal?: boolean } = {},
) {
	await ensureOutboxReady();
	const rows = (await db
		.table(TABLE)
		.orderBy("created_at")
		.toArray()) as InvoiceOutboxEntry[];
	return rows.filter(
		(row) => options.includeTerminal || !TERMINAL_STATUSES.has(row.status),
	);
}

export async function getPendingInvoiceOutboxCount() {
	return (await getInvoiceOutboxRows({ includeTerminal: true })).filter(
		(row) => row.status !== "acknowledged",
	).length;
}

export async function removeInvoiceOutboxEntry(clientRequestId: string) {
	const normalizedId = String(clientRequestId || "").trim();
	if (!normalizedId) return 0;
	await ensureOutboxReady();
	const deleted = await db
		.table(TABLE)
		.where("client_request_id")
		.equals(normalizedId)
		.delete();
	removeInvoiceIntentJournal(normalizedId);
	return deleted;
}

export async function acknowledgeInvoiceOutbox(
	clientRequestId: string,
	response: AnyRecord,
) {
	requireSubmittedInvoice(response);
	await ensureOutboxReady();
	const table = db.table(TABLE);
	await db.transaction("rw", table, async () => {
		const row = await table
			.where("client_request_id")
			.equals(clientRequestId)
			.first();
		if (row)
			await table.put(
				markOutboxAcknowledged(row, response?.message || response),
			);
	});
	removeInvoiceIntentJournal(clientRequestId);
}

function shouldAttempt(row: InvoiceOutboxEntry) {
	if (TERMINAL_STATUSES.has(row.status)) return false;
	if (row.status === "syncing") {
		const started = Date.parse(row.updated_at);
		return !Number.isFinite(started) || Date.now() - started >= SYNCING_LEASE_MS;
	}
	if (!row.next_retry_at) return true;
	const nextRetryAt = Date.parse(row.next_retry_at);
	return !Number.isFinite(nextRetryAt) || nextRetryAt <= Date.now();
}

function computeBackoffMs(retryCount: number) {
	const multiplier = 2 ** Math.max(0, retryCount - 1);
	return Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * multiplier);
}

function markOutboxAcknowledged(
	row: InvoiceOutboxEntry,
	response: AnyRecord,
): InvoiceOutboxEntry {
	const timestamp = nowIso();
	return {
		...row,
		status: "acknowledged",
		resource: "invoice_outbox" as const,
		updated_at: timestamp,
		acknowledged_at: timestamp,
		last_error: null,
		next_retry_at: null,
		nextAttemptAt: null,
		invoice_name:
			response?.invoice?.name ||
			response?.name ||
			row.invoice_name ||
			null,
	};
}

function markOutboxFailed(
	row: InvoiceOutboxEntry,
	error: unknown,
): InvoiceOutboxEntry {
	const retryCount = Number(row.retry_count || 0) + 1;
	const status: InvoiceOutboxStatus =
		retryCount >= MAX_RETRY_COUNT ? "dead_letter" : "retrying";
	const nextRetryAt =
		status === "dead_letter"
			? null
			: new Date(Date.now() + computeBackoffMs(retryCount)).toISOString();
	return {
		...row,
		resource: "invoice_outbox" as const,
		status,
		retry_count: retryCount,
		updated_at: nowIso(),
		next_retry_at: nextRetryAt,
		nextAttemptAt: nextRetryAt,
		last_error: toErrorMessage(error),
	};
}

export async function syncInvoiceOutboxResource(
	callOfflineSyncMethod: (
		method: string,
		args?: Record<string, any>,
	) => Promise<any>,
) {
	await ensureOutboxReady();
	await ensureOfflineQueueReady();
	// Coordinator adoption must not strand invoices saved before dual-write was enabled.
	const legacyRows = await getQueueEntries("invoice");
	const adoptionTable = db.table(TABLE);
	await db.transaction("rw", adoptionTable, async () => {
		for (const legacy of legacyRows) {
			const id = getClientRequestId(legacy.payload);
			if (
				!id ||
				(await adoptionTable
					.where("client_request_id")
					.equals(id)
					.first())
			)
				continue;
			const timestamp = nowIso();
			await adoptionTable.add({
				client_request_id: id,
				resource: "invoice_outbox",
				invoice: legacy.payload.invoice,
				data: legacy.payload.data || {},
				created_at: legacy.created_at,
				updated_at: legacy.last_attempt_at || timestamp,
				retry_count: legacy.retry_count,
				status:
					legacy.status === "dead_letter"
						? "dead_letter"
						: legacy.status === "syncing"
							? "syncing"
							: "pending",
				next_retry_at: null,
				nextAttemptAt: null,
				last_error: legacy.last_error,
				invoice_name: null,
				acknowledged_at: null,
			});
		}
	});
	let acknowledged = 0;
	let failed = 0;
	const claimTimestamp = nowIso();
	const table = db.table(TABLE);
	// IndexedDB transaction serializes claims across tabs and coordinator runs.
	const claimedRows = await db.transaction("rw", table, async () => {
		const rows = (await table
			.orderBy("created_at")
			.toArray()) as InvoiceOutboxEntry[];
		const claimed = rows
			.filter(shouldAttempt)
			.map((row) => ({
				...row,
				resource: "invoice_outbox" as const,
				status: "syncing" as const,
				updated_at: claimTimestamp,
				nextAttemptAt: row.next_retry_at || null,
			}));
		if (claimed.length) await table.bulkPut(claimed);
		return claimed;
	});
	const finalRows: InvoiceOutboxEntry[] = [];

	for (const claimed of claimedRows) {
		try {
			const response = await callOfflineSyncMethod(
				"posawesome.posawesome.api.offline_sync.invoices.submit_invoice_outbox_entry",
				{
					client_request_id: claimed.client_request_id,
					invoice: claimed.invoice,
					data: claimed.data,
				},
			);
			requireSubmittedInvoice(response);
			if (response?.acknowledged !== false) {
				finalRows.push(markOutboxAcknowledged(claimed, response || {}));
				acknowledged += 1;
			} else {
				throw new Error("Invoice outbox response was not acknowledged");
			}
		} catch (error) {
			failed += 1;
			finalRows.push(markOutboxFailed(claimed, error));
		}
	}
	if (finalRows.length) {
		const committed: InvoiceOutboxEntry[] = [];
		await db.transaction("rw", table, async () => {
			for (const row of finalRows) {
				const current = await table.get(row.outbox_id!);
				if (
					current?.status !== "syncing" ||
					current.updated_at !== claimTimestamp
				)
					continue;
				await table.put(row);
				committed.push(row);
			}
		});
		const acknowledgedRows = committed.filter(
			(row) => row.status === "acknowledged",
		);
		for (const row of acknowledgedRows) {
			removeInvoiceIntentJournal(row.client_request_id);
			await markWriteQueueEntrySyncedByIdempotencyKey(
				"invoice",
				`invoice:${row.client_request_id}`,
			);
		}
	}

	const pending = await getPendingInvoiceOutboxCount();
	return {
		resourceId: "invoice_outbox",
		status: failed || pending ? "error" : "fresh",
		lastError:
			failed || pending
				? `${pending} invoice(s) remain pending; ${failed} attempt(s) failed. Review recovery status.`
				: null,
		watermark: nowIso(),
		lastSyncedAt: nowIso(),
		consecutiveFailures: failed ? 1 : 0,
		pendingCount: pending,
		acknowledged,
	};
}

registerPostHydrationTask(recoverInvoiceIntentJournal);
