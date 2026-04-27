/**
 * Pinia Store for Items Management in POSAwesome
 * Optimized state management with multi-layer caching and performance improvements
 */

import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Item, POSProfile } from "../types/models";
import itemService from "../services/itemService";
import { refreshBootstrapSnapshotFromCacheState } from "../../offline/index";

// Composables
import { useItemsCache } from "../composables/pos/items/store/useItemsCache";
import { useItemsSearch } from "../composables/pos/items/store/useItemsSearch";
import { useItemsSync } from "../composables/pos/items/store/useItemsSync";
import { useItemsPagination } from "../composables/pos/items/store/useItemsPagination";
import { useItemsMetrics } from "../composables/pos/items/store/useItemsMetrics";
import {
	buildLoadItemsRequest,
	type LoadItemsOptions,
} from "./items/loadItemsRequest";

export const useItemsStore = defineStore("items", () => {
	type OfflineModule = Record<string, any>;
	let offlineApiPromise: Promise<OfflineModule> | null = null;

	const getOfflineApi = async (): Promise<OfflineModule> => {
		if (!offlineApiPromise) {
			offlineApiPromise = import("../../offline/index")
				.then((mod) => mod as OfflineModule)
				.catch((error) => {
					offlineApiPromise = null;
					console.warn("Failed to load offline module", error);
					return {};
				});
		}
		return await offlineApiPromise;
	};

	const getOfflineFn = async (name: string) => {
		const api = await getOfflineApi();
		return api[name];
	};

	const getStoredItemsCountByScopeCompat = async (scope = "") => {
		const scopedCountFn = await getOfflineFn("getStoredItemsCountByScope");
		if (typeof scopedCountFn === "function") {
			return await scopedCountFn(scope);
		}

		const legacyCountFn = await getOfflineFn("getStoredItemsCount");
		if (typeof legacyCountFn === "function") {
			console.warn(
				"offline/index.js missing getStoredItemsCountByScope; using legacy getStoredItemsCount fallback.",
			);
			return await legacyCountFn();
		}

		return 0;
	};

	const getAllStoredItemsCompat = async (scope = "") => {
		const scopedGetAllFn = await getOfflineFn("getAllStoredItems");
		if (typeof scopedGetAllFn === "function") {
			return await scopedGetAllFn(scope);
		}

		const legacyGetAllFn = await getOfflineFn("getStoredItems");
		if (typeof legacyGetAllFn === "function") {
			console.warn(
				"offline/index.js missing getAllStoredItems; using legacy getStoredItems fallback.",
			);
			return await legacyGetAllFn();
		}

		return [];
	};

	const searchStoredItemsCompat = async (args: any) => {
		const searchFn = await getOfflineFn("searchStoredItems");
		if (typeof searchFn !== "function") {
			return [];
		}
		return await searchFn(args);
	};

	const getCachedPriceListItemsCompat = async (priceList: string) => {
		const fn = await getOfflineFn("getCachedPriceListItems");
		if (typeof fn !== "function") {
			return null;
		}
		return await fn(priceList);
	};

	const syncBootstrapItemReadiness = (count: number | boolean) => {
		refreshBootstrapSnapshotFromCacheState({
			itemsCount: count,
		});
	};

	// Core State
	const items = ref<Item[]>([]);
	const filteredItems = ref<Item[]>([]);
	const totalItemCount = ref(0);
	const itemsLoaded = ref(false);
	const searchTerm = ref("");
	const itemGroup = ref("ALL");
	const lastSearch = ref("");
	const posProfile = ref<POSProfile | null>(null);
	const customer = ref<string | null>(null);
	const customerPriceList = ref<string | null>(null);

	// Composables Initialization
	const {
		cache,
		cacheHealth,
		assessCacheHealth,
		clearAllCaches,
		clearSearchCache,
		getCachedItems,
		cacheItems,
		getCachedSearchResult,
		setCachedSearchResult,
		getCachedPriceList,
		setCachedPriceList,
		generateCacheKey,
	} = useItemsCache();

	const {
		itemsMap,
		barcodeIndex,
		updateIndexes,
		resetIndexes,
		performLocalSearch,
		filterItemsByGroup,
		getItemByCode,
		getItemByBarcode,
	} = useItemsSearch();

	const {
		isLoading,
		isBackgroundLoading,
		loadProgress,
		syncedItemsCount,
		requestToken,
		abortControllers,
		backgroundSyncState,
		itemGroups,
		loadItemGroups,
		persistItemsToStorage,
		primeItemDetailsCache,
		cancelBackgroundSync,
		refreshModifiedItems: syncRefreshModifiedItems,
		backgroundSyncItems: syncBackgroundSyncItems,
	} = useItemsSync();

	const {
		cachedPagination,
		DEFAULT_PAGE_SIZE,
		LARGE_CATALOG_THRESHOLD,
		resolvePageSize: paginationResolvePageSize,
		resolveLimitSearchSize,
		resetCachedPagination: paginationResetCachedPagination,
		updateCachedPaginationFromStorage,
	} = useItemsPagination();

	const {
		performanceMetrics,
		updatePerformanceMetrics,
		getEstimatedMemoryUsage,
	} = useItemsMetrics();

	// Helpers
	const normalizeBooleanSetting = (value: any): boolean => {
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			return (
				normalized === "1" ||
				normalized === "true" ||
				normalized === "yes"
			);
		}
		if (typeof value === "number") {
			return value === 1;
		}
		return Boolean(value);
	};

	const limitSearchEnabled = computed(() => {
		const rawValue =
			posProfile.value?.posa_use_limit_search ??
			posProfile.value?.pose_use_limit_search;
		return normalizeBooleanSetting(rawValue);
	});

	const resolvePageSize = (pageSize = DEFAULT_PAGE_SIZE): number => {
		return paginationResolvePageSize(
			posProfile.value,
			limitSearchEnabled.value,
			pageSize,
		);
	};

	const resetCachedPagination = (
		options: { enabled?: boolean; total?: number; pageSize?: number } = {},
	) => {
		paginationResetCachedPagination(
			options,
			posProfile.value,
			limitSearchEnabled.value,
		);
	};

	const shouldUseIndexedSearch = () => {
		if (limitSearchEnabled.value) {
			return false;
		}
		return true;
	};

	const shouldPersistItems = () => {
		if (limitSearchEnabled.value) {
			return false;
		}
		return true;
	};

	const getCacheScope = () => {
		const profileName = posProfile.value?.name || "no_profile";
		const warehouse = posProfile.value?.warehouse || "no_warehouse";
		return `${profileName}_${warehouse}`;
	};

	const getStorageScope = () => getCacheScope();

	const setItems = (
		newItems: Item[],
		options: { append?: boolean; totalCount?: number } = {},
	) => {
		const { append = false, totalCount: totalOverride } = options;
		const normalizedGroup =
			typeof itemGroup.value === "string" && itemGroup.value.length > 0
				? itemGroup.value
				: "ALL";

		if (!append) {
			items.value = Array.isArray(newItems) ? [...newItems] : [];
			resetIndexes();
			updateIndexes(items.value, posProfile.value);
		} else if (Array.isArray(newItems) && newItems.length) {
			const additions: Item[] = [];
			newItems.forEach((item) => {
				if (
					!item ||
					!item.item_code ||
					itemsMap.value.has(item.item_code)
				) {
					return;
				}
				additions.push(item);
			});

			if (additions.length) {
				items.value = [...items.value, ...additions];
				const appendedItems = items.value.slice(-additions.length);
				updateIndexes(appendedItems, posProfile.value);
			}
		}

		if (Number.isFinite(totalOverride)) {
			totalItemCount.value = totalOverride!;
		} else if (!append) {
			totalItemCount.value = items.value.length;
		}

		if (!searchTerm.value) {
			filteredItems.value = filterItemsByGroup(
				items.value,
				normalizedGroup,
			);
		}
	};

	// Computed
	const activePriceList = computed(() => {
		return (
			customerPriceList.value ||
			posProfile.value?.selling_price_list ||
			""
		);
	});

	const hasMoreCachedItems = computed(() => {
		if (!cachedPagination.value.enabled) return false;
		if (cachedPagination.value.loading) return true;
		return cachedPagination.value.offset < cachedPagination.value.total;
	});

	const itemStats = computed(() => {
		const groups = new Set<string>();
		let withImages = 0;
		let withStock = 0;
		let lowStock = 0;

		items.value.forEach((item) => {
			if (item.item_group) {
				groups.add(item.item_group);
			}
			if (item.image) {
				withImages += 1;
			}
			const qty = item.actual_qty || 0;
			if (qty > 0) {
				withStock += 1;
			}
			if (qty < 5) {
				lowStock += 1;
			}
		});

		return {
			total: items.value.length,
			filtered: filteredItems.value.length,
			groups: groups.size,
			withImages,
			withStock,
			lowStock,
		};
	});

	const cacheStats = computed(() => {
		const memCache = cache.value.memory;
		return {
			searchCacheSize: memCache.searchResults.size,
			priceListCacheSize: memCache.priceListData.size,
			itemDetailsCacheSize: memCache.itemDetails.size,
			memoryUsage: getEstimatedMemoryUsage(
				items.value.length,
				memCache.searchResults.size,
				memCache.priceListData.size,
			),
		};
	});

	// Actions
	const initialize = async (
		profile: POSProfile,
		cust: string | null = null,
		priceList: string | null = null,
	) => {
		posProfile.value = profile;
		customer.value = cust;
		customerPriceList.value = priceList;

		await loadItemGroups(posProfile.value);
		await assessCacheHealth();
		await loadCachedItems();

		if (!itemsLoaded.value || items.value.length === 0) {
			await loadItems({ forceServer: false });
		}
		itemsLoaded.value = true;
	};

	const loadCachedItems = async () => {
		try {
			if (limitSearchEnabled.value) {
				resetCachedPagination({ enabled: false, total: 0 });
				setItems([], { totalCount: 0 });
				itemsLoaded.value = false;
				syncBootstrapItemReadiness(0);
				return;
			}

			const cachedCount = await getStoredItemsCountByScopeCompat(
				getStorageScope(),
			).catch(() => 0);
			const resolvedCount = Number.isFinite(cachedCount)
				? cachedCount
				: 0;

			totalItemCount.value = resolvedCount;

			if (resolvedCount === 0) {
				itemsLoaded.value = false;
				resetCachedPagination();
				syncBootstrapItemReadiness(0);
				return;
			}

			const shouldPaginate = resolvedCount > LARGE_CATALOG_THRESHOLD;
			resetCachedPagination({
				enabled: shouldPaginate,
				total: resolvedCount,
			});

			if (!shouldPaginate) {
				const cachedItems = await getAllStoredItemsCompat(
					getStorageScope(),
				).catch(() => []);
				if (Array.isArray(cachedItems) && cachedItems.length) {
					setItems(cachedItems, { totalCount: resolvedCount });
					cachedPagination.value.offset = cachedItems.length;
					itemsLoaded.value = true;
					syncBootstrapItemReadiness(resolvedCount);
				}
				return;
			}

			const initialItems = await searchStoredItemsCompat({
				search: "",
				itemGroup: itemGroup.value,
				limit: cachedPagination.value.pageSize,
				offset: 0,
				scope: getStorageScope(),
			});

			const safeInitial = Array.isArray(initialItems) ? initialItems : [];
			setItems(safeInitial, { totalCount: resolvedCount });
			cachedPagination.value.offset = safeInitial.length;
			cachedPagination.value.search = "";
			cachedPagination.value.group =
				typeof itemGroup.value === "string" &&
				itemGroup.value.length > 0
					? itemGroup.value
					: "ALL";
			itemsLoaded.value = true;
			syncBootstrapItemReadiness(resolvedCount);
		} catch (error) {
			console.warn("Failed to load cached items:", error);
			itemsLoaded.value = true;
		}
	};

	const triggerBackgroundSync = (options: any = {}) => {
		if (!shouldPersistItems()) return;
		if (backgroundSyncState.value.running) return;

		syncBackgroundSyncItems(
			options,
			posProfile.value,
			activePriceList.value,
			getStorageScope(),
			shouldPersistItems(),
			resolvePageSize,
			setItems,
			async () => {
				await updateCachedPaginationFromStorage(
					items.value.length,
					totalItemCount,
					posProfile.value,
					shouldUseIndexedSearch(),
					limitSearchEnabled.value,
				);
			},
			totalItemCount,
			itemsLoaded,
			items,
		).catch((error) => {
			console.error("Failed to trigger background sync:", error);
		});
	};

	const loadItems = async (options: LoadItemsOptions = {}) => {
		const startTime = performance.now();
		const currentRequestToken = ++requestToken.value;
		let cacheKey: string | null = null;

		try {
			isLoading.value = true;
			performanceMetrics.value.totalRequests++;

			const {
				forceServer,
				searchValue,
				normalizedGroup,
				priceList,
				effectivePriceList,
				isInitialBootstrapRequest,
				args,
			} = buildLoadItemsRequest({
				options,
				posProfile: posProfile.value,
				activePriceList: activePriceList.value,
				customer: customer.value,
				itemCount: items.value.length,
				totalItemCount: totalItemCount.value,
				limitSearchEnabled: limitSearchEnabled.value,
				resolvePageSize,
				resolveLimitSearchSize: () =>
					resolveLimitSearchSize(
						posProfile.value,
						limitSearchEnabled.value,
					),
			});

			cacheKey = generateCacheKey(
				searchValue,
				normalizedGroup,
				priceList,
				getCacheScope(),
			);

			const canReadFromCache = !forceServer && !limitSearchEnabled.value;

			if (canReadFromCache) {
				const cachedResult = await getCachedItems(cacheKey);
				if (cachedResult) {
					setItems(cachedResult);
					itemsLoaded.value = true;
					cachedPagination.value.enabled = false;
					cachedPagination.value.offset = cachedResult.length;
					cachedPagination.value.total = cachedResult.length;
					cachedPagination.value.loading = false;
					if (!searchValue && shouldPersistItems()) {
						const storedCount = await getStoredItemsCountByScopeCompat(
							getStorageScope(),
						).catch(() => 0);
						if (!storedCount && cachedResult.length) {
							await persistItemsToStorage(
								cachedResult,
								true,
								true,
								getStorageScope(),
								async () => {
									await updateCachedPaginationFromStorage(
										cachedResult.length,
										totalItemCount,
										posProfile.value,
										shouldUseIndexedSearch(),
										limitSearchEnabled.value,
									);
								},
							);
						}
						if (normalizedGroup === "ALL") {
							syncBootstrapItemReadiness(
								Math.max(Number(storedCount || 0), cachedResult.length),
							);
						}
					}
					performanceMetrics.value.cachedRequests++;
					updatePerformanceMetrics(startTime);
					return cachedResult;
				}
			}

			const abortController = new AbortController();
			abortControllers.value.set(cacheKey, abortController);

			if (!args || !posProfile.value) {
				console.warn("Attempted to load items without POS Profile");
				return [];
			}

			const fetchedItems = await itemService.getItems(
				args,
				abortController.signal,
			);

			if (requestToken.value !== currentRequestToken) {
				return;
			}

			cachedPagination.value.enabled = false;
			cachedPagination.value.offset = fetchedItems.length;
			cachedPagination.value.total = fetchedItems.length;
			cachedPagination.value.loading = false;
			setItems(fetchedItems);
			itemsLoaded.value = true;

			const shouldCacheFetchedItems =
				!limitSearchEnabled.value && !isInitialBootstrapRequest;

			if (shouldCacheFetchedItems) {
				await cacheItems(cacheKey, fetchedItems);
			}

			if (!searchValue && shouldPersistItems()) {
				await persistItemsToStorage(
					fetchedItems,
					shouldPersistItems(),
					forceServer,
					getStorageScope(),
					async () => {
						await updateCachedPaginationFromStorage(
							items.value.length,
							totalItemCount,
							posProfile.value,
							shouldUseIndexedSearch(),
							limitSearchEnabled.value,
						);
					},
				);
				if (normalizedGroup === "ALL") {
					const storedCount = await getStoredItemsCountByScopeCompat(
						getStorageScope(),
					).catch(() => fetchedItems.length);
					syncBootstrapItemReadiness(
						Math.max(Number(storedCount || 0), fetchedItems.length),
					);
				}
				triggerBackgroundSync({
					groupFilter: normalizedGroup,
					initialBatch: fetchedItems,
					reset: false,
				});
			} else if (!searchValue && normalizedGroup === "ALL") {
				syncBootstrapItemReadiness(0);
			}

			if (fetchedItems.length > 0) {
				// `get_items` already returns detail-enriched rows. Seed the offline
				// detail cache from that response and keep the visible-item refresh path
				// as the single place that decides whether a live recheck is still needed.
				primeItemDetailsCache(
					fetchedItems,
					posProfile.value,
					effectivePriceList,
				);
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
			typeof itemGroup.value === "string" && itemGroup.value.length > 0
				? itemGroup.value
				: "ALL";

		clearSearchCache();
		if (preserveItems) {
			filteredItems.value = filterItemsByGroup(
				items.value,
				itemGroup.value,
			);
			return filteredItems.value;
		}

		setItems([], { totalCount: 0 });
		loadProgress.value = 0;
		return filteredItems.value;
	};

	const searchItems = async (term: string) => {
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

			if (!cachedPagination.value.enabled) {
				filteredItems.value = filterItemsByGroup(
					items.value,
					itemGroup.value,
				);
			} else {
				cachedPagination.value.search = "";
				cachedPagination.value.offset = Math.min(
					cachedPagination.value.offset,
					items.value.length,
				);
				filteredItems.value = filterItemsByGroup(
					items.value,
					itemGroup.value,
				);
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

				const serverResults = filterItemsByGroup(
					items.value,
					itemGroup.value,
				);
				filteredItems.value = serverResults;
				performanceMetrics.value.searchMisses++;

				return serverResults;
			} catch (error) {
				console.error("Search failed:", error);
				performanceMetrics.value.searchMisses++;
				return [];
			}
		}

		const cacheKey = `search_${getCacheScope()}_${activePriceList.value || "default"}_${term}_${itemGroup.value}`;
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
					typeof itemGroup.value === "string" &&
					itemGroup.value.length > 0
						? itemGroup.value
						: "ALL";
				const results = await searchStoredItemsCompat({
					search: term,
					itemGroup: normalizedGroup,
					limit: cachedPagination.value.pageSize,
					offset: 0,
					scope: getStorageScope(),
				});

				searchResults = Array.isArray(results) ? results : [];
				cachedPagination.value.search = term;
				cachedPagination.value.offset = searchResults.length;
				cachedPagination.value.total = Math.max(
					cachedPagination.value.total,
					searchResults.length,
				);
			} else {
				const sourceItems = canRefineSearch
					? filteredItems.value
					: items.value;
				searchResults = performLocalSearch(
					term,
					sourceItems,
					itemGroup.value,
				);

				if (searchResults.length === 0 && term.length >= 3) {
					await loadItems({
						searchValue: term,
						groupFilter: itemGroup.value,
						forceServer: true,
					});
					searchResults = performLocalSearch(
						term,
						items.value,
						itemGroup.value,
					);
				}

				searchResults = filterItemsByGroup(
					searchResults,
					itemGroup.value,
				);
			}

			setCachedSearchResult(cacheKey, searchResults);

			filteredItems.value = searchResults;
			performanceMetrics.value.searchMisses++;

			if (shouldUseIndexed) {
				updateIndexes(searchResults, posProfile.value);
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
			await searchItems(searchTerm.value);
		} else {
			if (cachedPagination.value.enabled && shouldUseIndexedSearch()) {
				await resetCachedItemsForGroup(group);
			} else {
				filteredItems.value = filterItemsByGroup(items.value, group);
			}
		}
	};

	const appendCachedItemsPage = async () => {
		if (limitSearchEnabled.value) return [];
		if (!cachedPagination.value.enabled || cachedPagination.value.loading)
			return [];
		if (searchTerm.value && searchTerm.value.length >= 2) return [];
		if (cachedPagination.value.offset >= cachedPagination.value.total)
			return [];

		cachedPagination.value.loading = true;

		try {
			const nextPage = await searchStoredItemsCompat({
				search: cachedPagination.value.search || "",
				itemGroup: cachedPagination.value.group,
				limit: cachedPagination.value.pageSize,
				offset: cachedPagination.value.offset,
				scope: getStorageScope(),
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

			return safePage;
		} catch (error) {
			console.warn("Failed to append cached items:", error);
			return [];
		} finally {
			cachedPagination.value.loading = false;
		}
	};

	const resetCachedItemsForGroup = async (group: string) => {
		if (
			limitSearchEnabled.value ||
			!cachedPagination.value.enabled ||
			!shouldUseIndexedSearch()
		) {
			filteredItems.value = filterItemsByGroup(items.value, group);
			return;
		}

		const normalizedGroup =
			typeof group === "string" && group.length > 0 ? group : "ALL";
		cachedPagination.value.group = normalizedGroup;
		cachedPagination.value.offset = 0;
		cachedPagination.value.search = "";

		const firstPage = await searchStoredItemsCompat({
			search: "",
			itemGroup: normalizedGroup,
			limit: cachedPagination.value.pageSize,
			offset: 0,
			scope: getStorageScope(),
		});

		const safePage = Array.isArray(firstPage) ? firstPage : [];
		setItems(safePage, { totalCount: cachedPagination.value.total });
		cachedPagination.value.offset = safePage.length;
	};

	const updatePriceList = async (newPriceList: string) => {
		if (!newPriceList || newPriceList === customerPriceList.value) return;

		customerPriceList.value = newPriceList;

		try {
			const cacheKey = `price_list_${getCacheScope()}_${newPriceList}`;
			let priceData = getCachedPriceList(cacheKey);

			if (!priceData) {
				priceData = await getCachedPriceListItemsCompat(newPriceList);
				if (priceData && priceData.length > 0) {
					setCachedPriceList(cacheKey, priceData);
				}
			}

			if (priceData && priceData.length > 0) {
				applyPriceListToItems(priceData);
			} else {
				await loadItems({
					forceServer: true,
					priceList: newPriceList,
				});
			}
		} catch (error) {
			console.error("Failed to update price list:", error);
		}
	};

	const applyPriceListToItems = (priceListItems: any[]) => {
		const priceMap = new Map();
		priceListItems.forEach((item) => {
			priceMap.set(item.item_code, item);
		});

		items.value.forEach((item) => {
			const priceItem = priceMap.get(item.item_code);
			if (priceItem) {
				const nextRate =
					priceItem.price_list_rate || priceItem.rate || 0;
				const nextCurrency =
					priceItem.currency ||
					item.original_currency ||
					item.currency ||
					posProfile.value?.currency;

				item.rate = nextRate;
				item.price_list_rate = nextRate;
				item.original_rate = nextRate;
				item.original_currency = nextCurrency;
				item.currency = nextCurrency;
			}
		});
		clearSearchCache();

		if (searchTerm.value) {
			filteredItems.value = performLocalSearch(
				searchTerm.value,
				items.value,
				itemGroup.value,
			);
		} else {
			filteredItems.value = filterItemsByGroup(
				items.value,
				itemGroup.value,
			);
		}
	};

	const refreshItems = async () => {
		await clearAllCaches();
		itemsLoaded.value = false;
		resetCachedPagination();
		await loadItems({ forceServer: true });
	};

	const addScannedItem = async (barcode: string) => {
		let item = getItemByBarcode(barcode);
		if (item) return item;

		try {
			const newItem: any = await itemService.getItemsFromBarcode({
				selling_price_list: activePriceList.value,
				currency: posProfile.value?.currency || "",
				barcode: barcode,
			});

			if (newItem) {
				if (
					newItem.scale_qty !== undefined &&
					newItem.scale_qty !== null
				) {
					const parsedQty = parseFloat(newItem.scale_qty);
					if (!Number.isNaN(parsedQty)) {
						newItem._scale_qty = parsedQty;
					}
				}

				if (
					newItem.scale_price !== undefined &&
					newItem.scale_price !== null
				) {
					const parsedPrice = parseFloat(newItem.scale_price);
					if (!Number.isNaN(parsedPrice)) {
						newItem._scale_price = parsedPrice;
					}
				}

				items.value.push(newItem);
				updateIndexes([newItem], posProfile.value);

				if (searchTerm.value) {
					await searchItems(searchTerm.value);
				} else {
					filteredItems.value = filterItemsByGroup(
						items.value,
						itemGroup.value,
					);
				}

				clearSearchCache();
				return newItem as Item;
			}
			return null;
		} catch (error) {
			console.error("Failed to fetch item by barcode:", error);
			return null;
		}
	};

	const refreshModifiedItems = async (priceListOverride: string | null = null) => {
		if (!itemsLoaded.value) return { size: 0, count: 0, items: [] };
		const resolvedPriceList =
			typeof priceListOverride === "string" &&
			priceListOverride.trim().length > 0
				? priceListOverride.trim()
				: activePriceList.value;

		return await syncRefreshModifiedItems(
			posProfile.value,
			resolvedPriceList,
			customer.value,
			getStorageScope(),
			(updates) => updateItemsInPlace(updates),
			itemsMap.value,
		);
	};

	const updateItemsInPlace = (updates: Item[]) => {
		if (!Array.isArray(updates) || updates.length === 0) {
			return;
		}

		const additions: Item[] = [];
		const touchedItems: Item[] = [];
		const canonicalItemsByCode = new Map<string, Item>();
		items.value.forEach((item) => {
			if (item?.item_code) {
				canonicalItemsByCode.set(item.item_code, item);
			}
		});

		updates.forEach((update) => {
			if (!update?.item_code) {
				return;
			}

			const existing = canonicalItemsByCode.get(update.item_code);
			if (existing) {
				Object.assign(existing, update);
				const syncedRate = update.price_list_rate ?? update.rate;
				if (syncedRate !== undefined && syncedRate !== null) {
					existing.original_rate = syncedRate as any;
				}
				if (update.currency) {
					existing.original_currency = update.currency as any;
				}
				touchedItems.push(existing);
			} else {
				const syncedRate = update.price_list_rate ?? update.rate;
				if (
					syncedRate !== undefined &&
					syncedRate !== null &&
					update.original_rate === undefined
				) {
					(update as any).original_rate = syncedRate;
				}
				if (
					update.currency &&
					update.original_currency === undefined
				) {
					(update as any).original_currency = update.currency;
				}
				additions.push(update);
			}
		});

		if (additions.length > 0) {
			items.value = [...items.value, ...additions];
			const appendedItems = items.value.slice(-additions.length);
			updateIndexes(appendedItems, posProfile.value);
		}

		if (touchedItems.length > 0) {
			// Force a shallow array refresh so virtualized tables/cards re-render
			// even when rows are updated in-place.
			items.value = [...items.value];
			updateIndexes(touchedItems, posProfile.value);
		}

		clearSearchCache();
		if (searchTerm.value) {
			filteredItems.value = performLocalSearch(
				searchTerm.value,
				items.value,
				itemGroup.value,
			);
		} else {
			filteredItems.value = filterItemsByGroup(
				items.value,
				itemGroup.value,
			);
		}
	};

	// Watchers
	watch(customerPriceList, (newPriceList) => {
		if (newPriceList && itemsLoaded.value) {
			updatePriceList(newPriceList);
		}
	});

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
		syncedItemsCount,
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
		backgroundSyncItems: triggerBackgroundSync, // mapped
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
