/* eslint-env worker */
/* global importScripts, Dexie */

let db;
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

const SCHEMA_SIGNATURE = JSON.stringify(BASE_SCHEMA);
const QUERY_CACHE_LIMIT = 100;
const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map();

(async () => {
	let DexieLib;
	try {
		importScripts("/assets/posawesome/dist/js/libs/dexie.min.js?v=1");
		DexieLib = { default: Dexie };
	} catch {
		// Fallback to dynamic import when importScripts fails
		DexieLib = await import("/assets/posawesome/dist/js/libs/dexie.min.js?v=1");
	}
	db = new DexieLib.default("posawesome_offline");
	db.version(7)
		.stores({
			keyval: "&key",
			queue: "&key",
			cache: "&key",
			items: "&item_code,item_name,item_group,*barcodes,*name_keywords,*serials,*batches",
			item_prices: "&[price_list+item_code],price_list,item_code",
			customers: "&name,customer_name,mobile_no,email_id,tax_id",
		})
		.upgrade((tx) =>
			tx
				.table("items")
				.toCollection()
				.modify((item) => {
					item.barcodes = Array.isArray(item.item_barcode)
						? item.item_barcode.map((b) => b.barcode).filter(Boolean)
						: item.item_barcode
							? [String(item.item_barcode)]
							: [];
					item.name_keywords = item.item_name
						? item.item_name.toLowerCase().split(/\s+/).filter(Boolean)
						: [];
					item.serials = Array.isArray(item.serial_no_data)
						? item.serial_no_data.map((s) => s.serial_no).filter(Boolean)
						: [];
					item.batches = Array.isArray(item.batch_no_data)
						? item.batch_no_data.map((b) => b.batch_no).filter(Boolean)
						: [];
				}),
		);
	db.version(8)
		.stores({
			keyval: "&key",
			queue: "&key",
			cache: "&key",
			items: "&item_code,item_name,item_group,*barcodes,*name_keywords,*serials,*batches",
			item_prices: "&[price_list+item_code],price_list,item_code",
			customers: "&name,customer_name,mobile_no,email_id,tax_id",
			local_stock: "&key",
			coupons: "&key",
			item_groups: "&key",
			translations: "&key",
			pricing_rules: "&key",
		})
		.upgrade(async (tx) => {
			const migrateKey = async (key, targetTable) => {
				try {
					const entry = await tx.table("keyval").get(key);
					if (entry) {
						await tx.table(targetTable).put(entry);
					}
				} catch (err) {
					console.warn(`Worker migration failed for ${key} -> ${targetTable}`, err);
				}
			};

			await Promise.all([
				migrateKey("local_stock_cache", "local_stock"),
				migrateKey("coupons_cache", "coupons"),
				migrateKey("item_groups_cache", "item_groups"),
				migrateKey("translation_cache", "translations"),
				migrateKey("pricing_rules_snapshot", "pricing_rules"),
				migrateKey("pricing_rules_context", "pricing_rules"),
				migrateKey("pricing_rules_last_sync", "pricing_rules"),
				migrateKey("pricing_rules_stale_at", "pricing_rules"),
			]);
		});
	db.version(9)
		.stores(BASE_SCHEMA)
		.upgrade(async (tx) => {
			const migrateKey = async (key, targetTable) => {
				try {
					const entry = await tx.table("keyval").get(key);
					if (entry) {
						await tx.table(targetTable).put(entry);
					}
				} catch (err) {
					console.warn(`Worker migration failed for ${key} -> ${targetTable}`, err);
				}
			};

			const settingsKeys = [
				"cache_version",
				"cache_ready",
				"stock_cache_ready",
				"manual_offline",
				"invoice_outbox_mode",
				"bootstrap_snapshot",
				"bootstrap_snapshot_status",
				"bootstrap_limited_mode",
				"schema_signature",
			];

			const syncStateKeys = [
				"items_last_sync",
				"customers_last_sync",
				"payment_methods_last_sync",
				"pos_last_sync_totals",
			];

			await Promise.all([
				migrateKey("local_stock_cache", "local_stock"),
				migrateKey("coupons_cache", "coupons"),
				migrateKey("item_groups_cache", "item_groups"),
				migrateKey("translation_cache", "translations"),
				migrateKey("pricing_rules_snapshot", "pricing_rules"),
				migrateKey("pricing_rules_context", "pricing_rules"),
				migrateKey("pricing_rules_last_sync", "pricing_rules"),
				migrateKey("pricing_rules_stale_at", "pricing_rules"),
				...settingsKeys.map((key) => migrateKey(key, "settings")),
				...syncStateKeys.map((key) => migrateKey(key, "sync_state")),
			]);

			try {
				await tx.table("settings").put({ key: "schema_signature", value: SCHEMA_SIGNATURE });
			} catch (err) {
				console.warn("Worker failed to persist schema signature", err);
			}
		});
	db.version(10).stores(BASE_SCHEMA);
	db.version(11).stores(BASE_SCHEMA);
	db.version(12).stores(BASE_SCHEMA);
	db.version(13).stores(BASE_SCHEMA);
	try {
		await db.open();
	} catch (err) {
		console.error("Failed to open IndexedDB in worker", err);
	}
})();

const KEY_TABLE_MAP = {
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

const LARGE_KEYS = new Set(["items", "item_details_cache", "local_stock_cache"]);
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
const MEMORY_ONLY_KEYS = new Set(["customer_storage"]);

function tableForKey(key) {
	return KEY_TABLE_MAP[key] || "keyval";
}

async function persist(key, value) {
	if (!MEMORY_ONLY_KEYS.has(key)) {
		try {
			if (!db.isOpen()) {
				await db.open();
			}
			const table = tableForKey(key);
			await db.table(table).put({ key, value });
		} catch (e) {
			console.error("Worker persist failed", e);
		}
	}

	if (typeof localStorage !== "undefined") {
		if (LOCAL_STORAGE_KEYS.has(key) && !LARGE_KEYS.has(key)) {
			try {
				localStorage.setItem(`posa_${key}`, JSON.stringify(value));
			} catch (err) {
				console.error("Worker localStorage failed", err);
			}
		} else {
			localStorage.removeItem(`posa_${key}`);
		}
	}
}

async function bulkPutItems(items, syncedAt = Date.now()) {
	try {
		if (!db.isOpen()) {
			await db.open();
		}
		const CHUNK_SIZE = 1000;
		await db.transaction("rw", db.table("items"), async () => {
			for (let i = 0; i < items.length; i += CHUNK_SIZE) {
				const chunk = items.slice(i, i + CHUNK_SIZE).map((item) => ({
					...item,
					synced_at: syncedAt,
				}));
				await db.table("items").bulkPut(chunk);
			}
		});
		clearQueryCache();
	} catch (e) {
		console.error("Worker bulkPut items failed", e);
	}
}

async function bulkPutPrices(priceList, items, syncedAt = Date.now()) {
	try {
		if (!priceList) {
			return;
		}
		if (!db.isOpen()) {
			await db.open();
		}
		const records = items.map((it) => {
			const price = it.price_list_rate ?? it.rate ?? 0;
			return {
				price_list: priceList,
				item_code: it.item_code,
				rate: price,
				price_list_rate: price,
				timestamp: syncedAt,
			};
		});
		await db.table("item_prices").bulkPut(records);
	} catch (e) {
		console.error("Worker bulkPut prices failed", e);
	}
}

function hasScope(scope) {
	return String(scope || "").length > 0;
}

function isMatchingScope(row, scope) {
	return String(row?.profile_scope || "") === String(scope || "");
}

function matchesItemSearch(item, search) {
	const normalizedSearch = String(search || "").trim().toLowerCase();
	if (!normalizedSearch) {
		return true;
	}
	const terms = normalizedSearch.split(/\s+/).filter(Boolean);
	const searchableValues = [
		item?.item_name,
		item?.item_code,
		item?.description,
		item?.item_barcode,
		...(Array.isArray(item?.barcodes) ? item.barcodes : []),
		...(Array.isArray(item?.name_keywords) ? item.name_keywords : []),
		...(Array.isArray(item?.serials) ? item.serials : []),
		...(Array.isArray(item?.batches) ? item.batches : []),
	]
		.flatMap((value) => {
			if (Array.isArray(value)) return value;
			if (value && typeof value === "object") {
				return [value.barcode, value.serial_no, value.batch_no];
			}
			return [value];
		})
		.filter((value) => value !== null && value !== undefined)
		.map((value) => String(value).toLowerCase());

	return terms.every((term) =>
		searchableValues.some((value) => value.includes(term)),
	);
}

function scoreItemSearchMatch(item, search) {
	const normalizedSearch = String(search || "").trim().toLowerCase();
	if (!normalizedSearch) {
		return 1;
	}
	if (!matchesItemSearch(item, normalizedSearch)) {
		return 0;
	}

	const itemCode = String(item?.item_code || "").toLowerCase();
	const itemName = String(item?.item_name || "").toLowerCase();
	const barcodes = Array.isArray(item?.barcodes)
		? item.barcodes.map((barcode) => String(barcode).toLowerCase())
		: [];

	if (barcodes.includes(normalizedSearch)) return 400;
	if (itemCode === normalizedSearch) return 350;
	if (itemName === normalizedSearch) return 325;
	if (itemCode.startsWith(normalizedSearch)) return 275;
	if (itemName.startsWith(normalizedSearch)) return 250;
	if (itemCode.includes(normalizedSearch)) return 175;
	if (itemName.includes(normalizedSearch)) return 150;
	return 50;
}

function rankItemSearchRows(rows, search, limit, offset) {
	const deduped = new Map();
	rows.forEach((row) => {
		if (row?.item_code && !deduped.has(row.item_code)) {
			deduped.set(row.item_code, row);
		}
	});

	return Array.from(deduped.values())
		.map((item) => ({ item, score: scoreItemSearchMatch(item, search) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				String(a.item.item_name || a.item.item_code || "").localeCompare(
					String(b.item.item_name || b.item.item_code || ""),
				),
		)
		.slice(offset, offset + limit)
		.map((entry) => entry.item);
}

function getCustomerSearchValues(customer) {
	if (!customer) {
		return [];
	}
	return [
		customer.customer_name,
		customer.name,
		customer.mobile_no,
		customer.email_id,
		customer.tax_id,
	]
		.filter((value) => value !== null && value !== undefined)
		.map((value) => String(value).toLowerCase());
}

function matchesCustomerSearch(customer, search) {
	const parts = String(search || "")
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) {
		return true;
	}
	const values = getCustomerSearchValues(customer);
	return parts.every((part) => values.some((value) => value.includes(part)));
}

function scoreCustomerSearchMatch(customer, search) {
	const normalized = String(search || "").trim().toLowerCase();
	if (!normalized || !customer) {
		return normalized ? 0 : 1;
	}

	const values = getCustomerSearchValues(customer);
	if (!values.length) {
		return 0;
	}

	const customerName = String(customer.customer_name || "").toLowerCase();
	const id = String(customer.name || "").toLowerCase();
	const mobile = String(customer.mobile_no || "").toLowerCase();
	const email = String(customer.email_id || "").toLowerCase();
	const parts = normalized.split(/\s+/).filter(Boolean);

	if (!parts.every((part) => values.some((value) => value.includes(part)))) {
		return 0;
	}

	if (customerName === normalized) return 300;
	if (id === normalized) return 290;
	if (mobile === normalized) return 280;
	if (email === normalized) return 260;
	if (customerName.startsWith(normalized)) return 240;
	if (mobile.startsWith(normalized)) return 220;
	if (email.startsWith(normalized)) return 200;
	if (id.startsWith(normalized)) return 180;
	if (customerName.includes(normalized)) return 140;
	if (mobile.includes(normalized)) return 120;
	if (email.includes(normalized)) return 100;
	if (id.includes(normalized)) return 90;

	return 50;
}

function rankCustomerSearchRows(rows, search, limit, offset) {
	const deduped = new Map();
	rows.forEach((row) => {
		if (row?.name && !deduped.has(row.name)) {
			deduped.set(row.name, row);
		}
	});

	return Array.from(deduped.values())
		.map((customer) => ({ customer, score: scoreCustomerSearchMatch(customer, search) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				String(a.customer.name || "").localeCompare(String(b.customer.name || "")),
		)
		.slice(offset, offset + limit)
		.map((entry) => entry.customer);
}

function rowMatchesGroupAndScope(row, group, scope) {
	const normalizedGroup = String(group || "").trim();
	return (
		(!hasScope(scope) || isMatchingScope(row, scope)) &&
		(!normalizedGroup ||
			normalizedGroup.toLowerCase() === "all" ||
			String(row?.item_group || "").toLowerCase() ===
				normalizedGroup.toLowerCase())
	);
}

function buildQueryCacheKey(payload = {}) {
	return [
		String(payload.search || "").trim().toLowerCase(),
		String(payload.itemGroup || "").trim().toLowerCase(),
		Number(payload.limit || 100),
		Number(payload.offset || 0),
		String(payload.scope || ""),
	].join("::");
}

function getQueryCache(key) {
	const cached = queryCache.get(key);
	if (!cached) {
		return null;
	}
	if (Date.now() - cached.timestamp > QUERY_CACHE_TTL_MS) {
		queryCache.delete(key);
		return null;
	}

	queryCache.delete(key);
	queryCache.set(key, cached);
	return cached.value;
}

function setQueryCache(key, value) {
	if (!key || !Array.isArray(value)) {
		return;
	}
	queryCache.set(key, {
		value,
		timestamp: Date.now(),
	});
	while (queryCache.size > QUERY_CACHE_LIMIT) {
		const firstKey = queryCache.keys().next().value;
		if (!firstKey) break;
		queryCache.delete(firstKey);
	}
}

function clearQueryCache() {
	queryCache.clear();
}

async function searchStoredItems({ search = "", itemGroup = "", limit = 100, offset = 0, scope = "" } = {}) {
	if (!db.isOpen()) {
		await db.open();
	}

	const cacheKey = buildQueryCacheKey({ search, itemGroup, limit, offset, scope });
	const cached = getQueryCache(cacheKey);
	if (cached) {
		return cached;
	}

	const table = db.table("items");
	const normalizedSearch = String(search || "").trim();
	const normalizedGroup = String(itemGroup || "").trim();
	let result;

	if (!normalizedSearch) {
		let collection = table;
		if (normalizedGroup && normalizedGroup.toLowerCase() !== "all") {
			collection = collection.where("item_group").equalsIgnoreCase(normalizedGroup);
		}
		if (hasScope(scope)) {
			collection = collection.filter((row) => isMatchingScope(row, scope));
		}
		result = await collection.offset(offset).limit(limit).toArray();
		setQueryCache(cacheKey, result);
		return result;
	}

	const term = normalizedSearch.toLowerCase();
	const terms = term.split(/\s+/).filter(Boolean);
	const candidateLimit = Math.max(limit + offset, limit * 3);
	const indexedRows = [];

	async function addIndexedRows(queryFactory) {
		try {
			const rows = await queryFactory();
			if (Array.isArray(rows) && rows.length) {
				indexedRows.push(...rows);
			}
		} catch {
			// Missing indexes in old caches fall through to generic filtering.
		}
	}

	if (terms.length === 1) {
		await Promise.all([
			addIndexedRows(() =>
				table.where("barcodes").equals(term).limit(candidateLimit).toArray(),
			),
			addIndexedRows(() =>
				table.where("item_code").startsWithIgnoreCase(normalizedSearch).limit(candidateLimit).toArray(),
			),
			addIndexedRows(() =>
				table.where("item_name").startsWithIgnoreCase(normalizedSearch).limit(candidateLimit).toArray(),
			),
			addIndexedRows(() =>
				table.where("name_keywords").equals(term).limit(candidateLimit).toArray(),
			),
		]);
	} else if (terms.length > 1) {
		await addIndexedRows(() =>
			table.where("name_keywords").anyOf(terms).limit(candidateLimit).toArray(),
		);
	}

	const indexedResult = rankItemSearchRows(
		indexedRows.filter((row) => rowMatchesGroupAndScope(row, normalizedGroup, scope)),
		normalizedSearch,
		limit,
		offset,
	);
	if (indexedResult.length >= limit) {
		setQueryCache(cacheKey, indexedResult);
		return indexedResult;
	}

	let collection = table;
	if (normalizedGroup && normalizedGroup.toLowerCase() !== "all") {
		collection = collection.where("item_group").equalsIgnoreCase(normalizedGroup);
	}
	collection = collection.filter(
		(row) =>
			rowMatchesGroupAndScope(row, normalizedGroup, scope) &&
			matchesItemSearch(row, normalizedSearch),
	);
	result = await collection.offset(offset).limit(limit).toArray();
	setQueryCache(cacheKey, result);
	return result;
}

async function searchStoredCustomers({ search = "", limit = 50, offset = 0 } = {}) {
	if (!db.isOpen()) {
		await db.open();
	}

	const table = db.table("customers");
	const normalizedSearch = String(search || "").trim();
	const safeLimit = Math.max(1, Number(limit) || 50);
	const safeOffset = Math.max(0, Number(offset) || 0);

	if (!normalizedSearch) {
		return await table.offset(safeOffset).limit(safeLimit).toArray();
	}

	const candidateLimit = Math.max(safeLimit + safeOffset, safeLimit * 3);
	const indexedRows = [];

	async function addIndexedRows(queryFactory) {
		try {
			const rows = await queryFactory();
			if (Array.isArray(rows) && rows.length) {
				indexedRows.push(...rows);
			}
		} catch {
			// Missing indexes in old caches fall through to generic filtering.
		}
	}

	await Promise.all(
		["name", "customer_name", "mobile_no", "email_id"].map((field) =>
			addIndexedRows(() =>
				table
					.where(field)
					.startsWithIgnoreCase(normalizedSearch)
					.limit(candidateLimit)
					.toArray(),
			),
		),
	);

	const indexedResult = rankCustomerSearchRows(
		indexedRows,
		normalizedSearch,
		safeLimit,
		safeOffset,
	);
	if (indexedResult.length >= safeLimit) {
		return indexedResult;
	}

	const filteredRows = await table
		.filter((customer) => matchesCustomerSearch(customer, normalizedSearch))
		.limit(candidateLimit)
		.toArray();
	return rankCustomerSearchRows(
		[...indexedRows, ...filteredRows],
		normalizedSearch,
		safeLimit,
		safeOffset,
	);
}

self.onmessage = async (event) => {
	// Logging every message can flood the console and increase memory usage
	// when the worker is used for frequent persistence operations. Remove
	// the noisy log to keep the console clean.
	const data = event.data || {};
	if (data.type === "parse_and_cache") {
		try {
			let parsed = JSON.parse(data.json);
			let itemsRaw = parsed.message || parsed;
			let items;
			const syncTimestamp = data.syncedAt || Date.now();
			try {
				if (typeof structuredClone === "function") {
					items = structuredClone(itemsRaw);
				} else {
					// Fallback for older browsers
					items = JSON.parse(JSON.stringify(itemsRaw));
				}
			} catch (e) {
				console.error("Failed to clone items", e);
				self.postMessage({ type: "error", error: e.message });
				return;
			}
			let trimmed = items.map((it) => ({
				item_code: it.item_code,
				item_name: it.item_name,
				description: it.description,
				stock_uom: it.stock_uom,
				image: it.image,
				item_group: it.item_group,
				rate: it.rate,
				price_list_rate: it.price_list_rate,
				currency: it.currency,
				item_barcode: it.item_barcode,
				item_uoms: it.item_uoms,
				actual_qty: it.actual_qty,
				has_batch_no: it.has_batch_no,
				has_serial_no: it.has_serial_no,
				has_variants: !!it.has_variants,
				barcodes: Array.isArray(it.item_barcode)
					? it.item_barcode.map((b) => b.barcode).filter(Boolean)
					: it.item_barcode
						? [String(it.item_barcode)]
						: [],
				name_keywords: it.item_name ? it.item_name.toLowerCase().split(/\s+/).filter(Boolean) : [],
				serials: Array.isArray(it.serial_no_data)
					? it.serial_no_data.map((s) => s.serial_no).filter(Boolean)
					: [],
				batches: Array.isArray(it.batch_no_data)
					? it.batch_no_data.map((b) => b.batch_no).filter(Boolean)
					: [],
			}));
			await bulkPutItems(trimmed, syncTimestamp);
			await bulkPutPrices(data.priceList, trimmed, syncTimestamp);
			// Clear references to release memory before posting back
			items = null;
			itemsRaw = null;
			data.json = null;
			parsed = null;
			let out = trimmed;
			self.postMessage({ type: "parsed", items: out });
			trimmed.length = 0;
			trimmed = null;
		} catch (err) {
			console.log(err);
			self.postMessage({ type: "error", error: err.message });
		}
	} else if (data.type === "persist") {
		await persist(data.key, data.value);
		self.postMessage({ type: "persisted", key: data.key });
	} else if (data.type === "bulk_put_items") {
		await bulkPutItems(data.items || [], data.syncedAt || Date.now());
		self.postMessage({ type: "items_saved" });
	} else if (data.type === "search_stored_items") {
		try {
			const items = await searchStoredItems(data.payload || {});
			self.postMessage({ type: "search_stored_items_result", id: data.id, items });
		} catch (err) {
			self.postMessage({
				type: "search_stored_items_error",
				id: data.id,
				error: err?.message || String(err),
			});
		}
	} else if (data.type === "search_stored_customers") {
		try {
			const customers = await searchStoredCustomers(data.payload || {});
			self.postMessage({ type: "search_stored_customers_result", id: data.id, customers });
		} catch (err) {
			self.postMessage({
				type: "search_stored_customers_error",
				id: data.id,
				error: err?.message || String(err),
			});
		}
	}
};
