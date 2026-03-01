import Dexie from "dexie/dist/dexie.mjs";

type AnyRecord = Record<string, any>;

// --- Dexie initialization ---------------------------------------------------
export const db = new Dexie("posawesome_offline");

const BASE_SCHEMA = {
	keyval: "&key",
	queue: "&key",
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

function tableForKey(key: string) {
	return KEY_TABLE_MAP[key] || "keyval";
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

let persistWorker: Worker | null = null;
let workerRequestId = 0;
const workerPendingRequests = new Map<
	number,
	{
		resolve: (value: unknown) => void;
		reject: (reason?: unknown) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

function rejectPendingWorkerRequests(error: unknown) {
	for (const pending of workerPendingRequests.values()) {
		clearTimeout(pending.timeoutId);
		pending.reject(error);
	}
	workerPendingRequests.clear();
}

function disablePersistWorker(error: unknown) {
	rejectPendingWorkerRequests(
		error instanceof Error ? error : new Error("Item worker failed"),
	);

	if (!persistWorker) {
		return;
	}

	try {
		persistWorker.removeEventListener("message", handlePersistWorkerMessage);
		persistWorker.removeEventListener("error", handlePersistWorkerFailure);
		persistWorker.terminate();
	} catch (terminateError) {
		console.error("Failed to terminate broken item worker", terminateError);
	} finally {
		persistWorker = null;
	}
}

function handlePersistWorkerMessage(event: MessageEvent) {
	const payload = event.data || {};
	const requestId = payload?.requestId;
	if (typeof requestId !== "number") {
		return;
	}

	const pending = workerPendingRequests.get(requestId);
	if (!pending) {
		return;
	}

	clearTimeout(pending.timeoutId);
	workerPendingRequests.delete(requestId);

	if (payload?.type === "worker_response") {
		pending.resolve(payload.payload);
		return;
	}

	const error =
		payload?.payload?.message ||
		payload?.error ||
		"Item worker request failed";
	pending.reject(new Error(String(error)));
}

function handlePersistWorkerFailure(error: unknown) {
	disablePersistWorker(error);
}

if (typeof Worker !== "undefined") {
	try {
		// Use the plain URL so the service worker cache matches when offline
		const workerUrl =
			"/assets/posawesome/dist/js/posapp/workers/itemWorker.js";
		persistWorker = new Worker(workerUrl, { type: "classic" });
		persistWorker.addEventListener("message", handlePersistWorkerMessage);
		persistWorker.addEventListener("error", handlePersistWorkerFailure);
	} catch (e) {
		console.error("Failed to init persist worker", e);
		persistWorker = null;
	}
}

export function hasItemWorker() {
	return !!persistWorker;
}

export function sendItemWorkerRequest<T = unknown>(
	type: string,
	payload: Record<string, unknown> = {},
	timeoutMs = 10000,
): Promise<T> {
	if (!persistWorker) {
		return Promise.reject(new Error("Item worker unavailable"));
	}

	const requestId = ++workerRequestId;

	return new Promise<T>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			workerPendingRequests.delete(requestId);
			reject(new Error(`Item worker timed out for ${type}`));
		}, timeoutMs);

		workerPendingRequests.set(requestId, {
			resolve: (value) => resolve(value as T),
			reject,
			timeoutId,
		});

		try {
			persistWorker!.postMessage({
				type,
				requestId,
				payload,
			});
		} catch (error) {
			clearTimeout(timeoutId);
			workerPendingRequests.delete(requestId);
			reject(error);
		}
	});
}

export const memory: AnyRecord = {
	offline_invoices: [],
	offline_customers: [],
	offline_payments: [],
	offline_cash_movements: [],
	pos_last_sync_totals: { pending: 0, synced: 0, drafted: 0 },
	uom_cache: {},
	offers_cache: [],
	customer_balance_cache: {},
	local_stock_cache: {},
	stock_cache_ready: false,
	customer_storage: [],
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
};

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

	const table = tableForKey(key);
	db.table(table)
		.put({ key, value })
		.catch((e) => console.error(`Failed to persist ${key}`, e));
	if (table !== "keyval") {
		db.table("keyval")
			.put({ key, value })
			.catch((e) => console.error(`Failed to mirror ${key} to keyval`, e));
	}

	if (typeof localStorage !== "undefined" && !LARGE_KEYS.has(key)) {
		try {
			localStorage.setItem(`posa_${key}`, JSON.stringify(value));
		} catch (err) {
			console.error("Failed to persist", key, "to localStorage", err);
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
