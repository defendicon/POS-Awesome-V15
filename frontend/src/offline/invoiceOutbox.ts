import { checkDbHealth, db, initPromise, memory, persist, safeBulkPut } from "./db";
import { bucketCount, startPerfMeasure } from "../posapp/utils/perf";

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
	const metric = startPerfMeasure("pos.offline.outbox_enqueue", {
		entity_type: "invoice",
		source: "local",
	});
	try {
		await ensureOutboxReady();
		const cleanEntry = cloneSerializable(entry);
		const clientRequestId = getClientRequestId(cleanEntry);
		if (!clientRequestId) {
			throw new Error("Invoice outbox entry requires a client_request_id");
		}

		const table = db.table(TABLE);
		const result = await db.transaction("rw", table, async () => {
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
		metric.finish("success");
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
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

function markOutboxFailed(row: InvoiceOutboxEntry, error: unknown): InvoiceOutboxEntry {
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
		_method: string,
		_args?: Record<string, any>,
	) => Promise<any>,
) {
	const metric = startPerfMeasure("pos.offline.sync_start", {
		resource: "invoice_outbox",
	});
	await ensureOutboxReady();
	const rows = await getInvoiceOutboxRows();
	let acknowledged = 0;
	let failed = 0;
	const claimTimestamp = nowIso();
	const attemptRows = rows.filter((row) => shouldAttempt(row));
	const claimedRows: InvoiceOutboxEntry[] = attemptRows.map((row) => ({
		...row,
		resource: "invoice_outbox" as const,
		status: "syncing" as InvoiceOutboxStatus,
		updated_at: claimTimestamp,
		nextAttemptAt: row.next_retry_at || null,
	}));
	if (claimedRows.length) {
		await safeBulkPut(TABLE, claimedRows);
	}
	const finalRows: InvoiceOutboxEntry[] = [];

	for (const claimed of claimedRows) {
		const mutationMetric = startPerfMeasure("pos.offline.sync_mutation", {
			resource: "invoice_outbox",
			retry_count_bucket: bucketCount(claimed.retry_count || 0),
		});
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
				finalRows.push(markOutboxAcknowledged(claimed, response || {}));
				acknowledged += 1;
				mutationMetric.finish("success");
			} else {
				throw new Error("Invoice outbox response was not acknowledged");
			}
		} catch (error) {
			failed += 1;
			finalRows.push(markOutboxFailed(claimed, error));
			mutationMetric.fail(error);
		}
	}
	if (finalRows.length) {
		await safeBulkPut(TABLE, finalRows);
	}

	const pending = await getPendingInvoiceOutboxCount();
	metric.finish(failed ? "failure" : "success", {
		mutation_count_bucket: bucketCount(claimedRows.length),
		pending_count_bucket: bucketCount(pending),
	});
	startPerfMeasure("pos.offline.sync_complete", {
		resource: "invoice_outbox",
	}).finish(failed ? "failure" : "success", {
		acknowledged_count_bucket: bucketCount(acknowledged),
		failed_count_bucket: bucketCount(failed),
	});
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
