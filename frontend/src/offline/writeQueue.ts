import { checkDbHealth, db, initPromise, memory } from "./db";
import {
	ensureOfflineInvoiceRequest,
	ensurePaymentClientRequestId,
} from "./idempotency";

type AnyRecord = Record<string, any>;

export type OfflineEntityType =
	| "invoice"
	| "customer"
	| "payment"
	| "cash_movement";

export type OfflineQueueStatus =
	| "pending"
	| "syncing"
	| "failed"
	| "dead_letter"
	| "synced";

export interface OfflineQueueEntry {
	queue_id?: number;
	entity_type: OfflineEntityType;
	payload: AnyRecord;
	created_at: string;
	last_attempt_at: string | null;
	retry_count: number;
	status: OfflineQueueStatus;
	idempotency_key: string;
	last_error: string | null;
}

const WRITE_QUEUE_TABLE = "write_queue";
const MAX_RETRY_COUNT = 5;
const SYNCING_LEASE_MS = 5 * 60 * 1000;

const ENTITY_MEMORY_KEYS: Record<OfflineEntityType, string> = {
	invoice: "offline_invoices",
	customer: "offline_customers",
	payment: "offline_payments",
	cash_movement: "offline_cash_movements",
};

const LEGACY_QUEUE_CONFIG: Array<{
	entityType: OfflineEntityType;
	memoryKey: string;
}> = [
	{ entityType: "invoice", memoryKey: "offline_invoices" },
	{ entityType: "customer", memoryKey: "offline_customers" },
	{ entityType: "payment", memoryKey: "offline_payments" },
	{ entityType: "cash_movement", memoryKey: "offline_cash_movements" },
];

const ACTIVE_STATUSES = new Set<OfflineQueueStatus>([
	"pending",
	"syncing",
	"failed",
	"dead_letter",
]);

const RETRYABLE_STATUSES = new Set<OfflineQueueStatus>([
	"pending",
	"failed",
	"syncing",
]);

let queueReadyPromise: Promise<void> | null = null;

const nowIso = () => new Date().toISOString();

const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function stableStringify(value: any): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(",")}}`;
	}

	return JSON.stringify(value);
}

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 33) ^ value.charCodeAt(index);
	}
	return (hash >>> 0).toString(16);
}

function getMemoryKey(entityType: OfflineEntityType) {
	return ENTITY_MEMORY_KEYS[entityType];
}

function isActiveStatus(status: OfflineQueueStatus) {
	return ACTIVE_STATUSES.has(status);
}

function isRetryableStatus(status: OfflineQueueStatus) {
	return RETRYABLE_STATUSES.has(status);
}

function isStaleSyncLease(entry: OfflineQueueEntry) {
	if (entry.status !== "syncing" || !entry.last_attempt_at) {
		return false;
	}

	const lastAttempt = Date.parse(entry.last_attempt_at);
	if (!Number.isFinite(lastAttempt)) {
		return true;
	}

	return Date.now() - lastAttempt >= SYNCING_LEASE_MS;
}

function toErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function normalizePaymentPayload(payload: AnyRecord) {
	const nextPayload = cloneSerializable(payload);
	const paymentPayload = nextPayload?.args?.payload;
	if (paymentPayload) {
		ensurePaymentClientRequestId(paymentPayload);
	}
	return nextPayload;
}

function normalizeInvoicePayload(payload: AnyRecord) {
	const nextPayload = cloneSerializable(payload);
	ensureOfflineInvoiceRequest(nextPayload);
	return nextPayload;
}

function normalizeCashMovementPayload(payload: AnyRecord) {
	const nextPayload = cloneSerializable(payload);
	const movementPayload = nextPayload?.args?.payload || nextPayload?.payload;
	if (movementPayload && !movementPayload.client_request_id) {
		movementPayload.client_request_id = `cm-${Date.now()}-${Math.random()
			.toString(36)
			.slice(2, 10)}`;
	}
	return nextPayload;
}

function normalizePayload(
	entityType: OfflineEntityType,
	payload: AnyRecord,
): AnyRecord {
	if (entityType === "payment") {
		return normalizePaymentPayload(payload);
	}

	if (entityType === "invoice") {
		return normalizeInvoicePayload(payload);
	}

	if (entityType === "cash_movement") {
		return normalizeCashMovementPayload(payload);
	}

	return cloneSerializable(payload);
}

function deriveIdempotencyKey(
	entityType: OfflineEntityType,
	payload: AnyRecord,
): string {
	if (entityType === "invoice") {
		const requestId = String(payload?.invoice?.posa_client_request_id || "").trim();
		if (requestId) {
			return `invoice:${requestId}`;
		}

		const invoiceName = String(payload?.invoice?.name || "").trim();
		if (invoiceName) {
			return `invoice:${invoiceName}`;
		}
	}

	if (entityType === "payment") {
		const requestId = String(
			payload?.args?.payload?.client_request_id || "",
		).trim();
		if (requestId) {
			return `payment:${requestId}`;
		}
	}

	if (entityType === "cash_movement") {
		const requestId = String(
			payload?.args?.payload?.client_request_id ||
				payload?.payload?.client_request_id ||
				"",
		).trim();
		if (requestId) {
			return `cash_movement:${requestId}`;
		}
	}

	if (entityType === "customer") {
		const customerId = String(payload?.args?.customer_id || "").trim();
		if (customerId) {
			return `customer:update:${customerId}`;
		}

		const customerFingerprint = {
			method: payload?.args?.method || "create",
			customer_name: payload?.args?.customer_name || "",
			mobile_no: payload?.args?.mobile_no || "",
			email_id: payload?.args?.email_id || "",
			tax_id: payload?.args?.tax_id || "",
		};
		return `customer:${hashString(stableStringify(customerFingerprint))}`;
	}

	return `${entityType}:${hashString(stableStringify(payload))}`;
}

function isCustomerUpdateKey(entityType: OfflineEntityType, idempotencyKey: string) {
	return entityType === "customer" && idempotencyKey.startsWith("customer:update:");
}

function buildCoalescedQueueEntry(
	existing: OfflineQueueEntry,
	payload: AnyRecord,
): OfflineQueueEntry {
	return {
		...existing,
		payload,
		status: "pending",
		retry_count: 0,
		last_attempt_at: null,
		last_error: null,
	};
}

function toPublicSnapshot(entry: OfflineQueueEntry) {
	return {
		...cloneSerializable(entry.payload),
		queue_id: entry.queue_id,
		entity_type: entry.entity_type,
		created_at: entry.created_at,
		last_attempt_at: entry.last_attempt_at,
		retry_count: entry.retry_count,
		status: entry.status,
		idempotency_key: entry.idempotency_key,
		last_error: entry.last_error,
	};
}

async function clearLegacyQueueStorage(memoryKey: string) {
	const queueTable = db.table("queue");
	const keyvalTable = db.table("keyval");

	await Promise.all([
		queueTable.put({ key: memoryKey, value: [] }),
		keyvalTable.put({ key: memoryKey, value: [] }),
	]);

	if (typeof localStorage !== "undefined") {
		localStorage.removeItem(`posa_${memoryKey}`);
	}
}

async function ensureQueueDbReady() {
	await initPromise;
	await checkDbHealth();
	if (!db.isOpen()) {
		await db.open();
	}
}

export async function getQueueEntries(
	entityType: OfflineEntityType,
	options: {
		includeSynced?: boolean;
		statuses?: OfflineQueueStatus[];
	} = {},
) {
	await ensureQueueDbReady();

	const rows = (await db
		.table(WRITE_QUEUE_TABLE)
		.where("entity_type")
		.equals(entityType)
		.sortBy("created_at")) as OfflineQueueEntry[];

	return rows.filter((row) => {
		if (options.statuses?.length) {
			return options.statuses.includes(row.status);
		}
		if (options.includeSynced) {
			return true;
		}
		return isActiveStatus(row.status);
	});
}

export async function refreshQueueMemory(entityType: OfflineEntityType) {
	const entries = await getQueueEntries(entityType);
	memory[getMemoryKey(entityType)] = entries.map((entry) =>
		toPublicSnapshot(entry),
	);
}

export async function refreshAllQueueMemory() {
	for (const config of LEGACY_QUEUE_CONFIG) {
		await refreshQueueMemory(config.entityType);
	}
}

async function enqueueWriteQueueEntryInternal(
	entityType: OfflineEntityType,
	payload: AnyRecord,
	options: { idempotencyKey?: string } = {},
) {
	const normalizedPayload = normalizePayload(entityType, payload);
	const idempotencyKey =
		options.idempotencyKey || deriveIdempotencyKey(entityType, normalizedPayload);

	const table = db.table(WRITE_QUEUE_TABLE);
	const queuedEntry = await db.transaction("rw", table, async () => {
		const existing = (await table
			.where("idempotency_key")
			.equals(idempotencyKey)
			.first()) as OfflineQueueEntry | undefined;

		if (existing) {
			if (isCustomerUpdateKey(entityType, idempotencyKey)) {
				const coalescedEntry = buildCoalescedQueueEntry(
					existing,
					normalizedPayload,
				);
				await table.put(coalescedEntry);
				return coalescedEntry;
			}
			return existing;
		}

		const entry: OfflineQueueEntry = {
			entity_type: entityType,
			payload: normalizedPayload,
			created_at: nowIso(),
			last_attempt_at: null,
			retry_count: 0,
			status: "pending",
			idempotency_key: idempotencyKey,
			last_error: null,
		};

		const queueId = await table.add(entry);
		return { ...entry, queue_id: queueId };
	});

	await refreshQueueMemory(entityType);
	return queuedEntry;
}

export async function enqueueWriteQueueEntry(
	entityType: OfflineEntityType,
	payload: AnyRecord,
	options: { idempotencyKey?: string } = {},
) {
	await ensureOfflineQueueReady();
	return enqueueWriteQueueEntryInternal(entityType, payload, options);
}

export async function deleteWriteQueueEntry(
	entityType: OfflineEntityType,
	queueId: number,
) {
	await ensureOfflineQueueReady();
	await db.table(WRITE_QUEUE_TABLE).delete(queueId);
	await refreshQueueMemory(entityType);
}

export async function deleteWriteQueueEntryByIndex(
	entityType: OfflineEntityType,
	index: number,
) {
	const entries = await getQueueEntries(entityType);
	const target = entries[index];
	if (!target?.queue_id) {
		return;
	}
	await deleteWriteQueueEntry(entityType, target.queue_id);
}

export async function clearWriteQueueEntries(
	entityType: OfflineEntityType,
	options: { includeSynced?: boolean } = {},
) {
	await ensureOfflineQueueReady();
	const entries = await getQueueEntries(entityType, {
		includeSynced: options.includeSynced ?? true,
	});
	const queueIds = entries
		.map((entry) => entry.queue_id)
		.filter((queueId): queueId is number => Number.isFinite(Number(queueId)));

	if (queueIds.length) {
		await db.table(WRITE_QUEUE_TABLE).bulkDelete(queueIds);
	}

	await refreshQueueMemory(entityType);
}

export async function claimRetryableQueueEntries(entityType: OfflineEntityType) {
	await ensureOfflineQueueReady();

	const table = db.table(WRITE_QUEUE_TABLE);
	const claimed: OfflineQueueEntry[] = [];
	const claimTimestamp = nowIso();

	await db.transaction("rw", table, async () => {
		const entries = (await table
			.where("entity_type")
			.equals(entityType)
			.sortBy("created_at")) as OfflineQueueEntry[];

		for (const entry of entries) {
			if (!isRetryableStatus(entry.status)) {
				continue;
			}

			if (entry.status === "syncing" && !isStaleSyncLease(entry)) {
				continue;
			}

			const nextEntry: OfflineQueueEntry = {
				...entry,
				status: "syncing",
				last_attempt_at: claimTimestamp,
				last_error:
					entry.status === "syncing" && isStaleSyncLease(entry)
						? entry.last_error || "Recovered stale sync lease"
						: entry.last_error,
			};

			await table.put(nextEntry);
			claimed.push(nextEntry);
		}
	});

	await refreshQueueMemory(entityType);
	return claimed;
}

async function updateClaimedQueueEntry(
	entityType: OfflineEntityType,
	queueId: number,
	expectedLastAttemptAt: string | null | undefined,
	updater: (current: OfflineQueueEntry) => OfflineQueueEntry,
) {
	const table = db.table(WRITE_QUEUE_TABLE);
	const updated = await db.transaction("rw", table, async () => {
		const current = (await table.get(queueId)) as OfflineQueueEntry | undefined;
		if (!current) {
			return false;
		}

		if (
			current.entity_type !== entityType ||
			current.status !== "syncing" ||
			current.last_attempt_at !== (expectedLastAttemptAt ?? null)
		) {
			return false;
		}

		await table.put(updater(current));
		return true;
	});

	if (updated) {
		await refreshQueueMemory(entityType);
	}

	return updated;
}

export async function markWriteQueueEntrySynced(
	entityType: OfflineEntityType,
	queueId: number,
	expectedLastAttemptAt: string | null | undefined,
) {
	await ensureOfflineQueueReady();

	return updateClaimedQueueEntry(
		entityType,
		queueId,
		expectedLastAttemptAt,
		(current) => ({
			...current,
			status: "synced",
			last_error: null,
			last_attempt_at: current.last_attempt_at || expectedLastAttemptAt || nowIso(),
		}),
	);
}

export async function markWriteQueueEntryFailed(
	entityType: OfflineEntityType,
	queueId: number,
	error: unknown,
	expectedLastAttemptAt: string | null | undefined,
) {
	await ensureOfflineQueueReady();

	return updateClaimedQueueEntry(
		entityType,
		queueId,
		expectedLastAttemptAt,
		(current) => {
			const nextRetryCount = Number(current.retry_count || 0) + 1;
			const nextStatus: OfflineQueueStatus =
				nextRetryCount >= MAX_RETRY_COUNT ? "dead_letter" : "failed";

			return {
				...current,
				status: nextStatus,
				retry_count: nextRetryCount,
				last_attempt_at: nowIso(),
				last_error: toErrorMessage(error),
			};
		},
	);
}

export async function updateQueuedPayloads(
	entityType: OfflineEntityType,
	updater: (payload: AnyRecord) => AnyRecord,
) {
	await ensureOfflineQueueReady();
	const table = db.table(WRITE_QUEUE_TABLE);

	await db.transaction("rw", table, async () => {
		const entries = (await table
			.where("entity_type")
			.equals(entityType)
			.sortBy("created_at")) as OfflineQueueEntry[];

		for (const entry of entries) {
			if (!isActiveStatus(entry.status)) {
				continue;
			}
			const nextPayload = normalizePayload(entityType, updater(cloneSerializable(entry.payload)));
			await table.put({
				...entry,
				payload: nextPayload,
			});
		}
	});

	await refreshQueueMemory(entityType);
}

export async function migrateLegacyOfflineQueues() {
	await ensureQueueDbReady();

	for (const config of LEGACY_QUEUE_CONFIG) {
		const legacyEntries = Array.isArray(memory[config.memoryKey])
			? cloneSerializable(memory[config.memoryKey])
			: [];

		if (legacyEntries.length) {
			for (const legacyEntry of legacyEntries) {
				await enqueueWriteQueueEntryInternal(config.entityType, legacyEntry);
			}
		}

		await clearLegacyQueueStorage(config.memoryKey);
		await refreshQueueMemory(config.entityType);
	}
}

export async function ensureOfflineQueueReady() {
	if (!queueReadyPromise) {
		queueReadyPromise = (async () => {
			await ensureQueueDbReady();
			await migrateLegacyOfflineQueues();
			await refreshAllQueueMemory();
		})().catch((error) => {
			queueReadyPromise = null;
			throw error;
		});
	}

	return queueReadyPromise;
}

export function getQueuedPayloadSnapshots(entityType: OfflineEntityType) {
	const snapshots = memory[getMemoryKey(entityType)];
	return Array.isArray(snapshots)
		? snapshots.map((snapshot) => cloneSerializable(snapshot))
		: [];
}

export function getQueuedPayloadCount(entityType: OfflineEntityType) {
	return (memory[getMemoryKey(entityType)] || []).length;
}
