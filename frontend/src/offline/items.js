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
		const rates = items.map((it) => ({
			price_list: priceList,
			item_code: it.item_code,
			rate: it.rate,
			price_list_rate: it.price_list_rate || it.rate,
			timestamp: Date.now(),
		}));
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
				return it
					? {
							...it,
							rate: p.rate,
							price_list_rate: p.price_list_rate || p.rate,
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
               await db.table("items").bulkPut(cleanItems);
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
		const term = search.toLowerCase();
               if (term) {
                       let collection = db
                               .table("items")
                               .where("item_code")
                               .startsWithIgnoreCase(term)
                               .or("item_name")
                               .startsWithIgnoreCase(term)
                               .or("barcodes")
                               .equalsIgnoreCase(term)
                               .or("name_keywords")
                               .startsWithIgnoreCase(term)
                               .or("serials")
                               .equalsIgnoreCase(term)
                               .or("batches")
                               .equalsIgnoreCase(term);
                       if (itemGroup && itemGroup.toLowerCase() !== "all") {
                               const group = itemGroup.toLowerCase();
                               collection = collection.and((it) => it.item_group && it.item_group.toLowerCase() === group);
                       }
                       let results = await collection.toArray();
                       if (!results.length) {
                               let fallback = db.table("items");
                               if (itemGroup && itemGroup.toLowerCase() !== "all") {
                                       fallback = fallback.where("item_group").equalsIgnoreCase(itemGroup);
                               }
                               results = await fallback
                                       .filter((it) => {
                                               const nameMatch = it.item_name && it.item_name.toLowerCase().includes(term);
                                               const codeMatch = it.item_code && it.item_code.toLowerCase().includes(term);
                                               const barcodeMatch = Array.isArray(it.item_barcode)
                                                       ? it.item_barcode.some((b) => b.barcode && b.barcode.toLowerCase() === term)
                                                       : it.item_barcode && String(it.item_barcode).toLowerCase().includes(term);
                                               const serialMatch = Array.isArray(it.serial_no_data)
                                                       ? it.serial_no_data.some((s) => s.serial_no && s.serial_no.toLowerCase() === term)
                                                       : Array.isArray(it.serials)
                                                               ? it.serials.some((s) => s && s.toLowerCase() === term)
                                                               : false;
                                               const batchMatch = Array.isArray(it.batch_no_data)
                                                       ? it.batch_no_data.some((b) => b.batch_no && b.batch_no.toLowerCase() === term)
                                                       : Array.isArray(it.batches)
                                                               ? it.batches.some((b) => b && b.toLowerCase() === term)
                                                               : false;
                                               return nameMatch || codeMatch || barcodeMatch || serialMatch || batchMatch;
                                       })
                                       .toArray();
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
               if (search) {
                       const term = search.toLowerCase();
                       collection = collection.filter((it) => {
                               const nameMatch = it.item_name && it.item_name.toLowerCase().includes(term);
                               const codeMatch = it.item_code && it.item_code.toLowerCase().includes(term);
                               const barcodeMatch = Array.isArray(it.item_barcode)
                                       ? it.item_barcode.some((b) => b.barcode && b.barcode.toLowerCase() === term)
                                       : it.item_barcode && String(it.item_barcode).toLowerCase().includes(term);
                               const serialMatch = Array.isArray(it.serial_no_data)
                                       ? it.serial_no_data.some((s) => s.serial_no && s.serial_no.toLowerCase() === term)
                                       : Array.isArray(it.serials)
                                               ? it.serials.some((s) => s && s.toLowerCase() === term)
                                               : false;
                               const batchMatch = Array.isArray(it.batch_no_data)
                                       ? it.batch_no_data.some((b) => b.batch_no && b.batch_no.toLowerCase() === term)
                                       : Array.isArray(it.batches)
                                               ? it.batches.some((b) => b && b.toLowerCase() === term)
                                               : false;
                               return nameMatch || codeMatch || barcodeMatch || serialMatch || batchMatch;
                       });
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
