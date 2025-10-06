import { memory } from "./cache.js";
import { persist } from "./core.js";

export function saveCoupons(customer, coupons) {
	try {
		const cache = memory.coupons_cache || {};
		const clean =
			typeof structuredClone === "function"
				? structuredClone(coupons)
				: JSON.parse(JSON.stringify(coupons));
		cache[customer] = clean;
		memory.coupons_cache = cache;
		persist("coupons_cache", memory.coupons_cache);
	} catch (e) {
		console.error("Failed to cache coupons", e);
	}
}

export function getCachedCoupons(customer) {
	try {
		const cache = memory.coupons_cache || {};
		return cache[customer] || [];
	} catch (e) {
		console.error("Failed to get cached coupons", e);
		return [];
	}
}

export function clearCoupons(customer) {
	try {
		const cache = memory.coupons_cache || {};
		if (customer) {
			delete cache[customer];
		} else {
			for (const key in cache) {
				delete cache[key];
			}
		}
		memory.coupons_cache = cache;
		persist("coupons_cache", memory.coupons_cache);
	} catch (e) {
		console.error("Failed to clear coupons cache", e);
	}
}
