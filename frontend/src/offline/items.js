import { memory } from "./cache.js";
import { persist, db, checkDbHealth } from "./core.js";

export function saveItemUOMs(itemCode, uoms) {
	try {
		const cache = memory.uom_cache;
		// Clone to avoid persisting reactive objects which cause
		// DataCloneError when stored in IndexedDB
		let cleanUoms;
		try {
			cleanUoms = JSON.parse(JSON.stringify(uoms));
		} catch (err) {
			console.error("Failed to serialize UOMs", err);
			cleanUoms = [];
		}
		cache[itemCode] = cleanUoms;
		memory.uom_cache = cache;
		persist("uom_cache", memory.uom_cache);
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
		persist("offers_cache", memory.offers_cache);
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

// Price list rate storage using dedicated table
export async function savePriceListItems(priceList, items) {
	try {
		if (!priceList) return;
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const rates = items.map((it) => {
			const price = it.price_list_rate ?? it.rate ?? 0;
			return {
				price_list: priceList,
				item_code: it.item_code,
				rate: price,
				price_list_rate: price,
				timestamp: Date.now(),
			};
		});
		await db.table("item_prices").bulkPut(rates);
	} catch (e) {
		console.error("Failed to save price list items", e);
	}
}

export async function getCachedPriceListItems(priceList, ttl = 24 * 60 * 60 * 1000) {
	try {
		if (!priceList) return null;
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const now = Date.now();
		const prices = await db.table("item_prices").where("price_list").equals(priceList).toArray();
		if (!prices.length) return null;
		const valid = prices.filter((p) => now - p.timestamp < ttl);
		if (!valid.length) return null;
		const itemCodes = valid.map((p) => p.item_code);
		const items = await db.table("items").where("item_code").anyOf(itemCodes).toArray();
		const map = new Map(items.map((it) => [it.item_code, it]));
		const result = valid
			.map((p) => {
				const it = map.get(p.item_code);
				const price = p.price_list_rate ?? p.rate ?? 0;
				return it
					? {
							...it,
							rate: price,
							price_list_rate: price,
						}
					: null;
			})
			.filter(Boolean);
		return result;
	} catch (e) {
		console.error("Failed to get cached price list items", e);
		return null;
	}
}

export async function clearPriceListCache(priceList = null) {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		if (priceList) {
			await db.table("item_prices").where("price_list").equals(priceList).delete();
		} else {
			await db.table("item_prices").clear();
		}
	} catch (e) {
		console.error("Failed to clear price list cache", e);
	}
}

// Item details caching functions
export function saveItemDetailsCache(profileName, priceList, items) {
	try {
		const cache = memory.item_details_cache || {};
		const profileCache = cache[profileName] || {};
		const priceCache = profileCache[priceList] || {};

		let cleanItems;
		try {
			// Store only fields required for offline usage
			cleanItems = items.map((it) => ({
				item_code: it.item_code,
				actual_qty: it.actual_qty,
				has_batch_no: it.has_batch_no,
				has_serial_no: it.has_serial_no,
				item_uoms: it.item_uoms,
				batch_no_data: it.batch_no_data,
				serial_no_data: it.serial_no_data,
				rate: it.rate,
				price_list_rate: it.price_list_rate,
				currency: it.currency,
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
		persist("item_details_cache", memory.item_details_cache);
	} catch (e) {
		console.error("Failed to cache item details", e);
	}
}

export async function getCachedItemDetails(profileName, priceList, itemCodes, ttl = 15 * 60 * 1000) {
	try {
		const cache = memory.item_details_cache || {};
		const priceCache = cache[profileName]?.[priceList] || {};
		const now = Date.now();
		const cached = [];
		const missing = [];
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

// Persistent item storage helpers

export async function saveItemsBulk(items) {
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
		cleanItems = cleanItems.map((it) => ({
			...it,
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
		const CHUNK_SIZE = 1000;
		await db.transaction("rw", db.table("items"), async () => {
			for (let i = 0; i < cleanItems.length; i += CHUNK_SIZE) {
				const chunk = cleanItems.slice(i, i + CHUNK_SIZE);
				await db.table("items").bulkPut(chunk);
			}
		});
	} catch (e) {
		console.error("Failed to save items", e);
	}
}

export async function getAllStoredItems() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		return await db.table("items").toArray();
	} catch (e) {
		console.error("Failed to read stored items", e);
		return [];
	}
}

export async function searchStoredItems({ search = "", itemGroup = "", limit = 100, offset = 0 } = {}) {
        try {
                await checkDbHealth();
                if (!db.isOpen()) await db.open();

                const tokens = Array.from(
                        new Set(
                                (search || "")
                                        .toLowerCase()
                                        .split(/\s+/)
                                        .map((part) => part.trim())
                                        .filter(Boolean),
                        ),
                );

                const matchesTokens = (it) => {
                        if (!tokens.length) {
                                return true;
                        }

                        const searchableFields = [];
                        const pushValue = (value) => {
                                if (value) {
                                        searchableFields.push(String(value).toLowerCase());
                                }
                        };

                        pushValue(it.item_name);
                        pushValue(it.item_code);
                        pushValue(it.barcode);

                        if (Array.isArray(it.item_barcode)) {
                                it.item_barcode.forEach((b) => pushValue(b && b.barcode));
                        } else {
                                pushValue(it.item_barcode);
                        }

                        if (Array.isArray(it.barcodes)) {
                                it.barcodes.forEach((bc) => pushValue(bc));
                        }

                        if (Array.isArray(it.name_keywords)) {
                                it.name_keywords.forEach((kw) => pushValue(kw));
                        }

                        if (Array.isArray(it.serial_no_data)) {
                                it.serial_no_data.forEach((s) => pushValue(s && s.serial_no));
                        }

                        if (Array.isArray(it.serials)) {
                                it.serials.forEach((s) => pushValue(s));
                        }

                        if (Array.isArray(it.batch_no_data)) {
                                it.batch_no_data.forEach((b) => pushValue(b && b.batch_no));
                        }

                        if (Array.isArray(it.batches)) {
                                it.batches.forEach((b) => pushValue(b));
                        }

                        if (!searchableFields.length) {
                                return false;
                        }

                        return tokens.every((token) => searchableFields.some((field) => field.includes(token)));
                };

                if (tokens.length) {
                        const [primaryToken] = tokens;
                        let collection = db
                                .table("items")
                                .where("item_code")
                                .startsWithIgnoreCase(primaryToken)
                                .or("item_name")
                                .startsWithIgnoreCase(primaryToken)
                                .or("barcodes")
                                .equalsIgnoreCase(primaryToken)
                                .or("name_keywords")
                                .startsWithIgnoreCase(primaryToken)
                                .or("serials")
                                .equalsIgnoreCase(primaryToken)
                                .or("batches")
                                .equalsIgnoreCase(primaryToken);

                        if (itemGroup && itemGroup.toLowerCase() !== "all") {
                                const group = itemGroup.toLowerCase();
                                collection = collection.and((it) => it.item_group && it.item_group.toLowerCase() === group);
                        }

                        let results = (await collection.toArray()).filter(matchesTokens);

                        if (!results.length) {
                                let fallback = db.table("items");
                                if (itemGroup && itemGroup.toLowerCase() !== "all") {
                                        fallback = fallback.where("item_group").equalsIgnoreCase(itemGroup);
                                }
                                results = await fallback.filter(matchesTokens).toArray();
                        }

                        const map = new Map();
                        results.forEach((it) => {
                                if (!map.has(it.item_code)) {
                                        map.set(it.item_code, it);
                                }
                        });

                        const unique = Array.from(map.values());
                        return unique.slice(offset, offset + limit);
                }

                let collection = db.table("items");
                if (itemGroup && itemGroup.toLowerCase() !== "all") {
                        collection = collection.where("item_group").equalsIgnoreCase(itemGroup);
                }

                const res = await collection.offset(offset).limit(limit).toArray();
                return res;
        } catch (e) {
                console.error("Failed to query stored items", e);
                return [];
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
