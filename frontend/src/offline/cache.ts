import { memory, persist, db, checkDbHealth } from "./db";

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
		let collection = db.table("items");
		if (normalizedGroup && normalizedGroup.toLowerCase() !== "all") {
			collection = collection
				.where("item_group")
				.equalsIgnoreCase(normalizedGroup);
		}
		collection = filterByScope(collection, scope);
		const normalizedSearch =
			typeof search === "string" ? search.trim() : "";
		if (normalizedSearch) {
			const term = normalizedSearch.toLowerCase();
			const terms = term.split(/\s+/).filter(Boolean);

			collection = collection.filter((it) => {
				const nameMatch =
					it.item_name &&
					terms.every((t) => it.item_name.toLowerCase().includes(t));
				const codeMatch =
					it.item_code && it.item_code.toLowerCase().includes(term);
				const barcodeMatch = Array.isArray(it.item_barcode)
					? it.item_barcode.some(
							(b) =>
								b.barcode && b.barcode.toLowerCase() === term,
						)
					: it.item_barcode &&
						String(it.item_barcode).toLowerCase().includes(term);
				return nameMatch || codeMatch || barcodeMatch;
			});
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
		if (!hasScope(scope)) {
			return await db.table("items").count();
		}
		return await filterByScope(db.table("items"), scope).count();
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
		return await filterByScope(db.table("items"), scope).toArray();
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
		const scopedItems = Array.isArray(items)
			? items.map((it) => ({
					...it,
					profile_scope: scope || it?.profile_scope || "",
				}))
			: [];
		await db.table("items").bulkPut(scopedItems);
	} catch (e) {
		console.error("Failed to save items", e);
	}
}

export async function clearStoredItems(scope = "") {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		if (!hasScope(scope)) {
			await db.table("items").clear();
			return;
		}
		await filterByScope(db.table("items"), scope).delete();
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
	} catch (e) {
		console.error("Failed to cache offers", e);
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

export function clearPriceListCache() {
	try {
		memory.price_list_cache = {};
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to clear price list cache", e);
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
				actual_qty: it.actual_qty,
				serial_no_data: it.serial_no_data,
				batch_no_data: it.batch_no_data,
				has_batch_no: it.has_batch_no,
				has_serial_no: it.has_serial_no,
				item_uoms: it.item_uoms,
				rate: it.rate,
				price_list_rate: it.price_list_rate,
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
	} catch (e) {
		console.error("Failed to set sales persons storage", e);
	}
}

export function getOpeningStorage() {
	return memory.pos_opening_storage || null;
}

export function setOpeningStorage(data) {
	try {
		memory.pos_opening_storage = JSON.parse(JSON.stringify(data));
		persist("pos_opening_storage");
	} catch (e) {
		console.error("Failed to set opening storage", e);
	}
}

export function clearOpeningStorage() {
	try {
		memory.pos_opening_storage = null;
		persist("pos_opening_storage");
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
}

export function reduceCacheUsage() {
	memory.price_list_cache = {};
	memory.item_details_cache = {};
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.coupons_cache = {};
	memory.item_groups_cache = [];
	persist("price_list_cache");
	persist("item_details_cache");
	persist("uom_cache");
	persist("offers_cache");
	persist("customer_balance_cache");
	persist("local_stock_cache");
	persist("stock_cache_ready");
	persist("coupons_cache");
	persist("item_groups_cache");
}

export function setItemsLastSync(timestamp) {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem("posa_items_last_sync", timestamp);
	}
}

export function getItemsLastSync() {
	if (typeof localStorage !== "undefined") {
		return localStorage.getItem("posa_items_last_sync");
	}
	return null;
}

export function setCustomersLastSync(timestamp) {
	if (typeof localStorage !== "undefined") {
		if (timestamp) {
			localStorage.setItem("posa_customers_last_sync", timestamp);
		} else {
			localStorage.removeItem("posa_customers_last_sync");
		}
	}
}

export function getCustomersLastSync() {
	if (typeof localStorage !== "undefined") {
		const val = localStorage.getItem("posa_customers_last_sync");
		if (val === "null" || val === "undefined") return null;
		return val;
	}
	return null;
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
	} catch (e) {
		console.error("Failed to set terms and conditions", e);
	}
}

// Coupons
export function saveCoupons(coupons) {
	try {
		memory.coupons_cache = coupons || {};
		persist("coupons_cache");
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
}

// Item Groups
export function saveItemGroups(groups) {
	try {
		memory.item_groups_cache = groups || [];
		persist("item_groups_cache");
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
}

export async function getCacheUsageEstimate() {
	// Basic implementation since we removed core.js dependency
	return {
		total: 0,
		localStorage: 0,
		indexedDB: 0,
		percentage: 0,
	};
}
