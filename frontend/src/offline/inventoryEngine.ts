import {
	bucketCount,
	startPerfMeasure,
	type PerfMetricName,
} from "../posapp/utils/perf";
import { checkDbHealth, db, safeBulkDelete, safeBulkPut, withDbTransaction } from "./db";

type RawItem = Record<string, any>;

export type OperationalItemRecord = {
	key: string;
	scope: string;
	item_code: string;
	item_name: string;
	item_group?: string | null;
	brand?: string | null;
	stock_uom?: string | null;
	uom?: string | null;
	barcodes: string[];
	search_tokens: string[];
	disabled: boolean;
	is_stock_item?: number | boolean | null;
	has_batch_no?: number | boolean | null;
	has_serial_no?: number | boolean | null;
	variant_of?: string | null;
	modified?: string | null;
	rate?: number | null;
	price_list_rate?: number | null;
	standard_rate?: number | null;
	base_rate?: number | null;
	base_price_list_rate?: number | null;
	currency?: string | null;
	original_currency?: string | null;
	actual_qty?: number | null;
	item_barcode?: Array<{ barcode?: string | null; uom?: string | null }>;
	item_uoms?: Array<Record<string, any>>;
	batch_no_data?: Array<Record<string, any>>;
	serial_no_data?: Array<Record<string, any>>;
	payload: RawItem;
};

export type InventorySearchOptions = {
	scope?: string;
	itemGroup?: string;
	limit?: number;
	offset?: number;
	hideZeroRate?: boolean;
	hideVariants?: boolean;
	onlyBarcode?: boolean;
};

export type InventoryDeltaBatch = {
	scope: string;
	changed?: RawItem[];
	deletedItemCodes?: string[];
	source?: string;
};

export type InventoryDiagnostics = {
	ready: boolean;
	scope: string | null;
	generation: number;
	indexedItemCount: number;
	barcodeCount: number;
	rateReady: boolean;
	lastHydratedAt: string | null;
	lastBuiltAt: string | null;
	lastDeltaAppliedAt: string | null;
	lastHydrateDurationMs: number | null;
	lastBuildDurationMs: number | null;
	lastBlockingReason: string | null;
	fullReloadAvoidedCount: number;
};

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 100;
const MAX_PREFIX_LENGTH = 24;
const MIN_PREFIX_LENGTH = 1;
const EMPTY_DIAGNOSTICS: InventoryDiagnostics = {
	ready: false,
	scope: null,
	generation: 0,
	indexedItemCount: 0,
	barcodeCount: 0,
	rateReady: false,
	lastHydratedAt: null,
	lastBuiltAt: null,
	lastDeltaAppliedAt: null,
	lastHydrateDurationMs: null,
	lastBuildDurationMs: null,
	lastBlockingReason: null,
	fullReloadAvoidedCount: 0,
};

function nowIso() {
	return new Date().toISOString();
}

function normalizeScope(scope: unknown) {
	return String(scope || "").trim();
}

export function normalizeInventorySearchValue(value: unknown) {
	return String(value ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function normalizeExactKey(value: unknown) {
	return String(value ?? "").trim().toLowerCase();
}

function tokenize(value: unknown) {
	const normalized = normalizeInventorySearchValue(value);
	return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function unique(values: unknown[]) {
	const seen = new Set<string>();
	const result: string[] = [];
	values.forEach((value) => {
		const normalized = String(value ?? "").trim();
		if (!normalized || seen.has(normalized)) {
			return;
		}
		seen.add(normalized);
		result.push(normalized);
	});
	return result;
}

function collectBarcodes(item: RawItem) {
	const values: unknown[] = [item?.barcode];
	if (Array.isArray(item?.barcodes)) {
		values.push(...item.barcodes);
	}
	if (Array.isArray(item?.item_barcode)) {
		item.item_barcode.forEach((entry: any) => values.push(entry?.barcode));
	} else if (item?.item_barcode) {
		values.push(item.item_barcode);
	}
	return unique(values);
}

function toFiniteNumber(value: unknown): number | null {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function isDisabled(item: RawItem) {
	return Boolean(item?.disabled || item?.disabled === 1 || item?.enabled === 0);
}

function sanitizeArray(value: unknown, maxRows = 250) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.slice(0, maxRows)
		.map((entry) => {
			try {
				return JSON.parse(JSON.stringify(entry));
			} catch {
				return null;
			}
		})
		.filter(Boolean);
}

function buildOperationalPayload(item: RawItem, barcodes: string[]) {
	return {
		item_code: item.item_code,
		item_name: item.item_name || item.item_code,
		item_group: item.item_group || null,
		brand: item.brand || null,
		stock_uom: item.stock_uom || item.uom || null,
		uom: item.uom || item.stock_uom || null,
		barcode: item.barcode || barcodes[0] || null,
		barcodes,
		item_barcode: sanitizeArray(item.item_barcode),
		item_uoms: sanitizeArray(item.item_uoms || item.uoms),
		batch_no_data: sanitizeArray(item.batch_no_data, 500),
		serial_no_data: sanitizeArray(item.serial_no_data, 500),
		is_stock_item: item.is_stock_item,
		has_batch_no: item.has_batch_no,
		has_serial_no: item.has_serial_no,
		allow_negative_stock: item.allow_negative_stock,
		variant_of: item.variant_of || null,
		has_variants: item.has_variants,
		image: typeof item.image === "string" ? item.image : null,
		actual_qty: toFiniteNumber(item.actual_qty),
		rate: toFiniteNumber(item.rate),
		price_list_rate: toFiniteNumber(item.price_list_rate),
		standard_rate: toFiniteNumber(item.standard_rate),
		base_rate: toFiniteNumber(item.base_rate),
		base_price_list_rate: toFiniteNumber(item.base_price_list_rate),
		original_rate: toFiniteNumber(item.original_rate ?? item.price_list_rate ?? item.rate),
		currency: item.currency || item.price_list_currency || null,
		original_currency: item.original_currency || item.currency || item.price_list_currency || null,
		conversion_factor: toFiniteNumber(item.conversion_factor),
		modified: item.modified || null,
	};
}

function buildSearchTokens(item: RawItem, barcodes: string[]) {
	return unique([
		...tokenize(item.item_code),
		...tokenize(item.item_name),
		...tokenize(item.brand),
		...tokenize(item.item_group),
		...barcodes.map((barcode) => normalizeExactKey(barcode)),
	]).filter(Boolean);
}

export function buildOperationalItemRecord(item: RawItem, scope = "") {
	const itemCode = String(item?.item_code || "").trim();
	if (!itemCode) {
		return null;
	}
	const normalizedScope = normalizeScope(scope);
	const barcodes = collectBarcodes(item);
	const payload = buildOperationalPayload(item, barcodes);
	return {
		key: `${normalizedScope}::${itemCode}`,
		scope: normalizedScope,
		item_code: itemCode,
		item_name: String(item.item_name || itemCode),
		item_group: item.item_group || null,
		brand: item.brand || null,
		stock_uom: item.stock_uom || item.uom || null,
		uom: item.uom || item.stock_uom || null,
		barcodes,
		search_tokens: buildSearchTokens(item, barcodes),
		disabled: isDisabled(item),
		is_stock_item: item.is_stock_item,
		has_batch_no: item.has_batch_no,
		has_serial_no: item.has_serial_no,
		variant_of: item.variant_of || null,
		modified: item.modified || null,
		rate: payload.rate,
		price_list_rate: payload.price_list_rate,
		standard_rate: payload.standard_rate,
		base_rate: payload.base_rate,
		base_price_list_rate: payload.base_price_list_rate,
		currency: payload.currency,
		original_currency: payload.original_currency,
		actual_qty: payload.actual_qty,
		item_barcode: payload.item_barcode,
		item_uoms: payload.item_uoms,
		batch_no_data: payload.batch_no_data,
		serial_no_data: payload.serial_no_data,
		payload,
	} satisfies OperationalItemRecord;
}

function addToListMap(map: Map<string, string[]>, key: string, value: string) {
	if (!key) {
		return;
	}
	const current = map.get(key);
	if (current) {
		current.push(value);
	} else {
		map.set(key, [value]);
	}
}

function addPrefixes(map: Map<string, string[]>, token: string, value: string) {
	const clean = normalizeExactKey(token);
	if (!clean) {
		return;
	}
	const max = Math.min(clean.length, MAX_PREFIX_LENGTH);
	for (let length = MIN_PREFIX_LENGTH; length <= max; length += 1) {
		addToListMap(map, clean.slice(0, length), value);
	}
}

function rateFromRecord(record: OperationalItemRecord, uom?: string | null) {
	const base =
		record.price_list_rate ??
		record.rate ??
		record.standard_rate ??
		record.base_price_list_rate ??
		record.base_rate ??
		null;
	if (base === null) {
		return null;
	}
	const targetUom = String(uom || record.uom || record.stock_uom || "").trim();
	if (targetUom && Array.isArray(record.item_uoms)) {
		const row = record.item_uoms.find((entry) => String(entry?.uom || "").trim() === targetUom);
		const factor = toFiniteNumber(row?.conversion_factor);
		if (
			factor &&
			targetUom !== String(record.stock_uom || "").trim()
		) {
			return base * factor;
		}
	}
	return base;
}

class LocalInventoryEngine {
	private recordsByKey = new Map<string, OperationalItemRecord>();
	private itemCodeIndex = new Map<string, string>();
	private barcodeIndex = new Map<string, string>();
	private tokenIndex = new Map<string, string[]>();
	private prefixIndex = new Map<string, string[]>();
	private orderedKeys: string[] = [];
	private diagnostics: InventoryDiagnostics = { ...EMPTY_DIAGNOSTICS };
	private hydratePromise: Promise<InventoryDiagnostics> | null = null;

	getDiagnostics() {
		return { ...this.diagnostics };
	}

	reset(scope: string | null = null) {
		if (scope && this.diagnostics.scope && this.diagnostics.scope !== scope) {
			return;
		}
		this.resetIndexes(scope || "");
		this.diagnostics = { ...EMPTY_DIAGNOSTICS, scope };
		this.hydratePromise = null;
	}

	private resetIndexes(scope: string) {
		this.recordsByKey = new Map();
		this.itemCodeIndex = new Map();
		this.barcodeIndex = new Map();
		this.tokenIndex = new Map();
		this.prefixIndex = new Map();
		this.orderedKeys = [];
		this.diagnostics = {
			...this.diagnostics,
			ready: false,
			scope,
			indexedItemCount: 0,
			barcodeCount: 0,
			rateReady: false,
			lastBlockingReason: "index_empty",
		};
	}

	private indexRecord(record: OperationalItemRecord) {
		if (!record?.key || record.disabled) {
			return;
		}
		this.recordsByKey.set(record.key, record);
		this.orderedKeys.push(record.key);
		this.itemCodeIndex.set(normalizeExactKey(record.item_code), record.key);
		collectBarcodes(record).forEach((barcode) => {
			const normalized = normalizeExactKey(barcode);
			if (!normalized || this.barcodeIndex.has(normalized)) {
				return;
			}
			this.barcodeIndex.set(normalized, record.key);
		});
		record.search_tokens.forEach((token) => {
			addToListMap(this.tokenIndex, token, record.key);
			addPrefixes(this.prefixIndex, token, record.key);
		});
	}

	private buildInMemoryIndex(records: OperationalItemRecord[], scope: string) {
		const started = performance.now();
		this.resetIndexes(scope);
		records.forEach((record) => this.indexRecord(record));
		const duration = performance.now() - started;
		this.diagnostics = {
			...this.diagnostics,
			ready: this.recordsByKey.size > 0,
			scope,
			generation: this.diagnostics.generation + 1,
			indexedItemCount: this.recordsByKey.size,
			barcodeCount: this.barcodeIndex.size,
			rateReady: this.recordsByKey.size > 0,
			lastBuiltAt: nowIso(),
			lastBuildDurationMs: duration,
			lastBlockingReason: this.recordsByKey.size > 0 ? null : "index_empty",
		};
	}

	async hydrate(scope = "") {
		const normalizedScope = normalizeScope(scope);
		if (
			this.diagnostics.ready &&
			this.diagnostics.scope === normalizedScope
		) {
			return this.getDiagnostics();
		}
		if (this.hydratePromise) {
			return this.hydratePromise;
		}
		this.hydratePromise = this.hydrateInternal(normalizedScope).finally(() => {
			this.hydratePromise = null;
		});
		return this.hydratePromise;
	}

	private async hydrateInternal(scope: string) {
		const metric = startPerfMeasure("pos.inventory.index_hydrate", {
			source: "indexeddb",
		});
		const bootMetric = startPerfMeasure("pos.boot.index_hydrate", {
			source: "inventory_engine",
		});
		const started = performance.now();
		try {
			await checkDbHealth();
			if (!db.isOpen()) {
				await db.open();
			}
			let records = await db.table("operational_items").where("scope").equals(scope).toArray();
			if (!records.length) {
				records = await this.rebuildFromStoredItems(scope, false);
			}
			this.buildInMemoryIndex(records as OperationalItemRecord[], scope);
			const duration = performance.now() - started;
			this.diagnostics.lastHydratedAt = nowIso();
			this.diagnostics.lastHydrateDurationMs = duration;
			metric.finish("success", {
				item_result_count: bucketCount(this.diagnostics.indexedItemCount),
				barcode_count: bucketCount(this.diagnostics.barcodeCount),
				cache_hit: records.length > 0,
			});
			bootMetric.finish("success", {
				item_result_count: bucketCount(this.diagnostics.indexedItemCount),
			});
			return this.getDiagnostics();
		} catch (error) {
			this.diagnostics.lastBlockingReason =
				error instanceof Error ? error.message : "hydrate_failed";
			metric.fail(error);
			bootMetric.fail(error);
			throw error;
		}
	}

	private async rebuildFromStoredItems(scope: string, measure = true) {
		const metric = measure
			? startPerfMeasure("pos.inventory.index_build", { source: "stored_items" })
			: null;
		const bootMetric = measure
			? startPerfMeasure("pos.boot.index_rebuild", { source: "inventory_engine" })
			: null;
		try {
			const collection = scope
				? db.table("items").where("profile_scope").equals(scope)
				: db.table("items");
			const rawItems = await collection.toArray();
			const records = rawItems
				.map((item: RawItem) => buildOperationalItemRecord(item, scope))
				.filter((record): record is OperationalItemRecord => Boolean(record));
			await this.commitRecords(scope, records, { replaceScope: true });
			metric?.finish("success", {
				item_result_count: bucketCount(records.length),
			});
			bootMetric?.finish("success", {
				item_result_count: bucketCount(records.length),
			});
			return records;
		} catch (error) {
			metric?.fail(error);
			bootMetric?.fail(error);
			throw error;
		}
	}

	async commitRecords(
		scope: string,
		records: OperationalItemRecord[],
		options: { replaceScope?: boolean } = {},
	) {
		const metric = startPerfMeasure("pos.inventory.index_commit", {
			source: options.replaceScope ? "rebuild" : "delta",
		});
		try {
			await checkDbHealth();
			if (!db.isOpen()) {
				await db.open();
			}
			const table = db.table("operational_items");
			await withDbTransaction("rw", "operational_items", async () => {
				if (options.replaceScope) {
					await table.where("scope").equals(scope).delete();
				}
				if (records.length) {
					await table.bulkPut(records);
				}
			});
			metric.finish("success", {
				item_result_count: bucketCount(records.length),
			});
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}

	async upsertRawItems(items: RawItem[], scope = "") {
		const normalizedScope = normalizeScope(scope);
		const records: OperationalItemRecord[] = [];
		(Array.isArray(items) ? items : []).forEach((item) => {
			const record = buildOperationalItemRecord(item, normalizedScope);
			if (record) {
				records.push(record);
			}
		});
		if (!records.length) {
			return { count: 0 };
		}
		await safeBulkPut("operational_items", records);
		if (this.diagnostics.scope === normalizedScope) {
			records.forEach((record) => {
				if (this.recordsByKey.has(record.key)) {
					this.removeRecordFromMemory(record.item_code);
				}
				this.indexRecord(record);
			});
			this.diagnostics = {
				...this.diagnostics,
				ready: this.recordsByKey.size > 0,
				indexedItemCount: this.recordsByKey.size,
				barcodeCount: this.barcodeIndex.size,
				rateReady: this.recordsByKey.size > 0,
				generation: this.diagnostics.generation + 1,
				lastDeltaAppliedAt: nowIso(),
				lastBlockingReason: null,
			};
		}
		return { count: records.length };
	}

	private removeRecordFromMemory(itemCode: string) {
		const key = this.itemCodeIndex.get(normalizeExactKey(itemCode));
		if (!key) {
			return;
		}
		const existing = this.recordsByKey.get(key);
		this.recordsByKey.delete(key);
		this.itemCodeIndex.delete(normalizeExactKey(itemCode));
		existing?.barcodes.forEach((barcode) => {
			this.barcodeIndex.delete(normalizeExactKey(barcode));
		});
		this.orderedKeys = this.orderedKeys.filter((candidate) => candidate !== key);
	}

	async deleteItemCodes(itemCodes: string[], scope = "") {
		const normalizedScope = normalizeScope(scope);
		const keys = unique(itemCodes).map((itemCode) => `${normalizedScope}::${itemCode}`);
		await safeBulkDelete("operational_items", keys);
		if (this.diagnostics.scope === normalizedScope) {
			itemCodes.forEach((itemCode) => this.removeRecordFromMemory(itemCode));
			this.diagnostics = {
				...this.diagnostics,
				indexedItemCount: this.recordsByKey.size,
				barcodeCount: this.barcodeIndex.size,
				generation: this.diagnostics.generation + 1,
				lastDeltaAppliedAt: nowIso(),
			};
		}
	}

	private resolveRecordByKey(key: string | undefined) {
		return key ? this.recordsByKey.get(key) || null : null;
	}

	private toSearchResult(record: OperationalItemRecord) {
		return { ...record.payload };
	}

	lookupItemCodeExact(itemCode: string, scope = "") {
		const metric = startPerfMeasure("pos.inventory.query_exact_item_code", {
			source: "local",
		});
		try {
			if (scope && this.diagnostics.scope !== normalizeScope(scope)) {
				metric.finish("failure", { cache_hit: false });
				return null;
			}
			const record = this.resolveRecordByKey(
				this.itemCodeIndex.get(normalizeExactKey(itemCode)),
			);
			metric.finish("success", { cache_hit: Boolean(record) });
			return record ? this.toSearchResult(record) : null;
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}

	lookupBarcodeExact(barcode: string, scope = "") {
		const metric = startPerfMeasure("pos.inventory.query_barcode_exact", {
			source: "local",
		});
		const legacyMetric = startPerfMeasure("pos.items.barcode_lookup", {
			source: "local",
		});
		try {
			if (scope && this.diagnostics.scope !== normalizeScope(scope)) {
				metric.finish("failure", { cache_hit: false });
				legacyMetric.finish("failure", { cache_hit: false });
				return null;
			}
			const record = this.resolveRecordByKey(
				this.barcodeIndex.get(normalizeExactKey(barcode)) ||
					this.itemCodeIndex.get(normalizeExactKey(barcode)),
			);
			const tags = { cache_hit: Boolean(record) };
			metric.finish("success", tags);
			legacyMetric.finish("success", tags);
			return record ? this.toSearchResult(record) : null;
		} catch (error) {
			metric.fail(error);
			legacyMetric.fail(error);
			throw error;
		}
	}

	getItemRate(itemCode: string, context: { scope?: string; uom?: string | null } = {}) {
		const metric = startPerfMeasure("pos.inventory.rate_lookup_local", {
			source: "local",
		});
		try {
			const record = this.resolveRecordByKey(
				this.itemCodeIndex.get(normalizeExactKey(itemCode)),
			);
			const rate = record ? rateFromRecord(record, context.uom) : null;
			metric.finish("success", { cache_hit: rate !== null });
			return rate;
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}

	searchItemsLocal(query: string, options: InventorySearchOptions = {}) {
		const limit = Math.max(
			1,
			Math.min(Number(options.limit || DEFAULT_SEARCH_LIMIT), MAX_SEARCH_LIMIT),
		);
		const offset = Math.max(0, Number(options.offset || 0));
		const metricTags = {
			source: "local",
			item_count_bucket: bucketCount(this.recordsByKey.size),
			limit_bucket: bucketCount(limit),
			search_length_bucket: bucketCount(String(query || "").trim().length),
		};
		const metric = startPerfMeasure("pos.inventory.query_autocomplete", metricTags);
		const legacyMetric = startPerfMeasure("pos.items.local_search", metricTags);
		try {
			if (options.scope && this.diagnostics.scope !== normalizeScope(options.scope)) {
				metric.finish("failure", { cache_hit: false, item_result_count: "0" });
				legacyMetric.finish("failure", { cache_hit: false, item_result_count: "0" });
				return [];
			}
			const terms = tokenize(query);
			let keys: string[];
			const exactKey = normalizeExactKey(query);
			const exactItem = this.itemCodeIndex.get(exactKey);
			const exactBarcode = this.barcodeIndex.get(exactKey);
			if (exactBarcode || exactItem) {
				keys = [exactBarcode || exactItem].filter(Boolean) as string[];
			} else if (!terms.length) {
				keys = this.orderedKeys;
			} else {
				const candidateLists = terms.map((term) => {
					const normalized = normalizeExactKey(term);
					return (
						this.tokenIndex.get(normalized) ||
						this.prefixIndex.get(normalized) ||
						[]
					);
				});
				candidateLists.sort((left, right) => left.length - right.length);
				const smallest = candidateLists[0] || [];
				const rest = candidateLists.slice(1).map((list) => new Set(list));
				keys = rest.length
					? smallest.filter((key) => rest.every((set) => set.has(key)))
					: smallest;
			}

			const group = String(options.itemGroup || "ALL").trim().toLowerCase();
			const result: RawItem[] = [];
			const seen = new Set<string>();
			let skipped = 0;
			for (const key of keys) {
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				const record = this.recordsByKey.get(key);
				if (!record || record.disabled) {
					continue;
				}
				if (group && group !== "all" && String(record.item_group || "").toLowerCase() !== group) {
					continue;
				}
				if (options.onlyBarcode && !record.barcodes.length) {
					continue;
				}
				if (options.hideVariants && record.variant_of) {
					continue;
				}
				if (options.hideZeroRate && (rateFromRecord(record) || 0) <= 0) {
					continue;
				}
				if (skipped < offset) {
					skipped += 1;
					continue;
				}
				result.push(this.toSearchResult(record));
				if (result.length >= limit) {
					break;
				}
			}
			const finishTags = {
				cache_hit: true,
				item_result_count: bucketCount(result.length),
			};
			metric.finish("success", finishTags);
			legacyMetric.finish("success", finishTags);
			return result;
		} catch (error) {
			metric.fail(error);
			legacyMetric.fail(error);
			throw error;
		}
	}

	async applyInventoryDeltas(batch: InventoryDeltaBatch) {
		const metric = startPerfMeasure("pos.inventory.delta_items_apply", {
			source: batch.source || "sync",
			item_count_bucket: bucketCount(batch.changed?.length || 0),
		});
		try {
			if (batch.changed?.length) {
				await this.upsertRawItems(batch.changed, batch.scope);
			}
			if (batch.deletedItemCodes?.length) {
				await this.deleteItemCodes(batch.deletedItemCodes, batch.scope);
			}
			this.diagnostics.fullReloadAvoidedCount += 1;
			startPerfMeasure("pos.inventory.full_reload_avoided", {
				source: batch.source || "sync",
			}).finish("success");
			metric.finish("success", {
				item_result_count: bucketCount(batch.changed?.length || 0),
				deleted_count: bucketCount(batch.deletedItemCodes?.length || 0),
			});
			return this.getDiagnostics();
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}
}

export const localInventoryEngine = new LocalInventoryEngine();

export async function hydrateOperationalIndexFromSnapshot(scope = "") {
	return localInventoryEngine.hydrate(scope);
}

export async function saveOperationalItemsFromRaw(items: RawItem[], scope = "") {
	return localInventoryEngine.upsertRawItems(items, scope);
}

export async function deleteOperationalItemsByCodes(itemCodes: string[], scope = "") {
	return localInventoryEngine.deleteItemCodes(itemCodes, scope);
}

export function searchItemsLocal(query: string, options: InventorySearchOptions = {}) {
	return localInventoryEngine.searchItemsLocal(query, options);
}

export function lookupBarcodeExact(barcode: string, scope = "") {
	return localInventoryEngine.lookupBarcodeExact(barcode, scope);
}

export function lookupItemCodeExact(itemCode: string, scope = "") {
	return localInventoryEngine.lookupItemCodeExact(itemCode, scope);
}

export function getOperationalItem(itemCode: string, scope = "") {
	return lookupItemCodeExact(itemCode, scope);
}

export function getItemRate(
	itemCode: string,
	context: { scope?: string; priceList?: string | null; currency?: string | null; uom?: string | null } = {},
) {
	return localInventoryEngine.getItemRate(itemCode, context);
}

export async function applyInventoryDeltas(batch: InventoryDeltaBatch) {
	return localInventoryEngine.applyInventoryDeltas(batch);
}

export async function applyRateDeltas(batch: InventoryDeltaBatch) {
	const metric = startPerfMeasure("pos.inventory.delta_rates_apply" as PerfMetricName, {
		source: batch.source || "sync",
	});
	try {
		const result = await localInventoryEngine.applyInventoryDeltas(batch);
		metric.finish("success", {
			item_result_count: bucketCount(batch.changed?.length || 0),
		});
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}

export async function applyStockDeltas(batch: InventoryDeltaBatch) {
	const metric = startPerfMeasure("pos.inventory.delta_stock_apply" as PerfMetricName, {
		source: batch.source || "sync",
	});
	try {
		const result = await localInventoryEngine.applyInventoryDeltas(batch);
		metric.finish("success", {
			item_result_count: bucketCount(batch.changed?.length || 0),
		});
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}

export function getInventoryDiagnostics() {
	return localInventoryEngine.getDiagnostics();
}

export function resetInventoryEngine(scope: string | null = null) {
	localInventoryEngine.reset(scope);
}
