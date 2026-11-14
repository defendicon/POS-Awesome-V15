/**
 * Storage primitives for the POS offline layer.
 *
 * This module provides the two foundations that all other offline-layer modules
 * (`cache.ts`, domain queues, sync adapters) are built on:
 *
 * **Dexie / IndexedDB (`db`)**
 * `db` is a Dexie instance named `"posawesome_offline"`. `BASE_SCHEMA` defines its
 * tables — items, customers, domain queues, caches, settings, and sync state.
 * `KEY_TABLE_MAP` routes each logical key name to the correct physical table;
 * keys not listed fall through to a `keyval` catch-all. Multiple schema versions
 * are declared to maintain upgrade compatibility without structural changes.
 *
 * **In-memory store (`memory`)**
 * `memory` is a plain object that holds all cache values in RAM for synchronous
 * access. `startupInitPromise` hydrates the small boot-critical subset
 * immediately. `initPromise` remains the full-memory readiness contract for
 * cache-dependent flows and completes during idle time. Both read Dexie first,
 * then legacy `keyval`, then `localStorage` (prefix `posa_`), retaining defaults
 * when no persisted value exists.
 *
 * **Persist write path (`persist`)**
 * `persist(key)` is the single write path for all `memory` entries. Calls made in
 * the same turn are coalesced by key, then grouped by the Dexie table determined
 * by `KEY_TABLE_MAP`. Only a small, explicit set of lightweight
 * settings/metadata keys are additionally mirrored to `localStorage` under
 * `posa_<key>`. When a Web Worker is available (`persistWorker`), one native
 * structured-clone batch is sent to the worker; otherwise the same grouped
 * `bulkPut()` path runs on the main thread.
 *
 * **Relationship to the rest of the offline layer**
 * `cache.ts` reads and writes through `memory`, calling `persist(key)` on every
 * mutation. For large, searchable datasets (`items`, `customers`) it also issues
 * `db` table queries directly. Domain queue modules (`invoices`, `payments`, etc.)
 * and sync adapters import `db`, `memory`, and `persist` from this file.
 * `checkDbHealth` is called defensively before every IndexedDB operation
 * elsewhere in the layer. It attempts a non-destructive reopen and enters
 * degraded mode when recovery would otherwise require deleting user data.
 */
import Dexie from "dexie/dist/dexie.mjs";
import {
	finishStartupPhase,
	startStartupPhase,
	traceStartupEvent,
} from "../utils/startupTrace";
import { buildPosWorkerUrl } from "../posapp/utils/workerUrl";

type AnyRecord = Record<string, any>;

// --- Dexie initialization ---------------------------------------------------
export const db = new Dexie("posawesome_offline");

const BASE_SCHEMA = {
	keyval: "&key",
	queue: "&key",
	write_queue:
		"++queue_id,entity_type,status,resource,next_attempt_at,created_at,last_attempt_at,retry_count,&idempotency_key,[entity_type+status],[status+next_attempt_at]",
	invoice_outbox:
		"++outbox_id,&client_request_id,status,resource,created_at,next_retry_at,nextAttemptAt,retry_count,[status+next_retry_at],[resource+status],[status+nextAttemptAt]",
	cache: "&key",
	items: "&item_code,item_name,item_group,*barcodes,*name_keywords,*serials,*batches",
	item_prices: "&[price_list+item_code],price_list,item_code",
	customers: "&name,customer_name,mobile_no,email_id,tax_id",
	pos_profiles: "&name",
	opening_shifts: "&name,user,pos_profile",
	local_stock: "&key",
	coupons: "&key",
	item_groups: "&key",
	translations: "&key",
	pricing_rules: "&key",
	settings: "&key",
	sync_state: "&key,resourceId,status,nextRetryAt,lastAttemptAt,updated_at",
};

const SCHEMA_V14 = {
	...BASE_SCHEMA,
	item_price_records:
		"&name,price_list,item_code,uom,currency,customer,modified,[price_list+item_code],[price_list+item_code+uom]",
	pricing_rule_records:
		"&key,rule_name,target_type,target_value,modified,[target_type+target_value]",
	currency_rate_records:
		"&name,profile_name,company,from_currency,to_currency,date,modified,[profile_name+company+from_currency+to_currency]",
};

const SCHEMA_V15 = {
	...SCHEMA_V14,
	write_queue:
		"++queue_id,entity_type,status,resource,next_attempt_at,created_at,last_attempt_at,retry_count,&idempotency_key,[entity_type+status],[status+next_attempt_at],[status+last_attempt_at],[status+created_at]",
	invoice_outbox:
		"++outbox_id,&client_request_id,status,resource,created_at,updated_at,acknowledged_at,next_retry_at,nextAttemptAt,retry_count,[status+next_retry_at],[resource+status],[status+nextAttemptAt],[status+acknowledged_at],[status+updated_at],[status+created_at]",
};

const SCHEMA_V16 = {
	...SCHEMA_V15,
	items: "&item_code,item_name,item_group,profile_scope,item_code_lc,item_name_lc,*barcodes,*barcodes_lc,*name_keywords,*name_keywords_lc,*serials,*batches",
};

const SCHEMA_V17 = {
	...SCHEMA_V16,
	item_catalog_rows:
		"&[profile_scope+catalog_generation+item_code],[profile_scope+catalog_generation],profile_scope,catalog_generation,item_code,item_name,item_group,item_code_lc,item_name_lc,*barcodes,*barcodes_lc,*name_keywords,*name_keywords_lc,*serials,*batches",
	item_catalog_state: "&profile_scope,active_generation,updated_at",
};
const SCHEMA_V18 = {
	...SCHEMA_V17,
	customers:
		"&name,customer_name,mobile_no,email_id,tax_id,*_mobile_search_keys",
};
const OFFLINE_DB_SCHEMA_SIGNATURE = JSON.stringify(SCHEMA_V18);

export const KEY_TABLE_MAP: Record<string, string> = {
	offline_invoices: "queue",
	offline_customers: "queue",
	offline_payments: "queue",
	offline_cash_movements: "queue",
	item_details_cache: "cache",
	stored_value_snapshot_cache: "cache",
	gift_card_snapshot_cache: "cache",
	delivery_charges_cache: "cache",
	currency_options_cache: "cache",
	exchange_rate_cache: "cache",
	price_list_meta_cache: "cache",
	customer_addresses_cache: "cache",
	payment_method_currency_cache: "cache",
	local_stock_cache: "local_stock",
	coupons_cache: "coupons",
	item_groups_cache: "item_groups",
	translation_cache: "translations",
	pricing_rules_snapshot: "pricing_rules",
	pricing_rules_context: "pricing_rules",
	pricing_rules_last_sync: "pricing_rules",
	pricing_rules_stale_at: "pricing_rules",
	cache_version: "settings",
	cache_ready: "settings",
	stock_cache_ready: "settings",
	manual_offline: "settings",
	invoice_outbox_mode: "settings",
	bootstrap_snapshot: "settings",
	bootstrap_snapshot_status: "settings",
	bootstrap_limited_mode: "settings",
	schema_signature: "settings",
	items_last_sync: "sync_state",
	customers_last_sync: "sync_state",
	payment_methods_last_sync: "sync_state",
	pos_last_sync_totals: "sync_state",
};

const LARGE_KEYS = new Set([
	"items",
	"item_details_cache",
	"local_stock_cache",
]);

const LOCAL_STORAGE_KEYS = new Set([
	"manual_offline",
	"invoice_outbox_mode",
	"bootstrap_snapshot",
	"bootstrap_snapshot_status",
	"bootstrap_limited_mode",
	"cache_ready",
	"stock_cache_ready",
	"schema_signature",
	"tax_inclusive",
]);

// customer_storage is a runtime-only hot cache. The canonical durable customer
// read model is the IndexedDB `customers` table.
const MEMORY_ONLY_KEYS = new Set(["customer_storage"]);
const LEGACY_KEY_TABLES: Record<string, string[]> = {
	customer_storage: ["cache"],
};

export const STARTUP_MEMORY_KEYS = Object.freeze([
	"offline_invoices",
	"offline_customers",
	"offline_payments",
	"offline_cash_movements",
	"manual_offline",
	"invoice_outbox_mode",
	"pos_opening_storage",
	"opening_dialog_storage",
	"pos_last_sync_totals",
	"bootstrap_snapshot",
	"bootstrap_snapshot_status",
	"bootstrap_limited_mode",
	"cache_ready",
	"stock_cache_ready",
	"schema_signature",
	"tax_inclusive",
]);

export const PENDING_OFFLINE_QUEUE_KEYS = Object.freeze([
	"offline_invoices",
	"offline_customers",
	"offline_payments",
	"offline_cash_movements",
]);

export const DERIVED_OFFLINE_CACHE_KEYS = Object.freeze([
	"uom_cache",
	"offers_cache",
	"customer_balance_cache",
	"stored_value_snapshot_cache",
	"gift_card_snapshot_cache",
	"delivery_charges_cache",
	"currency_options_cache",
	"exchange_rate_cache",
	"price_list_meta_cache",
	"customer_addresses_cache",
	"payment_method_currency_cache",
	"local_stock_cache",
	"stock_cache_ready",
	"customer_storage",
	"items_last_sync",
	"customers_last_sync",
	"payment_methods_last_sync",
	"sales_persons_storage",
	"price_list_cache",
	"item_details_cache",
	"tax_template_cache",
	"tax_inclusive",
	"item_groups_cache",
	"coupons_cache",
	"translation_cache",
	"pricing_rules_snapshot",
	"pricing_rules_context",
	"pricing_rules_last_sync",
	"pricing_rules_stale_at",
	"print_template",
	"terms_and_conditions",
	"cache_ready",
	"bootstrap_snapshot",
	"bootstrap_snapshot_status",
	"bootstrap_limited_mode",
	"schema_signature",
]);

const DERIVED_OFFLINE_METADATA_KEYS = Object.freeze(["cache_version"]);

// Intentionally preserved across build-cache reconciliation:
// - `manual_offline` is an explicit user/network override, not stale derived data.
// - `pos_opening_storage` / `opening_dialog_storage` hold active shift/session state.
// - `pos_last_sync_totals` is operational queue telemetry derived from pending work.
// These keys are cleared by their owning flows when appropriate, but not by
// `clearDerivedOfflineCaches()`.

const DERIVED_OFFLINE_TABLES_TO_CLEAR = Object.freeze([
	"items",
	"item_catalog_rows",
	"item_catalog_state",
	"item_prices",
	"item_price_records",
	"customers",
	"cache",
	"local_stock",
	"coupons",
	"item_groups",
	"translations",
	"pricing_rules",
	"pricing_rule_records",
	"currency_rate_records",
]);

function tableForKey(key: string) {
	return KEY_TABLE_MAP[key] || "keyval";
}

function shouldPersistToIndexedDb(key: string) {
	return !MEMORY_ONLY_KEYS.has(key);
}

function shouldPersistToLocalStorage(key: string) {
	return LOCAL_STORAGE_KEYS.has(key) && !LARGE_KEYS.has(key);
}

function isCorruptionError(err: unknown) {
	if (!err || typeof err !== "object") return false;
	const maybe = err as { name?: string; message?: string };
	const name = maybe.name || "";
	const message = (maybe.message || "").toLowerCase();
	return (
		["VersionError", "InvalidStateError", "NotFoundError"].includes(name) ||
		message.includes("corrupt")
	);
}

// Start with version 1 using the full schema immediately
// This ensures new installations get the correct schema
db.version(1).stores(BASE_SCHEMA);

// Keep higher versions if needed for upgrades, but map them to the same schema
// if no structural changes are required, or define specific upgrades.
// Since we are fixing a "Table customers does not exist" error, explicitly defining
// it in the initial version is the safest bet.

db.version(7).stores(BASE_SCHEMA);
db.version(8).stores(BASE_SCHEMA);
db.version(9).stores(BASE_SCHEMA);
db.version(10).stores(BASE_SCHEMA);
db.version(11).stores(BASE_SCHEMA);
db.version(12).stores(BASE_SCHEMA);
db.version(13).stores(BASE_SCHEMA);
db.version(14).stores(SCHEMA_V14);
db.version(15).stores(SCHEMA_V15);
db.version(16).stores(SCHEMA_V16);
db.version(17)
	.stores(SCHEMA_V17)
	.upgrade((tx) =>
		tx.table("settings").put({
			key: "schema_signature",
			value: OFFLINE_DB_SCHEMA_SIGNATURE,
		}),
	);
db.version(18)
	.stores(SCHEMA_V18)
	.upgrade(async (tx) => {
		await tx
			.table("customers")
			.toCollection()
			.modify((customer) => {
				const digits = String(customer.mobile_no || "").replace(
					/\D/g,
					"",
				);
				const keys = new Set(digits ? [digits] : []);
				if (digits.startsWith("00") && digits.length > 2)
					keys.add(digits.slice(2));
				if (digits.startsWith("0") && digits.length > 1)
					keys.add(digits.slice(1));
				for (const length of [10, 9, 8]) {
					if (digits.length > length) keys.add(digits.slice(-length));
				}
				customer._mobile_search_keys = Array.from(keys).filter(
					(key) => key.length >= 4,
				);
			});
		await tx.table("settings").put({
			key: "schema_signature",
			value: OFFLINE_DB_SCHEMA_SIGNATURE,
		});
	});

// The persistence worker is deliberately started only after the main Dexie
// connection has opened. Starting two schema owners at module import allowed an
// old-profile worker upgrade to block the main startup connection for minutes.
let persistWorker: Worker | null = null;

const MEMORY_DEFAULTS: AnyRecord = {
	offline_invoices: [],
	offline_customers: [],
	offline_payments: [],
	offline_cash_movements: [],
	invoice_outbox_mode: "off",
	pos_last_sync_totals: { pending: 0, synced: 0, drafted: 0 },
	uom_cache: {},
	offers_cache: [],
	customer_balance_cache: {},
	stored_value_snapshot_cache: {},
	gift_card_snapshot_cache: {},
	delivery_charges_cache: {},
	currency_options_cache: {},
	exchange_rate_cache: {},
	price_list_meta_cache: {},
	customer_addresses_cache: {},
	payment_method_currency_cache: {},
	local_stock_cache: {},
	stock_cache_ready: false,
	customer_storage: [],
	items_last_sync: null,
	customers_last_sync: null,
	payment_methods_last_sync: null,
	pos_opening_storage: null,
	opening_dialog_storage: null,
	sales_persons_storage: [],
	price_list_cache: {},
	item_details_cache: {},
	tax_template_cache: {},
	tax_inclusive: false,
	manual_offline: false,
	item_groups_cache: [],
	coupons_cache: {},
	// Additional properties that might be needed
	translation_cache: {},
	pricing_rules_snapshot: [],
	pricing_rules_context: null,
	pricing_rules_last_sync: null,
	pricing_rules_stale_at: null,
	print_template: "",
	terms_and_conditions: "",
	cache_ready: false,
	bootstrap_snapshot: null,
	bootstrap_snapshot_status: null,
	bootstrap_limited_mode: false,
	schema_signature: null,
};

export const memory: AnyRecord = {
	...MEMORY_DEFAULTS,
};

const memoryMutationVersions = new Map<string, number>();

function markMemoryKeyChanged(key: string) {
	memoryMutationVersions.set(key, (memoryMutationVersions.get(key) || 0) + 1);
}

function cloneDefaultValue<T>(value: T): T {
	if (value === null || typeof value !== "object") {
		return value;
	}

	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return value;
	}
}

function resetMemoryKey(key: string) {
	markMemoryKeyChanged(key);
	if (Object.prototype.hasOwnProperty.call(MEMORY_DEFAULTS, key)) {
		memory[key] = cloneDefaultValue(MEMORY_DEFAULTS[key]);
		return;
	}

	delete memory[key];
}

function removeLocalStorageMirror(key: string) {
	if (typeof localStorage === "undefined") {
		return;
	}

	try {
		localStorage.removeItem(`posa_${key}`);
	} catch (error) {
		console.warn("Failed to remove localStorage mirror", key, error);
	}
}

async function deletePersistedKey(key: string) {
	const primaryTable = tableForKey(key);
	const deletePrimary = () =>
		db
			.table(primaryTable)
			.delete(key)
			.catch((error) => {
				console.warn(
					`Failed to delete ${key} from ${primaryTable}`,
					error,
				);
			});
	const tasks = [deletePrimary()];

	if (primaryTable !== "keyval") {
		tasks.push(
			db
				.table("keyval")
				.delete(key)
				.catch((error) => {
					console.warn(
						`Failed to delete ${key} fallback from keyval`,
						error,
					);
				}),
		);
	}

	for (const legacyTable of LEGACY_KEY_TABLES[key] || []) {
		if (legacyTable === primaryTable) {
			continue;
		}
		tasks.push(
			db
				.table(legacyTable)
				.delete(key)
				.catch((error) => {
					console.warn(
						`Failed to delete ${key} legacy row from ${legacyTable}`,
						error,
					);
				}),
		);
	}

	await Promise.all(tasks);
}

type PersistedValueRecord = { key?: string; value?: unknown } | undefined;

function readLocalStorageValue(key: string): PersistedValueRecord {
	if (typeof localStorage === "undefined") {
		return undefined;
	}

	try {
		const stored = localStorage.getItem(`posa_${key}`);
		if (stored === null) {
			return undefined;
		}
		return { key, value: JSON.parse(stored) };
	} catch (error) {
		console.error("Failed to parse localStorage for", key, error);
		return undefined;
	}
}

type PersistEntry = { key: string; value: unknown };
type PersistWorkerBatch = {
	entries: PersistEntry[];
	resolve: () => void;
	reject: (_error: unknown) => void;
	timeout: ReturnType<typeof setTimeout> | null;
};

export const PERSIST_WORKER_TIMEOUT_MS = 10_000;
export const PERSIST_WORKER_READY_TIMEOUT_MS = 30_000;
const pendingPersistEntries = new Map<string, unknown>();
const inFlightWorkerBatches = new Map<number, PersistWorkerBatch>();
const activePersistOperations = new Set<Promise<void>>();
let persistFlushScheduled = false;
let nextPersistBatchId = 1;
let persistWorkerHealthy = Boolean(persistWorker);
let directPersistChain: Promise<void> = Promise.resolve();
let persistWorkerReadyPromise: Promise<void> | null = null;
let resolvePersistWorkerReady: (() => void) | null = null;
let rejectPersistWorkerReady: ((_error: unknown) => void) | null = null;
let persistWorkerReadyTimeout: ReturnType<typeof setTimeout> | null = null;

export async function hydrateMemoryKeys(
	keys: readonly string[],
): Promise<void> {
	const phase = startStartupPhase("indexeddb.memory_hydration", {
		keys: keys.length,
		largeKeys: keys.filter((key) => LARGE_KEYS.has(key)),
	});
	const uniqueKeys = Array.from(new Set(keys)).filter((key) =>
		Object.prototype.hasOwnProperty.call(memory, key),
	);
	if (!uniqueKeys.length) {
		finishStartupPhase(phase, "ok", { hydratedKeys: 0 });
		return;
	}

	const mutationVersions = new Map(
		uniqueKeys.map((key) => [key, memoryMutationVersions.get(key) || 0]),
	);
	const primaryGroups = new Map<string, string[]>();
	for (const key of uniqueKeys) {
		const tableName = tableForKey(key);
		if (tableName === "keyval") {
			continue;
		}
		const tableKeys = primaryGroups.get(tableName) || [];
		tableKeys.push(key);
		primaryGroups.set(tableName, tableKeys);
	}

	const primaryRecords = new Map<string, PersistedValueRecord>();
	const legacyRecords = new Map<string, PersistedValueRecord>();
	await Promise.all([
		...Array.from(primaryGroups.entries()).map(
			async ([tableName, tableKeys]) => {
				const rows = (await db
					.table(tableName)
					.bulkGet(tableKeys)) as PersistedValueRecord[];
				tableKeys.forEach((key, index) => {
					primaryRecords.set(key, rows[index]);
				});
			},
		),
		(async () => {
			// One keyval read covers both keys owned by keyval and legacy fallback
			// rows left behind before KEY_TABLE_MAP routed them elsewhere.
			const rows = (await db
				.table("keyval")
				.bulkGet(uniqueKeys)) as PersistedValueRecord[];
			uniqueKeys.forEach((key, index) => {
				legacyRecords.set(key, rows[index]);
			});
		})(),
	]);

	for (const key of uniqueKeys) {
		if (
			(memoryMutationVersions.get(key) || 0) !== mutationVersions.get(key)
		) {
			continue;
		}

		const primary =
			tableForKey(key) === "keyval"
				? legacyRecords.get(key)
				: primaryRecords.get(key);
		const legacy = legacyRecords.get(key);
		const stored =
			primary?.value !== undefined
				? primary
				: legacy?.value !== undefined
					? legacy
					: readLocalStorageValue(key);

		if (stored?.value !== undefined) {
			memory[key] = stored.value;
		}
	}
	finishStartupPhase(phase, "ok", {
		hydratedKeys: uniqueKeys.length,
		tables: Array.from(primaryGroups.keys()),
	});
}

async function initializeMemoryKeys(keys: readonly string[]) {
	const phase = startStartupPhase("indexeddb.open_and_hydrate", {
		keys: keys.length,
		requestedVersion: 17,
	});
	try {
		await db.open();
		await hydrateMemoryKeys(keys);
		finishStartupPhase(phase, "ok", {
			databaseVersion: db.verno,
			keys: keys.length,
		});
		return true;
	} catch (error) {
		console.error("Failed to initialize offline DB", error);
		finishStartupPhase(phase, "error", { error, keys: keys.length });
		return false;
	}
}

function scheduleIdleTask(task: () => void) {
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(task, { timeout: 2_000 });
	} else {
		setTimeout(task, 0);
	}
}

function yieldToMainThread() {
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

type PostHydrationTask = () => Promise<void> | void;
const postHydrationTasks = new Set<PostHydrationTask>();

export function registerPostHydrationTask(task: PostHydrationTask) {
	postHydrationTasks.add(task);
	return () => postHydrationTasks.delete(task);
}

async function runPostHydrationTasks() {
	for (const task of Array.from(postHydrationTasks)) {
		try {
			await task();
		} catch (error) {
			console.error("Offline post-hydration task failed", error);
		}
	}
}

const startupStoragePhase = startStartupPhase("indexeddb.startup_ready", {
	keys: STARTUP_MEMORY_KEYS.length,
});
export const startupInitPromise = initializeMemoryKeys(
	STARTUP_MEMORY_KEYS,
).then(
	(ready) => {
		finishStartupPhase(startupStoragePhase, ready ? "ok" : "error", {
			databaseVersion: db.verno,
			degraded: !ready,
		});
	},
	(error) => {
		finishStartupPhase(startupStoragePhase, "error", { error });
	},
);

export const initPromise = startupInitPromise.then(
	() =>
		new Promise<void>((resolve) => {
			scheduleIdleTask(() => {
				const startupKeys = new Set<string>(STARTUP_MEMORY_KEYS);
				const remainingKeys = Object.keys(memory).filter(
					(key) => !startupKeys.has(key),
				);
				const lightweightKeys = remainingKeys.filter(
					(key) => !LARGE_KEYS.has(key),
				);
				const largeKeys = remainingKeys.filter((key) =>
					LARGE_KEYS.has(key),
				);
				void initializeMemoryKeys(lightweightKeys).then(async () => {
					for (const key of largeKeys) {
						await yieldToMainThread();
						await initializeMemoryKeys([key]);
					}
					await runPostHydrationTasks();
					scheduleIdleOfflinePruning();
					resolve();
				});
			});
		}),
);

export async function withDbTransaction<T>(
	mode: "r" | "rw",
	tableNames: string | string[],
	callback: () => Promise<T> | T,
): Promise<T> {
	const tables = (Array.isArray(tableNames) ? tableNames : [tableNames]).map(
		(tableName) => db.table(tableName),
	);
	return db.transaction(mode, tables, callback);
}

export async function safeBulkPut<T extends AnyRecord>(
	tableName: string,
	rows: T[],
): Promise<void> {
	if (!rows.length) {
		return;
	}

	const table = db.table(tableName);
	try {
		await db.transaction("rw", table, async () => {
			await table.bulkPut(rows);
		});
	} catch (error) {
		console.warn(
			`bulkPut failed for ${tableName}; retrying row-by-row`,
			error,
		);
		await db.transaction("rw", table, async () => {
			for (const row of rows) {
				await table.put(row);
			}
		});
	}
}

function writeLocalStorageMirror(key: string, value: unknown) {
	if (typeof localStorage === "undefined") {
		return;
	}

	if (!shouldPersistToLocalStorage(key)) {
		localStorage.removeItem(`posa_${key}`);
		return;
	}

	try {
		localStorage.setItem(`posa_${key}`, JSON.stringify(value));
	} catch (error) {
		console.error("Failed to persist", key, "to localStorage", error);
	}
}

async function persistEntriesDirectly(entries: PersistEntry[]) {
	if (!entries.length) {
		return;
	}
	if (!db.isOpen()) {
		await db.open();
	}

	const rowsByTable = new Map<string, PersistEntry[]>();
	for (const entry of entries) {
		const tableName = tableForKey(entry.key);
		const rows = rowsByTable.get(tableName) || [];
		rows.push(entry);
		rowsByTable.set(tableName, rows);
	}

	await Promise.all(
		Array.from(rowsByTable.entries()).map(([tableName, rows]) =>
			safeBulkPut(tableName, rows),
		),
	);
}

function queueDirectPersist(entries: PersistEntry[]) {
	const operation = directPersistChain.then(() =>
		persistEntriesDirectly(entries),
	);
	directPersistChain = operation.catch(() => undefined);
	return operation;
}

function trackPersistOperation(operation: Promise<void>) {
	activePersistOperations.add(operation);
	void operation.then(
		() => activePersistOperations.delete(operation),
		() => activePersistOperations.delete(operation),
	);
	return operation;
}

function disablePersistWorker(error: unknown) {
	if (!persistWorkerHealthy && !persistWorker) {
		return;
	}
	persistWorkerHealthy = false;
	if (persistWorkerReadyTimeout) {
		clearTimeout(persistWorkerReadyTimeout);
		persistWorkerReadyTimeout = null;
	}
	rejectPersistWorkerReady?.(error);
	resolvePersistWorkerReady = null;
	rejectPersistWorkerReady = null;
	persistWorkerReadyPromise = null;
	traceStartupEvent("persistence_worker.disabled", "error", { error });
	console.error(
		"Persistence worker disabled; using main-thread fallback",
		error,
	);
	try {
		persistWorker?.terminate();
	} catch {
		// The worker is already unusable; direct persistence remains available.
	}
	persistWorker = null;
}

function settleWorkerBatch(batchId: number, error?: unknown) {
	const batch = inFlightWorkerBatches.get(batchId);
	if (!batch) {
		return;
	}
	inFlightWorkerBatches.delete(batchId);
	if (batch.timeout) {
		clearTimeout(batch.timeout);
	}

	if (!error) {
		batch.resolve();
		return;
	}

	disablePersistWorker(error);
	void queueDirectPersist(batch.entries).then(batch.resolve, batch.reject);
}

function failAllWorkerBatches(error: unknown) {
	disablePersistWorker(error);
	for (const batchId of Array.from(inFlightWorkerBatches.keys())) {
		settleWorkerBatch(batchId, error);
	}
}

function bindPersistWorker(worker: Worker) {
	worker.onmessage = (event: MessageEvent) => {
		const data = event.data || {};
		if (data.type === "persistence_worker_ready") {
			if (persistWorkerReadyTimeout) {
				clearTimeout(persistWorkerReadyTimeout);
				persistWorkerReadyTimeout = null;
			}
			resolvePersistWorkerReady?.();
			resolvePersistWorkerReady = null;
			rejectPersistWorkerReady = null;
			traceStartupEvent("persistence_worker.ready", "ok", {
				databaseVersion: data.databaseVersion,
				openDurationMs: data.openDurationMs,
			});
			return;
		}
		if (data.type === "persisted_batch") {
			traceStartupEvent("persistence_worker.batch", "ok", {
				batchId: Number(data.batchId),
				durationMs: data.durationMs,
				tables: data.tables,
				recordCount: data.recordCount,
			});
			settleWorkerBatch(Number(data.batchId));
		} else if (data.type === "persist_batch_failed") {
			failAllWorkerBatches(
				new Error(
					data.error ||
						`Persistence worker rejected batch ${Number(data.batchId)}`,
				),
			);
		}
	};
	worker.onerror = (event: ErrorEvent) => {
		failAllWorkerBatches(event.error || new Error(event.message));
	};
}

function initializePersistWorker() {
	if (persistWorker || typeof Worker === "undefined") return;
	const phase = startStartupPhase("persistence_worker.create", {
		databaseVersion: db.verno,
	});
	try {
		persistWorker = new Worker(
			buildPosWorkerUrl("itemWorker.js", { includeStartupTrace: true }),
			{ type: "classic" },
		);
		persistWorkerHealthy = true;
		persistWorkerReadyPromise = new Promise<void>((resolve, reject) => {
			resolvePersistWorkerReady = resolve;
			rejectPersistWorkerReady = reject;
		});
		// The rejection is observed by every queued batch. This side handler only
		// prevents an unhandled rejection when no persistence work was queued.
		void persistWorkerReadyPromise.catch(() => undefined);
		persistWorkerReadyTimeout = setTimeout(() => {
			const error = new Error(
				`Persistence worker did not become ready within ${PERSIST_WORKER_READY_TIMEOUT_MS} ms`,
			);
			traceStartupEvent("persistence_worker.ready", "timeout", {
				timeoutMs: PERSIST_WORKER_READY_TIMEOUT_MS,
			});
			failAllWorkerBatches(error);
		}, PERSIST_WORKER_READY_TIMEOUT_MS);
		bindPersistWorker(persistWorker);
		finishStartupPhase(phase, "ok");
	} catch (error) {
		persistWorker = null;
		persistWorkerHealthy = false;
		finishStartupPhase(phase, "error", { error });
		console.error("Failed to init persist worker", error);
	}
}

void startupInitPromise.finally(initializePersistWorker);

function dispatchPersistBatch(entries: PersistEntry[]) {
	if (!entries.length) {
		return Promise.resolve();
	}

	if (!persistWorker || !persistWorkerHealthy || !persistWorkerReadyPromise) {
		return queueDirectPersist(entries);
	}

	const readyPromise = persistWorkerReadyPromise;
	const batchId = nextPersistBatchId++;
	const keys = entries.map((entry) => entry.key);
	const tables = Array.from(new Set(keys.map(tableForKey)));
	traceStartupEvent("persistence_worker.batch", "info", {
		batchId,
		keys,
		tables,
		recordCount: entries.length,
		state: "queued_for_worker_ready",
	});
	const operation = new Promise<void>((resolve, reject) => {
		inFlightWorkerBatches.set(batchId, {
			entries,
			resolve,
			reject,
			timeout: null,
		});

		void readyPromise
			.then(() => {
				const batch = inFlightWorkerBatches.get(batchId);
				if (!batch) return;
				if (!persistWorker || !persistWorkerHealthy) {
					throw new Error(
						"Persistence worker became unavailable before dispatch",
					);
				}

				traceStartupEvent("persistence_worker.batch", "start", {
					batchId,
					keys,
					tables,
					recordCount: entries.length,
					timeoutMs: PERSIST_WORKER_TIMEOUT_MS,
				});
				batch.timeout = setTimeout(() => {
					traceStartupEvent("persistence_worker.batch", "timeout", {
						batchId,
						keys,
						tables,
						recordCount: entries.length,
						timeoutMs: PERSIST_WORKER_TIMEOUT_MS,
					});
					failAllWorkerBatches(
						new Error(
							`Persistence worker batch ${batchId} timed out`,
						),
					);
				}, PERSIST_WORKER_TIMEOUT_MS);
				persistWorker.postMessage({
					type: "persist_batch",
					batchId,
					entries,
				});
			})
			.catch((error) => settleWorkerBatch(batchId, error));
	});

	return operation;
}

function drainPendingPersistEntries() {
	const entries = Array.from(pendingPersistEntries, ([key, value]) => ({
		key,
		value,
	}));
	pendingPersistEntries.clear();
	return entries;
}

function flushPendingPersistBatch() {
	persistFlushScheduled = false;
	const entries = drainPendingPersistEntries();
	if (!entries.length) {
		return Promise.resolve();
	}
	return trackPersistOperation(dispatchPersistBatch(entries));
}

function schedulePersistFlush() {
	if (persistFlushScheduled) {
		return;
	}
	persistFlushScheduled = true;
	queueMicrotask(() => {
		void flushPendingPersistBatch().catch((error) => {
			console.error("Failed to persist offline batch", error);
		});
	});
}

export async function flushPersistQueue() {
	await flushPendingPersistBatch();
	while (activePersistOperations.size) {
		await Promise.all(Array.from(activePersistOperations));
	}
	await directPersistChain;
}

export async function safeBulkDelete(
	tableName: string,
	keys: Array<string | number>,
): Promise<void> {
	if (!keys.length) {
		return;
	}
	await db.table(tableName).bulkDelete(keys as any[]);
}

function toEpoch(value: unknown) {
	if (!value) {
		return Number.NaN;
	}
	const epoch = Date.parse(String(value));
	return Number.isFinite(epoch) ? epoch : Number.NaN;
}

function isOlderThan(value: unknown, cutoff: number) {
	const epoch = toEpoch(value);
	return Number.isFinite(epoch) && epoch < cutoff;
}

const PRUNE_DELETE_CHUNK_SIZE = 500;

type PruneCollectionFactory = (
	_table: Dexie.Table<any, any>,
) => Dexie.Collection<any, any>;

async function pruneCollectionInChunks(
	tableName: string,
	createCollection: PruneCollectionFactory,
	predicate: (_row: AnyRecord) => boolean,
): Promise<number> {
	const table = db.table(tableName);
	let deleted = 0;

	while (true) {
		const keys = (await createCollection(table)
			.filter((row) => predicate(row as AnyRecord))
			.limit(PRUNE_DELETE_CHUNK_SIZE)
			.primaryKeys()) as Array<string | number>;

		if (!keys.length) {
			return deleted;
		}

		await safeBulkDelete(tableName, keys);
		deleted += keys.length;

		if (keys.length < PRUNE_DELETE_CHUNK_SIZE) {
			return deleted;
		}
	}
}

function statusDateRange(
	table: Dexie.Table<any, any>,
	indexName: string,
	status: string,
	cutoffIso: string,
) {
	return table
		.where(indexName)
		.between([status, Dexie.minKey], [status, cutoffIso], false, true);
}

async function pruneInvoiceOutboxRows(cutoff: number, cutoffIso: string) {
	let deleted = 0;
	// Exhausted requests are unresolved sales, not disposable cache entries.
	for (const status of ["acknowledged"]) {
		deleted += await pruneCollectionInChunks(
			"invoice_outbox",
			(table) =>
				statusDateRange(
					table,
					"[status+acknowledged_at]",
					status,
					cutoffIso,
				),
			(row) =>
				row.status === status &&
				isOlderThan(
					row.acknowledged_at || row.updated_at || row.created_at,
					cutoff,
				),
		);
		deleted += await pruneCollectionInChunks(
			"invoice_outbox",
			(table) =>
				statusDateRange(
					table,
					"[status+updated_at]",
					status,
					cutoffIso,
				),
			(row) =>
				row.status === status &&
				!row.acknowledged_at &&
				isOlderThan(row.updated_at || row.created_at, cutoff),
		);
		deleted += await pruneCollectionInChunks(
			"invoice_outbox",
			(table) =>
				statusDateRange(
					table,
					"[status+created_at]",
					status,
					cutoffIso,
				),
			(row) =>
				row.status === status &&
				!row.acknowledged_at &&
				!row.updated_at &&
				isOlderThan(row.created_at, cutoff),
		);
	}
	return deleted;
}

async function pruneWriteQueueRows(cutoff: number, cutoffIso: string) {
	const status = "synced";
	let deleted = await pruneCollectionInChunks(
		"write_queue",
		(table) =>
			statusDateRange(
				table,
				"[status+last_attempt_at]",
				status,
				cutoffIso,
			),
		(row) =>
			row.status === status &&
			isOlderThan(row.last_attempt_at || row.created_at, cutoff),
	);
	deleted += await pruneCollectionInChunks(
		"write_queue",
		(table) =>
			statusDateRange(table, "[status+created_at]", status, cutoffIso),
		(row) =>
			row.status === status &&
			!row.last_attempt_at &&
			isOlderThan(row.created_at, cutoff),
	);
	return deleted;
}

async function pruneSyncStateRows(cutoff: number, cutoffIso: string) {
	let deleted = await pruneCollectionInChunks(
		"sync_state",
		(table) => table.where("updated_at").below(cutoffIso),
		(row) => isOlderThan(row.updated_at || row.value?.lastSyncedAt, cutoff),
	);
	deleted += await pruneCollectionInChunks(
		"sync_state",
		(table) => table.where("key").startsWith("posa_sync_state::"),
		(row) =>
			!row.updated_at && isOlderThan(row.value?.lastSyncedAt, cutoff),
	);
	return deleted;
}

async function pruneKeyvalPrefixRows(
	prefix: string,
	cutoff: number,
): Promise<number> {
	return pruneCollectionInChunks(
		"keyval",
		(table) => table.where("key").startsWith(prefix),
		(row) =>
			isOlderThan(row.value?.created_at || row.value?.updated_at, cutoff),
	);
}

export type OfflinePruneResult = {
	invoiceOutbox: number;
	writeQueue: number;
	syncState: number;
	tombstones: number;
	localTelemetry: number;
};

export async function pruneOfflineStorage(
	options: { now?: number; maxAgeDays?: number } = {},
): Promise<OfflinePruneResult> {
	await quickDbHealthCheck();
	const now = options.now || Date.now();
	const cutoff = now - (options.maxAgeDays || 30) * 24 * 60 * 60 * 1000;
	const result: OfflinePruneResult = {
		invoiceOutbox: 0,
		writeQueue: 0,
		syncState: 0,
		tombstones: 0,
		localTelemetry: 0,
	};

	const cutoffIso = new Date(cutoff).toISOString();
	result.invoiceOutbox = await pruneInvoiceOutboxRows(cutoff, cutoffIso);
	result.writeQueue = await pruneWriteQueueRows(cutoff, cutoffIso);
	result.syncState = await pruneSyncStateRows(cutoff, cutoffIso);
	result.tombstones = await pruneKeyvalPrefixRows("tombstone:", cutoff);
	result.localTelemetry = await pruneKeyvalPrefixRows(
		"local_telemetry:",
		cutoff,
	);

	return result;
}

let idlePruneScheduled = false;

export function scheduleIdleOfflinePruning() {
	if (idlePruneScheduled || typeof window === "undefined") {
		return;
	}
	idlePruneScheduled = true;
	const run = () => {
		void pruneOfflineStorage().catch((error) => {
			console.warn("Offline DB idle pruning failed", error);
		});
	};
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(run, { timeout: 10_000 });
	} else {
		window.setTimeout(run, 5_000);
	}
}

export function persist(key: string, value: unknown = memory[key]) {
	markMemoryKeyChanged(key);
	if (!shouldPersistToIndexedDb(key) && !shouldPersistToLocalStorage(key)) {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(`posa_${key}`);
		}
		return;
	}

	writeLocalStorageMirror(key, value);
	if (shouldPersistToIndexedDb(key)) {
		pendingPersistEntries.set(key, value);
		schedulePersistFlush();
	}
}

export function isOffline() {
	if (typeof window === "undefined") {
		// Not in a browser (SSR/Node), assume online (or handle explicitly if needed)
		return memory.manual_offline || false;
	}

	const {
		location: { protocol, hostname },
		navigator,
	} = window;
	const online = navigator.onLine;

	const serverOnline =
		typeof (window as AnyRecord).serverOnline === "boolean"
			? (window as AnyRecord).serverOnline
			: true;

	const isIpAddress = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
	const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
	const isDnsName = !isIpAddress && !isLocalhost;

	if (memory.manual_offline) {
		return true;
	}

	if (protocol === "https:" && isDnsName) {
		return !online || !serverOnline;
	}

	return !online || !serverOnline;
}

export function isManualOffline() {
	return memory.manual_offline || false;
}

export function setManualOffline(state) {
	memory.manual_offline = !!state;
	persist("manual_offline");
}

export function toggleManualOffline() {
	setManualOffline(!memory.manual_offline);
}

export async function assertOfflineDataCanBeCleared() {
	if (
		typeof window !== "undefined" &&
		!window.dispatchEvent(
			new Event("posa:before-cache-clear", { cancelable: true }),
		)
	)
		throw new Error(
			"The active cashier cart could not be saved. Cache clearing was cancelled.",
		);
	if (!db.isOpen()) await db.open();
	const [writes, outbox, legacy] = await Promise.all([
		db.table("write_queue").toArray(),
		db.table("invoice_outbox").toArray(),
		db.table("queue").toArray(),
	]);
	const pending =
		writes.some((row) => row.status !== "synced") ||
		outbox.some((row) => row.status !== "acknowledged") ||
		legacy.some((row) => Array.isArray(row.value) && row.value.length);
	const journals =
		typeof localStorage !== "undefined" &&
		Object.keys(localStorage).some(
			(key) =>
				key.startsWith("posa_invoice_intent_") ||
				key.startsWith("posa_cart_recovery_v1:"),
		);
	if (pending || journals)
		throw new Error(
			"Cache was kept because unsynced transactions or saved cashier carts exist. Reconcile transactions and review/export recovery data before clearing.",
		);
}

export async function clearAllCache() {
	await assertOfflineDataCanBeCleared();
	try {
		if (db.isOpen()) {
			await db.close();
		}
		await Dexie.delete("posawesome_offline");
		await db.open();
	} catch (e) {
		console.error("Failed to clear IndexedDB cache", e);
		throw e;
	}

	if (typeof localStorage !== "undefined") {
		Object.keys(localStorage).forEach((key) => {
			if (key.startsWith("posa_")) {
				localStorage.removeItem(key);
			}
		});
	}

	// Reset memory state
	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.offline_cash_movements = [];
	memory.invoice_outbox_mode = "off";
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.customer_storage = [];
	memory.items_last_sync = null;
	memory.customers_last_sync = null;
	memory.payment_methods_last_sync = null;
	memory.pos_opening_storage = null;
	memory.opening_dialog_storage = null;
	memory.sales_persons_storage = [];
	memory.price_list_cache = {};
	memory.item_details_cache = {};
	memory.tax_template_cache = {};
	memory.tax_inclusive = false;
	memory.manual_offline = false;
	memory.item_groups_cache = [];
	memory.coupons_cache = {};
	memory.bootstrap_snapshot = null;
	memory.bootstrap_snapshot_status = null;
	memory.bootstrap_limited_mode = false;
}

export async function forceClearAllCache() {
	await clearAllCache();
	// Extended clearing logic
	memory.translation_cache = {};
	memory.pricing_rules_snapshot = [];
	memory.pricing_rules_context = null;
	memory.pricing_rules_last_sync = null;
	memory.pricing_rules_stale_at = null;
	memory.print_template = "";
	memory.terms_and_conditions = "";
	memory.cache_ready = false;
	memory.bootstrap_snapshot = null;
	memory.bootstrap_snapshot_status = null;
	memory.bootstrap_limited_mode = false;
}

export async function clearDerivedOfflineCaches() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) {
			await db.open();
		}

		await Promise.all(
			DERIVED_OFFLINE_TABLES_TO_CLEAR.map((tableName) =>
				db
					.table(tableName)
					.clear()
					.catch((error) => {
						console.warn(
							`Failed to clear derived table ${tableName}`,
							error,
						);
					}),
			),
		);

		await Promise.all(
			[
				...DERIVED_OFFLINE_CACHE_KEYS,
				...DERIVED_OFFLINE_METADATA_KEYS,
			].map((key) => deletePersistedKey(key)),
		);
	} catch (error) {
		console.error("Failed to clear derived offline caches", error);
		throw error;
	} finally {
		[
			...DERIVED_OFFLINE_CACHE_KEYS,
			...DERIVED_OFFLINE_METADATA_KEYS,
		].forEach((key) => {
			resetMemoryKey(key);
			removeLocalStorageMirror(key);
		});
	}
}

export async function quickDbHealthCheck() {
	try {
		if (!db.isOpen()) {
			await db.open();
		}
		await db.table(tableForKey("health_check")).get("health_check");
		return true;
	} catch (e) {
		console.warn("DB quick health check failed", e);
		return false;
	}
}

export async function repairDbAfterFailedHealthCheck(error?: unknown) {
	try {
		if (db.isOpen()) {
			db.close();
		}
		await db.open();
		return true;
	} catch (reopenError) {
		console.error("DB reopen failed", reopenError);
		if (isCorruptionError(reopenError) || isCorruptionError(error)) {
			// Never delete a POS database automatically. It may contain drafts,
			// invoice intents, or unsynced payments. Recovery is an explicit
			// export-first operator action.
			traceStartupEvent("indexeddb.repair_required", "error", {
				error,
				reopenError,
				automaticDeleteSuppressed: true,
			});
		}
	}
	return false;
}

export async function getOfflineStorageDiagnostics() {
	const phase = startStartupPhase("indexeddb.diagnostics");
	try {
		if (!db.isOpen()) await db.open();
		const tableCounts = Object.fromEntries(
			await Promise.all(
				db.tables.map(async (table) => [
					table.name,
					await table.count(),
				]),
			),
		);
		const estimate =
			typeof navigator !== "undefined" && navigator.storage?.estimate
				? await navigator.storage.estimate()
				: {};
		const result = {
			database: db.name,
			version: db.verno,
			tableCounts,
			usage: estimate.usage ?? null,
			quota: estimate.quota ?? null,
		};
		finishStartupPhase(phase, "ok", result);
		return result;
	} catch (error) {
		finishStartupPhase(phase, "error", { error });
		throw error;
	}
}

export async function exportOfflineRecoveryData() {
	if (!db.isOpen()) await db.open();
	const [invoiceOutbox, writeQueue, legacyQueue, cashierHandovers] =
		await Promise.all([
			db.table("invoice_outbox").toArray(),
			db.table("write_queue").toArray(),
			db.table("queue").toArray(),
			db
				.table("keyval")
				.filter((row) => row.key?.startsWith("posa_cashier_handover:"))
				.toArray(),
		]);
	const invoiceIntentJournal: Record<string, unknown> = {};
	const cashierCarts: Record<string, unknown> = {};
	if (typeof localStorage !== "undefined") {
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (
				!key?.startsWith("posa_invoice_intent_") &&
				!key?.startsWith("posa_cart_recovery_v1:")
			)
				continue;
			const target = key.startsWith("posa_cart_recovery_v1:")
				? cashierCarts
				: invoiceIntentJournal;
			try {
				target[key] = JSON.parse(localStorage.getItem(key) || "null");
			} catch {
				target[key] = localStorage.getItem(key);
			}
		}
	}
	return {
		exportedAt: new Date().toISOString(),
		database: db.name,
		version: db.verno,
		invoiceOutbox,
		writeQueue,
		legacyQueue,
		invoiceIntentJournal,
		cashierCarts,
		cashierHandovers,
	};
}

if (typeof window !== "undefined") {
	(window as AnyRecord).__POS_OFFLINE_DIAGNOSTICS__ = {
		inspect: getOfflineStorageDiagnostics,
		exportRecoveryData: exportOfflineRecoveryData,
	};
}

export async function checkDbHealth() {
	const healthy = await quickDbHealthCheck();
	if (healthy) {
		return true;
	}
	return repairDbAfterFailedHealthCheck();
}

export function queueHealthCheck() {
	const cutoff = legacyQueuePruneCutoff();
	return PENDING_OFFLINE_QUEUE_KEYS.some((key) =>
		getMemoryQueueList(key).some((entry) =>
			shouldPruneLegacyQueueEntry(entry, cutoff),
		),
	);
}

const LEGACY_QUEUE_PRUNE_MAX_AGE_DAYS = 30;
const LEGACY_QUEUE_TERMINAL_STATUSES = new Set(["acknowledged", "synced"]);

function legacyQueuePruneCutoff(
	options: { now?: number; maxAgeDays?: number } = {},
) {
	return (
		(options.now || Date.now()) -
		(options.maxAgeDays || LEGACY_QUEUE_PRUNE_MAX_AGE_DAYS) *
			24 *
			60 *
			60 *
			1000
	);
}

function getMemoryQueueList(key: string): AnyRecord[] {
	return Array.isArray(memory[key]) ? memory[key] : [];
}

function getLegacyQueueTimestamp(entry: AnyRecord) {
	return (
		entry?.acknowledged_at ||
		entry?.synced_at ||
		entry?.last_attempt_at ||
		entry?.updated_at ||
		entry?.created_at
	);
}

function shouldPruneLegacyQueueEntry(entry: AnyRecord, cutoff: number) {
	const status = String(entry?.status || "").toLowerCase();
	return (
		LEGACY_QUEUE_TERMINAL_STATUSES.has(status) &&
		isOlderThan(getLegacyQueueTimestamp(entry), cutoff)
	);
}

export function purgeOldQueueEntries(
	options: { now?: number; maxAgeDays?: number } = {},
) {
	const cutoff = legacyQueuePruneCutoff(options);
	let pruned = 0;

	for (const key of PENDING_OFFLINE_QUEUE_KEYS) {
		const list = getMemoryQueueList(key);
		if (!list.length) {
			continue;
		}

		const retained = list.filter(
			(entry) => !shouldPruneLegacyQueueEntry(entry, cutoff),
		);
		const removed = list.length - retained.length;
		if (!removed) {
			continue;
		}

		memory[key] = retained;
		persist(key);
		pruned += removed;
	}

	return pruned;
}
