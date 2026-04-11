import { ref } from "vue";
// @ts-ignore
import {
	clearPriceListCache,
	isStockCacheReady,
	getItemsLastSync,
	clearItemDetailsCache,
} from "../../../../../offline/index";
import type { Item } from "../../../../types/models";

export interface CacheHealth {
	items: string;
	priceList: string;
	stock: string;
	lastCheck: number | null;
}

export interface ItemStoreCache {
	memory: {
		searchResults: Map<string, { data: Item[]; timestamp: number }>;
		priceListData: Map<string, { data: any[]; timestamp: number }>;
		itemDetails: Map<string, { data: any; timestamp: number }>;
		maxSize: number;
		ttl: number;
	};
}

export function useItemsCache() {
	const cacheHealth = ref<CacheHealth>({
		items: "unknown",
		priceList: "unknown",
		stock: "unknown",
		lastCheck: null,
	});

	const cache = ref<ItemStoreCache>({
		memory: {
			searchResults: new Map(),
			priceListData: new Map(),
			itemDetails: new Map(),
			maxSize: 500,
			ttl: 5 * 60 * 1000, // 5 minutes
		},
	});

	// Throttle expensive cache cleanup to avoid iterating large Maps after every search write
	const MEMORY_CLEANUP_INTERVAL = 1000;
	let lastMemoryCleanup = 0;

	const assessCacheHealth = async () => {
		try {
			const health: CacheHealth = {
				items: "healthy",
				priceList: "healthy",
				stock: "healthy",
				lastCheck: Date.now(),
			};

			// Check stock cache
			if (!isStockCacheReady()) {
				health.stock = "missing";
			}

			// Check items cache age
			const lastSync = getItemsLastSync();
			if (lastSync) {
				const age = Date.now() - new Date(lastSync).getTime();
				if (age > 24 * 60 * 60 * 1000) {
					health.items = "stale";
				}
			} else {
				health.items = "missing";
			}

			cacheHealth.value = health;
		} catch (error) {
			console.error("Cache health assessment failed:", error);
			cacheHealth.value = {
				items: "error",
				priceList: "error",
				stock: "error",
				lastCheck: Date.now(),
			};
		}
	};

	const clearAllCaches = async () => {
		// Clear memory caches
		cache.value.memory.searchResults.clear();
		cache.value.memory.priceListData.clear();
		cache.value.memory.itemDetails.clear();

		// Clear persistent cache
		await clearPriceListCache();
		clearItemDetailsCache();
	};

	const clearSearchCache = () => {
		cache.value.memory.searchResults.clear();
	};

	const cleanupMemoryCache = () => {
		const now = Date.now();
		const ttl = cache.value.memory.ttl;

		if (
			now - lastMemoryCleanup < MEMORY_CLEANUP_INTERVAL &&
			cache.value.memory.searchResults.size <= cache.value.memory.maxSize
		) {
			return;
		}
		lastMemoryCleanup = now;

		// Cleanup expired entries
		for (const [key, value] of cache.value.memory.searchResults.entries()) {
			if (now - value.timestamp > ttl) {
				cache.value.memory.searchResults.delete(key);
			}
		}

		// Limit cache size
		if (
			cache.value.memory.searchResults.size > cache.value.memory.maxSize
		) {
			const entries = Array.from(
				cache.value.memory.searchResults.entries(),
			);
			entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

			const toRemove = Math.floor(entries.length * 0.2);
			for (let i = 0; i < toRemove; i++) {
				const entry = entries[i];
				if (entry) {
					cache.value.memory.searchResults.delete(entry[0]);
				}
			}
		}
	};

	const getCachedItems = async (cacheKey: string) => {
		// Check memory cache first
		const memCache = cache.value.memory.searchResults.get(cacheKey);
		if (
			memCache &&
			Date.now() - memCache.timestamp < cache.value.memory.ttl
		) {
			return memCache.data;
		}

		return null;
	};

	const cacheItems = async (cacheKey: string, items: Item[]) => {
		const cacheData = {
			data: items,
			timestamp: Date.now(),
		};

		// Store in memory cache
		cache.value.memory.searchResults.set(cacheKey, cacheData);

		// Cleanup old cache entries
		cleanupMemoryCache();
	};

	const getCachedSearchResult = (cacheKey: string) => {
		const cached = cache.value.memory.searchResults.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < cache.value.memory.ttl) {
			return cached.data;
		}
		return null;
	};

	const setCachedSearchResult = (cacheKey: string, data: Item[]) => {
		cache.value.memory.searchResults.set(cacheKey, {
			data,
			timestamp: Date.now(),
		});
		cleanupMemoryCache();
	};

	const getCachedPriceList = (cacheKey: string) => {
		const cached = cache.value.memory.priceListData.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < cache.value.memory.ttl) {
			return cached.data;
		}
		return null;
	};

	const setCachedPriceList = (cacheKey: string, data: any[]) => {
		cache.value.memory.priceListData.set(cacheKey, {
			data,
			timestamp: Date.now(),
		});
	};

	const generateCacheKey = (
		search: string,
		group: string,
		priceList: string | null,
		scope: string = "global",
	) => {
		return `items_${scope}_${search || "all"}_${group}_${priceList || "default"}`;
	};

	return {
		cache,
		cacheHealth,
		assessCacheHealth,
		clearAllCaches,
		clearSearchCache,
		cleanupMemoryCache,
		getCachedItems,
		cacheItems,
		getCachedSearchResult,
		setCachedSearchResult,
		getCachedPriceList,
		setCachedPriceList,
		generateCacheKey,
	};
}
