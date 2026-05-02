import { checkDbHealth, db, initPromise, memory, persist } from "./db";

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
	status: InvoiceOutboxStatus;
	invoice: AnyRecord;
	data: AnyRecord;
	created_at: string;
	updated_at: string;
	next_retry_at: string | null;
	retry_count: number;
	last_error: string | null;
	invoice_name: string | null;
	acknowledged_at: string | null;
}

const TABLE = "invoice_outbox";
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
	await initPromise;
	await checkDbHealth();
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

export async function enqueueInvoiceOutboxEntry(entry: AnyRecord) {
	await ensureOutboxReady();
	const cleanEntry = cloneSerializable(entry);
	const clientRequestId = getClientRequestId(cleanEntry);
	if (!clientRequestId) {
		throw new Error("Invoice outbox entry requires a client_request_id");
	}

	const table = db.table(TABLE);
	return db.transaction("rw", table, async () => {
		const existing = (await table
			.where("client_request_id")
			.equals(clientRequestId)
			.first()) as InvoiceOutboxEntry | undefined;
		if (existing) {
			return existing;
		}

		const timestamp = nowIso();
		const outboxEntry: InvoiceOutboxEntry = {
			client_request_id: clientRequestId,
			status: "pending",
			invoice: cleanEntry.invoice,
			data: cleanEntry.data || {},
			created_at: timestamp,
			updated_at: timestamp,
			next_retry_at: null,
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
	return (await getInvoiceOutboxRows()).length;
}

function shouldAttempt(row: InvoiceOutboxEntry) {
	if (TERMINAL_STATUSES.has(row.status)) return false;
	if (!row.next_retry_at) return true;
	const nextRetryAt = Date.parse(row.next_retry_at);
	return !Number.isFinite(nextRetryAt) || nextRetryAt <= Date.now();
}

function computeBackoffMs(retryCount: number) {
	const multiplier = 2 ** Math.max(0, retryCount - 1);
	return Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * multiplier);
}

async function markOutboxAcknowledged(
	row: InvoiceOutboxEntry,
	response: AnyRecord,
) {
	const timestamp = nowIso();
	await db.table(TABLE).put({
		...row,
		status: "acknowledged",
		updated_at: timestamp,
		acknowledged_at: timestamp,
		last_error: null,
		next_retry_at: null,
		invoice_name:
			response?.invoice?.name ||
			response?.name ||
			row.invoice_name ||
			null,
	});
}

async function markOutboxFailed(row: InvoiceOutboxEntry, error: unknown) {
	const retryCount = Number(row.retry_count || 0) + 1;
	const status: InvoiceOutboxStatus =
		retryCount >= MAX_RETRY_COUNT ? "dead_letter" : "retrying";
	const nextRetryAt =
		status === "dead_letter"
			? null
			: new Date(Date.now() + computeBackoffMs(retryCount)).toISOString();
	await db.table(TABLE).put({
		...row,
		status,
		retry_count: retryCount,
		updated_at: nowIso(),
		next_retry_at: nextRetryAt,
		last_error: toErrorMessage(error),
	});
}

export async function syncInvoiceOutboxResource(
	callOfflineSyncMethod: (
		method: string,
		args?: Record<string, any>,
	) => Promise<any>,
) {
	await ensureOutboxReady();
	const rows = await getInvoiceOutboxRows();
	let acknowledged = 0;
	let failed = 0;

	for (const row of rows) {
		if (!shouldAttempt(row)) {
			continue;
		}

		const claimed: InvoiceOutboxEntry = {
			...row,
			status: "syncing",
			updated_at: nowIso(),
		};
		await db.table(TABLE).put(claimed);

		try {
			const response = await callOfflineSyncMethod(
				"posawesome.posawesome.api.offline_sync.invoices.submit_invoice_outbox_entry",
				{
					client_request_id: claimed.client_request_id,
					invoice: claimed.invoice,
					data: claimed.data,
				},
			);
			if (response?.acknowledged || response?.invoice || response?.name) {
				await markOutboxAcknowledged(claimed, response || {});
				acknowledged += 1;
			} else {
				throw new Error("Invoice outbox response was not acknowledged");
			}
		} catch (error) {
			failed += 1;
			await markOutboxFailed(claimed, error);
		}
	}

	const pending = await getPendingInvoiceOutboxCount();
	return {
		resourceId: "invoice_outbox",
		status: failed ? "error" : "fresh",
		lastError: failed
			? `${failed} invoice outbox entr${failed === 1 ? "y" : "ies"} failed`
			: null,
		watermark: nowIso(),
		lastSyncedAt: nowIso(),
		consecutiveFailures: failed ? 1 : 0,
		pendingCount: pending,
		acknowledged,
	};
}
