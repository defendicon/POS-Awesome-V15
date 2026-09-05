/**
 * Unified cache layer for all offline POS data.
 *
 * Every offline read and write goes through this module so that storage concerns
 * stay out of sync adapters and Vue components.
 *
 * ## Storage ownership
 *
 * **Runtime cache — `memory`**
 * `memory` is the synchronous runtime cache for small reference payloads and UI-facing
 * state. Every mutation to `memory` must be followed immediately by `persist(key)`.
 * `persist` writes durable data to IndexedDB and only mirrors a narrow allowlist of
 * lightweight settings/metadata to `localStorage`.
 *
 * **Durable store — Dexie / IndexedDB (`db`)**
 * IndexedDB is the persistent source of truth for business and cache data. Large datasets
 * that would overflow localStorage live here directly. Currently:
 * - `item_catalog_rows` / `item_catalog_state` — generation-scoped item catalog and
 *   atomic active pointer. The legacy `items` table remains a read fallback until the
 *   first complete V17 generation is promoted.
 * - `customers` — all customers.
 * - `pos_profiles` / `opening_shifts` — structural records persisted on shift open.
 *
 * **Light metadata — `localStorage`**
 * `localStorage` is only used for a small set of lightweight settings and migration
 * fallback reads. It is not the durable owner of core offline datasets or sync cursors.
 *
 * ## Tier interaction
 * The runtime cache and IndexedDB are largely independent. The one exception is `getCachedItemDetails`,
 * which reads per-item detail overrides from `memory.item_details_cache` and merges
 * them onto base records fetched from the Dexie `items` table:
 * `result = { ...baseItem, ...detailOverride }`.
 *
 * ## Scope
 * Most item functions accept a `scope` parameter (the POS profile name). Items are
 * stored with a `profile_scope` field so reads and deletes are filtered to the active
 * profile. Omitting scope falls back to unscoped behaviour and logs a deprecation
 * warning. Keyed caches (delivery charges, exchange rates, etc.) use
 * `buildScopedCacheKey` to namespace entries by profile or company.
 *
 * ## Bootstrap snapshot side effects
 * Many `save*` functions call `refreshBootstrapSnapshotFromCacheState` as a side
 * effect after writing. This keeps the offline-readiness snapshot current so that the
 * UI indicator reflects the true cache state without a separate polling pass.
 *
 * ## Clone safety
 * Data written to IndexedDB must be structured-clone safe. `toCloneSafeValue` strips
 * functions, symbols, bigints, and circular references before writes. Data returned by
 * getters is similarly cloned via `cloneCachePayload` so callers cannot mutate the
 * cached copy and corrupt future reads.
 *
 * ## TTL
 * Most `memory`-tier caches use `DEFAULT_CACHE_TTL_MS` (24 hours). `getCachedItemDetails`
 * uses a shorter 15-minute TTL. Stale entries are treated as cache misses; callers are
 * responsible for re-fetching via the appropriate sync adapter.
 *
 * @module offline/cache
 */

import { refreshBootstrapSnapshotFromCaches } from "./bootstrapSnapshot";
import { memory, persist, db, checkDbHealth } from "./db";
import { emitBootstrapSnapshotUpdated } from "../posapp/utils/bootstrapRuntimeEvents";
import { finishStartupPhase, startStartupPhase } from "../utils/startupTrace";
import { itemPriceRepository } from "./repositories";

const normalizeScope = (scope: unknown): string => String(scope || "");
const hasScope = (scope: unknown): boolean => normalizeScope(scope).length > 0;
const isMatchingScope = (row: any, scope: unknown): boolean =>
	normalizeScope(row?.profile_scope) === normalizeScope(scope);

const filterByScope = (collection: any, scope: unknown) => {
	if (!hasScope(scope)) {
		return collection;
	}
	return collection.filter((it: any) => isMatchingScope(it, scope));
};

type ItemBarcodeEntry = {
	barcode?: string | null;
};

type ItemSerialEntry = {
	serial_no?: string | null;
};

type ItemBatchEntry = {
	batch_no?: string | null;
};

type SearchableItem = Record<string, any> & {
	item_code?: string | null;
	item_name?: string | null;
	item_barcode?: string | ItemBarcodeEntry[] | null;
	barcodes?: unknown[];
	barcodes_lc?: unknown[];
	name_keywords?: unknown[];
	name_keywords_lc?: unknown[];
	serial_no_data?: ItemSerialEntry[] | null;
	serials?: unknown[];
	batch_no_data?: ItemBatchEntry[] | null;
	batches?: unknown[];
};

const normalizeSearchValue = (value: unknown): string =>
	String(value || "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();

const uniqueStrings = (values: unknown[]): string[] =>
	Array.from(
		new Set(
			values.map((value) => String(value || "").trim()).filter(Boolean),
		),
	);

export const deriveItemSearchFields = (
	item: SearchableItem | null | undefined,
) => {
	const safeItem: SearchableItem = item || {};

	const getBarcodes = (): string[] => {
		const values: unknown[] = [];
		if (Array.isArray(safeItem.item_barcode)) {
			values.push(
				...safeItem.item_barcode
					.map((barcodeEntry) => barcodeEntry?.barcode)
					.filter((barcode): barcode is string => Boolean(barcode)),
			);
		} else if (safeItem.item_barcode) {
			values.push(String(safeItem.item_barcode));
		}
		if (Array.isArray(safeItem.barcodes)) {
			values.push(
				...safeItem.barcodes
					.map((entry: any) =>
						entry && typeof entry === "object"
							? entry.barcode
							: entry,
					)
					.filter(Boolean),
			);
		}
		return uniqueStrings(values);
	};

	const getNameKeywords = (): string[] => {
		const values = [
			safeItem.item_name,
			safeItem.retailmind_short_name,
			safeItem.brand,
			safeItem.item_group,
			safeItem.retailmind_old_pos_pack,
			safeItem.retailmind_old_pos_company_code,
			safeItem.retailmind_old_pos_generic_code,
			safeItem.retailmind_old_pos_generic_name,
			safeItem.retailmind_old_pos_rack,
		];
		if (Array.isArray(safeItem.name_keywords)) {
			values.push(...safeItem.name_keywords);
		}
		return uniqueStrings(
			values.flatMap((value) => {
				const normalized = normalizeSearchValue(value);
				return normalized ? normalized.split(/\s+/) : [];
			}),
		);
	};

	const getSerials = (): string[] => {
		if (Array.isArray(safeItem.serial_no_data)) {
			return safeItem.serial_no_data
				.map((serialEntry) => serialEntry?.serial_no)
				.filter((serial): serial is string => Boolean(serial));
		}
		if (Array.isArray(safeItem.serials)) {
			return safeItem.serials
				.map((serial) => String(serial))
				.filter(Boolean);
		}
		return [];
	};

	const getBatches = (): string[] => {
		if (Array.isArray(safeItem.batch_no_data)) {
			return safeItem.batch_no_data
				.map((batchEntry) => batchEntry?.batch_no)
				.filter((batch): batch is string => Boolean(batch));
		}
		if (Array.isArray(safeItem.batches)) {
			return safeItem.batches
				.map((batch) => String(batch))
				.filter(Boolean);
		}
		return [];
	};

	const barcodes = getBarcodes();
	const nameKeywords = getNameKeywords();
	const itemCodeLc = normalizeSearchValue(safeItem.item_code);
	const itemNameLc = normalizeSearchValue(safeItem.item_name);
	const barcodesLc = barcodes.map(normalizeSearchValue).filter(Boolean);
	const nameKeywordsLc = nameKeywords
		.map(normalizeSearchValue)
		.filter(Boolean);

	return {
		...safeItem,
		item_code_lc: itemCodeLc,
		item_name_lc: itemNameLc,
		barcodes,
		barcodes_lc: barcodesLc,
		name_keywords: nameKeywords,
		name_keywords_lc: nameKeywordsLc,
		serials: getSerials(),
		batches: getBatches(),
		search_text: [itemCodeLc, itemNameLc, ...barcodesLc, ...nameKeywordsLc]
			.filter(Boolean)
			.join(" "),
	};
};

const itemMatchesStoredSearch = (
	item: Record<string, any>,
	term: string,
	terms: string[],
) => {
	const itemName = item.item_name_lc || normalizeSearchValue(item.item_name);
	const itemCode = item.item_code_lc || normalizeSearchValue(item.item_code);
	const searchText = item.search_text || "";
	const barcodes = Array.isArray(item.barcodes_lc)
		? item.barcodes_lc
		: Array.isArray(item.barcodes)
			? item.barcodes.map(normalizeSearchValue)
			: [];

	const nameMatch =
		itemName && terms.every((token) => itemName.includes(token));
	const codeMatch = itemCode && itemCode.includes(term);
	const barcodeMatch = barcodes.some((barcode) => barcode.includes(term));
	const textMatch =
		searchText && terms.every((token) => searchText.includes(token));

	return Boolean(nameMatch || codeMatch || barcodeMatch || textMatch);
};

const scoreStoredItemSearch = (
	item: Record<string, any>,
	term: string,
	terms: string[],
) => {
	const itemName = item.item_name_lc || normalizeSearchValue(item.item_name);
	const itemCode = item.item_code_lc || normalizeSearchValue(item.item_code);
	const barcodes = Array.isArray(item.barcodes_lc)
		? item.barcodes_lc
		: Array.isArray(item.barcodes)
			? item.barcodes.map(normalizeSearchValue)
			: [];
	const nameKeywords = Array.isArray(item.name_keywords_lc)
		? item.name_keywords_lc
		: Array.isArray(item.name_keywords)
			? item.name_keywords.map(normalizeSearchValue)
			: [];

	if (itemCode === term) return 1000;
	if (barcodes.includes(term)) return 950;
	if (itemCode.startsWith(term)) return 800;
	if (itemName.startsWith(term)) return 700;
	if (
		terms.length &&
		terms.every((token) =>
			nameKeywords.some((keyword) => keyword.startsWith(token)),
		)
	) {
		return 650;
	}
	return 100;
};

const toCloneSafeValue = <T>(input: T): T | null => {
	try {
		const seen = new WeakSet<object>();
		const serialized = JSON.stringify(input, (_key, value) => {
			if (typeof value === "function" || typeof value === "symbol") {
				return undefined;
			}
			if (typeof value === "bigint") {
				return String(value);
			}
			if (value && typeof value === "object") {
				const obj = value as object;
				if (seen.has(obj)) {
					return undefined;
				}
				seen.add(obj);
			}
			return value;
		});
		if (serialized === undefined) {
			return null;
		}
		return JSON.parse(serialized) as T;
	} catch {
		return null;
	}
};

const ITEM_CATALOG_ROWS_TABLE = "item_catalog_rows";
const ITEM_CATALOG_STATE_TABLE = "item_catalog_state";
const ITEM_WRITE_CHUNK_SIZE = 1000;
const STALE_CATALOG_GENERATION_MS = 2 * 60 * 60 * 1000;
const itemCatalogRefreshLocks = new Map<string, Promise<void>>();

type ItemCatalogState = {
	profile_scope: string;
	active_generation?: string;
	row_count?: number;
	updated_at: string;
	staging_generations?: Array<{
		generation: string;
		started_at: string;
	}>;
	retired_generations?: string[];
};

const createCatalogGeneration = () => {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const requireCatalogScope = (scope: unknown) => {
	const normalized = normalizeScope(scope).trim();
	if (!normalized) {
		throw new Error("Item catalog generation requires a POS profile scope");
	}
	return normalized;
};

async function getItemCatalogState(
	scope: string,
): Promise<(ItemCatalogState & { active_generation: string }) | null> {
	const state = await db.table(ITEM_CATALOG_STATE_TABLE).get(scope);
	return state?.active_generation
		? (state as ItemCatalogState & { active_generation: string })
		: null;
}

export async function getActiveItemCatalogGeneration(scope: string) {
	const normalizedScope = requireCatalogScope(scope);
	await checkDbHealth();
	if (!db.isOpen()) await db.open();
	return (
		(await getItemCatalogState(normalizedScope))?.active_generation || null
	);
}

function activeCatalogCollection(scope: string, generation: string) {
	return db
		.table(ITEM_CATALOG_ROWS_TABLE)
		.where("[profile_scope+catalog_generation]")
		.equals([scope, generation]);
}

async function resolveScopedCatalogCollection(scope: string) {
	const state = await getItemCatalogState(scope);
	if (state) {
		return {
			collection: activeCatalogCollection(scope, state.active_generation),
			generation: state.active_generation,
			usesGeneration: true,
		};
	}
	return {
		collection: filterByScope(db.table("items"), scope),
		generation: null,
		usesGeneration: false,
	};
}

function normalizeCatalogRows(
	items: unknown,
	scope: string,
	generation: string | null,
	existingByCode: Map<string, Record<string, any>> = new Map(),
) {
	return (Array.isArray(items) ? items : [])
		.filter((item) => item?.item_code)
		.map((item) => toCloneSafeValue<Record<string, any>>(item))
		.filter((item): item is Record<string, any> => !!item?.item_code)
		.map((item) => {
			const existing = existingByCode.get(item.item_code) || {};
			return deriveItemSearchFields({
				...existing,
				...item,
				profile_scope:
					scope || item.profile_scope || existing.profile_scope || "",
				...(generation ? { catalog_generation: generation } : {}),
			});
		});
}

async function writeCatalogRows(rows: Record<string, any>[]) {
	const table = db.table(ITEM_CATALOG_ROWS_TABLE);
	for (
		let offset = 0;
		offset < rows.length;
		offset += ITEM_WRITE_CHUNK_SIZE
	) {
		await table.bulkPut(rows.slice(offset, offset + ITEM_WRITE_CHUNK_SIZE));
	}
}

async function deleteCatalogGenerationRows(scope: string, generation: string) {
	await activeCatalogCollection(scope, generation).delete();
}

export async function withItemCatalogRefreshLock<T>(
	scope: string,
	task: () => Promise<T>,
): Promise<T> {
	const normalizedScope = requireCatalogScope(scope);
	const previous =
		itemCatalogRefreshLocks.get(normalizedScope) || Promise.resolve();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const tail = previous.catch(() => undefined).then(() => gate);
	itemCatalogRefreshLocks.set(normalizedScope, tail);
	await previous.catch(() => undefined);
	try {
		return await task();
	} finally {
		release();
		if (itemCatalogRefreshLocks.get(normalizedScope) === tail) {
			itemCatalogRefreshLocks.delete(normalizedScope);
		}
	}
}

export async function beginItemCatalogGeneration(scope: string) {
	const normalizedScope = requireCatalogScope(scope);
	await checkDbHealth();
	if (!db.isOpen()) await db.open();
	const generation = createCatalogGeneration();
	const now = new Date();
	const rowsTable = db.table(ITEM_CATALOG_ROWS_TABLE);
	const stateTable = db.table(ITEM_CATALOG_STATE_TABLE);
	await db.transaction("rw", rowsTable, stateTable, async () => {
		const current = (await stateTable.get(normalizedScope)) as
			| ItemCatalogState
			| undefined;
		const retainedStaging: NonNullable<
			ItemCatalogState["staging_generations"]
		> = [];
		for (const retiredGeneration of current?.retired_generations || []) {
			await deleteCatalogGenerationRows(
				normalizedScope,
				retiredGeneration,
			);
		}
		for (const staging of current?.staging_generations || []) {
			const startedAt = Date.parse(staging.started_at);
			if (
				Number.isFinite(startedAt) &&
				now.getTime() - startedAt < STALE_CATALOG_GENERATION_MS
			) {
				retainedStaging.push(staging);
				continue;
			}
			await deleteCatalogGenerationRows(
				normalizedScope,
				staging.generation,
			);
		}
		retainedStaging.push({
			generation,
			started_at: now.toISOString(),
		});
		await stateTable.put({
			...(current || {}),
			profile_scope: normalizedScope,
			updated_at: now.toISOString(),
			staging_generations: retainedStaging,
			retired_generations: [],
		});
	});
	return {
		scope: normalizedScope,
		generation,
	};
}

export async function stageItemCatalogRows(
	items: Record<string, any>[],
	scope: string,
	generation: string,
) {
	const transformPhase = startStartupPhase("items.transform_and_index", {
		recordCount: items.length,
		scope,
	});
	const normalizedScope = requireCatalogScope(scope);
	if (!generation) {
		throw new Error("Item catalog staging requires a generation id");
	}
	await checkDbHealth();
	if (!db.isOpen()) await db.open();
	const rows = normalizeCatalogRows(items, normalizedScope, generation);
	finishStartupPhase(transformPhase, "ok", { recordCount: rows.length });
	const writePhase = startStartupPhase("items.indexeddb_write", {
		recordCount: rows.length,
		table: ITEM_CATALOG_ROWS_TABLE,
		scope: normalizedScope,
	});
	await writeCatalogRows(rows);
	finishStartupPhase(writePhase, "ok", { recordCount: rows.length });
	return rows.length;
}

export async function discardItemCatalogGeneration(
	scope: string,
	generation: string,
) {
	const normalizedScope = requireCatalogScope(scope);
	if (!generation) return;
	await checkDbHealth();
	if (!db.isOpen()) await db.open();
	const rowsTable = db.table(ITEM_CATALOG_ROWS_TABLE);
	const stateTable = db.table(ITEM_CATALOG_STATE_TABLE);
	await db.transaction("rw", rowsTable, stateTable, async () => {
		await deleteCatalogGenerationRows(normalizedScope, generation);
		const current = (await stateTable.get(normalizedScope)) as
			| ItemCatalogState
			| undefined;
		if (!current) return;
		const stagingGenerations = (current.staging_generations || []).filter(
			(staging) => staging.generation !== generation,
		);
		if (!current.active_generation && !stagingGenerations.length) {
			await stateTable.delete(normalizedScope);
			return;
		}
		await stateTable.put({
			...current,
			updated_at: new Date().toISOString(),
			staging_generations: stagingGenerations,
		});
	});
}

export async function promoteItemCatalogGeneration(
	scope: string,
	generation: string,
	options: { expectedCount?: number; allowEmpty?: boolean } = {},
) {
	const normalizedScope = requireCatalogScope(scope);
	if (!generation) {
		throw new Error("Item catalog promotion requires a generation id");
	}
	await checkDbHealth();
	if (!db.isOpen()) await db.open();
	const rowsTable = db.table(ITEM_CATALOG_ROWS_TABLE);
	const stateTable = db.table(ITEM_CATALOG_STATE_TABLE);
	let previousGeneration = "";
	let retiredGenerations: string[] = [];
	let rowCount = 0;

	await db.transaction("rw", rowsTable, stateTable, async () => {
		rowCount = await activeCatalogCollection(
			normalizedScope,
			generation,
		).count();
		const expectedCount = Number(options.expectedCount);
		if (
			Number.isFinite(expectedCount) &&
			expectedCount >= 0 &&
			rowCount !== expectedCount
		) {
			throw new Error(
				`Item catalog generation is incomplete: expected ${expectedCount}, stored ${rowCount}`,
			);
		}
		if (!rowCount && !options.allowEmpty) {
			throw new Error(
				"Refusing to promote an empty item catalog generation",
			);
		}

		const previous = (await stateTable.get(normalizedScope)) as
			| ItemCatalogState
			| undefined;
		previousGeneration = previous?.active_generation || "";
		retiredGenerations = Array.from(
			new Set([
				...(previous?.retired_generations || []),
				...(previousGeneration && previousGeneration !== generation
					? [previousGeneration]
					: []),
			]),
		);
		await stateTable.put({
			...(previous || {}),
			profile_scope: normalizedScope,
			active_generation: generation,
			row_count: rowCount,
			updated_at: new Date().toISOString(),
			staging_generations: (previous?.staging_generations || []).filter(
				(staging) => staging.generation !== generation,
			),
			retired_generations: retiredGenerations,
		});
	});

	try {
		for (const retiredGeneration of retiredGenerations) {
			await deleteCatalogGenerationRows(
				normalizedScope,
				retiredGeneration,
			);
		}
		await filterByScope(db.table("items"), normalizedScope).delete();
		await db.transaction("rw", stateTable, async () => {
			const latest = (await stateTable.get(normalizedScope)) as
				| ItemCatalogState
				| undefined;
			if (!latest) return;
			await stateTable.put({
				...latest,
				retired_generations: (latest.retired_generations || []).filter(
					(retiredGeneration) =>
						!retiredGenerations.includes(retiredGeneration),
				),
				updated_at: new Date().toISOString(),
			});
		});
	} catch (cleanupError) {
		console.warn(
			"Failed to prune superseded item catalog rows",
			cleanupError,
		);
	}

	return { generation, rowCount, previousGeneration };
}

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeCacheKeyPart = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const buildScopedCacheKey = (...parts: unknown[]): string =>
	parts.map((part) => normalizeCacheKeyPart(part)).join("::");

const isFreshCacheEntry = (entry: any, ttlMs = DEFAULT_CACHE_TTL_MS) => {
	if (!entry || typeof entry !== "object") {
		return false;
	}
	const timestamp = Number(entry.timestamp || 0);
	if (!timestamp) {
		return false;
	}
	return Date.now() - timestamp < ttlMs;
};

const cloneCachePayload = <T>(value: T): T | null => toCloneSafeValue(value);

const estimateSerializedBytes = (value: unknown) => {
	try {
		const serialized =
			typeof value === "string" ? value : JSON.stringify(value);
		if (!serialized) {
			return 0;
		}
		if (typeof TextEncoder !== "undefined") {
			return new TextEncoder().encode(serialized).length;
		}
		return serialized.length * 2;
	} catch {
		return 0;
	}
};

type ExchangeRateCacheEntry = {
	profileName?: string;
	company?: string;
	fromCurrency?: string;
	toCurrency?: string;
	rateDate?: string;
	date?: string;
	exchange_rate?: number;
	[key: string]: unknown;
};

// --- Generic getters and setters for cached data ----------------------------
/**
 * @deprecated Avoid unscoped reads. Prefer `getAllStoredItems(scope)` with an explicit scope.
 */
export async function getStoredItems() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		return await db.table("items").toArray();
	} catch (e) {
		console.error("Failed to get stored items", e);
		return [];
	}
}

export async function searchStoredItems({
	search = "",
	itemGroup = "",
	limit = 100,
	offset = 0,
	scope = "",
} = {}) {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const normalizedGroup =
			typeof itemGroup === "string" ? itemGroup.trim() : "";
		const normalizedScope = normalizeScope(scope).trim();
		let collection = normalizedScope
			? (await resolveScopedCatalogCollection(normalizedScope)).collection
			: db.table("items").toCollection();
		if (normalizedGroup && normalizedGroup.toLowerCase() !== "all") {
			const groupLower = normalizedGroup.toLowerCase();
			collection = collection.filter(
				(item: any) =>
					String(item?.item_group || "").toLowerCase() === groupLower,
			);
		}
		const normalizedSearch =
			typeof search === "string" ? search.trim() : "";
		if (normalizedSearch) {
			const term = normalizeSearchValue(normalizedSearch);
			const terms = term.split(/\s+/).filter(Boolean);

			const matchedItems = await collection
				.filter((it) => itemMatchesStoredSearch(it, term, terms))
				.toArray();
			return matchedItems
				.map((item, originalIndex) => ({
					item,
					originalIndex,
					score: scoreStoredItemSearch(item, term, terms),
				}))
				.sort(
					(left, right) =>
						right.score - left.score ||
						left.originalIndex - right.originalIndex,
				)
				.slice(offset, offset + limit)
				.map(({ item }) => item);
		}

		const res = await collection.offset(offset).limit(limit).toArray();
		return res;
	} catch (e) {
		console.error("Failed to query stored items", e);
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

export async function getStoredItemsCountByScope(scope = "") {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const normalizedScope = normalizeScope(scope).trim();
		if (!normalizedScope) {
			return await db.table("items").count();
		}
		return await (
			await resolveScopedCatalogCollection(normalizedScope)
		).collection.count();
	} catch (e) {
		console.error("Failed to count scoped stored items", e);
		return 0;
	}
}

export async function getAllStoredItems(scope = "") {
	if (!hasScope(scope)) {
		console.warn(
			"getAllStoredItems called without scope; returning all items (deprecated behavior).",
		);
		return await getStoredItems();
	}
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		return await (
			await resolveScopedCatalogCollection(normalizeScope(scope).trim())
		).collection.toArray();
	} catch (e) {
		console.error("Failed to read scoped stored items", e);
		return [];
	}
}

export async function saveItemsBulk(items, scope = "") {
	return await saveItems(items, scope);
}

export async function saveItems(items, scope = "") {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const normalizedScope = normalizeScope(scope).trim();
		const incomingItems = Array.isArray(items)
			? items
					.filter((it) => it?.item_code)
					.map((it) => toCloneSafeValue<Record<string, any>>(it))
					.filter((it): it is Record<string, any> => !!it?.item_code)
			: [];
		if (!incomingItems.length) {
			return;
		}

		const itemCodes = Array.from(
			new Set(incomingItems.map((it) => it.item_code).filter(Boolean)),
		);
		const catalogState = normalizedScope
			? await getItemCatalogState(normalizedScope)
			: null;
		const targetTable = catalogState
			? db.table(ITEM_CATALOG_ROWS_TABLE)
			: db.table("items");
		const existingRows: any[] = [];
		for (let i = 0; i < itemCodes.length; i += ITEM_WRITE_CHUNK_SIZE) {
			const codeChunk = itemCodes.slice(i, i + ITEM_WRITE_CHUNK_SIZE);
			if (!codeChunk.length) {
				continue;
			}
			const rows = await targetTable
				.where("item_code")
				.anyOf(codeChunk)
				.filter((row: any) =>
					catalogState
						? row?.profile_scope === normalizedScope &&
							row?.catalog_generation ===
								catalogState.active_generation
						: !normalizedScope ||
							isMatchingScope(row, normalizedScope),
				)
				.toArray();
			if (Array.isArray(rows) && rows.length) {
				existingRows.push(...rows);
			}
		}
		const existingByCode = new Map(
			existingRows.map((row: any) => [row.item_code, row]),
		);

		for (let i = 0; i < incomingItems.length; i += ITEM_WRITE_CHUNK_SIZE) {
			const itemChunk = incomingItems.slice(i, i + ITEM_WRITE_CHUNK_SIZE);
			const scopedItems = normalizeCatalogRows(
				itemChunk,
				normalizedScope,
				catalogState?.active_generation || null,
				existingByCode,
			);
			if (!scopedItems.length) {
				continue;
			}
			try {
				await targetTable.bulkPut(scopedItems);
			} catch (bulkError) {
				console.warn(
					"bulkPut failed for items chunk; retrying one-by-one",
					bulkError,
				);
				for (const row of scopedItems) {
					try {
						await targetTable.put(row);
					} catch (rowError) {
						console.error("Failed to save item row", {
							item_code: row?.item_code,
							rowError,
						});
					}
				}
			}
		}
	} catch (e) {
		console.error("Failed to save items", e);
	}
}

export async function clearStoredItems(scope = "") {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		if (!hasScope(scope)) {
			console.warn(
				"clearStoredItems called without scope; clearing all cached items.",
			);
			await db.transaction(
				"rw",
				db.table("items"),
				db.table(ITEM_CATALOG_ROWS_TABLE),
				db.table(ITEM_CATALOG_STATE_TABLE),
				async () => {
					await Promise.all([
						db.table("items").clear(),
						db.table(ITEM_CATALOG_ROWS_TABLE).clear(),
						db.table(ITEM_CATALOG_STATE_TABLE).clear(),
					]);
				},
			);
			return;
		}
		const normalizedScope = normalizeScope(scope).trim();
		await db.transaction(
			"rw",
			db.table("items"),
			db.table(ITEM_CATALOG_ROWS_TABLE),
			db.table(ITEM_CATALOG_STATE_TABLE),
			async () => {
				await Promise.all([
					filterByScope(db.table("items"), normalizedScope).delete(),
					db
						.table(ITEM_CATALOG_ROWS_TABLE)
						.where("profile_scope")
						.equals(normalizedScope)
						.delete(),
					db.table(ITEM_CATALOG_STATE_TABLE).delete(normalizedScope),
				]);
			},
		);
	} catch (e) {
		console.error("Failed to clear stored items", e);
	}
}

export function saveItemUOMs(itemCode, uoms) {
	try {
		const cache = memory.uom_cache;
		const cleanUoms = JSON.parse(JSON.stringify(uoms));
		cache[itemCode] = cleanUoms;
		memory.uom_cache = cache;
		persist("uom_cache");
	} catch (e) {
		console.error("Failed to cache UOMs", e);
	}
}

export function getItemUOMs(itemCode) {
	try {
		const cache = memory.uom_cache || {};
		return cache[itemCode] || [];
	} catch {
		return [];
	}
}

export function saveOffers(offers) {
	try {
		memory.offers_cache = offers;
		persist("offers_cache");
		refreshBootstrapSnapshotFromCacheState({
			offers: memory.offers_cache,
		});
	} catch (e) {
		console.error("Failed to cache offers", e);
	}
}

export async function deleteStoredItemsByCodes(
	itemCodes: string[] = [],
	scope = "",
) {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const normalizedCodes = Array.from(
			new Set(
				(Array.isArray(itemCodes) ? itemCodes : [])
					.map((code) => String(code || "").trim())
					.filter(Boolean),
			),
		);
		if (!normalizedCodes.length) {
			return;
		}

		if (!hasScope(scope)) {
			await db.table("items").bulkDelete(normalizedCodes);
			return;
		}

		const normalizedScope = normalizeScope(scope).trim();
		const state = await getItemCatalogState(normalizedScope);
		if (state) {
			const keys = await db
				.table(ITEM_CATALOG_ROWS_TABLE)
				.where("item_code")
				.anyOf(normalizedCodes)
				.filter(
					(row: any) =>
						row?.profile_scope === normalizedScope &&
						row?.catalog_generation === state.active_generation,
				)
				.primaryKeys();
			if (keys.length) {
				await db.table(ITEM_CATALOG_ROWS_TABLE).bulkDelete(keys);
			}
			return;
		}

		const existingRows = await db
			.table("items")
			.where("item_code")
			.anyOf(normalizedCodes)
			.toArray();
		const matchingCodes = existingRows
			.filter((row: any) => isMatchingScope(row, normalizedScope))
			.map((row: any) => row?.item_code)
			.filter(Boolean);

		if (matchingCodes.length) {
			await db.table("items").bulkDelete(matchingCodes);
		}
	} catch (e) {
		console.error("Failed to delete stored items by code", e);
	}
}

export function getCachedOffers() {
	try {
		return memory.offers_cache || [];
	} catch {
		return [];
	}
}

export function savePriceListItems(priceList, items) {
	try {
		const cache = memory.price_list_cache || {};
		let cleanItems;
		try {
			cleanItems = JSON.parse(JSON.stringify(items));
		} catch (err) {
			console.error("Failed to serialize price list items", err);
			cleanItems = [];
		}

		cache[priceList] = {
			items: cleanItems,
			timestamp: Date.now(),
		};
		memory.price_list_cache = cache;
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to cache price list items", e);
	}
}

export function getCachedPriceListItems(priceList) {
	try {
		const cache = memory.price_list_cache || {};
		const cachedData = cache[priceList];
		if (cachedData) {
			const isValid =
				Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData.items : null;
		}
		return null;
	} catch (e) {
		console.error("Failed to get cached price list items", e);
		return null;
	}
}

export async function getCachedItemPriceForUom({
	priceList,
	itemCode,
	uom,
	customer = null,
	currency = null,
	date = null,
}: {
	priceList: string;
	itemCode: string;
	uom: string;
	customer?: string | null;
	currency?: string | null;
	date?: string | null;
}) {
	try {
		return await itemPriceRepository.findApplicableForItemAndUom({
			priceList,
			itemCode,
			uom,
			customer,
			currency,
			date,
		});
	} catch (error) {
		console.error("Failed to resolve cached UOM Item Price", error);
		return null;
	}
}

export function clearPriceListCache() {
	try {
		memory.price_list_cache = {};
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to clear price list cache", e);
	}
}

export function mergeCachedPriceListItems(
	priceList,
	items: Record<string, any>[] = [],
) {
	try {
		if (!priceList || !Array.isArray(items) || !items.length) {
			return;
		}
		const cache = memory.price_list_cache || {};
		const cachedEntry = cache[priceList];
		if (!cachedEntry || !Array.isArray(cachedEntry.items)) {
			return;
		}

		const mergedItems = Array.isArray(cachedEntry.items)
			? [...cachedEntry.items]
			: [];
		const itemIndex = new Map(
			mergedItems
				.filter((entry) => entry?.item_code)
				.map((entry) => [entry.item_code, entry]),
		);

		items.forEach((item) => {
			if (!item?.item_code) {
				return;
			}
			const cleanItem =
				cloneCachePayload(item) || JSON.parse(JSON.stringify(item));
			itemIndex.set(item.item_code, cleanItem);
		});

		cache[priceList] = {
			items: Array.from(itemIndex.values()),
			timestamp: Date.now(),
		};
		memory.price_list_cache = cache;
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to merge cached price list items", e);
	}
}

export function removeCachedPriceListItems(
	itemCodes: string[] = [],
	priceList: string | null = null,
) {
	try {
		const normalizedCodes = new Set(
			(Array.isArray(itemCodes) ? itemCodes : [])
				.map((code) => String(code || "").trim())
				.filter(Boolean),
		);
		if (!normalizedCodes.size) {
			return;
		}

		const cache = memory.price_list_cache || {};
		const targetLists = priceList ? [priceList] : Object.keys(cache || {});

		targetLists.forEach((targetPriceList) => {
			const cachedEntry = cache[targetPriceList];
			if (!cachedEntry || !Array.isArray(cachedEntry.items)) {
				return;
			}
			cache[targetPriceList] = {
				...cachedEntry,
				items: cachedEntry.items.filter(
					(entry) =>
						!normalizedCodes.has(
							String(entry?.item_code || "").trim(),
						),
				),
				timestamp: Date.now(),
			};
		});

		memory.price_list_cache = cache;
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to remove cached price list items", e);
	}
}

export function saveItemDetailsCache(profileName, priceList, items) {
	try {
		const cache = memory.item_details_cache || {};
		const profileCache = cache[profileName] || {};
		const priceCache = profileCache[priceList] || {};
		let cleanItems;
		try {
			cleanItems = items.map((it) => ({
				item_code: it.item_code,
				stock_uom: it.stock_uom,
				conversion_factor: it.conversion_factor,
				actual_qty: it.actual_qty,
				serial_no_data: it.serial_no_data,
				batch_no_data: it.batch_no_data,
				has_batch_no: it.has_batch_no,
				has_serial_no: it.has_serial_no,
				item_uoms: it.item_uoms,
				rate: it.rate,
				price_list_rate: it.price_list_rate,
				trade_price: it.trade_price,
				buying_rate: it.buying_rate,
				buying_price_list: it.buying_price_list,
				buying_price_currency: it.buying_price_currency,
				_buying_prices_by_uom: it._buying_prices_by_uom,
			}));
			cleanItems = JSON.parse(JSON.stringify(cleanItems));
		} catch (err) {
			console.error("Failed to serialize item details", err);
			cleanItems = [];
		}
		cleanItems.forEach((item) => {
			priceCache[item.item_code] = {
				data: item,
				timestamp: Date.now(),
			};
		});
		profileCache[priceList] = priceCache;
		cache[profileName] = profileCache;
		memory.item_details_cache = cache;
		persist("item_details_cache");
	} catch (e) {
		console.error("Failed to cache item details", e);
	}
}

async function attachOfflineBuyingFloors(profileName: string, items: any[]) {
	if (!profileName || !items.length) return items;
	const profile = await db.table("pos_profiles").get(profileName);
	const buyingPriceList = String(profile?.buying_price_list || "").trim();
	if (!buyingPriceList) return items;

	const itemCodes = new Set(
		items.map((item) => String(item?.item_code || "")),
	);
	const today = new Date().toISOString().slice(0, 10);
	const priceRows = await db
		.table("item_price_records")
		.where("price_list")
		.equals(buyingPriceList)
		.filter(
			(row) =>
				itemCodes.has(String(row?.item_code || "")) &&
				!row?.customer &&
				!row?.supplier &&
				(!row?.valid_from ||
					String(row.valid_from).slice(0, 10) <= today) &&
				(!row?.valid_upto ||
					String(row.valid_upto).slice(0, 10) >= today),
		)
		.toArray();
	if (!priceRows.length) return items;

	const companyCurrency = String(
		profile?.company_currency || profile?.currency || "",
	);
	const currencyRates = new Map<string, number>();
	const toCompanyRate = async (currency: string) => {
		if (!currency || !companyCurrency || currency === companyCurrency)
			return 1;
		if (currencyRates.has(currency))
			return currencyRates.get(currency) || 0;
		const rows = await db
			.table("currency_rate_records")
			.where("[profile_name+company+from_currency+to_currency]")
			.equals([
				profileName,
				String(profile?.company || ""),
				currency,
				companyCurrency,
			])
			.toArray();
		const selected = rows
			.filter(
				(row) => !row?.date || String(row.date).slice(0, 10) <= today,
			)
			.sort((left, right) =>
				String(right?.date || right?.modified || "").localeCompare(
					String(left?.date || left?.modified || ""),
				),
			)[0];
		const rate = Number(selected?.exchange_rate || 0);
		currencyRates.set(currency, Number.isFinite(rate) ? rate : 0);
		return currencyRates.get(currency) || 0;
	};

	const rowsByItem = new Map<string, any[]>();
	for (const row of priceRows) {
		const itemCode = String(row.item_code || "");
		const rows = rowsByItem.get(itemCode) || [];
		rows.push(row);
		rowsByItem.set(itemCode, rows);
	}

	for (const item of items) {
		const buyingRows = rowsByItem.get(String(item?.item_code || "")) || [];
		buyingRows.sort((left, right) =>
			String(right?.valid_from || right?.modified || "").localeCompare(
				String(left?.valid_from || left?.modified || ""),
			),
		);
		const pricesByUom: Record<string, any> = {};
		for (const row of buyingRows) {
			const uom = String(row?.uom || "");
			if (pricesByUom[uom]) continue;
			const rate = Number(row?.price_list_rate || 0);
			const exchangeRate = await toCompanyRate(
				String(row?.currency || ""),
			);
			if (!Number.isFinite(rate) || rate <= 0 || exchangeRate <= 0)
				continue;
			pricesByUom[uom] = {
				price_list_rate: rate,
				base_price_list_rate: rate * exchangeRate,
				currency: row?.currency || companyCurrency,
				price_list: buyingPriceList,
			};
		}
		if (Object.keys(pricesByUom).length) {
			item._buying_prices_by_uom = pricesByUom;
			item.buying_price_list = buyingPriceList;
		}
	}
	return items;
}

export async function setProfileBuyingPriceList(
	profile: any,
	buyingPriceList: string | null | undefined,
) {
	if (!profile?.name || !buyingPriceList) return;
	await checkDbHealth();
	if (!db.isOpen()) await db.open();
	const current =
		(await db.table("pos_profiles").get(profile.name)) || profile;
	await db.table("pos_profiles").put({
		...current,
		buying_price_list: buyingPriceList,
	});
}

/**
 * Returns cached item details, split into `cached` (fresh) and `missing` (absent or stale)
 * groups so callers know exactly which items need a network fetch.
 *
 * This function spans both storage tiers:
 * 1. Reads per-item detail overrides from `memory.item_details_cache`
 *    (keyed by `profileName → priceList → item_code`, TTL 15 minutes).
 * 2. For items that are fresh, fetches their base records from the Dexie `items` table
 *    and merges them: `result = { ...baseItem, ...detailOverride }`.
 *
 * @param profileName - POS profile name used as the first cache key dimension.
 * @param priceList - Price list name used as the second cache key dimension.
 * @param itemCodes - Item codes to look up.
 * @param ttl - Cache TTL in milliseconds. Defaults to 15 minutes.
 * @returns `{ cached: mergedItems[], missing: itemCodes[] }`.
 */
export async function getCachedItemDetails(
	profileName: string,
	priceList: string,
	itemCodes: string[],
	ttl = 15 * 60 * 1000,
) {
	try {
		const cache = memory.item_details_cache || {};
		const priceCache = cache[profileName]?.[priceList] || {};
		const now = Date.now();
		const cached: any[] = [];
		const missing: string[] = [];
		itemCodes.forEach((code) => {
			const entry = priceCache[code];
			if (entry && now - entry.timestamp < ttl) {
				cached.push(entry.data);
			} else {
				missing.push(code);
			}
		});

		if (cached.length) {
			await checkDbHealth();
			if (!db.isOpen()) await db.open();
			const baseItems = await db
				.table("items")
				.where("item_code")
				.anyOf(cached.map((it) => it.item_code))
				.toArray();
			const map = new Map(baseItems.map((it) => [it.item_code, it]));
			cached.forEach((det, idx) => {
				const base = map.get(det.item_code) || {};
				cached[idx] = { ...base, ...det };
			});
			await attachOfflineBuyingFloors(profileName, cached);
		}

		return { cached, missing };
	} catch (e) {
		console.error("Failed to get cached item details", e);
		return { cached: [], missing: itemCodes };
	}
}

export function clearItemDetailsCache() {
	try {
		memory.item_details_cache = {};
		persist("item_details_cache");
	} catch (e) {
		console.error("Failed to clear item details cache", e);
	}
}

export function removeItemDetailsCacheEntries(
	profileName,
	itemCodes: string[] = [],
	priceList: string | null = null,
) {
	try {
		const normalizedCodes = new Set(
			(Array.isArray(itemCodes) ? itemCodes : [])
				.map((code) => String(code || "").trim())
				.filter(Boolean),
		);
		if (!normalizedCodes.size) {
			return;
		}

		const cache = memory.item_details_cache || {};
		const targetProfiles = profileName
			? [profileName]
			: Object.keys(cache || {});

		targetProfiles.forEach((targetProfile) => {
			const profileCache = cache[targetProfile];
			if (!profileCache || typeof profileCache !== "object") {
				return;
			}
			const targetPriceLists = priceList
				? [priceList]
				: Object.keys(profileCache);

			targetPriceLists.forEach((targetPriceList) => {
				const priceCache = profileCache[targetPriceList];
				if (!priceCache || typeof priceCache !== "object") {
					return;
				}
				normalizedCodes.forEach((code) => {
					delete priceCache[code];
				});
				profileCache[targetPriceList] = priceCache;
			});

			cache[targetProfile] = profileCache;
		});

		memory.item_details_cache = cache;
		persist("item_details_cache");
	} catch (e) {
		console.error("Failed to remove item details cache entries", e);
	}
}

export function saveTaxTemplate(name, doc) {
	try {
		const cache = memory.tax_template_cache || {};
		const cleanDoc = JSON.parse(JSON.stringify(doc));
		cache[name] = cleanDoc;
		memory.tax_template_cache = cache;
		persist("tax_template_cache");
	} catch (e) {
		console.error("Failed to cache tax template", e);
	}
}

export const setTaxTemplate = saveTaxTemplate;

export function getTaxTemplate(name) {
	try {
		const cache = memory.tax_template_cache || {};
		return cache[name] || null;
	} catch (e) {
		console.error("Failed to get cached tax template", e);
		return null;
	}
}

export function getSalesPersonsStorage() {
	return memory.sales_persons_storage || [];
}

export function setSalesPersonsStorage(data) {
	try {
		memory.sales_persons_storage = JSON.parse(JSON.stringify(data));
		persist("sales_persons_storage");
		refreshBootstrapSnapshotFromCacheState({
			salesPersons: memory.sales_persons_storage,
		});
	} catch (e) {
		console.error("Failed to set sales persons storage", e);
	}
}

export function getOpeningStorage() {
	return memory.pos_opening_storage || null;
}

export function getBootstrapSnapshot() {
	return memory.bootstrap_snapshot || null;
}

/**
 * Re-evaluates the stored bootstrap snapshot against the current cache state and
 * persists the updated snapshot.
 *
 * Called as a side effect by most `save*` functions in this module. Callers pass a
 * partial `cacheState` object describing what changed (e.g. `{ offers: [...] }`);
 * `refreshBootstrapSnapshotFromCaches` merges it with the rest of the current snapshot
 * to produce an updated readiness record.
 *
 * This is the mechanism that keeps the offline-readiness banner in sync with actual
 * cache state without a dedicated polling loop.
 *
 * @param cacheState - Partial cache state describing what was just written.
 */
export function refreshBootstrapSnapshotFromCacheState(cacheState = {}) {
	try {
		setBootstrapSnapshot(
			refreshBootstrapSnapshotFromCaches({
				currentSnapshot: getBootstrapSnapshot(),
				cacheState,
			}),
		);
	} catch (e) {
		console.error(
			"Failed to refresh bootstrap snapshot from cache state",
			e,
		);
	}
}

export function setBootstrapSnapshot(snapshot) {
	try {
		memory.bootstrap_snapshot = snapshot
			? JSON.parse(JSON.stringify(snapshot))
			: null;
		persist("bootstrap_snapshot");
		emitBootstrapSnapshotUpdated(memory.bootstrap_snapshot);
	} catch (e) {
		console.error("Failed to set bootstrap snapshot", e);
	}
}

export function getBootstrapSnapshotStatus() {
	return memory.bootstrap_snapshot_status || null;
}

export function setBootstrapSnapshotStatus(status) {
	try {
		memory.bootstrap_snapshot_status = status
			? JSON.parse(JSON.stringify(status))
			: null;
		persist("bootstrap_snapshot_status");
	} catch (e) {
		console.error("Failed to set bootstrap snapshot status", e);
	}
}

export function getBootstrapLimitedMode() {
	return !!memory.bootstrap_limited_mode;
}

export function setBootstrapLimitedMode(state) {
	try {
		memory.bootstrap_limited_mode = !!state;
		persist("bootstrap_limited_mode");
	} catch (e) {
		console.error("Failed to set bootstrap limited mode", e);
	}
}

// --- Opening storage (memory + IndexedDB) ------------------------------------
// `pos_opening_storage` lives in `memory` for fast synchronous access.
// `pos_profiles` and `opening_shifts` are additionally written to Dexie so they
// survive a hard reload even if localStorage is cleared.

function cloneOpeningData(data: any) {
	try {
		return JSON.parse(JSON.stringify(data));
	} catch (e) {
		console.error("Failed to clone opening data", e);
		return null;
	}
}

async function persistOpeningEntities(data: any) {
	if (!data) {
		return;
	}
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();

		const profile = data?.pos_profile;
		if (profile?.name) {
			await db.table("pos_profiles").put(profile);
		}

		const openingShift = data?.pos_opening_shift;
		if (openingShift?.name) {
			await db.table("opening_shifts").put({
				...openingShift,
				pos_profile: openingShift?.pos_profile || profile?.name || "",
			});
		}
	} catch (e) {
		console.error("Failed to persist opening entities", e);
	}
}

async function clearPersistedOpeningShift(data: any) {
	const openingShiftName = data?.pos_opening_shift?.name;
	if (!openingShiftName) {
		return;
	}
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		await db.table("opening_shifts").delete(openingShiftName);
	} catch (e) {
		console.error("Failed to clear opening shift storage", e);
	}
}

export function setOpeningStorage(data) {
	try {
		const cleanData = cloneOpeningData(data);
		if (!cleanData) {
			return;
		}
		memory.pos_opening_storage = cleanData;
		persist("pos_opening_storage");
		void persistOpeningEntities(cleanData);
	} catch (e) {
		console.error("Failed to set opening storage", e);
	}
}

export function clearOpeningStorage() {
	try {
		const previousOpeningData = cloneOpeningData(
			memory.pos_opening_storage,
		);
		memory.pos_opening_storage = null;
		persist("pos_opening_storage");
		void clearPersistedOpeningShift(previousOpeningData);
	} catch (e) {
		console.error("Failed to clear opening storage", e);
	}
}

export function getOpeningDialogStorage() {
	return memory.opening_dialog_storage || null;
}

export function setOpeningDialogStorage(data) {
	try {
		memory.opening_dialog_storage = JSON.parse(JSON.stringify(data));
		persist("opening_dialog_storage");
	} catch (e) {
		console.error("Failed to set opening dialog storage", e);
	}
}

export function getTaxInclusiveSetting() {
	return !!memory.tax_inclusive;
}

export function setTaxInclusiveSetting(value) {
	memory.tax_inclusive = !!value;
	persist("tax_inclusive");
	refreshBootstrapSnapshotFromCacheState({
		taxInclusive: memory.tax_inclusive,
	});
}

/**
 * Clears all `memory`-tier caches to free up localStorage space under memory pressure.
 *
 * **Does NOT touch the Dexie IndexedDB tables** (`items`, `customers`, etc.). Those are
 * preserved so the POS can continue operating offline. Only the faster, smaller
 * `memory`-tier caches (price lists, item details, exchange rates, etc.) are emptied.
 * All cleared keys are immediately persisted so that the empty state survives a reload.
 *
 * Callers should expect that any `getCached*` call after this returns `null` / empty until
 * the relevant sync adapter re-populates the cache.
 */
export function reduceCacheUsage() {
	memory.price_list_cache = {};
	memory.item_details_cache = {};
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.delivery_charges_cache = {};
	memory.currency_options_cache = {};
	memory.exchange_rate_cache = {};
	memory.price_list_meta_cache = {};
	memory.customer_addresses_cache = {};
	memory.payment_method_currency_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.coupons_cache = {};
	memory.item_groups_cache = [];
	persist("price_list_cache");
	persist("item_details_cache");
	persist("uom_cache");
	persist("offers_cache");
	persist("customer_balance_cache");
	persist("delivery_charges_cache");
	persist("currency_options_cache");
	persist("exchange_rate_cache");
	persist("price_list_meta_cache");
	persist("customer_addresses_cache");
	persist("payment_method_currency_cache");
	persist("local_stock_cache");
	persist("stock_cache_ready");
	persist("coupons_cache");
	persist("item_groups_cache");
}

// --- Sync watermarks (memory + IndexedDB) ------------------------------------
// Delta sync cursors are kept in memory for synchronous access and persisted via
// `persist()` into the `sync_state` table. `db.ts` still reads legacy
// `localStorage` keys during initialization for migration safety.

export function setItemsLastSync(timestamp) {
	memory.items_last_sync = timestamp || null;
	persist("items_last_sync");
}

export function getItemsLastSync() {
	return memory.items_last_sync || null;
}

export function setCustomersLastSync(timestamp) {
	memory.customers_last_sync = timestamp || null;
	persist("customers_last_sync");
}

export function getCustomersLastSync() {
	return memory.customers_last_sync || null;
}

export async function getCustomerStorageCount() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		return await db.table("customers").count();
	} catch {
		return 0;
	}
}

export async function clearCustomerStorage() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		await db.table("customers").clear();
		memory.customer_storage = [];
	} catch (e) {
		console.error("Failed to clear customer storage", e);
	}
}

// Pricing Rules Logic
function sanitiseSnapshot(snapshot = []) {
	if (!Array.isArray(snapshot)) {
		return [];
	}
	try {
		return JSON.parse(JSON.stringify(snapshot));
	} catch (error) {
		console.error("Failed to sanitise pricing rules snapshot", error);
		return [];
	}
}

export function savePricingRulesSnapshot(
	snapshot = [],
	context = null,
	staleAt = null,
) {
	memory.pricing_rules_snapshot = sanitiseSnapshot(snapshot);
	memory.pricing_rules_context = context || null;
	memory.pricing_rules_last_sync = new Date().toISOString();
	memory.pricing_rules_stale_at = staleAt || null;

	persist("pricing_rules_snapshot");
	persist("pricing_rules_context");
	persist("pricing_rules_last_sync");
	persist("pricing_rules_stale_at");
	refreshBootstrapSnapshotFromCacheState({
		pricingSnapshotCount: true,
		pricingContext: memory.pricing_rules_context,
	});
}

export function getCachedPricingRulesSnapshot() {
	return {
		snapshot: Array.isArray(memory.pricing_rules_snapshot)
			? memory.pricing_rules_snapshot
			: [],
		context: memory.pricing_rules_context || null,
		lastSync: memory.pricing_rules_last_sync || null,
		staleAt: memory.pricing_rules_stale_at || null,
	};
}

export function clearPricingRulesSnapshot() {
	memory.pricing_rules_snapshot = [];
	memory.pricing_rules_context = null;
	memory.pricing_rules_last_sync = null;
	memory.pricing_rules_stale_at = null;

	persist("pricing_rules_snapshot");
	persist("pricing_rules_context");
	persist("pricing_rules_last_sync");
	persist("pricing_rules_stale_at");
	refreshBootstrapSnapshotFromCacheState({
		pricingSnapshotCount: 0,
		pricingContext: null,
	});
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
		persist("translation_cache");
	} catch (e) {
		console.error("Failed to cache translations", e);
	}
}

export function getPrintTemplate() {
	try {
		return memory.print_template || "";
	} catch {
		return "";
	}
}

export function setPrintTemplate(template) {
	try {
		memory.print_template = template || "";
		persist("print_template");
		refreshBootstrapSnapshotFromCacheState({
			printTemplate: memory.print_template,
		});
	} catch (e) {
		console.error("Failed to set print template", e);
	}
}

export function getTermsAndConditions() {
	try {
		return memory.terms_and_conditions || "";
	} catch {
		return "";
	}
}

export function setTermsAndConditions(terms) {
	try {
		memory.terms_and_conditions = terms || "";
		persist("terms_and_conditions");
		refreshBootstrapSnapshotFromCacheState({
			termsAndConditions: memory.terms_and_conditions,
		});
	} catch (e) {
		console.error("Failed to set terms and conditions", e);
	}
}

// Coupons
export function saveCoupons(coupons) {
	try {
		memory.coupons_cache = coupons || {};
		persist("coupons_cache");
		refreshBootstrapSnapshotFromCacheState({
			coupons: memory.coupons_cache,
		});
	} catch (e) {
		console.error("Failed to save coupons", e);
	}
}

export function getCachedCoupons() {
	return memory.coupons_cache || {};
}

export function clearCoupons() {
	memory.coupons_cache = {};
	persist("coupons_cache");
	refreshBootstrapSnapshotFromCacheState({
		coupons: memory.coupons_cache,
	});
}

// Item Groups
export function saveItemGroups(groups) {
	try {
		memory.item_groups_cache = groups || [];
		persist("item_groups_cache");
		refreshBootstrapSnapshotFromCacheState({
			itemGroups: memory.item_groups_cache,
		});
	} catch (e) {
		console.error("Failed to save item groups", e);
	}
}

export function getCachedItemGroups() {
	return memory.item_groups_cache || [];
}

export function clearItemGroups() {
	memory.item_groups_cache = [];
	persist("item_groups_cache");
	refreshBootstrapSnapshotFromCacheState({
		itemGroups: memory.item_groups_cache,
	});
}

// --- Scoped key-value caches (memory, TTL-based) ------------------------------
// The following caches store small, scoped payloads in `memory` using composite
// keys built by `buildScopedCacheKey`. Each entry carries a `timestamp` checked
// by `isFreshCacheEntry` against `DEFAULT_CACHE_TTL_MS` (24 h) or an override.
// Save operations call `refreshBootstrapSnapshotFromCacheState` as a side effect.

export function saveDeliveryChargesCache(
	profileName,
	customer,
	deliveryCharges,
) {
	try {
		const key = buildScopedCacheKey(profileName, customer);
		if (!key || !Array.isArray(deliveryCharges)) {
			return;
		}
		const cache = memory.delivery_charges_cache || {};
		cache[key] = {
			data: cloneCachePayload(deliveryCharges) || [],
			timestamp: Date.now(),
		};
		memory.delivery_charges_cache = cache;
		persist("delivery_charges_cache");
		refreshBootstrapSnapshotFromCacheState({
			deliveryChargesCount: Object.keys(
				memory.delivery_charges_cache || {},
			).length,
		});
	} catch (e) {
		console.error("Failed to save delivery charges cache", e);
	}
}

export function getCachedDeliveryCharges(
	profileName,
	customer,
	ttlMs = DEFAULT_CACHE_TTL_MS,
) {
	try {
		const key = buildScopedCacheKey(profileName, customer);
		const entry = (memory.delivery_charges_cache || {})[key];
		if (!isFreshCacheEntry(entry, ttlMs)) {
			return null;
		}
		return cloneCachePayload(entry.data) || [];
	} catch (e) {
		console.error("Failed to get cached delivery charges", e);
		return null;
	}
}

export function saveCurrencyOptionsCache(profileName, currencies) {
	try {
		const key = buildScopedCacheKey(profileName);
		if (!key || !Array.isArray(currencies)) {
			return;
		}
		const cache = memory.currency_options_cache || {};
		cache[key] = {
			data: cloneCachePayload(currencies) || [],
			timestamp: Date.now(),
		};
		memory.currency_options_cache = cache;
		persist("currency_options_cache");
		refreshBootstrapSnapshotFromCacheState({
			currencyOptionsCount: Object.keys(
				memory.currency_options_cache || {},
			).length,
		});
	} catch (e) {
		console.error("Failed to save currency options cache", e);
	}
}

export function getCachedCurrencyOptions(
	profileName,
	ttlMs = DEFAULT_CACHE_TTL_MS,
) {
	try {
		const key = buildScopedCacheKey(profileName);
		const entry = (memory.currency_options_cache || {})[key];
		if (!isFreshCacheEntry(entry, ttlMs)) {
			return null;
		}
		return cloneCachePayload(entry.data) || [];
	} catch (e) {
		console.error("Failed to get cached currency options", e);
		return null;
	}
}

export function saveExchangeRateCache(entry: ExchangeRateCacheEntry = {}) {
	try {
		const key = buildScopedCacheKey(
			entry.profileName,
			entry.company,
			entry.fromCurrency,
			entry.toCurrency,
			entry.rateDate || entry.date,
		);
		if (!key || !entry.fromCurrency || !entry.toCurrency) {
			return;
		}
		const cache = memory.exchange_rate_cache || {};
		cache[key] = {
			data: cloneCachePayload(entry) || {},
			timestamp: Date.now(),
		};
		memory.exchange_rate_cache = cache;
		persist("exchange_rate_cache");
		refreshBootstrapSnapshotFromCacheState({
			exchangeRateCount: Object.keys(memory.exchange_rate_cache || {})
				.length,
		});
	} catch (e) {
		console.error("Failed to save exchange rate cache", e);
	}
}

export function getCachedExchangeRate(
	entry: ExchangeRateCacheEntry = {},
	ttlMs = DEFAULT_CACHE_TTL_MS,
) {
	try {
		const key = buildScopedCacheKey(
			entry.profileName,
			entry.company,
			entry.fromCurrency,
			entry.toCurrency,
			entry.rateDate || entry.date,
		);
		const cachedEntry = (memory.exchange_rate_cache || {})[key];
		if (!isFreshCacheEntry(cachedEntry, ttlMs)) {
			return null;
		}
		return cloneCachePayload(cachedEntry.data) || null;
	} catch (e) {
		console.error("Failed to get cached exchange rate", e);
		return null;
	}
}

export function savePriceListMetaCache(profileName, metadata) {
	try {
		const key = buildScopedCacheKey(profileName);
		if (!key || !metadata || typeof metadata !== "object") {
			return;
		}
		const cache = memory.price_list_meta_cache || {};
		cache[key] = {
			data: cloneCachePayload(metadata) || {},
			timestamp: Date.now(),
		};
		memory.price_list_meta_cache = cache;
		persist("price_list_meta_cache");
		refreshBootstrapSnapshotFromCacheState({
			priceListMetaReady:
				Object.keys(memory.price_list_meta_cache || {}).length > 0,
		});
	} catch (e) {
		console.error("Failed to save price list metadata cache", e);
	}
}

export function getCachedPriceListMeta(
	profileName,
	ttlMs = DEFAULT_CACHE_TTL_MS,
) {
	try {
		const key = buildScopedCacheKey(profileName);
		const entry = (memory.price_list_meta_cache || {})[key];
		if (!isFreshCacheEntry(entry, ttlMs)) {
			return null;
		}
		return cloneCachePayload(entry.data) || null;
	} catch (e) {
		console.error("Failed to get cached price list metadata", e);
		return null;
	}
}

export function saveCustomerAddressesCache(customer, addresses) {
	try {
		const key = buildScopedCacheKey(customer);
		if (!key || !Array.isArray(addresses)) {
			return;
		}
		const cache = memory.customer_addresses_cache || {};
		cache[key] = {
			data: cloneCachePayload(addresses) || [],
			timestamp: Date.now(),
		};
		memory.customer_addresses_cache = cache;
		persist("customer_addresses_cache");
		refreshBootstrapSnapshotFromCacheState({
			customerAddressesCount: Object.keys(
				memory.customer_addresses_cache || {},
			).length,
		});
	} catch (e) {
		console.error("Failed to save customer addresses cache", e);
	}
}

export function getCachedCustomerAddresses(
	customer,
	ttlMs = DEFAULT_CACHE_TTL_MS,
) {
	try {
		const key = buildScopedCacheKey(customer);
		const entry = (memory.customer_addresses_cache || {})[key];
		if (!isFreshCacheEntry(entry, ttlMs)) {
			return null;
		}
		return cloneCachePayload(entry.data) || [];
	} catch (e) {
		console.error("Failed to get cached customer addresses", e);
		return null;
	}
}

export function savePaymentMethodCurrencyCache(company, mapping) {
	try {
		const key = buildScopedCacheKey(company);
		if (!key || !mapping || typeof mapping !== "object") {
			return;
		}
		const cache = memory.payment_method_currency_cache || {};
		cache[key] = {
			data: cloneCachePayload(mapping) || {},
			timestamp: Date.now(),
		};
		memory.payment_method_currency_cache = cache;
		persist("payment_method_currency_cache");
		refreshBootstrapSnapshotFromCacheState({
			paymentMethodCurrencyCount: Object.keys(
				memory.payment_method_currency_cache || {},
			).length,
		});
	} catch (e) {
		console.error("Failed to save payment method currency cache", e);
	}
}

export function getCachedPaymentMethodCurrencyMap(
	company,
	ttlMs = DEFAULT_CACHE_TTL_MS,
) {
	try {
		const key = buildScopedCacheKey(company);
		const entry = (memory.payment_method_currency_cache || {})[key];
		if (!isFreshCacheEntry(entry, ttlMs)) {
			return null;
		}
		return cloneCachePayload(entry.data) || null;
	} catch (e) {
		console.error("Failed to get cached payment method currency cache", e);
		return null;
	}
}

export async function getCacheUsageEstimate() {
	let indexedDB = 0;
	let localStorageUsage = 0;

	if (typeof localStorage !== "undefined") {
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (!key) {
				continue;
			}
			localStorageUsage += estimateSerializedBytes(key);
			localStorageUsage += estimateSerializedBytes(
				localStorage.getItem(key) || "",
			);
		}
	}

	try {
		await checkDbHealth();
		if (!db.isOpen()) {
			await db.open();
		}
		for (const table of db.tables) {
			await table.each((row) => {
				indexedDB += estimateSerializedBytes(row);
			});
		}
	} catch (e) {
		console.error("Failed to estimate IndexedDB cache usage", e);
	}

	const total = indexedDB + localStorageUsage;
	let percentage = 0;

	try {
		const estimatedQuota =
			typeof navigator !== "undefined" &&
			navigator.storage &&
			typeof navigator.storage.estimate === "function"
				? await navigator.storage.estimate()
				: null;
		const quota = Number(estimatedQuota?.quota || 50 * 1024 * 1024);
		if (quota > 0) {
			percentage = Math.min(100, Math.round((total / quota) * 100));
		}
	} catch {
		percentage = 0;
	}

	return {
		total,
		localStorage: localStorageUsage,
		indexedDB,
		percentage,
	};
}
