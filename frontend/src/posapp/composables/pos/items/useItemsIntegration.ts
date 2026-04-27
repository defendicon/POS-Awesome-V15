/**
 * Integration layer between existing ItemsSelector component and Pinia store
 * Provides backward compatibility while leveraging new state management
 */

import { computed, watch, onMounted, onUnmounted } from "vue";
import { useItemsStore } from "../../../stores/itemsStore.js";
import { storeToRefs } from "pinia";

type IntegrationOptions = {
	enableDebounce?: boolean;
	debounceDelay?: number;
};

type MemoryUsage = {
	used: number;
	total: number;
	limit: number;
};

export function useItemsIntegration(options: IntegrationOptions = {}) {
	const { enableDebounce = true, debounceDelay = 300 } = options;

	// Get store instance
	const itemsStore = useItemsStore();

	// Extract reactive references from store
	const {
		items,
		filteredItems,
		itemGroups,
		isLoading,
		isBackgroundLoading,
		loadProgress,
		syncedItemsCount,
		totalItemCount,
		itemsLoaded,
		searchTerm,
		itemGroup,
		posProfile,
		customer,
		customerPriceList,
		cacheHealth,
		performanceMetrics,
		cachedPagination,
		hasMoreCachedItems,
		activePriceList,
		itemStats,
		cacheStats,
	} = storeToRefs(itemsStore);

	// Legacy compatibility computed properties
	const items_group = computed(() => itemGroups.value);
	const loading = computed(() => isLoading.value);
	const items_loaded = computed(() => itemsLoaded.value);
	const item_group = computed({
		get: () => itemGroup.value,
		set: (value) => itemsStore.filterByGroup(value),
	});
	const search = computed({
		get: () => searchTerm.value,
		set: (value) => {
			const normalized = String(value ?? "");
			if (enableDebounce) {
				debouncedSearch(normalized);
			} else {
				itemsStore.searchItems(normalized);
			}
		},
	});
	const filtered_items = computed(() => filteredItems.value);
	const customer_price_list = computed({
		get: () => customerPriceList.value,
		set: (value) => itemsStore.updatePriceList(String(value ?? "")),
	});
	const active_price_list = computed(() => activePriceList.value);

	// Debounced search functionality
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	const debouncedSearch = (term: string) => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		searchTimeout = setTimeout(() => {
			itemsStore.searchItems(term);
		}, debounceDelay);
	};

	// Legacy method adapters
	const get_items = async (forceServer = false) => {
		if (!posProfile.value || !posProfile.value.name) return [];
		return await itemsStore.loadItems({
			forceServer,
			searchValue: searchTerm.value,
			groupFilter: itemGroup.value,
		});
	};

	const forceReloadItems = async () => {
		return await itemsStore.refreshItems();
	};

	const refreshModifiedItems = async (
		priceListOverride: string | null = null,
	) => {
		return await itemsStore.refreshModifiedItems(priceListOverride);
	};

	const get_items_groups = async () => {
		if (!posProfile.value) {
			return itemGroups.value;
		}
		await itemsStore.loadItemGroups(posProfile.value);
		return itemGroups.value;
	};

	const search_onchange = async (
		searchValue: string | null = null,
		fromScanner = false,
	) => {
		const term = String(searchValue || searchTerm.value || "");

		if (fromScanner) {
			// For scanner input, try to find item by barcode first
			const item = itemsStore.getItemByBarcode(term);
			if (item) {
				return [item];
			}

			// If not found, try to add scanned item
			const scannedItem = await itemsStore.addScannedItem(term);
			if (scannedItem) {
				return [scannedItem];
			}
		}

		return await itemsStore.searchItems(term);
	};

	const update_items_details = async (_itemList: unknown[]) => {
		// Compatibility shim: item detail refresh now runs through the store-managed path.
		return Promise.resolve(undefined);
	};

	const memoizedSearch = (searchTerm: string, _itemGroup: string) => {
		// The store now handles memoization internally
		return itemsStore.searchItems(searchTerm);
	};

	// Item lookup helpers
	const findItemByCode = (itemCode: string) => {
		return itemsStore.getItemByCode(itemCode);
	};

	const findItemByBarcode = (barcode: string) => {
		return itemsStore.getItemByBarcode(barcode);
	};

	// Initialization method
	const initializeStore = async (
		profile: unknown,
		cust: unknown = null,
		priceList: unknown = null,
	) => {
		await itemsStore.initialize(
			profile as any,
			cust as any,
			priceList as any,
		);

		// Initialization complete
		console.log("Items store initialized:", {
			itemsCount: totalItemCount.value,
			cacheHealth: cacheHealth.value,
		});
	};

	// Performance monitoring
	const getPerformanceReport = () => {
		return {
			metrics: performanceMetrics.value,
			cache: cacheStats.value,
			items: itemStats.value,
			memory: getMemoryUsage(),
		};
	};

	const getMemoryUsage = (): MemoryUsage | null => {
		try {
			const memory = (performance as Performance & { memory?: any })
				.memory;
			if (memory) {
				return {
					used: Math.round(memory.usedJSHeapSize / 1048576),
					total: Math.round(memory.totalJSHeapSize / 1048576),
					limit: Math.round(memory.jsHeapSizeLimit / 1048576),
				};
			}
		} catch (e: unknown) {
			console.warn("Memory usage not available:", e);
		}
		return null;
	};

	// Cache management
	const clearAllCaches = async () => {
		await itemsStore.clearAllCaches();
		console.log("All caches cleared");
	};

	const assessCacheHealth = async () => {
		await itemsStore.assessCacheHealth();
		return cacheHealth.value;
	};

	// Event handling for external updates
	const handleExternalUpdates = () => {
		// Note: Event handling should be set up in the component that has access to eventBus
		// This method is kept for compatibility but functionality moved to component level
	};

	// Cleanup function
	const cleanup = () => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
	};

	// Lifecycle hooks
	onMounted(() => {
		handleExternalUpdates();
	});

	onUnmounted(() => {
		cleanup();
	});

	// Watch for important changes
	watch(itemsLoaded, (loaded) => {
		if (loaded) {
			console.log("Items loaded:", {
				count: totalItemCount.value,
				cached: cacheHealth.value.items === "healthy",
			});
		}
	});

	watch(filteredItems, (newItems) => {
		console.debug("Filtered items updated:", {
			count: newItems.length,
			total: totalItemCount.value,
		});
	});

	watch(isLoading, (loading) => {
		console.debug("Loading state changed:", loading);
	});

	// Return interface compatible with existing component
	return {
		itemsStore,

		// Store state (reactive)
		items,
		filteredItems,
		itemGroups,
		isLoading,
		isBackgroundLoading,
		loadProgress,
		syncedItemsCount,
		totalItemCount,
		itemsLoaded,
		searchTerm,
		itemGroup,
		posProfile,
		customer,
		customerPriceList,
		cacheHealth,
		performanceMetrics,
		cachedPagination,
		hasMoreCachedItems,
		activePriceList,
		itemStats,
		cacheStats,

		// Legacy compatibility properties
		items_group,
		loading,
		items_loaded,
		item_group,
		search,
		filtered_items,
		customer_price_list,
		active_price_list,

		// Store actions
		loadItems: itemsStore.loadItems,
		searchItems: itemsStore.searchItems,
		filterByGroup: itemsStore.filterByGroup,
		updatePriceList: itemsStore.updatePriceList,
		refreshItems: itemsStore.refreshItems,
		appendCachedItemsPage: itemsStore.appendCachedItemsPage,
		resetCachedItemsForGroup: itemsStore.resetCachedItemsForGroup,
		backgroundSyncItems: itemsStore.backgroundSyncItems,
		refreshModifiedItems,
		getItemByCode: itemsStore.getItemByCode,
		getItemByBarcode: itemsStore.getItemByBarcode,
		addScannedItem: itemsStore.addScannedItem,
		clearLimitSearchResults: itemsStore.clearLimitSearchResults,

		// Legacy method adapters
		get_items,
		forceReloadItems,
		get_items_groups,
		search_onchange,
		update_items_details,
		memoizedSearch,

		// Helper methods
		findItemByCode,
		findItemByBarcode,
		initializeStore,
		getPerformanceReport,
		getMemoryUsage,
		clearAllCaches,
		assessCacheHealth,
		debouncedSearch,

		// Cleanup
		cleanup,
	};
}

export default useItemsIntegration;
