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
 * access. `initPromise` populates it at startup by reading each key from Dexie
 * first, then falling back to `localStorage` (prefix `posa_`), then retaining
 * the default value declared in the object literal. Await `initPromise` before
 * reading any `memory` value in application code.
 *
 * **Persist write path (`persist`)**
 * `persist(key)` is the single write path for all `memory` entries. On each call
 * it writes once to the Dexie table determined by `KEY_TABLE_MAP`. Only a small,
 * explicit set of lightweight settings/metadata keys are additionally mirrored to
 * `localStorage` under `posa_<key>`. When a Web Worker is available
 * (`persistWorker`), the Dexie/localStorage writes are offloaded to avoid blocking
 * the main thread during heavy sync passes.
 *
 * **Relationship to the rest of the offline layer**
 * `cache.ts` reads and writes through `memory`, calling `persist(key)` on every
 * mutation. For large, searchable datasets (`items`, `customers`) it also issues
 * `db` table queries directly. Domain queue modules (`invoices`, `payments`, etc.)
 * and sync adapters import `db`, `memory`, and `persist` from this file.
 * `checkDbHealth` is called defensively before every IndexedDB operation
 * elsewhere in the layer; it will reopen, or delete and recreate, the database
 * on detected corruption.
 */
import Dexie from "dexie/dist/dexie.mjs";

type AnyRecord = Record<string, any>;

// --- Dexie initialization ---------------------------------------------------
export const db = new Dexie("posawesome_offline");

const BASE_SCHEMA = {
	keyval: "&key",
	queue: "&key",
	write_queue:
		"++queue_id,entity_type,status,created_at,last_attempt_at,retry_count,&idempotency_key,[entity_type+status]",
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
	sync_state: "&key",
};

export const KEY_TABLE_MAP: Record<string, string> = {
	offline_invoices: "queue",
	offline_customers: "queue",
	offline_payments: "queue",
	offline_cash_movements: "queue",
	item_details_cache: "cache",
	customer_storage: "cache",
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
	"bootstrap_snapshot",
	"bootstrap_snapshot_status",
	"bootstrap_limited_mode",
	"cache_ready",
	"stock_cache_ready",
	"schema_signature",
	"tax_inclusive",
]);

const MEMORY_ONLY_KEYS = new Set([
	"customer_storage",
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
	"item_prices",
	"customers",
	"cache",
	"local_stock",
	"coupons",
	"item_groups",
	"translations",
	"pricing_rules",
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

let persistWorker: Worker | null = null;
if (typeof Worker !== "undefined") {
	try {
		// Use the plain URL so the service worker cache matches when offline
		const workerUrl =
			"/assets/posawesome/dist/js/posapp/workers/itemWorker.js";
		persistWorker = new Worker(workerUrl, { type: "classic" });
	} catch (e) {
		console.error("Failed to init persist worker", e);
		persistWorker = null;
	}
}

const MEMORY_DEFAULTS: AnyRecord = {
	offline_invoices: [],
	offline_customers: [],
	offline_payments: [],
	offline_cash_movements: [],
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
		db.table(primaryTable).delete(key).catch((error) => {
			console.warn(`Failed to delete ${key} from ${primaryTable}`, error);
		});
	const tasks = [deletePrimary()];

	if (primaryTable !== "keyval") {
		tasks.push(
			db.table("keyval").delete(key).catch((error) => {
				console.warn(`Failed to delete ${key} fallback from keyval`, error);
			}),
		);
	}

	await Promise.all(tasks);
}

export const initPromise = new Promise<void>((resolve) => {
	const init = async () => {
		try {
			await db.open();
			for (const key of Object.keys(memory)) {
				const table = tableForKey(key);
				let stored = await db.table(table).get(key);
				if (
					(!stored || stored.value === undefined) &&
					table !== "keyval"
				) {
					stored = await db.table("keyval").get(key);
				}
				if (stored && stored.value !== undefined) {
					memory[key] = stored.value;
					continue;
				}
				if (typeof localStorage !== "undefined") {
					const ls = localStorage.getItem(`posa_${key}`);
					if (ls) {
						try {
							memory[key] = JSON.parse(ls);
							continue;
						} catch (err) {
							console.error(
								"Failed to parse localStorage for",
								key,
								err,
							);
						}
					}
				}
			}
		} catch (e) {
			console.error("Failed to initialize offline DB", e);
		} finally {
			resolve();
		}
	};

	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(init);
	} else {
		setTimeout(init, 0);
	}
});

export function persist(key: string, value: unknown = memory[key]) {
	if (!shouldPersistToIndexedDb(key) && !shouldPersistToLocalStorage(key)) {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(`posa_${key}`);
		}
		return;
	}

	if (persistWorker) {
		let clean = value;
		try {
			clean = JSON.parse(JSON.stringify(value));
		} catch (e) {
			console.error("Failed to serialize", key, e);
		}
		try {
			persistWorker.postMessage({ type: "persist", key, value: clean });
			return;
		} catch (e) {
			console.error("Failed to persist via worker", key, e);
		}
	}

	if (shouldPersistToIndexedDb(key)) {
		const table = tableForKey(key);
		db.table(table)
			.put({ key, value })
			.catch((e) => console.error(`Failed to persist ${key}`, e));
	}

	if (typeof localStorage !== "undefined") {
		if (shouldPersistToLocalStorage(key)) {
			try {
				localStorage.setItem(`posa_${key}`, JSON.stringify(value));
			} catch (err) {
				console.error("Failed to persist", key, "to localStorage", err);
			}
		} else {
			localStorage.removeItem(`posa_${key}`);
		}
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

export async function clearAllCache() {
	try {
		if (db.isOpen()) {
			await db.close();
		}
		await Dexie.delete("posawesome_offline");
		await db.open();
	} catch (e) {
		console.error("Failed to clear IndexedDB cache", e);
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
				db.table(tableName).clear().catch((error) => {
					console.warn(`Failed to clear derived table ${tableName}`, error);
				}),
			),
		);

		await Promise.all(
			[...DERIVED_OFFLINE_CACHE_KEYS, ...DERIVED_OFFLINE_METADATA_KEYS].map(
				(key) => deletePersistedKey(key),
			),
		);
	} catch (error) {
		console.error("Failed to clear derived offline caches", error);
		throw error;
	} finally {
		[...DERIVED_OFFLINE_CACHE_KEYS, ...DERIVED_OFFLINE_METADATA_KEYS].forEach(
			(key) => {
				resetMemoryKey(key);
				removeLocalStorageMirror(key);
			},
		);
	}
}

export async function checkDbHealth() {
	try {
		if (!db.isOpen()) {
			await db.open();
		}
		await db.table(tableForKey("health_check")).get("health_check");
		return true;
	} catch (e) {
		console.error("DB Health Check Failed", e);
		try {
			if (db.isOpen()) {
				db.close();
			}
			await db.open();
			return true;
		} catch (reopenError) {
			console.error("DB reopen failed", reopenError);
			if (isCorruptionError(reopenError)) {
				try {
					await Dexie.delete("posawesome_offline");
					await db.open();
					return true;
				} catch (recreateError) {
					console.error("DB recreate failed", recreateError);
				}
			}
		}
		return false;
	}
}

export function queueHealthCheck() {
	const threshold = 1000;
	return (
		memory.offline_invoices.length > threshold ||
		memory.offline_customers.length > threshold ||
		memory.offline_payments.length > threshold ||
		memory.offline_cash_movements.length > threshold
	);
}

export function purgeOldQueueEntries() {
	const threshold = 1000;
	const purge = (list: any[]) => {
		if (list.length > threshold) {
			// Keep the newest items
			list.splice(0, list.length - threshold);
		}
	};
	purge(memory.offline_invoices);
	purge(memory.offline_customers);
	purge(memory.offline_payments);
	purge(memory.offline_cash_movements);
	persist("offline_invoices");
	persist("offline_customers");
	persist("offline_payments");
	persist("offline_cash_movements");
}
