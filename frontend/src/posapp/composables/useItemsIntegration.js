/**
 * Integration layer between existing ItemsSelector component and Pinia store
 * Provides backward compatibility while leveraging new state management
 */

import { computed, watch, onMounted, onUnmounted } from "vue";
import { useItemsStore } from "../stores/itemsStore.js";
import { storeToRefs } from "pinia";

export function useItemsIntegration(options = {}) {
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
			if (enableDebounce) {
				debouncedSearch(value);
			} else {
				itemsStore.searchItems(value);
			}
		},
	});
	const filtered_items = computed(() => filteredItems.value);
	const customer_price_list = computed({
		get: () => customerPriceList.value,
		set: (value) => itemsStore.updatePriceList(value),
	});
	const active_price_list = computed(() => activePriceList.value);

	// Debounced search functionality
	let searchTimeout = null;
	const debouncedSearch = (term) => {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		searchTimeout = setTimeout(() => {
			itemsStore.searchItems(term);
		}, debounceDelay);
	};

	// Legacy method adapters
	const get_items = async (forceServer = false) => {
		return await itemsStore.loadItems({
			forceServer,
			searchValue: searchTerm.value,
			groupFilter: itemGroup.value,
		});
	};

	const forceReloadItems = async () => {
		return await itemsStore.refreshItems();
	};

	const get_items_groups = async () => {
		await itemsStore.loadItemGroups();
		return itemGroups.value;
	};

	const search_onchange = async (searchValue = null, fromScanner = false) => {
		const term = searchValue || searchTerm.value;

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

	const update_items_details = async (itemList) => {
		// This is now handled automatically by the store in background
		// Keep for compatibility but don't need to do anything
		return Promise.resolve();
	};

	const memoizedSearch = (searchTerm, itemGroup) => {
		// The store now handles memoization internally
		return itemsStore.searchItems(searchTerm);
	};

	// Item lookup helpers
	const findItemByCode = (itemCode) => {
		return itemsStore.getItemByCode(itemCode);
	};

	const findItemByBarcode = (barcode) => {
		return itemsStore.getItemByBarcode(barcode);
	};

	// Initialization method
	const initializeStore = async (profile, cust = null, priceList = null) => {
		await itemsStore.initialize(profile, cust, priceList);

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

	const getMemoryUsage = () => {
		try {
			if (performance.memory) {
				return {
					used: Math.round(performance.memory.usedJSHeapSize / 1048576),
					total: Math.round(performance.memory.totalJSHeapSize / 1048576),
					limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
				};
			}
		} catch (e) {
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
		// Store state (reactive)
		items,
		filteredItems,
		itemGroups,
		isLoading,
		isBackgroundLoading,
		loadProgress,
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
