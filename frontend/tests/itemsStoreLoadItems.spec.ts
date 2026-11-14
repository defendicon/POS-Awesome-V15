import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const itemServiceMocks = vi.hoisted(() => ({
	getItemsData: vi.fn(),
	getHotItemsData: vi.fn(),
}));

const offlineMocks = vi.hoisted(() => ({
	refreshBootstrapSnapshotFromCacheState: vi.fn(),
	getStoredItemsCountByScope: vi.fn(async () => 0),
	getAllStoredItems: vi.fn(async () => []),
	searchStoredItems: vi.fn(async () => []),
	getCachedPriceListItems: vi.fn(async () => null),
	getItemsLastSync: vi.fn(() => null),
	isOffline: vi.fn(() => false),
}));

const cacheMocks = vi.hoisted(() => ({
	getCachedItems: vi.fn(async () => null),
	cacheItems: vi.fn(async () => {}),
	getCachedSearchResult: vi.fn(() => null),
	setCachedSearchResult: vi.fn(),
	clearSearchCache: vi.fn(),
}));

const itemsSearchMocks = vi.hoisted(() => ({
	performLocalSearch: vi.fn((_term: string, items: any[]) => items),
}));

const itemsSyncMocks = vi.hoisted(() => ({
	primeItemDetailsCache: vi.fn(),
	backgroundSyncItems: vi.fn(async () => []),
}));

vi.mock("../src/posapp/services/itemService", () => ({
	default: {
		getItemsData: itemServiceMocks.getItemsData,
		getHotItemsData: itemServiceMocks.getHotItemsData,
		getItemGroupsData: vi.fn(async () => []),
		getItemsFromBarcodeData: vi.fn(async () => null),
	},
}));

vi.mock("../src/offline/index", () => ({
	refreshBootstrapSnapshotFromCacheState:
		offlineMocks.refreshBootstrapSnapshotFromCacheState,
	getStoredItemsCountByScope: offlineMocks.getStoredItemsCountByScope,
	getAllStoredItems: offlineMocks.getAllStoredItems,
	searchStoredItems: offlineMocks.searchStoredItems,
	getCachedPriceListItems: offlineMocks.getCachedPriceListItems,
	getItemsLastSync: offlineMocks.getItemsLastSync,
	isOffline: offlineMocks.isOffline,
}));

vi.mock("../src/posapp/composables/pos/items/store/useItemsCache", () => ({
	useItemsCache: () => ({
		cache: {
			value: {
				memory: {
					searchResults: new Map(),
					priceListData: new Map(),
					itemDetails: new Map(),
				},
			},
		},
		cacheHealth: { value: { items: "healthy" } },
		assessCacheHealth: vi.fn(async () => {}),
		clearAllCaches: vi.fn(async () => {}),
		clearSearchCache: cacheMocks.clearSearchCache,
		getCachedItems: cacheMocks.getCachedItems,
		cacheItems: cacheMocks.cacheItems,
		getCachedSearchResult: cacheMocks.getCachedSearchResult,
		setCachedSearchResult: cacheMocks.setCachedSearchResult,
		getCachedPriceList: vi.fn(() => null),
		setCachedPriceList: vi.fn(),
		generateCacheKey: vi.fn(
			(searchValue = "", group = "ALL", priceList = "", scope = "") =>
				`${scope}:${priceList}:${group}:${searchValue}`,
		),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/store/useItemsSearch", () => ({
	useItemsSearch: () => {
		const itemsMap = { value: new Map<string, any>() };
		const barcodeIndex = { value: new Map<string, any>() };
		const register = (
			index: Map<string, any>,
			value: unknown,
			item: any,
		) => {
			const raw = String(value || "").trim();
			if (!raw) return;
			index.set(raw, item);
			index.set(raw.toLowerCase(), item);
		};

		return {
			itemsMap,
			barcodeIndex,
			updateIndexes: (items: any[] = []) => {
				items.forEach((item) => {
					if (item?.item_code) {
						register(itemsMap.value, item.item_code, item);
						register(barcodeIndex.value, item.item_code, item);
					}
					if (item?.barcode) {
						register(barcodeIndex.value, item.barcode, item);
					}
					if (Array.isArray(item?.item_barcode)) {
						item.item_barcode.forEach((entry: any) =>
							register(barcodeIndex.value, entry?.barcode, item),
						);
					}
					if (Array.isArray(item?.barcodes)) {
						item.barcodes.forEach((entry: any) =>
							register(
								barcodeIndex.value,
								entry?.barcode || entry,
								item,
							),
						);
					}
				});
			},
			resetIndexes: () => {
				itemsMap.value = new Map();
				barcodeIndex.value = new Map();
			},
			performLocalSearch: itemsSearchMocks.performLocalSearch,
			performRankedLocalSearch: (
				term: string,
				items: any[],
				group: string,
				limit = 50,
			) =>
				itemsSearchMocks
					.performLocalSearch(term, items, group)
					.slice(0, limit),
			filterItemsByGroup: (items: any[], group: string) =>
				group && group !== "ALL"
					? items.filter((item) => item?.item_group === group)
					: items,
			getItemByCode: (code: string) => itemsMap.value.get(code),
			getItemByBarcode: (barcode: string) =>
				barcodeIndex.value.get(barcode),
		};
	},
}));

vi.mock("../src/posapp/composables/pos/items/store/useItemsSync", () => ({
	useItemsSync: () => ({
		isLoading: { value: false },
		isBackgroundLoading: { value: false },
		loadProgress: { value: 0 },
		requestToken: { value: 0 },
		abortControllers: { value: new Map<string, AbortController>() },
		backgroundSyncState: { value: { running: false, token: 0 } },
		itemGroups: { value: ["ALL"] },
		loadItemGroups: vi.fn(async () => {}),
		persistItemsToStorage: vi.fn(async () => {}),
		primeItemDetailsCache: itemsSyncMocks.primeItemDetailsCache,
		cancelBackgroundSync: vi.fn(),
		refreshModifiedItems: vi.fn(async () => ({
			size: 0,
			count: 0,
			items: [],
		})),
		backgroundSyncItems: itemsSyncMocks.backgroundSyncItems,
	}),
}));

vi.mock("../src/posapp/composables/pos/items/store/useItemsPagination", () => ({
	useItemsPagination: () => ({
		cachedPagination: {
			value: {
				enabled: false,
				offset: 0,
				total: 0,
				loading: false,
				pageSize: 50,
				search: "",
				group: "ALL",
			},
		},
		DEFAULT_PAGE_SIZE: 50,
		LARGE_CATALOG_THRESHOLD: 500,
		resolvePageSize: vi.fn(() => 50),
		resolveLimitSearchSize: vi.fn(() => 50),
		resetCachedPagination: vi.fn(),
		updateCachedPaginationFromStorage: vi.fn(async () => {}),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/store/useItemsMetrics", () => ({
	useItemsMetrics: () => ({
		performanceMetrics: {
			value: {
				totalRequests: 0,
				cachedRequests: 0,
				searchHits: 0,
				searchMisses: 0,
			},
		},
		updatePerformanceMetrics: vi.fn(),
		getEstimatedMemoryUsage: vi.fn(() => 0),
	}),
}));

import { useItemsStore } from "../src/posapp/stores/itemsStore";

describe("itemsStore loadItems", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		offlineMocks.getStoredItemsCountByScope.mockResolvedValue(0);
		offlineMocks.getAllStoredItems.mockResolvedValue([]);
		offlineMocks.searchStoredItems.mockResolvedValue([]);
		offlineMocks.isOffline.mockReturnValue(false);
		cacheMocks.getCachedItems.mockResolvedValue(null);
		cacheMocks.getCachedSearchResult.mockReturnValue(null);
		itemsSearchMocks.performLocalSearch.mockImplementation(
			(_term: string, items: any[]) => items,
		);
		itemServiceMocks.getHotItemsData.mockResolvedValue([]);
		itemServiceMocks.getItemsData.mockResolvedValue([
			{
				item_code: "ITEM-1",
				item_name: "Item One",
				item_group: "All Item Groups",
				stock_uom: "Nos",
				actual_qty: 7,
				rate: 120,
				price_list_rate: 120,
				item_uoms: [{ uom: "Nos", conversion_factor: 1 }],
			},
		]);
	});

	it("replaces the catalog with the selected list and keeps it on a failed switch", async () => {
		const store = useItemsStore();
		await store.initialize({
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
		} as any);
		itemServiceMocks.getItemsData.mockResolvedValueOnce([
			{ item_code: "ITEM-2", rate: 95, price_list_rate: 95 },
		]);

		await store.updatePriceList("Wholesale", { reloadCatalog: true });

		expect(store.activePriceList).toBe("Wholesale");
		expect(store.items.map((item) => item.item_code)).toEqual(["ITEM-2"]);
		expect(store.filteredItems[0].rate).toBe(95);

		itemServiceMocks.getItemsData.mockRejectedValueOnce(new Error("Unavailable"));
		await expect(
			store.updatePriceList("Member", { reloadCatalog: true }),
		).rejects.toThrow("Unavailable");
		expect(store.activePriceList).toBe("Wholesale");
		expect(store.items[0].item_code).toBe("ITEM-2");
	});

	it("primes detail cache directly from get_items responses on first load", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		await store.initialize(profile);

		expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
		expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
			expect.objectContaining({
				price_list: "Retail",
			}),
			expect.any(AbortSignal),
		);
		expect(itemsSyncMocks.primeItemDetailsCache).toHaveBeenCalledTimes(1);
		expect(itemsSyncMocks.primeItemDetailsCache).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					item_code: "ITEM-1",
					actual_qty: 7,
					price_list_rate: 120,
				}),
			],
			profile,
			"Retail",
		);
		expect(store.items).toHaveLength(1);
		expect(store.filteredItems).toHaveLength(1);
	});

	it("deduplicates concurrent initialization inside the store", async () => {
		let releaseCatalog: ((items: any[]) => void) | undefined;
		itemServiceMocks.getItemsData.mockReturnValueOnce(
			new Promise<any[]>((resolve) => {
				releaseCatalog = resolve;
			}),
		);
		const store = useItemsStore();
		const profile = {
			name: "POS-DEDUP",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		const first = store.initialize(profile, "Walk In", "Retail");
		const second = store.initialize(profile, "Walk In", "Retail");
		await vi.waitFor(() =>
			expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1),
		);
		releaseCatalog?.([]);
		await Promise.all([first, second]);

		expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
	});

	it("does not repeat catalog storage work for transient startup customer contexts", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-DEDUP-CONTEXT",
			modified: "2026-07-20 10:00:00",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		await store.initialize(profile, null, null);
		const storageReadsAfterFirstPass =
			offlineMocks.getStoredItemsCountByScope.mock.calls.length;
		await store.initialize(profile, "Walk In", "Retail");

		expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
		expect(offlineMocks.getStoredItemsCountByScope).toHaveBeenCalledTimes(
			storageReadsAfterFirstPass,
		);
		expect(store.customer).toBe("Walk In");
		expect(store.customerPriceList).toBe("Retail");
	});

	it("does not replace the master catalog with scoped server search results", async () => {
		vi.useFakeTimers();
		try {
			const store = useItemsStore();
			await store.initialize({
				name: "POS-1",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 1,
			} as any);

			itemServiceMocks.getItemsData.mockClear();
			itemsSearchMocks.performLocalSearch.mockReturnValue([]);
			itemServiceMocks.getItemsData.mockResolvedValueOnce([
				{
					item_code: "SEARCH-1",
					item_name: "Scoped Search Result",
					item_group: "All Item Groups",
				},
			]);

			const searchPromise = store.searchItems("scoped", {
				serverFallbackDelayMs: 0,
			});
			await vi.advanceTimersByTimeAsync(0);
			await searchPromise;

			expect(store.items.map((item) => item.item_code)).toEqual([
				"ITEM-1",
			]);
			expect(store.filteredItems.map((item) => item.item_code)).toEqual([
				"SEARCH-1",
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("preserves the catalog and visible results when an active-search reload returns empty", async () => {
		const store = useItemsStore();
		await store.initialize({
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any);

		store.$patch({
			searchTerm: "item",
			filteredItems: [...store.items],
			filteredItemsSearchTerm: "item",
		});
		itemServiceMocks.getItemsData.mockResolvedValueOnce([]);

		await store.recoverItemCatalog({
			reason: "reload_button",
			preserveSearch: true,
		});

		expect(store.items.map((item) => item.item_code)).toEqual(["ITEM-1"]);
		expect(store.filteredItems.map((item) => item.item_code)).toEqual([
			"ITEM-1",
		]);
		expect(store.filteredItemsSearchTerm).toBe("item");
	});

	it("preserves an existing catalog when an unscoped manual reload returns empty", async () => {
		const store = useItemsStore();
		await store.initialize({
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any);

		itemServiceMocks.getItemsData.mockResolvedValueOnce([]);

		await store.recoverItemCatalog({
			reason: "reload_button",
			preserveSearch: false,
		});

		expect(store.items.map((item) => item.item_code)).toEqual(["ITEM-1"]);
		expect(store.filteredItems.map((item) => item.item_code)).toEqual([
			"ITEM-1",
		]);
	});

	it("does not replace the master catalog when reloading one item group", async () => {
		const store = useItemsStore();
		await store.initialize({
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any);
		await store.filterByGroup("Medicines");
		itemServiceMocks.getItemsData.mockResolvedValueOnce([
			{
				item_code: "MED-1",
				item_name: "Medicine One",
				item_group: "Medicines",
			},
		]);

		await store.recoverItemCatalog({
			reason: "reload_button",
			preserveSearch: true,
		});

		expect(store.items.map((item) => item.item_code)).toEqual(["ITEM-1"]);
		expect(store.filteredItems.map((item) => item.item_code)).toEqual([
			"MED-1",
		]);
	});

	it("does not insert a quick-edited item that no longer matches the active search", () => {
		const store = useItemsStore();
		const shampoo = {
			item_code: "ITEM-1",
			item_name: "Shampoo",
			item_group: "All Item Groups",
		} as any;
		store.$patch({
			items: [shampoo],
			filteredItems: [shampoo],
			searchTerm: "shampoo",
			filteredItemsSearchTerm: "shampoo",
		});
		itemsSearchMocks.performLocalSearch.mockImplementation(
			(term: string, items: any[]) =>
				items.filter((item) =>
					String(item?.item_name || "")
						.toLowerCase()
						.includes(term.toLowerCase()),
				),
		);

		store.upsertCatalogItem({
			item_code: "ITEM-1",
			item_name: "Dish Wash",
			item_group: "All Item Groups",
		} as any);

		expect(store.items[0].item_name).toBe("Dish Wash");
		expect(store.filteredItems).toEqual([]);
	});

	it("loads and indexes the hot catalog when Fast Counter Mode is enabled", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [{ item_group: "Medicines" }],
			posa_fast_counter_mode: 1,
			posa_hot_catalog_limit: 250,
			posa_fast_counter_positive_stock_only: 1,
		} as any;
		itemServiceMocks.getHotItemsData.mockResolvedValue([
			{
				item_code: "HOT-1",
				item_name: "Hot Item",
				item_group: "Medicines",
				price_list_rate: 15,
			},
		]);

		await store.initialize(profile);

		expect(itemServiceMocks.getHotItemsData).toHaveBeenCalledWith(
			expect.objectContaining({
				price_list: "Retail",
				limit: 250,
				days: 120,
				include_image: 0,
				item_groups: ["Medicines"],
			}),
		);
		const hotCatalogArgs =
			itemServiceMocks.getHotItemsData.mock.calls[0][0];
		expect(
			JSON.parse(hotCatalogArgs.pos_profile)
				.posa_fast_counter_positive_stock_only,
		).toBe(1);
		expect(store.hotItems.map((item) => item.item_code)).toEqual(["HOT-1"]);
		expect(store.hotItemsLoaded).toBe(true);
		expect(itemsSyncMocks.primeItemDetailsCache).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					item_code: "HOT-1",
					price_list_rate: 15,
				}),
			],
			profile,
			"Retail",
		);
	});

	it("returns an exact hot barcode hit without waiting for server fallback", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_fast_counter_mode: 1,
			posa_use_limit_search: 1,
		} as any;
		itemServiceMocks.getHotItemsData.mockResolvedValue([
			{
				item_code: "HOT-BAR",
				item_name: "Barcode Hot Item",
				item_group: "ALL",
				item_barcode: [{ barcode: "12345" }],
			},
		]);

		await store.initialize(profile);
		itemServiceMocks.getItemsData.mockClear();

		const result = await store.searchItems("12345");

		expect(result.map((item) => item.item_code)).toEqual(["HOT-BAR"]);
		expect(store.filteredItems.map((item) => item.item_code)).toEqual([
			"HOT-BAR",
		]);
		expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();
	});

	it("uses the resolved price list when seeding fetched detail rows", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		await store.initialize(profile);
		itemsSyncMocks.primeItemDetailsCache.mockClear();

		await store.loadItems({
			forceServer: true,
			priceList: "Customer Retail",
		});

		expect(itemServiceMocks.getItemsData).toHaveBeenLastCalledWith(
			expect.objectContaining({
				price_list: "Customer Retail",
			}),
			expect.any(AbortSignal),
		);
		expect(itemsSyncMocks.primeItemDetailsCache).toHaveBeenCalledWith(
			expect.any(Array),
			profile,
			"Customer Retail",
		);
	});

	it("limits customer price list cache-miss refreshes to the foreground page", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		await store.initialize(profile);
		itemServiceMocks.getItemsData.mockClear();

		await store.updatePriceList("Customer Retail");

		expect(offlineMocks.getCachedPriceListItems).toHaveBeenCalledWith(
			"Customer Retail",
		);
		expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
			expect.objectContaining({
				price_list: "Customer Retail",
				limit: 50,
			}),
			expect.any(AbortSignal),
		);
		expect(itemsSyncMocks.backgroundSyncItems).toHaveBeenCalledWith(
			expect.objectContaining({
				groupFilter: "ALL",
				reset: true,
			}),
			expect.anything(),
			"Customer Retail",
			"POS-1_Main WH",
			true,
			expect.any(Boolean),
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
	});

	it("does not prime detail cache when the server returns no items", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		itemServiceMocks.getItemsData.mockResolvedValueOnce([]);

		await store.initialize(profile);

		expect(itemsSyncMocks.primeItemDetailsCache).not.toHaveBeenCalled();
	});

	it("limits the initial cold-start fetch so background sync can hydrate the rest", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 0,
		} as any;

		await store.initialize(profile);

		expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
			expect.objectContaining({
				price_list: "Retail",
				limit: 50,
			}),
			expect.any(AbortSignal),
		);
		expect(itemsSyncMocks.backgroundSyncItems).toHaveBeenCalledTimes(1);
		expect(itemsSyncMocks.backgroundSyncItems).toHaveBeenCalledWith(
			expect.objectContaining({
				groupFilter: "ALL",
				reset: true,
			}),
			expect.anything(),
			"Retail",
			"POS-1_Main WH",
			true,
			expect.any(Boolean),
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
	});

	it("starts the catalog API when a large or blocked IndexedDB read misses the cold-start grace", async () => {
		vi.useFakeTimers();
		try {
			let releaseBlockedRead: ((value: number) => void) | undefined;
			const blockedRead = new Promise<number>((resolve) => {
				releaseBlockedRead = resolve;
			});
			let countReads = 0;
			offlineMocks.getStoredItemsCountByScope.mockImplementation(() => {
				countReads += 1;
				return countReads <= 2 ? blockedRead : Promise.resolve(0);
			});
			const store = useItemsStore();
			const initialization = store.initialize({
				name: "POS-BLOCKED-IDB",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 0,
			} as any);

			await Promise.resolve();
			expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(250);
			expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
				expect.objectContaining({
					price_list: "Retail",
					limit: 50,
				}),
				expect.any(AbortSignal),
			);
			releaseBlockedRead?.(0);
			vi.useRealTimers();
			await initialization;
			expect(store.itemsLoaded).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("bypasses memory result cache when scoped offline catalog is large", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 0,
		} as any;

		offlineMocks.getStoredItemsCountByScope.mockResolvedValue(6000);
		offlineMocks.searchStoredItems.mockResolvedValue([
			{
				item_code: "ITEM-CACHED-PAGE",
				item_name: "Cached Page Item",
				item_group: "ALL",
			},
		]);
		cacheMocks.getCachedItems.mockResolvedValue([
			{
				item_code: "ITEM-FULL-CACHE",
				item_name: "Full Cache Item",
				item_group: "ALL",
			},
		]);

		await store.initialize(profile);
		itemServiceMocks.getItemsData.mockClear();
		cacheMocks.getCachedItems.mockClear();

		await store.loadItems();

		expect(cacheMocks.getCachedItems).not.toHaveBeenCalled();
		expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
		expect(store.items.map((item) => item.item_code)).toEqual(["ITEM-1"]);
	});

	it("does not duplicate indexed search result pages in memory cache", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 0,
		} as any;

		offlineMocks.getStoredItemsCountByScope.mockResolvedValue(6000);
		offlineMocks.searchStoredItems
			.mockResolvedValueOnce([
				{
					item_code: "ITEM-BOOT",
					item_name: "Boot Item",
					item_group: "ALL",
				},
			])
			.mockResolvedValueOnce([
				{
					item_code: "ITEM-ALPHA",
					item_name: "Alpha Item",
					item_group: "ALL",
				},
			]);

		await store.initialize(profile);

		const result = await store.searchItems("alpha");

		expect(result.map((item) => item.item_code)).toEqual(["ITEM-ALPHA"]);
		expect(cacheMocks.getCachedSearchResult).not.toHaveBeenCalled();
		expect(cacheMocks.setCachedSearchResult).not.toHaveBeenCalled();
		expect(store.filteredItemsSearchTerm).toBe("alpha");
	});

	it("hydrates limit-search readiness from the scoped catalog and searches it immediately offline", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-COUNTER",
			warehouse: "Main Store",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 1,
			posa_force_server_items: 1,
		} as any;
		offlineMocks.isOffline.mockReturnValue(true);
		offlineMocks.getStoredItemsCountByScope.mockResolvedValue(40_500);
		offlineMocks.searchStoredItems.mockResolvedValue([
			{
				item_code: "02017",
				item_name: "Panadol 500mg",
				item_group: "Medicines",
			},
		]);

		await store.initialize(profile);
		const result = await store.searchItems("panadol", {
			serverFallbackDelayMs: 0,
			resultLimit: 25,
		});

		expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();
		expect(offlineMocks.searchStoredItems).toHaveBeenCalledWith({
			search: "panadol",
			itemGroup: "ALL",
			limit: 25,
			offset: 0,
			scope: "POS-COUNTER_Main Store",
		});
		expect(result.map((item) => item.item_code)).toEqual(["02017"]);
		expect(
			offlineMocks.refreshBootstrapSnapshotFromCacheState,
		).toHaveBeenCalledWith({ itemsCount: 40_500 });
	});

	it("does not let a slower offline lookup replace a newer cashier query", async () => {
		const store = useItemsStore();
		offlineMocks.isOffline.mockReturnValue(true);
		offlineMocks.getStoredItemsCountByScope.mockResolvedValue(40_500);
		let resolveOlderLookup!: (items: any[]) => void;
		const olderLookup = new Promise<any[]>((resolve) => {
			resolveOlderLookup = resolve;
		});
		offlineMocks.searchStoredItems
			.mockImplementationOnce(async () => await olderLookup)
			.mockResolvedValueOnce([
				{
					item_code: "NEWEST-1",
					item_name: "Panadol Newest Match",
					item_group: "Medicines",
				},
			]);

		await store.initialize({
			name: "POS-COUNTER",
			warehouse: "Main Store",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 1,
			posa_force_server_items: 1,
		} as any);

		const olderSearch = store.searchItems("pana", { resultLimit: 20 });
		await Promise.resolve();
		await expect(
			store.searchItems("panadol", { resultLimit: 20 }),
		).resolves.toEqual([
			expect.objectContaining({ item_code: "NEWEST-1" }),
		]);

		resolveOlderLookup([
			{
				item_code: "STALE-1",
				item_name: "Stale Match",
				item_group: "Medicines",
			},
		]);
		await expect(olderSearch).resolves.toEqual([]);
		expect(store.filteredItems.map((item) => item.item_code)).toEqual([
			"NEWEST-1",
		]);
		expect(store.filteredItemsSearchTerm).toBe("panadol");
	});

	it("background-hydrates IndexedDB for online limit-search force-server profiles without materializing 40k rows", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-COUNTER",
			warehouse: "Main Store",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 1,
			posa_force_server_items: 1,
		} as any;

		await store.initialize(profile);

		expect(itemsSyncMocks.backgroundSyncItems).toHaveBeenCalledTimes(1);
		const call = itemsSyncMocks.backgroundSyncItems.mock.calls[0];
		expect(call[0]).toEqual(
			expect.objectContaining({
				groupFilter: "ALL",
				reset: true,
			}),
		);
		expect(call[3]).toBe("POS-COUNTER_Main Store");
		expect(call[4]).toBe(true);
		expect(call[5]).toBe(false);
	});

	it("does not redownload a complete 40k limit-search catalog on every startup", async () => {
		const store = useItemsStore();
		offlineMocks.getStoredItemsCountByScope.mockResolvedValue(40_500);

		await store.initialize({
			name: "POS-COUNTER",
			warehouse: "Main Store",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
			posa_use_limit_search: 1,
			posa_force_server_items: 1,
		} as any);

		expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();
		expect(itemsSyncMocks.backgroundSyncItems).not.toHaveBeenCalled();
		expect(
			offlineMocks.refreshBootstrapSnapshotFromCacheState,
		).toHaveBeenCalledWith({ itemsCount: 40_500 });
	});

	it("falls back to the scoped ranked catalog when an online server search becomes unavailable", async () => {
		vi.useFakeTimers();
		try {
			const store = useItemsStore();
			const profile = {
				name: "POS-COUNTER",
				warehouse: "Main Store",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 1,
				posa_force_server_items: 1,
			} as any;
			await store.initialize(profile);
			itemServiceMocks.getItemsData.mockClear();
			itemServiceMocks.getItemsData.mockRejectedValueOnce(
				new TypeError("Failed to fetch"),
			);
			offlineMocks.searchStoredItems.mockResolvedValue([
				{
					item_code: "CACHED-1",
					item_name: "Cached Panadol",
					item_group: "Medicines",
				},
			]);

			const searchPromise = store.searchItems("panadol", {
				serverFallbackDelayMs: 0,
				resultLimit: 20,
			});
			await vi.advanceTimersByTimeAsync(0);

			await expect(searchPromise).resolves.toEqual([
				expect.objectContaining({ item_code: "CACHED-1" }),
			]);
			expect(offlineMocks.searchStoredItems).toHaveBeenCalledWith({
				search: "panadol",
				itemGroup: "ALL",
				limit: 20,
				offset: 0,
				scope: "POS-COUNTER_Main Store",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("debounces server fallback after a local search miss", async () => {
		vi.useFakeTimers();
		try {
			const store = useItemsStore();
			const profile = {
				name: "POS-1",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 1,
			} as any;

			await store.initialize(profile);
			itemServiceMocks.getItemsData.mockClear();
			itemsSearchMocks.performLocalSearch.mockReturnValue([]);

			const searchPromise = store.searchItems("typo");

			await vi.advanceTimersByTimeAsync(449);
			expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			const result = await searchPromise;

			expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
			expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
				expect.objectContaining({
					search_value: "typo",
					limit: 50,
				}),
				expect.any(AbortSignal),
			);
			expect(result.map((item) => item.item_code)).toEqual(["ITEM-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("dispatches the Counter Grid server fallback immediately with a bounded result set", async () => {
		vi.useFakeTimers();
		try {
			const store = useItemsStore();
			const profile = {
				name: "POS-1",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 1,
			} as any;

			await store.initialize(profile);
			itemServiceMocks.getItemsData.mockClear();
			itemsSearchMocks.performLocalSearch.mockReturnValue([]);

			const searchPromise = store.searchItems("counter", {
				serverFallbackDelayMs: 0,
				resultLimit: 17,
			});
			expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(0);
			await searchPromise;

			expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
			expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
				expect.objectContaining({
					search_value: "counter",
					limit: 17,
				}),
				expect.any(AbortSignal),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("cancels a pending server fallback when the cashier keeps typing", async () => {
		vi.useFakeTimers();
		try {
			const store = useItemsStore();
			const profile = {
				name: "POS-1",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 1,
			} as any;

			await store.initialize(profile);
			itemServiceMocks.getItemsData.mockClear();
			itemsSearchMocks.performLocalSearch.mockReturnValue([]);

			const firstSearch = store.searchItems("typo");
			await Promise.resolve();
			const secondSearch = store.searchItems("typox");

			await expect(firstSearch).resolves.toEqual([]);
			await vi.advanceTimersByTimeAsync(450);
			await secondSearch;

			expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);
			expect(itemServiceMocks.getItemsData).toHaveBeenCalledWith(
				expect.objectContaining({
					search_value: "typox",
				}),
				expect.any(AbortSignal),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not repeat server fallback for the same recent zero-result search", async () => {
		vi.useFakeTimers();
		try {
			const store = useItemsStore();
			const profile = {
				name: "POS-1",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
				posa_use_limit_search: 1,
			} as any;

			await store.initialize(profile);
			itemServiceMocks.getItemsData.mockClear();
			itemServiceMocks.getItemsData.mockResolvedValue([]);
			itemsSearchMocks.performLocalSearch.mockReturnValue([]);

			const firstSearch = store.searchItems("zzzz");
			await vi.advanceTimersByTimeAsync(450);
			await firstSearch;
			expect(itemServiceMocks.getItemsData).toHaveBeenCalledTimes(1);

			itemServiceMocks.getItemsData.mockClear();
			await store.searchItems("zzzz");

			expect(itemServiceMocks.getItemsData).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
