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

		const normalizedSearch = String(search || "")
			.toLowerCase()
			.trim();
		const words = Array.from(new Set(normalizedSearch.split(/\s+/).filter(Boolean)));
		const primaryWord = words.reduce(
			(longest, word) => (word.length > longest.length ? word : longest),
			words[0] || "",
		);

		const matchesAllWords = (item) => {
			if (!words.length) {
				return true;
			}

			const searchable = [];
			const pushValue = (value) => {
				if (value === undefined || value === null) {
					return;
				}
				const text = String(value).trim().toLowerCase();
				if (text) {
					searchable.push(text);
				}
			};

			pushValue(item.item_code);
			pushValue(item.item_name);
			pushValue(item.name);
			pushValue(item.description);
			pushValue(item.barcode);
			pushValue(item.brand);
			pushValue(item.item_group);
			pushValue(item.attributes);

			const handleArray = (source, extractor) => {
				if (!Array.isArray(source)) {
					return;
				}
				source.forEach((entry) => {
					if (extractor) {
						pushValue(extractor(entry));
					} else {
						pushValue(entry);
					}
				});
			};

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((barcode) => pushValue(barcode && barcode.barcode));
			} else {
				pushValue(item.item_barcode);
			}

			handleArray(item.barcodes);
			handleArray(item.name_keywords);
			handleArray(item.serial_no_data, (serial) => serial && serial.serial_no);
			handleArray(item.serials);
			handleArray(item.batch_no_data, (batch) => batch && batch.batch_no);
			handleArray(item.batches);

			const attributes = item.item_attributes;
			if (Array.isArray(attributes)) {
				attributes.forEach((attr) => {
					if (attr && typeof attr === "object") {
						pushValue(attr.attribute);
						pushValue(attr.attribute_value);
					} else {
						pushValue(attr);
					}
				});
			} else {
				pushValue(attributes);
			}

			if (!searchable.length) {
				return false;
			}

			return words.every((word) => searchable.some((field) => field.includes(word)));
		};

		const applyItemGroupFilter = (collection) => {
			if (itemGroup && itemGroup.toLowerCase() !== "all") {
				const group = itemGroup.toLowerCase();
				return collection.filter((it) => it.item_group && it.item_group.toLowerCase() === group);
			}
			return collection;
		};

		if (primaryWord) {
			let collection = db
				.table("items")
				.where("item_code")
				.startsWithIgnoreCase(primaryWord)
				.or("item_name")
				.startsWithIgnoreCase(primaryWord)
				.or("barcodes")
				.equalsIgnoreCase(primaryWord)
				.or("name_keywords")
				.startsWithIgnoreCase(primaryWord)
				.or("serials")
				.equalsIgnoreCase(primaryWord)
				.or("batches")
				.equalsIgnoreCase(primaryWord);

			collection = applyItemGroupFilter(collection);

			let results = await collection.toArray();
			results = results.filter(matchesAllWords);

			if (!results.length) {
				let fallback = applyItemGroupFilter(db.table("items"));
				results = await fallback.filter(matchesAllWords).toArray();
			}

			if (!results.length) {
				return [];
			}

			const map = new Map();
			results.forEach((item) => {
				if (!map.has(item.item_code)) {
					map.set(item.item_code, item);
				}
			});

			const unique = Array.from(map.values());
			return unique.slice(offset, offset + limit);
		}

		let collection = applyItemGroupFilter(db.table("items"));
		if (words.length) {
			collection = collection.filter(matchesAllWords);
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
