/* eslint-env worker */
/* global Dexie */

let db;
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

const SCHEMA_SIGNATURE = JSON.stringify(SCHEMA_V15);

const dbReady = (async () => {
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
	db.version(14).stores(SCHEMA_V14);
	db.version(15).stores(SCHEMA_V15);
	try {
		await db.open();
	} catch (err) {
		console.error("Failed to open IndexedDB in worker", err);
	}
	return db;
})();

const KEY_TABLE_MAP = {
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

// customer_storage is only an in-process hot cache. Durable customers live in
// the IndexedDB `customers` table, so the worker never persists this key.
const MEMORY_ONLY_KEYS = new Set(["customer_storage"]);
let persistBatchChain = Promise.resolve();

function tableForKey(key) {
	return KEY_TABLE_MAP[key] || "keyval";
}

async function safeBulkPut(tableName, rows) {
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
			`Worker bulkPut failed for ${tableName}; retrying row-by-row`,
			error,
		);
		await db.transaction("rw", table, async () => {
			for (const row of rows) {
				await table.put(row);
			}
		});
	}
}

async function persistBatch(entries) {
	await dbReady;
	if (!db.isOpen()) {
		await db.open();
	}
	const rowsByTable = new Map();
	for (const entry of entries || []) {
		if (!entry || MEMORY_ONLY_KEYS.has(entry.key)) {
			continue;
		}
		const tableName = tableForKey(entry.key);
		const rows = rowsByTable.get(tableName) || [];
		rows.push({ key: entry.key, value: entry.value });
		rowsByTable.set(tableName, rows);
	}

	await Promise.all(
		Array.from(rowsByTable.entries()).map(([tableName, rows]) =>
			safeBulkPut(tableName, rows),
		),
	);
}

async function bulkPutItems(items, syncedAt = Date.now()) {
	try {
		await dbReady;
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
	} catch (e) {
		console.error("Worker bulkPut items failed", e);
	}
}

async function bulkPutPrices(priceList, items, syncedAt = Date.now()) {
	try {
		if (!priceList) {
			return;
		}
		await dbReady;
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
	} else if (data.type === "persist_batch") {
		try {
			const operation = persistBatchChain.then(() =>
				persistBatch(data.entries),
			);
			persistBatchChain = operation.catch(() => undefined);
			await operation;
			self.postMessage({
				type: "persisted_batch",
				batchId: data.batchId,
			});
		} catch (error) {
			console.error("Worker persist batch failed", error);
			self.postMessage({
				type: "persist_batch_failed",
				batchId: data.batchId,
				error: error?.message || String(error),
			});
		}
	} else if (data.type === "bulk_put_items") {
		await bulkPutItems(data.items || [], data.syncedAt || Date.now());
		self.postMessage({ type: "items_saved" });
	}
};
