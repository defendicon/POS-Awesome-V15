import {
	db,
	persist,
	checkDbHealth,
	terminatePersistWorker,
	initPersistWorker,
	tableForKey,
} from "./core.js";
import { getAllByCursor } from "./db-utils.js";
import { clearPriceListCache } from "./items.js";
import Dexie from "dexie/dist/dexie.mjs";

// Increment this number whenever the cache data structure changes
export const CACHE_VERSION = 1;

export const MAX_QUEUE_ITEMS = 1000;

// Memory cache object
export const memory = {
	offline_invoices: [],
	offline_customers: [],
	offline_payments: [],
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
	item_details_cache: {},
	tax_template_cache: {},
	translation_cache: {},
	coupons_cache: {},
	item_groups_cache: [],
	items_last_sync: null,
	customers_last_sync: null,
	// Track the current cache schema version
	cache_version: CACHE_VERSION,
	cache_ready: false,
        tax_inclusive: false,
        manual_offline: false,
        print_template: "",
        terms_and_conditions: "",
};

// Initialize memory from IndexedDB and expose a promise for consumers
export const memoryInitPromise = (async () => {
	try {
		await checkDbHealth();
		for (const key of Object.keys(memory)) {
			const stored = await db.table(tableForKey(key)).get(key);
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
						console.error("Failed to parse localStorage for", key, err);
					}
				}
			}
		}

		// Verify cache version and clear outdated caches
		const versionEntry = await db.table(tableForKey("cache_version")).get("cache_version");
		let storedVersion = versionEntry ? versionEntry.value : null;
		if (!storedVersion && typeof localStorage !== "undefined") {
			const v = localStorage.getItem("posa_cache_version");
			if (v) storedVersion = parseInt(v, 10);
		}
		if (storedVersion !== CACHE_VERSION) {
			await forceClearAllCache();
			memory.cache_version = CACHE_VERSION;
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("posa_cache_version", CACHE_VERSION);
			}
			persist("cache_version", CACHE_VERSION);
		} else {
			memory.cache_version = storedVersion || CACHE_VERSION;
		}
		// Mark caches initialized
		memory.cache_ready = true;
		persist("cache_ready", true);
	} catch (e) {
		console.error("Failed to initialize memory from DB", e);
	}
})();

// Reset cached invoices and customers after syncing
export function resetOfflineState() {
	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };

	persist("offline_invoices", memory.offline_invoices);
	persist("offline_customers", memory.offline_customers);
	persist("offline_payments", memory.offline_payments);
	persist("pos_last_sync_totals", memory.pos_last_sync_totals);
}

export function reduceCacheUsage() {
	clearPriceListCache();
	memory.item_details_cache = {};
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.coupons_cache = {};
	memory.item_groups_cache = [];
	persist("item_details_cache", memory.item_details_cache);
	persist("uom_cache", memory.uom_cache);
	persist("offers_cache", memory.offers_cache);
	persist("customer_balance_cache", memory.customer_balance_cache);
	persist("local_stock_cache", memory.local_stock_cache);
	persist("stock_cache_ready", memory.stock_cache_ready);
	persist("coupons_cache", memory.coupons_cache);
	persist("item_groups_cache", memory.item_groups_cache);
}

// --- Generic getters and setters for cached data ----------------------------

export async function getStoredItems() {
        try {
                await checkDbHealth();
                if (!db.isOpen()) await db.open();
                const items = await db.table("items").toArray();
               return items;
        } catch (e) {
                console.error("Failed to get stored items", e);
                return [];
        }
}

export async function getStoredItemsCount() {
        try {
                await checkDbHealth();
                if (!db.isOpen()) await db.open();
                return await db.table("items").count();
        } catch (e) {
                console.error("Failed to count stored items", e);
                return 0;
        }
}

export async function saveItems(items) {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		let cleanItems;
		try {
			cleanItems = JSON.parse(JSON.stringify(items));
		} catch (err) {
			console.error("Failed to serialize items", err);
			cleanItems = [];
		}
		await db.table("items").bulkPut(cleanItems);
	} catch (e) {
		console.error("Failed to save items", e);
	}
}

export async function clearStoredItems() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		await db.table("items").clear();
	} catch (e) {
		console.error("Failed to clear stored items", e);
	}
}

export function getCustomerStorage() {
	return memory.customer_storage || [];
}

export function setCustomerStorage(customers) {
	try {
		memory.customer_storage = customers.map((c) => ({
			name: c.name,
			customer_name: c.customer_name,
			mobile_no: c.mobile_no,
			email_id: c.email_id,
			primary_address: c.primary_address,
			tax_id: c.tax_id,
		}));
	} catch (e) {
		console.error("Failed to trim customers for storage", e);
		memory.customer_storage = [];
	}
	persist("customer_storage", memory.customer_storage);
}

export function getItemsLastSync() {
	return memory.items_last_sync || null;
}

export function setItemsLastSync(ts) {
	memory.items_last_sync = ts;
	persist("items_last_sync", memory.items_last_sync);
}

export function getCustomersLastSync() {
	return memory.customers_last_sync || null;
}

export function setCustomersLastSync(ts) {
	memory.customers_last_sync = ts;
	persist("customers_last_sync", memory.customers_last_sync);
}

export function getSalesPersonsStorage() {
	return memory.sales_persons_storage || [];
}

export function setSalesPersonsStorage(data) {
	try {
		let clean;
		try {
			clean = JSON.parse(JSON.stringify(data));
		} catch (err) {
			console.error("Failed to serialize sales persons", err);
			clean = [];
		}
		memory.sales_persons_storage = clean;
		persist("sales_persons_storage", memory.sales_persons_storage);
	} catch (e) {
		console.error("Failed to set sales persons storage", e);
	}
}

export function getOpeningStorage() {
	return memory.pos_opening_storage || null;
}

export function setOpeningStorage(data) {
	try {
		let clean;
		try {
			clean = JSON.parse(JSON.stringify(data));
		} catch (err) {
			console.error("Failed to serialize opening storage", err);
			clean = {};
		}
		memory.pos_opening_storage = clean;
		persist("pos_opening_storage", memory.pos_opening_storage);
	} catch (e) {
		console.error("Failed to set opening storage", e);
	}
}

export function clearOpeningStorage() {
	try {
		memory.pos_opening_storage = null;
		persist("pos_opening_storage", memory.pos_opening_storage);
	} catch (e) {
		console.error("Failed to clear opening storage", e);
	}
}

export function getOpeningDialogStorage() {
	return memory.opening_dialog_storage || null;
}

export function setOpeningDialogStorage(data) {
	try {
		let clean;
		try {
			clean = JSON.parse(JSON.stringify(data));
		} catch (err) {
			console.error("Failed to serialize opening dialog", err);
			clean = {};
		}
		memory.opening_dialog_storage = clean;
		persist("opening_dialog_storage", memory.opening_dialog_storage);
	} catch (e) {
		console.error("Failed to set opening dialog storage", e);
	}
}

export function getTaxTemplate(name) {
	try {
		const cache = memory.tax_template_cache || {};
		return cache[name] || null;
	} catch (e) {
		console.error("Failed to get cached tax template", e);
		return null;
	}
}

export function setTaxTemplate(name, doc) {
	try {
		const cache = memory.tax_template_cache || {};
		let cleanDoc;
		try {
			cleanDoc = JSON.parse(JSON.stringify(doc));
		} catch (err) {
			console.error("Failed to serialize tax template", err);
			cleanDoc = doc ? { ...doc } : {};
		}
		cache[name] = cleanDoc;
		memory.tax_template_cache = cache;
		persist("tax_template_cache", memory.tax_template_cache);
	} catch (e) {
		console.error("Failed to cache tax template", e);
	}
}

export function getPrintTemplate() {
        try {
                return memory.print_template || "";
        } catch (e) {
                console.error("Failed to get print template", e);
                return "";
        }
}

export function setPrintTemplate(template) {
        try {
                memory.print_template = template || "";
                persist("print_template", memory.print_template);
        } catch (e) {
                console.error("Failed to set print template", e);
        }
}

export function getTermsAndConditions() {
        try {
                return memory.terms_and_conditions || "";
        } catch (e) {
                console.error("Failed to get terms and conditions", e);
                return "";
        }
}

export function setTermsAndConditions(terms) {
        try {
                memory.terms_and_conditions = terms || "";
                persist("terms_and_conditions", memory.terms_and_conditions);
        } catch (e) {
                console.error("Failed to set terms and conditions", e);
        }
}

export function getTranslationsCache(lang) {
	try {
		const cache = memory.translation_cache || {};
		return cache[lang] || null;
	} catch (e) {
		console.error("Failed to get cached translations", e);
		return null;
	}
}

export function saveTranslationsCache(lang, data) {
	try {
		const cache = memory.translation_cache || {};
		cache[lang] = data;
		memory.translation_cache = cache;
		persist("translation_cache", memory.translation_cache);
	} catch (e) {
		console.error("Failed to cache translations", e);
	}
}

export function setLastSyncTotals(totals) {
	memory.pos_last_sync_totals = totals;
	persist("pos_last_sync_totals", memory.pos_last_sync_totals);
}

export function getLastSyncTotals() {
	return memory.pos_last_sync_totals;
}

export function getTaxInclusiveSetting() {
	return !!memory.tax_inclusive;
}

export function setTaxInclusiveSetting(value) {
	memory.tax_inclusive = !!value;
	persist("tax_inclusive", memory.tax_inclusive);
}

export function isCacheReady() {
	return !!memory.cache_ready;
}

export function isManualOffline() {
	return memory.manual_offline || false;
}

export function setManualOffline(state) {
	memory.manual_offline = !!state;
	persist("manual_offline", memory.manual_offline);
}

export function toggleManualOffline() {
	setManualOffline(!memory.manual_offline);
}

export function queueHealthCheck(limit = MAX_QUEUE_ITEMS) {
	const inv = (memory.offline_invoices || []).length > limit;
	const cus = (memory.offline_customers || []).length > limit;
	const pay = (memory.offline_payments || []).length > limit;
	return inv || cus || pay;
}

export function purgeOldQueueEntries(limit = MAX_QUEUE_ITEMS) {
	if (Array.isArray(memory.offline_invoices) && memory.offline_invoices.length > limit) {
		memory.offline_invoices.splice(0, memory.offline_invoices.length - limit);
		persist("offline_invoices", memory.offline_invoices);
	}
	if (Array.isArray(memory.offline_customers) && memory.offline_customers.length > limit) {
		memory.offline_customers.splice(0, memory.offline_customers.length - limit);
		persist("offline_customers", memory.offline_customers);
	}
	if (Array.isArray(memory.offline_payments) && memory.offline_payments.length > limit) {
		memory.offline_payments.splice(0, memory.offline_payments.length - limit);
		persist("offline_payments", memory.offline_payments);
	}
}

export async function clearAllCache() {
	try {
		await checkDbHealth();
		terminatePersistWorker();
		if (db.isOpen()) {
			await db.close();
		}
		await Dexie.delete("posawesome_offline");
		await db.open();
		initPersistWorker();
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

	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.coupons_cache = {};
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.customer_storage = [];
	memory.items_last_sync = null;
	memory.customers_last_sync = null;
	memory.pos_opening_storage = null;
	memory.opening_dialog_storage = null;
	memory.sales_persons_storage = [];
	memory.item_details_cache = {};
	memory.tax_template_cache = {};
	memory.item_groups_cache = [];
	memory.cache_version = CACHE_VERSION;
	memory.tax_inclusive = false;
	memory.manual_offline = false;

	await clearPriceListCache();

	persist("cache_version", CACHE_VERSION);
}

// Faster cache clearing without reopening the database
export async function forceClearAllCache() {
	terminatePersistWorker();
	if (typeof localStorage !== "undefined") {
		Object.keys(localStorage).forEach((key) => {
			if (key.startsWith("posa_")) {
				localStorage.removeItem(key);
			}
		});
	}

	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.coupons_cache = {};
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.customer_storage = [];
	memory.items_last_sync = null;
	memory.customers_last_sync = null;
	memory.pos_opening_storage = null;
	memory.opening_dialog_storage = null;
	memory.sales_persons_storage = [];
	memory.item_details_cache = {};
	memory.tax_template_cache = {};
	memory.item_groups_cache = [];
	memory.cache_version = CACHE_VERSION;
	memory.tax_inclusive = false;
	memory.manual_offline = false;

	if (typeof localStorage !== "undefined") {
		localStorage.setItem("posa_cache_version", CACHE_VERSION);
	}

	await clearPriceListCache();

	// Delete the IndexedDB database in the background
	try {
		await Dexie.delete("posawesome_offline");
		await db.open();
		initPersistWorker();
	} catch (e) {
		console.error("Failed to clear IndexedDB cache", e);
	}

	persist("cache_version", CACHE_VERSION);
}

/**
 * Estimates the current cache usage size in bytes and percentage
 * @returns {Promise<Object>} Object containing total, localStorage, and indexedDB sizes in bytes, and usage percentage
 */
export async function getCacheUsageEstimate() {
	try {
		await checkDbHealth();
		// Calculate localStorage size
		let localStorageSize = 0;
		if (typeof localStorage !== "undefined") {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && key.startsWith("posa_")) {
					const value = localStorage.getItem(key) || "";
					localStorageSize += (key.length + value.length) * 2; // UTF-16 characters are 2 bytes each
				}
			}
		}

		// Estimate IndexedDB size using cursor to avoid loading everything in memory
		let indexedDBSize = 0;
		try {
			if (db.isOpen()) {
				for (const table of db.tables) {
					const entries = await getAllByCursor(table.name);
					indexedDBSize += entries.reduce((size, item) => {
						const itemSize = JSON.stringify(item).length * 2; // UTF-16 characters
						return size + itemSize;
					}, 0);
				}
			}
		} catch (e) {
			console.error("Failed to calculate IndexedDB size", e);
		}

		const totalSize = localStorageSize + indexedDBSize;
		const maxSize = 50 * 1024 * 1024; // Assume 50MB as max size
		const usagePercentage = Math.min(100, Math.round((totalSize / maxSize) * 100));

		return {
			total: totalSize,
			localStorage: localStorageSize,
			indexedDB: indexedDBSize,
			percentage: usagePercentage,
		};
	} catch (e) {
		console.error("Failed to estimate cache usage", e);
		return {
			total: 0,
			localStorage: 0,
			indexedDB: 0,
			percentage: 0,
		};
	}
}
