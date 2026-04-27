import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const itemServiceMocks = vi.hoisted(() => ({
	getItems: vi.fn(),
}));

const offlineMocks = vi.hoisted(() => ({
	refreshBootstrapSnapshotFromCacheState: vi.fn(),
	getStoredItemsCountByScope: vi.fn(async () => 0),
	getAllStoredItems: vi.fn(async () => []),
	getCachedPriceListItems: vi.fn(async () => null),
}));

const itemsSyncMocks = vi.hoisted(() => ({
	primeItemDetailsCache: vi.fn(),
	backgroundSyncItems: vi.fn(async () => []),
}));

vi.mock("../src/posapp/services/itemService", () => ({
	default: {
		getItems: itemServiceMocks.getItems,
		getItemGroups: vi.fn(async () => []),
		getItemsFromBarcode: vi.fn(async () => null),
	},
}));

vi.mock("../src/offline/index", () => ({
	refreshBootstrapSnapshotFromCacheState:
		offlineMocks.refreshBootstrapSnapshotFromCacheState,
	getStoredItemsCountByScope: offlineMocks.getStoredItemsCountByScope,
	getAllStoredItems: offlineMocks.getAllStoredItems,
	getCachedPriceListItems: offlineMocks.getCachedPriceListItems,
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
		clearSearchCache: vi.fn(),
		getCachedItems: vi.fn(async () => null),
		cacheItems: vi.fn(async () => {}),
		getCachedSearchResult: vi.fn(() => null),
		setCachedSearchResult: vi.fn(),
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

		return {
			itemsMap,
			barcodeIndex,
			updateIndexes: (items: any[] = []) => {
				items.forEach((item) => {
					if (item?.item_code) {
						itemsMap.value.set(item.item_code, item);
					}
				});
			},
			resetIndexes: () => {
				itemsMap.value = new Map();
				barcodeIndex.value = new Map();
			},
			performLocalSearch: (_term: string, items: any[]) => items,
			filterItemsByGroup: (items: any[], group: string) =>
				group && group !== "ALL"
					? items.filter((item) => item?.item_group === group)
					: items,
			getItemByCode: (code: string) => itemsMap.value.get(code),
			getItemByBarcode: (barcode: string) => barcodeIndex.value.get(barcode),
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
		itemServiceMocks.getItems.mockResolvedValue([
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

		expect(itemServiceMocks.getItems).toHaveBeenCalledTimes(1);
		expect(itemServiceMocks.getItems).toHaveBeenCalledWith(
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

		expect(itemServiceMocks.getItems).toHaveBeenLastCalledWith(
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

	it("does not prime detail cache when the server returns no items", async () => {
		const store = useItemsStore();
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [],
		} as any;

		itemServiceMocks.getItems.mockResolvedValueOnce([]);

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

		expect(itemServiceMocks.getItems).toHaveBeenCalledWith(
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
				reset: false,
			}),
			expect.anything(),
			"Retail",
			"POS-1_Main WH",
			true,
			expect.any(Function),
			expect.any(Function),
			expect.any(Function),
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
	});
});
