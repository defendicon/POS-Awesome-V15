import { memory } from "./cache.js";
import { persist } from "./core.js";

// Customer balance caching functions
export function saveCustomerBalance(customer, balance) {
	try {
		const cache = memory.customer_balance_cache;
		cache[customer] = {
			balance: balance,
			timestamp: Date.now(),
		};
		memory.customer_balance_cache = cache;
		persist("customer_balance_cache", memory.customer_balance_cache);
	} catch (e) {
		console.error("Failed to cache customer balance", e);
	}
}

export function getCachedCustomerBalance(customer) {
	try {
		const cache = memory.customer_balance_cache || {};
		const cachedData = cache[customer];
		if (cachedData) {
			const isValid = Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData.balance : null;
		}
		return null;
	} catch (e) {
		console.error("Failed to get cached customer balance", e);
		return null;
	}
}

export function clearCustomerBalanceCache() {
	try {
		memory.customer_balance_cache = {};
		persist("customer_balance_cache", memory.customer_balance_cache);
	} catch (e) {
		console.error("Failed to clear customer balance cache", e);
	}
}

export function clearExpiredCustomerBalances() {
	try {
		const cache = memory.customer_balance_cache || {};
		const now = Date.now();
		const validCache = {};

		Object.keys(cache).forEach((customer) => {
			const cachedData = cache[customer];
			if (cachedData && now - cachedData.timestamp < 24 * 60 * 60 * 1000) {
				validCache[customer] = cachedData;
			}
		});

		memory.customer_balance_cache = validCache;
		persist("customer_balance_cache", memory.customer_balance_cache);
	} catch (e) {
		console.error("Failed to clear expired customer balances", e);
	}
}
