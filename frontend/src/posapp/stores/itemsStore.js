/**
 * Pinia Store for Items Management in POSAwesome
 * Optimized state management with multi-layer caching and performance improvements
 */

import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
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
} from "../../offline/index.js";

const DEFAULT_PAGE_SIZE = 200;
const LARGE_CATALOG_THRESHOLD = 5000;
const LIMIT_SEARCH_FALLBACK = 500;

export const useItemsStore = defineStore("items", () => {
	// Core state
	const items = ref([]);
	const filteredItems = ref([]);
	const itemsMap = ref(new Map()); // O(1) lookup by item_code
	const barcodeIndex = ref(new Map()); // O(1) barcode lookup
	const itemGroups = ref(["ALL"]);

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
	const posProfile = ref(null);
	const customer = ref(null);
	const customerPriceList = ref(null);

	const normalizeBooleanSetting = (value) => {
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

	const resolveLimitSearchSize = () => {
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

	const resolvePageSize = (pageSize = DEFAULT_PAGE_SIZE) => {
		if (limitSearchEnabled.value) {
			return resolveLimitSearchSize();
		}

		return pageSize;
	};

	// Cache management
	const cacheHealth = ref({
		items: "unknown",
		priceList: "unknown",
		stock: "unknown",
		lastCheck: null,
	});

	// Performance tracking
	const performanceMetrics = ref({
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
	const abortControllers = ref(new Map());
	const backgroundSyncState = ref({
		running: false,
		token: 0,
	});

	// Multi-layer cache system
	const cache = ref({
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

	// Computed properties
	const activePriceList = computed(() => {
		return customerPriceList.value || posProfile.value?.selling_price_list;
	});

	const cachedPagination = ref({
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

		if (searchTerm.value) {
			// When searching we always fetch on demand based on term, so pagination
			// availability is governed by the most recent fetch size
			return cachedPagination.value.offset < cachedPagination.value.total;
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

	const resetCachedPagination = (options = {}) => {
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
	const initialize = async (profile, cust = null, priceList = null) => {
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
			if (posProfile.value?.item_groups?.length > 0) {
				const groups = ["ALL"];
				posProfile.value.item_groups.forEach((element) => {
					if (element.item_group !== "All Item Groups") {
						groups.push(element.item_group);
					}
				});
				itemGroups.value = groups;
			} else {
				// Fallback to API
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items_groups",
					args: {},
				});

				if (response.message) {
					const groups = ["ALL"];
					response.message.forEach((element) => {
						groups.push(element.name);
					});
					itemGroups.value = groups;
				}
			}
		} catch (error) {
			console.error("Failed to load item groups:", error);
		}
	};

	const loadItems = async (options = {}) => {
		const {
			forceServer = false,
			searchValue = "",
			groupFilter = "ALL",
			priceList = null,
			limit = null,
		} = options;

		const startTime = performance.now();
		const currentRequestToken = ++requestToken.value;
		let cacheKey;

		try {
			isLoading.value = true;
			performanceMetrics.value.totalRequests++;

			const normalizedGroup =
				typeof groupFilter === "string" && groupFilter.length > 0 ? groupFilter : "ALL";

			// Generate cache key
			cacheKey = generateCacheKey(searchValue, normalizedGroup, priceList);

			const resolvedLimit =
				Number.isFinite(limit) && limit > 0
					? limit
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
			const args = {
				pos_profile: JSON.stringify(posProfile.value),
				price_list: priceList || activePriceList.value,
				item_group: normalizedGroup !== "ALL" ? normalizedGroup.toLowerCase() : "",
				search_value: searchValue || "",
				customer: customer.value,
				include_image: 1,
				item_groups: posProfile.value?.item_groups?.map((g) => g.item_group) || [],
			};

			if (Number.isFinite(resolvedLimit) && resolvedLimit > 0) {
				args.limit = resolvedLimit;
			}

			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_items",
				args,
				signal: abortController.signal,
			});

			// Check if request is still valid
			if (requestToken.value !== currentRequestToken) {
				return;
			}

			const fetchedItems = response.message || [];

			// Update state
			cachedPagination.value.enabled = false;
			cachedPagination.value.offset = fetchedItems.length;
			cachedPagination.value.total = fetchedItems.length;
			cachedPagination.value.loading = false;
			setItems(fetchedItems, { replace: true });
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
		} catch (error) {
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

	const searchItems = async (term) => {
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
			let searchResults = [];

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
				searchResults = performLocalSearch(term, items.value);

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

	const filterByGroup = async (group) => {
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

	const updatePriceList = async (newPriceList) => {
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

	const getItemByCode = (itemCode) => {
		return itemsMap.value.get(itemCode);
	};

	const getItemByBarcode = (barcode) => {
		return barcodeIndex.value.get(barcode);
	};

	const addScannedItem = async (barcode) => {
		// First check existing items
		let item = getItemByBarcode(barcode);
		if (item) {
			return item;
		}

		try {
			// Search for item by barcode on server
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_items_from_barcode",
				args: {
					selling_price_list: activePriceList.value,
					currency: posProfile.value.currency,
					barcode: barcode,
				},
			});

			if (response && response.message) {
				const newItem = response.message;

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

				return newItem;
			}

			return null;
		} catch (error) {
			console.error("Failed to fetch item by barcode:", error);
			return null;
		}
	};

	// Helper functions
	const setItems = (newItems, { append = false, totalCount: totalOverride } = {}) => {
		const normalizedGroup =
			typeof itemGroup.value === "string" && itemGroup.value.length > 0 ? itemGroup.value : "ALL";

		if (!append) {
			items.value = Array.isArray(newItems) ? [...newItems] : [];
			resetIndexes();
			updateIndexes(items.value);
		} else if (Array.isArray(newItems) && newItems.length) {
			const additions = [];
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
			totalItemCount.value = totalOverride;
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

		setItems([], { replace: true, totalCount: 0 });
		itemsLoaded.value = false;
		loadProgress.value = 0;
		return filteredItems.value;
	};

	const updateIndexes = (itemList) => {
		if (!Array.isArray(itemList)) {
			return;
		}

		itemList.forEach((item) => {
			if (!item || !item.item_code) {
				return;
			}
			itemsMap.value.set(item.item_code, item);

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry) => {
					if (entry?.barcode) {
						barcodeIndex.value.set(String(entry.barcode), item);
					}
				});
			}

			if (item.barcode) {
				barcodeIndex.value.set(String(item.barcode), item);
			}
		});
	};

	const resetIndexes = () => {
		itemsMap.value.clear();
		barcodeIndex.value.clear();
	};

	const performLocalSearch = (term, itemList) => {
		if (!term) {
			return filterItemsByGroup(itemList, itemGroup.value);
		}

		const searchTerm = term.toLowerCase();
		const includeSerial = normalizeBooleanSetting(posProfile.value?.posa_search_serial_no);
		const includeBatch = normalizeBooleanSetting(posProfile.value?.posa_search_batch_no);

		return itemList.filter((item) => {
			if (!item) {
				return false;
			}

			const fields = [];

			if (item.item_code) {
				fields.push(item.item_code);
			}
			if (item.item_name) {
				fields.push(item.item_name);
			}
			if (item.barcode) {
				fields.push(item.barcode);
			}
			if (item.description) {
				fields.push(item.description);
			}

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry) => {
					if (entry?.barcode) {
						fields.push(entry.barcode);
					}
				});
			} else if (item.item_barcode) {
				fields.push(String(item.item_barcode));
			}

			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((code) => {
					if (code) {
						fields.push(String(code));
					}
				});
			}

			if (includeSerial && Array.isArray(item.serial_no_data)) {
				item.serial_no_data.forEach((serial) => {
					if (serial?.serial_no) {
						fields.push(serial.serial_no);
					}
				});
			}

			if (includeBatch && Array.isArray(item.batch_no_data)) {
				item.batch_no_data.forEach((batch) => {
					if (batch?.batch_no) {
						fields.push(batch.batch_no);
					}
				});
			}

			return fields.filter(Boolean).some((field) => field.toLowerCase().includes(searchTerm));
		});
	};

	const filterItemsByGroup = (itemList, group) => {
		if (group === "ALL") {
			return itemList;
		}
		return itemList.filter((item) => item.item_group === group);
	};

	const generateCacheKey = (search, group, priceList) => {
		return `items_${search || "all"}_${group}_${priceList || "default"}`;
	};

	// Cache management functions
	const getCachedItems = async (cacheKey) => {
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

	const cacheItems = async (cacheKey, items) => {
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

	const persistItemsToStorage = async (itemsBatch, { replaceExisting = false } = {}) => {
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

	const backgroundSyncItems = async (options = {}) => {
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

		const appended = [];

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
			const profileGroups = posProfile.value?.item_groups?.map((g) => g.item_group) || [];

			while (backgroundSyncState.value.token === token && shouldPersistItems()) {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: JSON.stringify(posProfile.value),
						price_list: activePriceList.value,
						item_group: normalizedGroup !== "ALL" ? normalizedGroup.toLowerCase() : "",
						search_value: "",
						customer: customer.value,
						include_image: 1,
						item_groups: profileGroups,
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

	const triggerBackgroundSync = (options = {}) => {
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

	const getCachedSearchResult = (cacheKey) => {
		const cached = cache.value.memory.searchResults.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < cache.value.memory.ttl) {
			return cached.data;
		}
		return null;
	};

	const setCachedSearchResult = (cacheKey, data) => {
		cache.value.memory.searchResults.set(cacheKey, {
			data,
			timestamp: Date.now(),
		});
		cleanupMemoryCache();
	};

	const getCachedPriceList = (cacheKey) => {
		const cached = cache.value.memory.priceListData.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < cache.value.memory.ttl) {
			return cached.data;
		}
		return null;
	};

	const setCachedPriceList = (cacheKey, data) => {
		cache.value.memory.priceListData.set(cacheKey, {
			data,
			timestamp: Date.now(),
		});
	};

	const applyPriceListToItems = (priceListItems) => {
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

	const backgroundLoadItemDetails = async (itemList) => {
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

	const loadItemDetailsBatch = async (itemBatch) => {
		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(posProfile.value),
					items_data: JSON.stringify(itemBatch),
					price_list: activePriceList.value,
				},
			});

			const details = response.message || [];

			// Update items with details
			details.forEach((detail) => {
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
			const health = {
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
					// 24 hours
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
				setItems([], { replace: true, totalCount: 0 });
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
					setItems(cachedItems, { replace: true, totalCount: resolvedCount });
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
			setItems(safeInitial, { replace: true, totalCount: resolvedCount });
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
			// Searches fetch a fresh page via searchItems, no incremental append required
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

	const resetCachedItemsForGroup = async (group) => {
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
		setItems(safePage, { replace: true, totalCount: cachedPagination.value.total });
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
	};

	const clearSearchCache = () => {
		cache.value.memory.searchResults.clear();
	};

	const cleanupMemoryCache = () => {
		const now = Date.now();
		const ttl = cache.value.memory.ttl;

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
				cache.value.memory.searchResults.delete(entries[i][0]);
			}
		}
	};

	const updatePerformanceMetrics = (startTime) => {
		const loadTime = performance.now() - startTime;
		performanceMetrics.value.lastLoadTime = loadTime;

		// Calculate running average
		const { averageLoadTime, totalRequests } = performanceMetrics.value;
		performanceMetrics.value.averageLoadTime =
			(averageLoadTime * (totalRequests - 1) + loadTime) / totalRequests;

		// Update cache hit rate
		const { cachedRequests, totalRequests: total } = performanceMetrics.value;
		performanceMetrics.value.cacheHitRate = total > 0 ? (cachedRequests / total) * 100 : 0;
	};

	const getEstimatedMemoryUsage = () => {
		try {
			let usage = 0;

			// Estimate items memory usage
			usage += items.value.length * 2; // ~2KB per item estimate

			// Estimate cache memory usage
			usage += cache.value.memory.searchResults.size * 1; // ~1KB per cache entry
			usage += cache.value.memory.priceListData.size * 0.5; // ~0.5KB per price entry

			return Math.round(usage * 100) / 100; // MB
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
		clearLimitSearchResults,
		clearAllCaches,
		clearSearchCache,
		assessCacheHealth,
	};
});

export default useItemsStore;
