/**
 * Pinia Store for Items Management in POSAwesome
 * Optimized state management with multi-layer caching and performance improvements
 */

import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
// @ts-ignore
import {
	getCachedPriceListItems,
	clearPriceListCache,
	saveItemDetailsCache,
	isStockCacheReady,
	getItemsLastSync,
	getAllStoredItems,
	getStoredItemsCount,
	searchStoredItems,
	saveItemsBulk,
	clearStoredItems,
	setItemsLastSync,
	clearItemDetailsCache,
} from "../../offline/index.js";
import itemService from "../services/itemService";
import type { Item, POSProfile } from "../types/models";

const DEFAULT_PAGE_SIZE = 200;
const LARGE_CATALOG_THRESHOLD = 5000;
const LIMIT_SEARCH_FALLBACK = 500;

export interface CacheHealth {
  items: string;
  priceList: string;
  stock: string;
  lastCheck: number | null;
}

export interface PerformanceMetrics {
  lastLoadTime: number;
  averageLoadTime: number;
  cacheHitRate: number;
  totalRequests: number;
  cachedRequests: number;
  searchHits: number;
  searchMisses: number;
}

export interface BackgroundSyncState {
  running: boolean;
  token: number;
}

export interface CachedPagination {
  enabled: boolean;
  pageSize: number;
  offset: number;
  total: number;
  loading: boolean;
  search: string;
  group: string;
}

export interface ItemStoreCache {
  memory: {
    searchResults: Map<string, { data: Item[]; timestamp: number }>;
    priceListData: Map<string, { data: any[]; timestamp: number }>;
    itemDetails: Map<string, { data: any; timestamp: number }>;
    maxSize: number;
    ttl: number;
  };
  session: {
    enabled: boolean;
    prefix: string;
  };
}

export const useItemsStore = defineStore("items", () => {
	// Core state
	const items = ref<Item[]>([]);
	const filteredItems = ref<Item[]>([]);
	const itemsMap = ref(new Map<string, Item>()); // O(1) lookup by item_code
	const barcodeIndex = ref(new Map<string, Item>()); // O(1) barcode lookup
	const itemGroups = ref<string[]>(["ALL"]);

	// Loading states
	const isLoading = ref(false);
	const isBackgroundLoading = ref(false);
	const loadProgress = ref(0);
	const totalItemCount = ref(0);
	const itemsLoaded = ref(false);

	// Search and filtering
	const searchTerm = ref("");
	const itemGroup = ref("ALL");
	const lastSearch = ref("");

	// Configuration
	const posProfile = ref<POSProfile | null>(null);
	const customer = ref<string | null>(null);
	const customerPriceList = ref<string | null>(null);

	const normalizeBooleanSetting = (value: any): boolean => {
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			return normalized === "1" || normalized === "true" || normalized === "yes";
		}

		if (typeof value === "number") {
			return value === 1;
		}

		return Boolean(value);
	};

	const limitSearchEnabled = computed(() => {
		const rawValue = posProfile.value?.posa_use_limit_search ?? posProfile.value?.pose_use_limit_search;
		return normalizeBooleanSetting(rawValue);
	});

	const resolveLimitSearchSize = (): number => {
		if (!limitSearchEnabled.value) {
			return DEFAULT_PAGE_SIZE;
		}

		const rawLimit = posProfile.value?.posa_search_limit;
		const parsedLimit = Number.parseInt(rawLimit, 10);

		if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
			return parsedLimit;
		}

		return LIMIT_SEARCH_FALLBACK;
	};

	const resolvePageSize = (pageSize = DEFAULT_PAGE_SIZE): number => {
		if (limitSearchEnabled.value) {
			return resolveLimitSearchSize();
		}

		return pageSize;
	};

	// Cache management
	const cacheHealth = ref<CacheHealth>({
		items: "unknown",
		priceList: "unknown",
		stock: "unknown",
		lastCheck: null,
	});

	// Performance tracking
	const performanceMetrics = ref<PerformanceMetrics>({
		lastLoadTime: 0,
		averageLoadTime: 0,
		cacheHitRate: 0,
		totalRequests: 0,
		cachedRequests: 0,
		searchHits: 0,
		searchMisses: 0,
	});

	// Request management
	const requestToken = ref(0);
	const abortControllers = ref(new Map<string, AbortController>());
	const backgroundSyncState = ref<BackgroundSyncState>({
		running: false,
		token: 0,
	});

	// Multi-layer cache system
	const cache = ref<ItemStoreCache>({
		memory: {
			searchResults: new Map(),
			priceListData: new Map(),
			itemDetails: new Map(),
			maxSize: 500,
			ttl: 5 * 60 * 1000, // 5 minutes
		},
		session: {
			enabled: typeof sessionStorage !== "undefined",
			prefix: "posa_items_",
		},
	});
	// Throttle expensive cache cleanup to avoid iterating large Maps after every search write
	const MEMORY_CLEANUP_INTERVAL = 1000; // 1s between cleanups is enough for freshness while saving CPU
	let lastMemoryCleanup = 0;

	// Computed properties
	const activePriceList = computed(() => {
		return customerPriceList.value || posProfile.value?.selling_price_list || "";
	});

	const cachedPagination = ref<CachedPagination>({
		enabled: false,
		pageSize: resolvePageSize(DEFAULT_PAGE_SIZE),
		offset: 0,
		total: 0,
		loading: false,
		search: "",
		group: "ALL",
	});

	const hasMoreCachedItems = computed(() => {
		if (!cachedPagination.value.enabled) {
			return false;
		}

		if (cachedPagination.value.loading) {
			return true;
		}

		return cachedPagination.value.offset < cachedPagination.value.total;
	});

	const shouldUseIndexedSearch = () => {
		if (limitSearchEnabled.value) {
			return false;
		}

		return Boolean(posProfile.value?.posa_local_storage);
	};

	const shouldPersistItems = () => {
		if (limitSearchEnabled.value) {
			return false;
		}

		return Boolean(posProfile.value?.posa_local_storage);
	};

	const resetCachedPagination = (options: { enabled?: boolean; total?: number; pageSize?: number } = {}) => {
		const { enabled = false, total = 0, pageSize = DEFAULT_PAGE_SIZE } = options;

		const resolvedPageSize = resolvePageSize(pageSize);

		cachedPagination.value.enabled = enabled;
		cachedPagination.value.total = Number.isFinite(total) ? total : 0;
		cachedPagination.value.pageSize = resolvedPageSize;
		cachedPagination.value.offset = 0;
		cachedPagination.value.loading = false;
		cachedPagination.value.search = "";
		cachedPagination.value.group =
			typeof itemGroup.value === "string" && itemGroup.value.length > 0 ? itemGroup.value : "ALL";
	};

	const itemStats = computed(() => {
		return {
			total: items.value.length,
			filtered: filteredItems.value.length,
			groups: [...new Set(items.value.map((item) => item.item_group))].length,
			withImages: items.value.filter((item) => item.image).length,
			withStock: items.value.filter((item) => (item.actual_qty || 0) > 0).length,
			lowStock: items.value.filter((item) => (item.actual_qty || 0) < 5).length,
		};
	});

	const cacheStats = computed(() => {
		const memCache = cache.value.memory;
		return {
			searchCacheSize: memCache.searchResults.size,
			priceListCacheSize: memCache.priceListData.size,
			itemDetailsCacheSize: memCache.itemDetails.size,
			memoryUsage: getEstimatedMemoryUsage(),
		};
	});

	// Actions
	const initialize = async (profile: POSProfile, cust: string | null = null, priceList: string | null = null) => {
		posProfile.value = profile;
		customer.value = cust;
		customerPriceList.value = priceList;

		// Load item groups
		await loadItemGroups();

		// Assess cache health
		await assessCacheHealth();

		// Load cached items if available
		await loadCachedItems();
	};

	const loadItemGroups = async () => {
		try {
			if (posProfile.value?.item_groups?.length && posProfile.value.item_groups.length > 0) {
				const groups = ["ALL"];
				posProfile.value.item_groups.forEach((element: any) => {
					if (element.item_group !== "All Item Groups") {
						groups.push(element.item_group);
					}
				});
				itemGroups.value = groups;
			} else {
				// Fallback to API
				const response = await itemService.getItemGroups();

				if (response) {
					const groups = ["ALL"];
					response.forEach((element) => {
						groups.push(element.name);
					});
					itemGroups.value = groups;
				}
			}
		} catch (error) {
			console.error("Failed to load item groups:", error);
		}
	};

	const loadItems = async (options: { forceServer?: boolean; searchValue?: string; groupFilter?: string; priceList?: string | null; limit?: number | null } = {}) => {
		const {
			forceServer = false,
			searchValue = "",
			groupFilter = "ALL",
			priceList = null,
			limit = null,
		} = options;

		const startTime = performance.now();
		const currentRequestToken = ++requestToken.value;
		let cacheKey: string | null = null;

		try {
			isLoading.value = true;
			performanceMetrics.value.totalRequests++;

			const normalizedGroup =
				typeof groupFilter === "string" && groupFilter.length > 0 ? groupFilter : "ALL";

			// Generate cache key
			cacheKey = generateCacheKey(searchValue, normalizedGroup, priceList);

			const resolvedLimit =
				Number.isFinite(limit) && limit! > 0
					? limit!
					: limitSearchEnabled.value
						? resolveLimitSearchSize()
						: null;

			// Check cache first unless forced to server or limit search requires fresh data
			const canReadFromCache = !forceServer && !limitSearchEnabled.value;

			if (canReadFromCache) {
				const cachedResult = await getCachedItems(cacheKey);
				if (cachedResult) {
					setItems(cachedResult);
					performanceMetrics.value.cachedRequests++;
					updatePerformanceMetrics(startTime);
					return cachedResult;
				}
			}

			// Create abort controller
			const abortController = new AbortController();
			abortControllers.value.set(cacheKey, abortController);

			// Fetch from server
			if (!posProfile.value) {
				console.warn("Attempted to load items without POS Profile");
				return [];
			}
			const requestProfile = JSON.parse(JSON.stringify(posProfile.value));
			if (forceServer) {
				requestProfile.posa_use_server_cache = 0;
				requestProfile.posa_force_reload_items = 1;
			}

			const args: any = {
				pos_profile: JSON.stringify(requestProfile),
				price_list: priceList || activePriceList.value,
				item_group: normalizedGroup !== "ALL" ? normalizedGroup.toLowerCase() : "",
				search_value: searchValue || "",
				customer: customer.value,
				include_image: 1,
				item_groups: posProfile.value?.item_groups?.map((g: any) => g.item_group) || [],
			};

			if (Number.isFinite(resolvedLimit) && resolvedLimit! > 0) {
				args.limit = resolvedLimit;
			}

			const fetchedItems = await itemService.getItems(args, abortController.signal);

			// Check if request is still valid
			if (requestToken.value !== currentRequestToken) {
				return;
			}

			// Update state
			cachedPagination.value.enabled = false;
			cachedPagination.value.offset = fetchedItems.length;
			cachedPagination.value.total = fetchedItems.length;
			cachedPagination.value.loading = false;
			setItems(fetchedItems);
			itemsLoaded.value = true;

			// Cache the results unless limit search requires fresh server lookups
			if (!limitSearchEnabled.value) {
				await cacheItems(cacheKey, fetchedItems);
			}

			// Persist to IndexedDB and kick off background sync when appropriate
			if (!searchValue && shouldPersistItems()) {
				await persistItemsToStorage(fetchedItems, { replaceExisting: forceServer });
				triggerBackgroundSync({
					groupFilter: normalizedGroup,
					initialBatch: fetchedItems,
					reset: false,
				});
			}

			// Background load additional data
			if (fetchedItems.length > 0) {
				backgroundLoadItemDetails(fetchedItems);
			}

			updatePerformanceMetrics(startTime);
			return fetchedItems;
		} catch (error: any) {
			if (error.name !== "AbortError") {
				console.error("Failed to load items:", error);
				throw error;
			}
		} finally {
			isLoading.value = false;
			if (cacheKey) {
				abortControllers.value.delete(cacheKey);
			}
		}
	};

	const searchItems = async (term: string) => {
		// Optimization: Check if we can refine the previous search result
		const previousTerm = searchTerm.value || "";
		const canRefineSearch =
			!shouldUseIndexedSearch() &&
			term &&
			previousTerm.length > 0 &&
			term.length > previousTerm.length &&
			term.toLowerCase().startsWith(previousTerm.toLowerCase()) &&
			filteredItems.value.length > 0 &&
			filteredItems.value.length < items.value.length;

		searchTerm.value = term;
		lastSearch.value = term;

		if (!term || term.length < 2) {
			if (limitSearchEnabled.value) {
				return clearLimitSearchResults({ preserveItems: true });
			}

			// Reset to all items if search is too short
			if (!cachedPagination.value.enabled) {
				filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
			} else {
				cachedPagination.value.search = "";
				cachedPagination.value.offset = Math.min(cachedPagination.value.offset, items.value.length);
				filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
			}
			return filteredItems.value;
		}

		if (limitSearchEnabled.value) {
			try {
				await loadItems({
					searchValue: term,
					groupFilter: itemGroup.value,
					forceServer: true,
				});

				const serverResults = filterItemsByGroup(items.value, itemGroup.value);
				filteredItems.value = serverResults;
				performanceMetrics.value.searchMisses++;

				return serverResults;
			} catch (error) {
				console.error("Search failed:", error);
				performanceMetrics.value.searchMisses++;
				return [];
			}
		}

		// Check memory cache first
		const cacheKey = `search_${term}_${itemGroup.value}`;
		const cached = getCachedSearchResult(cacheKey);
		if (cached) {
			filteredItems.value = cached;
			performanceMetrics.value.searchHits++;
			return cached;
		}

		try {
			const shouldUseIndexed = shouldUseIndexedSearch();
			let searchResults: Item[] = [];

			if (shouldUseIndexed) {
				const normalizedGroup =
					typeof itemGroup.value === "string" && itemGroup.value.length > 0
						? itemGroup.value
						: "ALL";
				const results = await searchStoredItems({
					search: term,
					itemGroup: normalizedGroup,
					limit: cachedPagination.value.pageSize,
					offset: 0,
				});

				searchResults = Array.isArray(results) ? results : [];
				cachedPagination.value.search = term;
				cachedPagination.value.offset = searchResults.length;
				cachedPagination.value.total = Math.max(cachedPagination.value.total, searchResults.length);
			} else {
				// Search in current items first
				const sourceItems = canRefineSearch ? filteredItems.value : items.value;
				searchResults = performLocalSearch(term, sourceItems);

				// If no results and term is specific enough, search server
				if (searchResults.length === 0 && term.length >= 3) {
					await loadItems({
						searchValue: term,
						groupFilter: itemGroup.value,
						forceServer: true,
					});
					searchResults = performLocalSearch(term, items.value);
				}

				// Apply group filter
				searchResults = filterItemsByGroup(searchResults, itemGroup.value);
			}

			// Cache the search result
			setCachedSearchResult(cacheKey, searchResults);

			filteredItems.value = searchResults;
			performanceMetrics.value.searchMisses++;

			if (shouldUseIndexed) {
				updateIndexes(searchResults);
			}

			return searchResults;
		} catch (error) {
			console.error("Search failed:", error);
			performanceMetrics.value.searchMisses++;
			return [];
		}
	};

	const filterByGroup = async (group: string) => {
		itemGroup.value = group;

		if (searchTerm.value) {
			// Re-run search with new group filter
			await searchItems(searchTerm.value);
		} else {
			if (cachedPagination.value.enabled && shouldUseIndexedSearch()) {
				await resetCachedItemsForGroup(group);
			} else {
				// Just filter current items
				filteredItems.value = filterItemsByGroup(items.value, group);
			}
		}
	};

	const updatePriceList = async (newPriceList: string) => {
		if (!newPriceList || newPriceList === customerPriceList.value) {
			return;
		}

		customerPriceList.value = newPriceList;

		try {
			// Check cache for price list data
			const cacheKey = `price_list_${newPriceList}`;
			let priceData = getCachedPriceList(cacheKey);

			if (!priceData) {
				// Fetch from persistent cache
				priceData = await getCachedPriceListItems(newPriceList);

				if (priceData && priceData.length > 0) {
					setCachedPriceList(cacheKey, priceData);
				}
			}

			if (priceData && priceData.length > 0) {
				// Apply price updates to current items
				applyPriceListToItems(priceData);
			} else {
				// Reload items with new price list
				await loadItems({
					forceServer: true,
					priceList: newPriceList,
				});
			}
		} catch (error) {
			console.error("Failed to update price list:", error);
		}
	};

	const refreshItems = async () => {
		await clearAllCaches();
		itemsLoaded.value = false;
		resetCachedPagination();
		await loadItems({ forceServer: true });
	};

	const getItemByCode = (itemCode: string) => {
		return itemsMap.value.get(itemCode);
	};

	const getItemByBarcode = (barcode: string) => {
		return barcodeIndex.value.get(barcode);
	};

	const addScannedItem = async (barcode: string) => {
		// First check existing items
		let item = getItemByBarcode(barcode);
		if (item) {
			return item;
		}

		try {
			// Search for item by barcode on server
			const newItem: any = await itemService.getItemsFromBarcode({
				selling_price_list: activePriceList.value,
				currency: posProfile.value?.currency || "",
				barcode: barcode,
			});

			if (newItem) {

				if (newItem.scale_qty !== undefined && newItem.scale_qty !== null) {
					const parsedQty = parseFloat(newItem.scale_qty);
					if (!Number.isNaN(parsedQty)) {
						newItem._scale_qty = parsedQty;
					}
				}

				if (newItem.scale_price !== undefined && newItem.scale_price !== null) {
					const parsedPrice = parseFloat(newItem.scale_price);
					if (!Number.isNaN(parsedPrice)) {
						newItem._scale_price = parsedPrice;
					}
				}

				// Add to current items
				items.value.push(newItem);
				updateIndexes([newItem]);

				// Re-filter if needed
				if (searchTerm.value) {
					await searchItems(searchTerm.value);
				} else {
					filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
				}

				// Clear search cache to force refresh
				clearSearchCache();

				return newItem as Item;
			}

			return null;
		} catch (error) {
			console.error("Failed to fetch item by barcode:", error);
			return null;
		}
	};

	const refreshModifiedItems = async () => {
		if (!itemsLoaded.value) return { size: 0, count: 0, items: [] };

		const lastSync = getItemsLastSync();
		if (!lastSync) return { size: 0, count: 0, items: [] };

		try {
			const args: any = {
				pos_profile: JSON.stringify(posProfile.value),
				price_list: activePriceList.value,
				item_group: "",
				search_value: "",
				customer: customer.value,
				include_image: 0,
				item_groups: posProfile.value?.item_groups?.map((g: any) => g.item_group) || [],
				modified_after: lastSync,
				limit: 500,
			};

			const fetchedItems = (await itemService.getItems(args)) || [];

			const size = JSON.stringify(fetchedItems).length;
			let resolvedItems: Item[] = [];

			if (fetchedItems.length > 0) {
				updateItemsInPlace(fetchedItems);
				await saveItemsBulk(fetchedItems);
				resolvedItems = fetchedItems
					.map((item) => itemsMap.value.get(item.item_code))
					.filter((item): item is Item => !!item);

				// Find the latest modification timestamp
				let maxModified = "";
				for (const item of fetchedItems) {
					if (item.modified && item.modified > maxModified) {
						maxModified = item.modified;
					}
				}

				if (maxModified) {
					setItemsLastSync(maxModified);
				}
			}

			return { size, count: fetchedItems.length, items: resolvedItems };
		} catch (error) {
			console.error("Failed to refresh modified items:", error);
			return { size: 0, count: 0, items: [], error };
		}
	};

	const updateItemsInPlace = (updates: Item[]) => {
		let needsReindex = false;
		const additions: Item[] = [];

		updates.forEach((update) => {
			const existing = itemsMap.value.get(update.item_code);
			if (existing) {
				Object.assign(existing, update);
			} else {
				additions.push(update);
			}
		});

		if (additions.length > 0) {
			items.value.push(...additions);
			updateIndexes(additions);
			needsReindex = true;
		}

		if (needsReindex && !searchTerm.value) {
			filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
		}
	};

	// Helper functions
	const setItems = (newItems: Item[], options: { append?: boolean; totalCount?: number } = {}) => {
		const { append = false, totalCount: totalOverride } = options;
		const normalizedGroup =
			typeof itemGroup.value === "string" && itemGroup.value.length > 0 ? itemGroup.value : "ALL";

		if (!append) {
			items.value = Array.isArray(newItems) ? [...newItems] : [];
			resetIndexes();
			updateIndexes(items.value);
		} else if (Array.isArray(newItems) && newItems.length) {
			const additions: Item[] = [];
			newItems.forEach((item) => {
				if (!item || !item.item_code || itemsMap.value.has(item.item_code)) {
					return;
				}
				additions.push(item);
			});

			if (additions.length) {
				items.value = [...items.value, ...additions];
				updateIndexes(additions);
			}
		}

		if (Number.isFinite(totalOverride)) {
			totalItemCount.value = totalOverride!;
		} else if (!append) {
			totalItemCount.value = items.value.length;
		}

		if (!searchTerm.value) {
			filteredItems.value = filterItemsByGroup(items.value, normalizedGroup);
		}
	};

	const clearLimitSearchResults = ({ preserveItems = false } = {}) => {
		if (!limitSearchEnabled.value) {
			return filteredItems.value;
		}

		cancelBackgroundSync();

		searchTerm.value = "";
		lastSearch.value = "";
		cachedPagination.value.enabled = false;
		cachedPagination.value.offset = 0;
		cachedPagination.value.total = 0;
		cachedPagination.value.loading = false;
		cachedPagination.value.search = "";
		cachedPagination.value.group =
			typeof itemGroup.value === "string" && itemGroup.value.length > 0 ? itemGroup.value : "ALL";

		clearSearchCache();
		if (preserveItems) {
			filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
			return filteredItems.value;
		}

		setItems([], { totalCount: 0 });
		itemsLoaded.value = false;
		loadProgress.value = 0;
		return filteredItems.value;
	};

	const updateIndexes = (itemList: Item[]) => {
		if (!Array.isArray(itemList)) {
			return;
		}

		const includeSerial = normalizeBooleanSetting(posProfile.value?.posa_search_serial_no);
		const includeBatch = normalizeBooleanSetting(posProfile.value?.posa_search_batch_no);

		itemList.forEach((item) => {
			if (!item || !item.item_code) {
				return;
			}
			itemsMap.value.set(item.item_code, item);

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry: any) => {
					if (entry?.barcode) {
						barcodeIndex.value.set(String(entry.barcode), item);
					}
				});
			}

			if (item.barcode) {
				barcodeIndex.value.set(String(item.barcode), item);
			}

			// Pre-compute search index for performance
			const searchFields = [item.item_code, item.item_name, item.barcode, item.description];

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((b: any) => searchFields.push(b?.barcode));
			} else if (item.item_barcode) {
				searchFields.push(String(item.item_barcode));
			}

			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((b: string) => searchFields.push(b));
			}

			if (includeSerial && Array.isArray(item.serial_no_data)) {
				item.serial_no_data.forEach((s: any) => searchFields.push(s?.serial_no));
			}

			if (includeBatch && Array.isArray(item.batch_no_data)) {
				item.batch_no_data.forEach((b: any) => searchFields.push(b?.batch_no));
			}

			item._search_index = searchFields
				.filter(Boolean)
				.map((f) => String(f).toLowerCase())
				.join(" ");
		});
	};

	const resetIndexes = () => {
		itemsMap.value.clear();
		barcodeIndex.value.clear();
	};

	const performLocalSearch = (term: string, itemList: Item[]) => {
		if (!term) {
			return filterItemsByGroup(itemList, itemGroup.value);
		}

		const searchTerm = term.toLowerCase();
		const searchTerms = searchTerm.split(/\s+/).filter(Boolean);

		return itemList.filter((item) => {
			if (!item) {
				return false;
			}

			// Use pre-computed search index if available
			if (item._search_index) {
				return searchTerms.every((t) => item._search_index!.includes(t));
			}

			// Fallback for items without index
			const fields = [item.item_code, item.item_name, item.barcode, item.description];

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry: any) => fields.push(entry?.barcode));
			} else if (item.item_barcode) {
				fields.push(String(item.item_barcode));
			}

			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((code: string) => fields.push(code));
			}

			return fields.filter(Boolean).some((field) => String(field).toLowerCase().includes(searchTerm));
		});
	};

	const filterItemsByGroup = (itemList: Item[], group: string) => {
		if (group === "ALL") {
			return itemList;
		}
		return itemList.filter((item) => item.item_group === group);
	};

	const generateCacheKey = (search: string, group: string, priceList: string | null) => {
		return `items_${search || "all"}_${group}_${priceList || "default"}`;
	};

	// Cache management functions
	const getCachedItems = async (cacheKey: string) => {
		// Check memory cache first
		const memCache = cache.value.memory.searchResults.get(cacheKey);
		if (memCache && Date.now() - memCache.timestamp < cache.value.memory.ttl) {
			return memCache.data;
		}

		// Check session cache
		if (cache.value.session.enabled) {
			try {
				const sessionData = sessionStorage.getItem(cache.value.session.prefix + cacheKey);
				if (sessionData) {
					const parsed = JSON.parse(sessionData);
					if (Date.now() - parsed.timestamp < cache.value.memory.ttl) {
						// Update memory cache
						cache.value.memory.searchResults.set(cacheKey, parsed);
						return parsed.data;
					}
				}
			} catch (e) {
				console.warn("Session cache read failed:", e);
			}
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

		// Store in session cache
		if (cache.value.session.enabled) {
			try {
				sessionStorage.setItem(cache.value.session.prefix + cacheKey, JSON.stringify(cacheData));
			} catch (e) {
				console.warn("Session cache write failed:", e);
			}
		}

		// Cleanup old cache entries
		cleanupMemoryCache();
	};

	const persistItemsToStorage = async (itemsBatch: Item[], { replaceExisting = false } = {}) => {
		if (!shouldPersistItems()) {
			return;
		}

		if (!Array.isArray(itemsBatch) || itemsBatch.length === 0) {
			return;
		}

		try {
			if (replaceExisting) {
				await clearStoredItems();
			}

			await saveItemsBulk(itemsBatch);
			await updateCachedPaginationFromStorage();
		} catch (error) {
			console.error("Failed to persist items batch:", error);
		}
	};

	const updateCachedPaginationFromStorage = async () => {
		if (!shouldUseIndexedSearch()) {
			cachedPagination.value.enabled = false;
			cachedPagination.value.total = items.value.length;
			cachedPagination.value.offset = items.value.length;
			return;
		}

		try {
			const storedCount = await getStoredItemsCount().catch(() => 0);
			const resolvedCount = Number.isFinite(storedCount) ? storedCount : 0;

			const shouldPaginate = resolvedCount > LARGE_CATALOG_THRESHOLD;
			cachedPagination.value.enabled = shouldPaginate;
			cachedPagination.value.total = resolvedCount;
			cachedPagination.value.pageSize = resolvePageSize(DEFAULT_PAGE_SIZE);
			cachedPagination.value.offset = Math.min(resolvedCount, items.value.length);
			totalItemCount.value = Math.max(totalItemCount.value, resolvedCount);
		} catch (error) {
			console.warn("Failed to update cached pagination state:", error);
		}
	};

	const cancelBackgroundSync = () => {
		backgroundSyncState.value.token += 1;
		backgroundSyncState.value.running = false;
		isBackgroundLoading.value = false;
	};

	const backgroundSyncItems = async (options: { reset?: boolean; groupFilter?: string; searchValue?: string; initialBatch?: Item[] } = {}) => {
		const {
			reset = false,
			groupFilter = itemGroup.value,
			searchValue = searchTerm.value,
			initialBatch = [],
		} = options;

		if (!shouldPersistItems()) {
			return [];
		}

		if (searchValue && searchValue.trim().length > 0) {
			return [];
		}

		const normalizedGroup =
			typeof groupFilter === "string" && groupFilter.length > 0 ? groupFilter : "ALL";

		const token = ++backgroundSyncState.value.token;
		backgroundSyncState.value.running = true;
		isBackgroundLoading.value = true;

		const appended: Item[] = [];

		try {
			if (reset) {
				await clearStoredItems();
				if (Array.isArray(initialBatch) && initialBatch.length) {
					await saveItemsBulk(initialBatch);
					await updateCachedPaginationFromStorage();
				}
			}

			let loaded = items.value.length;
			let lastItemName = items.value.length
				? items.value[items.value.length - 1]?.item_name || null
				: null;

			const limit = resolvePageSize(DEFAULT_PAGE_SIZE);

			while (backgroundSyncState.value.token === token && shouldPersistItems()) {
				// Clone posProfile and disable caching for this specific request
				const requestProfile = JSON.parse(JSON.stringify(posProfile.value));
				if (reset) {
					requestProfile.posa_use_server_cache = 0;
					requestProfile.posa_force_reload_items = 1;
				}

				const response = await (frappe.call as any)({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: JSON.stringify(requestProfile),
						price_list: activePriceList.value,
						item_group: normalizedGroup !== "ALL" ? normalizedGroup.toLowerCase() : "",
						start_after: lastItemName,
						limit,
					},
				});

				if (backgroundSyncState.value.token !== token) {
					break;
				}

				const batch = Array.isArray(response.message) ? response.message : [];
				if (batch.length === 0) {
					break;
				}

				await saveItemsBulk(batch);
				setItems(batch, { append: true });
				appended.push(...batch);
				loaded += batch.length;
				lastItemName = batch[batch.length - 1]?.item_name || lastItemName;

				await updateCachedPaginationFromStorage();

				if (totalItemCount.value > 0) {
					loadProgress.value = Math.min(99, Math.round((loaded / totalItemCount.value) * 100));
				} else if (loaded > 0) {
					loadProgress.value = Math.min(99, Math.round((loaded / (loaded + limit)) * 100));
				}

				if (batch.length < limit) {
					break;
				}
			}

			if (backgroundSyncState.value.token === token) {
				loadProgress.value = 100;
				itemsLoaded.value = true;
				await updateCachedPaginationFromStorage();
				setItemsLastSync(new Date().toISOString());
			}

			return appended;
		} catch (error) {
			console.error("Background item sync failed:", error);
			return appended;
		} finally {
			if (backgroundSyncState.value.token === token) {
				backgroundSyncState.value.running = false;
				isBackgroundLoading.value = false;
			}
		}
	};

	const triggerBackgroundSync = (options: any = {}) => {
		if (!shouldPersistItems()) {
			return;
		}

		if (backgroundSyncState.value.running) {
			return;
		}

		backgroundSyncItems(options).catch((error) => {
			console.error("Failed to trigger background sync:", error);
		});
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

	const applyPriceListToItems = (priceListItems: any[]) => {
		const priceMap = new Map();
		priceListItems.forEach((item) => {
			priceMap.set(item.item_code, item);
		});

		items.value.forEach((item) => {
			const priceItem = priceMap.get(item.item_code);
			if (priceItem) {
				item.rate = priceItem.price_list_rate || priceItem.rate || 0;
				item.price_list_rate = item.rate;
			}
		});

		// Update filtered items
		if (searchTerm.value) {
			filteredItems.value = performLocalSearch(searchTerm.value, items.value);
		} else {
			filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
		}
	};

	const backgroundLoadItemDetails = async (itemList: Item[]) => {
		if (!itemList || itemList.length === 0) return;

		try {
			// Process in batches to avoid overwhelming the server
			const batchSize = 20;
			for (let i = 0; i < itemList.length; i += batchSize) {
				const batch = itemList.slice(i, i + batchSize);

				// Add small delay between batches
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 200));
				}

				await loadItemDetailsBatch(batch);
			}
		} catch (error) {
			console.error("Background item details loading failed:", error);
		}
	};

	const loadItemDetailsBatch = async (itemBatch: Item[]) => {
		try {
			if (!posProfile.value) return;
			const response = await (frappe.call as any)({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(posProfile.value),
					items_data: JSON.stringify(itemBatch),
					price_list: activePriceList.value,
				},
			});

			const details = response.message || [];

			// Update items with details
			details.forEach((detail: any) => {
				const item = getItemByCode(detail.item_code);
				if (item) {
					Object.assign(item, detail);
				}
			});

			// Cache the details
			saveItemDetailsCache(posProfile.value.name, activePriceList.value, details);
		} catch (error) {
			console.error("Failed to load item details batch:", error);
		}
	};

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

	const loadCachedItems = async () => {
		try {
			if (limitSearchEnabled.value) {
				resetCachedPagination({ enabled: false, total: 0 });
				setItems([], { totalCount: 0 });
				itemsLoaded.value = false;
				return;
			}

			const cachedCount = await getStoredItemsCount().catch(() => 0);
			const resolvedCount = Number.isFinite(cachedCount) ? cachedCount : 0;

			totalItemCount.value = resolvedCount;

			if (resolvedCount === 0) {
				itemsLoaded.value = false;
				resetCachedPagination();
				return;
			}

			const shouldPaginate = resolvedCount > LARGE_CATALOG_THRESHOLD;
			resetCachedPagination({
				enabled: shouldPaginate,
				total: resolvedCount,
			});

			if (!shouldPaginate) {
				const cachedItems = await getAllStoredItems().catch(() => []);
				if (Array.isArray(cachedItems) && cachedItems.length) {
					setItems(cachedItems, { totalCount: resolvedCount });
					cachedPagination.value.offset = cachedItems.length;
					itemsLoaded.value = true;
				}
				return;
			}

			const initialItems = await searchStoredItems({
				search: "",
				itemGroup: itemGroup.value,
				limit: cachedPagination.value.pageSize,
				offset: 0,
			});

			const safeInitial = Array.isArray(initialItems) ? initialItems : [];
			setItems(safeInitial, { totalCount: resolvedCount });
			cachedPagination.value.offset = safeInitial.length;
			cachedPagination.value.search = "";
			cachedPagination.value.group =
				typeof itemGroup.value === "string" && itemGroup.value.length > 0 ? itemGroup.value : "ALL";
			itemsLoaded.value = true;
		} catch (error) {
			console.warn("Failed to load cached items:", error);
		}
	};

	const appendCachedItemsPage = async () => {
		if (limitSearchEnabled.value) {
			return [];
		}

		if (!cachedPagination.value.enabled || cachedPagination.value.loading) {
			return [];
		}

		if (searchTerm.value && searchTerm.value.length >= 2) {
			return [];
		}

		if (cachedPagination.value.offset >= cachedPagination.value.total) {
			return [];
		}

		cachedPagination.value.loading = true;

		try {
			const nextPage = await searchStoredItems({
				search: cachedPagination.value.search || "",
				itemGroup: cachedPagination.value.group,
				limit: cachedPagination.value.pageSize,
				offset: cachedPagination.value.offset,
			});

			const safePage = Array.isArray(nextPage) ? nextPage : [];

			if (safePage.length === 0) {
				cachedPagination.value.offset = cachedPagination.value.total;
				return [];
			}

			setItems(safePage, {
				append: true,
				totalCount: cachedPagination.value.total,
			});
			cachedPagination.value.offset += safePage.length;

			if (safePage.length < cachedPagination.value.pageSize) {
				cachedPagination.value.offset = cachedPagination.value.total;
			}

			backgroundLoadItemDetails(safePage);

			return safePage;
		} catch (error) {
			console.warn("Failed to append cached items:", error);
			return [];
		} finally {
			cachedPagination.value.loading = false;
		}
	};

	const resetCachedItemsForGroup = async (group: string) => {
		if (limitSearchEnabled.value || !cachedPagination.value.enabled || !shouldUseIndexedSearch()) {
			filteredItems.value = filterItemsByGroup(items.value, group);
			return;
		}

		const normalizedGroup = typeof group === "string" && group.length > 0 ? group : "ALL";
		cachedPagination.value.group = normalizedGroup;
		cachedPagination.value.offset = 0;
		cachedPagination.value.search = "";

		const firstPage = await searchStoredItems({
			search: "",
			itemGroup: normalizedGroup,
			limit: cachedPagination.value.pageSize,
			offset: 0,
		});

		const safePage = Array.isArray(firstPage) ? firstPage : [];
		setItems(safePage, { totalCount: cachedPagination.value.total });
		cachedPagination.value.offset = safePage.length;
	};

	const clearAllCaches = async () => {
		// Clear memory caches
		cache.value.memory.searchResults.clear();
		cache.value.memory.priceListData.clear();
		cache.value.memory.itemDetails.clear();

		// Clear session cache
		if (cache.value.session.enabled) {
			const keys = Object.keys(sessionStorage);
			keys.forEach((key) => {
				if (key.startsWith(cache.value.session.prefix)) {
					sessionStorage.removeItem(key);
				}
			});
		}

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
		if (cache.value.memory.searchResults.size > cache.value.memory.maxSize) {
			const entries = Array.from(cache.value.memory.searchResults.entries());
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

	const updatePerformanceMetrics = (startTime: number) => {
		const loadTime = performance.now() - startTime;
		performanceMetrics.value.lastLoadTime = loadTime;

		const { averageLoadTime, totalRequests } = performanceMetrics.value;
		performanceMetrics.value.averageLoadTime =
			totalRequests > 1 ? (averageLoadTime * (totalRequests - 1) + loadTime) / totalRequests : loadTime;

		const { cachedRequests, totalRequests: total } = performanceMetrics.value;
		performanceMetrics.value.cacheHitRate = total > 0 ? (cachedRequests / total) * 100 : 0;
	};

	const getEstimatedMemoryUsage = () => {
		try {
			let usage = 0;
			usage += items.value.length * 2 / 1024; // ~2KB per item estimate
			usage += cache.value.memory.searchResults.size * 1 / 1024; // ~1KB per cache entry
			usage += cache.value.memory.priceListData.size * 0.5 / 1024; // ~0.5KB per price entry
			return Math.round(usage * 100) / 100; // MB estimate
		} catch (e) {
			return 0;
		}
	};

	// Watch for reactive updates
	watch(customerPriceList, (newPriceList) => {
		if (newPriceList && itemsLoaded.value) {
			updatePriceList(newPriceList);
		}
	});

	// Return reactive state and actions
	return {
		// State
		items,
		filteredItems,
		itemsMap,
		barcodeIndex,
		itemGroups,
		isLoading,
		isBackgroundLoading,
		loadProgress,
		totalItemCount,
		itemsLoaded,
		searchTerm,
		itemGroup,
		lastSearch,
		posProfile,
		customer,
		customerPriceList,
		cacheHealth,
		performanceMetrics,
		cachedPagination,
		hasMoreCachedItems,

		// Computed
		activePriceList,
		itemStats,
		cacheStats,

		// Actions
		initialize,
		loadItems,
		loadItemGroups,
		loadCachedItems,
		searchItems,
		filterByGroup,
		updatePriceList,
		refreshItems,
		appendCachedItemsPage,
		resetCachedItemsForGroup,
		backgroundSyncItems,
		getItemByCode,
		getItemByBarcode,
		addScannedItem,
		refreshModifiedItems,
		clearLimitSearchResults,
		clearAllCaches,
		clearSearchCache,
		assessCacheHealth,
	};
});

export default useItemsStore;
