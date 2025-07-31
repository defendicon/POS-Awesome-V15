import Dexie from "dexie/dist/dexie.mjs";
import { withWriteLock } from "./db-utils.js";

// --- Dexie initialization ---------------------------------------------------
export const db = new Dexie("posawesome_offline");
db.version(4).stores({
	keyval: "&key",
	queue: "&key",
	cache: "&key",
	items: "&item_code,item_name,item_group",
	item_prices: "&[price_list+item_code],price_list,item_code",
});

export const KEY_TABLE_MAP = {
	offline_invoices: "queue",
	offline_customers: "queue",
	offline_payments: "queue",
	item_details_cache: "cache",
	customer_storage: "cache",
};

export function tableForKey(key) {
	return KEY_TABLE_MAP[key] || "keyval";
}

function isCorruptionError(err) {
	if (!err) return false;
	const msg = err.message ? err.message.toLowerCase() : "";
	return (
		["VersionError", "InvalidStateError", "NotFoundError"].includes(err.name) || msg.includes("corrupt")
	);
}

export async function checkDbHealth() {
	try {
		await db.table(tableForKey("health_check")).get("health_check");
		return true;
	} catch (e) {
		console.error("IndexedDB health check failed", e);
		try {
			if (db.isOpen()) {
				await db.close();
			}
			console.log("Attempting to reopen IndexedDB without deleting");
			await db.open();
			console.log("IndexedDB reopened successfully");
			return true;
		} catch (re) {
			console.error("Failed to reopen IndexedDB", re);
			if (isCorruptionError(re)) {
				console.log("IndexedDB appears corrupted. Recreating database...");
				try {
					await Dexie.delete("posawesome_offline");
					await db.open();
					console.log("IndexedDB recreated and opened successfully");
					return true;
				} catch (recreateErr) {
					console.error("Failed to recreate IndexedDB", recreateErr);
				}
			}
			return false;
		}
	}
}

let persistWorker = null;

export function initPersistWorker() {
	if (persistWorker || typeof Worker === "undefined") return;
	try {
		// Load the worker without a query string so the service worker
		// can serve the cached version when offline.
		const workerUrl = "/assets/posawesome/js/posapp/workers/itemWorker.js";
		try {
			persistWorker = new Worker(workerUrl, { type: "classic" });
		} catch (err) {
			persistWorker = new Worker(workerUrl, { type: "module" });
		}
	} catch (e) {
		console.error("Failed to init persist worker", e);
		persistWorker = null;
	}
}

export function terminatePersistWorker() {
	if (persistWorker) {
		try {
			persistWorker.terminate();
		} catch (e) {
			console.error("Failed to terminate persist worker", e);
		}
		persistWorker = null;
	}
}

// Initialize worker immediately
initPersistWorker();

// Persist queue for batching operations
const persistQueue = {};
let persistTimeout = null;

export function addToPersistQueue(key, value) {
	persistQueue[key] = value;

	if (!persistTimeout) {
		persistTimeout = setTimeout(flushPersistQueue, 100);
	}
}

function flushPersistQueue() {
	const keys = Object.keys(persistQueue);
	if (keys.length) {
		keys.forEach((key) => {
			persist(key, persistQueue[key]);
			delete persistQueue[key];
		});
	}
	persistTimeout = null;
}

export function persist(key, value) {
	// Run health check in background; ignore errors
	checkDbHealth().catch(() => {});
	if (persistWorker) {
		let cleanValue = value;
		try {
			cleanValue =
				typeof structuredClone === "function"
					? structuredClone(value)
					: JSON.parse(JSON.stringify(value));
		} catch (e) {
			console.error("Failed to serialize", key, e);
		}
		try {
			persistWorker.postMessage({ type: "persist", key, value: cleanValue });
		} catch (e) {
			console.error(`Failed to postMessage for ${key}`, e);
		}
		return;
	}

	const table = tableForKey(key);
	withWriteLock(() =>
		db
			.table(table)
			.put({ key, value })
			.catch((e) => console.error(`Failed to persist ${key}`, e)),
	);

	if (typeof localStorage !== "undefined" && key !== "price_list_cache") {
		try {
			localStorage.setItem(`posa_${key}`, JSON.stringify(value));
		} catch (err) {
			console.error("Failed to persist", key, "to localStorage", err);
		}
	}
}

export const initPromise = new Promise((resolve) => {
	const init = async () => {
		try {
			await db.open();
			// Initialization will be handled by the cache.js module
			resolve();
		} catch (e) {
			console.error("Failed to initialize offline DB", e);
			resolve(); // Resolve anyway to prevent blocking
		}
	};

	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(init);
	} else {
		setTimeout(init, 0);
	}
});
