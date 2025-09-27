/**
 * Pinia Store for Items Management in POSAwesome
 * Optimized state management with multi-layer caching and performance improvements
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import {
    getCachedPriceListItems,
    clearPriceListCache,
    saveItemDetailsCache,
    isStockCacheReady,
    getItemsLastSync,
    getAllStoredItems,
    getStoredItemsCount,
    searchStoredItems
} from '../../offline/index.js';

const LAZY_CACHE_THRESHOLD = 2000;
const CACHE_PAGE_SIZE = 200;
const SEARCH_PAGE_SIZE = 200;
const MIN_SEARCH_LENGTH = 2;

export const useItemsStore = defineStore('items', () => {
    // Core state
    const items = ref([]);
    const filteredItems = ref([]);
    const itemsMap = ref(new Map()); // O(1) lookup by item_code
    const barcodeIndex = ref(new Map()); // O(1) barcode lookup
    const itemGroups = ref(['ALL']);

    // Loading states
    const isLoading = ref(false);
    const isBackgroundLoading = ref(false);
    const loadProgress = ref(0);
    const totalItemCount = ref(0);
    const itemsLoaded = ref(false);

    // Search and filtering
    const searchTerm = ref('');
    const itemGroup = ref('ALL');
    const lastSearch = ref('');

    // Configuration
    const posProfile = ref(null);
    const customer = ref(null);
    const customerPriceList = ref(null);

    // Cache management
    const cacheHealth = ref({
        items: 'unknown',
        priceList: 'unknown',
        stock: 'unknown',
        lastCheck: null
    });

    // Performance tracking
    const performanceMetrics = ref({
        lastLoadTime: 0,
        averageLoadTime: 0,
        cacheHitRate: 0,
        totalRequests: 0,
        cachedRequests: 0,
        searchHits: 0,
        searchMisses: 0
    });

    // Request management
    const requestToken = ref(0);
    const abortControllers = ref(new Map());
    const cachedPagination = ref({
        enabled: false,
        pageSize: CACHE_PAGE_SIZE,
        pagesLoaded: 0,
        totalCount: 0,
        loading: false
    });

    const resetCachedPagination = () => {
        cachedPagination.value = {
            enabled: false,
            pageSize: CACHE_PAGE_SIZE,
            pagesLoaded: 0,
            totalCount: 0,
            loading: false
        };
    };

    // Multi-layer cache system
    const cache = ref({
        memory: {
            searchResults: new Map(),
            priceListData: new Map(),
            itemDetails: new Map(),
            maxSize: 500,
            ttl: 5 * 60 * 1000 // 5 minutes
        },
        session: {
            enabled: typeof sessionStorage !== 'undefined',
            prefix: 'posa_items_'
        }
    });

    // Computed properties
    const activePriceList = computed(() => {
        return customerPriceList.value || posProfile.value?.selling_price_list;
    });

    const itemStats = computed(() => {
        return {
            total: items.value.length,
            filtered: filteredItems.value.length,
            groups: [...new Set(items.value.map(item => item.item_group))].length,
            withImages: items.value.filter(item => item.image).length,
            withStock: items.value.filter(item => (item.actual_qty || 0) > 0).length,
            lowStock: items.value.filter(item => (item.actual_qty || 0) < 5).length
        };
    });

    const cacheStats = computed(() => {
        const memCache = cache.value.memory;
        return {
            searchCacheSize: memCache.searchResults.size,
            priceListCacheSize: memCache.priceListData.size,
            itemDetailsCacheSize: memCache.itemDetails.size,
            memoryUsage: getEstimatedMemoryUsage()
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
        resetCachedPagination();
        await loadCachedItems();
    };

    const loadItemGroups = async () => {
        try {
            if (posProfile.value?.item_groups?.length > 0) {
                const groups = ['ALL'];
                posProfile.value.item_groups.forEach(element => {
                    if (element.item_group !== 'All Item Groups') {
                        groups.push(element.item_group);
                    }
                });
                itemGroups.value = groups;
            } else {
                // Fallback to API
                const response = await frappe.call({
                    method: 'posawesome.posawesome.api.items.get_items_groups',
                    args: {}
                });

                if (response.message) {
                    const groups = ['ALL'];
                    response.message.forEach(element => {
                        groups.push(element.name);
                    });
                    itemGroups.value = groups;
                }
            }
        } catch (error) {
            console.error('Failed to load item groups:', error);
        }
    };

    const loadItems = async (options = {}) => {
        const {
            forceServer = false,
            searchValue = '',
            groupFilter = 'ALL',
            priceList = null,
            limit = null
        } = options;

        const startTime = performance.now();
        const currentRequestToken = ++requestToken.value;
        let cacheKey;

        try {
            isLoading.value = true;
            performanceMetrics.value.totalRequests++;

            const normalizedGroup =
                typeof groupFilter === 'string' && groupFilter.length > 0
                    ? groupFilter
                    : 'ALL';

            // Generate cache key
            cacheKey = generateCacheKey(searchValue, normalizedGroup, priceList);

            // Check cache first unless forced to server
            if (!forceServer) {
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
                item_group:
                    normalizedGroup !== 'ALL'
                        ? normalizedGroup.toLowerCase()
                        : '',
                search_value: searchValue || '',
                customer: customer.value,
                include_image: 1,
                item_groups: posProfile.value?.item_groups?.map(g => g.item_group) || []
            };

            if (Number.isFinite(limit) && limit > 0) {
                args.limit = limit;
            }

            const response = await frappe.call({
                method: 'posawesome.posawesome.api.items.get_items',
                args,
                signal: abortController.signal
            });

            // Check if request is still valid
            if (requestToken.value !== currentRequestToken) {
                return;
            }

            const fetchedItems = response.message || [];

            // Update state
            setItems(fetchedItems, { updateTotal: true });
            itemsLoaded.value = true;

            // Cache the results
            await cacheItems(cacheKey, fetchedItems);

            // Background load additional data
            if (fetchedItems.length > 0) {
                backgroundLoadItemDetails(fetchedItems);
            }

            updatePerformanceMetrics(startTime);
            return fetchedItems;

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Failed to load items:', error);
                throw error;
            }
        } finally {
            isLoading.value = false;
            if (cacheKey) {
                abortControllers.value.delete(cacheKey);
            }
        }
    };

    const searchItems = async (term, options = {}) => {
        const { groupOverride = itemGroup.value } = options;

        searchTerm.value = term;
        lastSearch.value = term;

        const normalizedGroup =
            typeof groupOverride === 'string' && groupOverride.length > 0
                ? groupOverride
                : 'ALL';

        if (!term || term.length < MIN_SEARCH_LENGTH) {
            // Reset to all items if search is too short
            filteredItems.value = applyFilters(items.value, {
                group: normalizedGroup,
                search: term
            });
            return filteredItems.value;
        }

        const cacheKey = `search_${term}_${normalizedGroup}`;
        const cached = getCachedSearchResult(cacheKey);
        if (cached) {
            filteredItems.value = cached;
            performanceMetrics.value.searchHits++;
            return cached;
        }

        const useIndexedSearch = Boolean(
            posProfile.value?.posa_local_storage &&
            (cachedPagination.value.enabled || totalItemCount.value > 0)
        );

        if (useIndexedSearch) {
            try {
                const offlineResults = await searchStoredItems({
                    search: term,
                    itemGroup: normalizedGroup,
                    limit: SEARCH_PAGE_SIZE,
                    offset: 0
                });

                if (offlineResults.length > 0) {
                    setCachedSearchResult(cacheKey, offlineResults);
                    filteredItems.value = offlineResults;
                    performanceMetrics.value.searchMisses++;
                    return offlineResults;
                }
            } catch (error) {
                console.warn('Indexed search failed:', error);
            }
        }

        try {
            // Search in current items first
            let searchResults = performLocalSearch(term, applyFilters(items.value, { group: normalizedGroup, search: '' }));

            // If no results and term is specific enough, search server
            if (searchResults.length === 0 && term.length >= 3) {
                await loadItems({
                    searchValue: term,
                    groupFilter: normalizedGroup,
                    forceServer: true
                });
                searchResults = performLocalSearch(term, applyFilters(items.value, { group: normalizedGroup, search: '' }));
            }

            // Cache the search result
            setCachedSearchResult(cacheKey, searchResults);

            filteredItems.value = searchResults;
            performanceMetrics.value.searchMisses++;

            return searchResults;

        } catch (error) {
            console.error('Search failed:', error);
            performanceMetrics.value.searchMisses++;
            return [];
        }
    };

    const filterByGroup = (group) => {
        itemGroup.value = group;

        if (searchTerm.value && searchTerm.value.length >= MIN_SEARCH_LENGTH) {
            // Re-run search with new group filter
            searchItems(searchTerm.value, { groupOverride: group });
        } else {
            // Just filter current items
            filteredItems.value = applyFilters(items.value, { group });
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
                    priceList: newPriceList
                });
            }

        } catch (error) {
            console.error('Failed to update price list:', error);
        }
    };

    const refreshItems = async () => {
        await clearAllCaches();
        itemsLoaded.value = false;
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
                method: 'posawesome.posawesome.api.items.get_items_from_barcode',
                args: {
                    selling_price_list: activePriceList.value,
                    currency: posProfile.value.currency,
                    barcode: barcode
                }
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
                    filteredItems.value = applyFilters(items.value);
                }

                // Clear search cache to force refresh
                clearSearchCache();

                return newItem;
            }

            return null;

        } catch (error) {
            console.error('Failed to fetch item by barcode:', error);
            return null;
        }
    };

    // Helper functions
    const clearIndexes = () => {
        itemsMap.value.clear();
        barcodeIndex.value.clear();
    };

    const setItems = (newItems, { append = false, updateTotal = false } = {}) => {
        const incomingItems = Array.isArray(newItems)
            ? newItems.filter(item => item && item.item_code)
            : [];

        let combinedItems = incomingItems;

        if (append && items.value.length) {
            const merged = [...items.value];
            const indexByCode = new Map();
            merged.forEach((item, idx) => {
                indexByCode.set(item.item_code, idx);
            });

            incomingItems.forEach(item => {
                const existingIndex = indexByCode.get(item.item_code);
                if (typeof existingIndex === 'number') {
                    merged[existingIndex] = { ...merged[existingIndex], ...item };
                } else {
                    indexByCode.set(item.item_code, merged.length);
                    merged.push(item);
                }
            });

            combinedItems = merged;
        }

        if (!append) {
            items.value = combinedItems;
        } else {
            items.value = combinedItems;
        }

        clearIndexes();
        updateIndexes(items.value);

        if (updateTotal) {
            totalItemCount.value = items.value.length;
        } else if (!append) {
            totalItemCount.value = Math.max(totalItemCount.value, items.value.length);
        }

        filteredItems.value = applyFilters(items.value);
    };

    const updateIndexes = (itemList) => {
        itemList.forEach(item => {
            if (!item || !item.item_code) {
                return;
            }

            itemsMap.value.set(item.item_code, item);

            const registerBarcode = (code) => {
                if (!code) return;
                barcodeIndex.value.set(String(code), item);
            };

            registerBarcode(item.barcode);

            if (Array.isArray(item.barcodes)) {
                item.barcodes.forEach(registerBarcode);
            }

            if (Array.isArray(item.item_barcode)) {
                item.item_barcode.forEach(entry => registerBarcode(entry?.barcode));
            }
        });
    };

    const performLocalSearch = (term, itemList) => {
        const loweredTerm = term.toLowerCase();
        return itemList.filter(item => {
            const codeMatch = item.item_code?.toLowerCase().includes(loweredTerm);
            const nameMatch = item.item_name?.toLowerCase().includes(loweredTerm);
            const descriptionMatch = item.description?.toLowerCase().includes(loweredTerm);

            let barcodeMatch = false;
            if (item.barcode) {
                barcodeMatch = item.barcode.toLowerCase().includes(loweredTerm);
            }

            if (!barcodeMatch && Array.isArray(item.barcodes)) {
                barcodeMatch = item.barcodes.some(code => String(code).toLowerCase().includes(loweredTerm));
            }

            if (!barcodeMatch && Array.isArray(item.item_barcode)) {
                barcodeMatch = item.item_barcode.some(entry => entry?.barcode?.toLowerCase().includes(loweredTerm));
            }

            return codeMatch || nameMatch || descriptionMatch || barcodeMatch;
        });
    };

    const filterItemsByGroup = (itemList, group) => {
        if (!group || group === 'ALL') {
            return itemList;
        }

        const normalizedGroup = group.toLowerCase();
        return itemList.filter(item => (item.item_group || '').toLowerCase() === normalizedGroup);
    };

    const applyFilters = (sourceItems, { search = null, group = null } = {}) => {
        const activeGroup = group ?? itemGroup.value;
        const activeSearch = search ?? searchTerm.value;

        let filtered = filterItemsByGroup(sourceItems, activeGroup);

        if (activeSearch && activeSearch.length >= MIN_SEARCH_LENGTH) {
            filtered = performLocalSearch(activeSearch, filtered);
        }

        return filtered;
    };

    const generateCacheKey = (search, group, priceList) => {
        return `items_${search || 'all'}_${group}_${priceList || 'default'}`;
    };

    // Cache management functions
    const getCachedItems = async (cacheKey) => {
        // Check memory cache first
        const memCache = cache.value.memory.searchResults.get(cacheKey);
        if (memCache && (Date.now() - memCache.timestamp) < cache.value.memory.ttl) {
            return memCache.data;
        }

        // Check session cache
        if (cache.value.session.enabled) {
            try {
                const sessionData = sessionStorage.getItem(cache.value.session.prefix + cacheKey);
                if (sessionData) {
                    const parsed = JSON.parse(sessionData);
                    if ((Date.now() - parsed.timestamp) < cache.value.memory.ttl) {
                        // Update memory cache
                        cache.value.memory.searchResults.set(cacheKey, parsed);
                        return parsed.data;
                    }
                }
            } catch (e) {
                console.warn('Session cache read failed:', e);
            }
        }

        return null;
    };

    const cacheItems = async (cacheKey, items) => {
        const cacheData = {
            data: items,
            timestamp: Date.now()
        };

        // Store in memory cache
        cache.value.memory.searchResults.set(cacheKey, cacheData);

        // Store in session cache
        if (cache.value.session.enabled) {
            try {
                sessionStorage.setItem(
                    cache.value.session.prefix + cacheKey,
                    JSON.stringify(cacheData)
                );
            } catch (e) {
                console.warn('Session cache write failed:', e);
            }
        }

        // Cleanup old cache entries
        cleanupMemoryCache();
    };

    const getCachedSearchResult = (cacheKey) => {
        const cached = cache.value.memory.searchResults.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < cache.value.memory.ttl) {
            return cached.data;
        }
        return null;
    };

    const setCachedSearchResult = (cacheKey, data) => {
        cache.value.memory.searchResults.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        cleanupMemoryCache();
    };

    const getCachedPriceList = (cacheKey) => {
        const cached = cache.value.memory.priceListData.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < cache.value.memory.ttl) {
            return cached.data;
        }
        return null;
    };

    const setCachedPriceList = (cacheKey, data) => {
        cache.value.memory.priceListData.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
    };

    const applyPriceListToItems = (priceListItems) => {
        const priceMap = new Map();
        priceListItems.forEach(item => {
            priceMap.set(item.item_code, item);
        });

        items.value.forEach(item => {
            const priceItem = priceMap.get(item.item_code);
            if (priceItem) {
                item.rate = priceItem.price_list_rate || priceItem.rate || 0;
                item.price_list_rate = item.rate;
            }
        });

        // Update filtered items
        filteredItems.value = applyFilters(items.value);
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
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                await loadItemDetailsBatch(batch);
            }
        } catch (error) {
            console.error('Background item details loading failed:', error);
        }
    };

    const loadItemDetailsBatch = async (itemBatch) => {
        try {
            const response = await frappe.call({
                method: 'posawesome.posawesome.api.items.get_items_details',
                args: {
                    pos_profile: JSON.stringify(posProfile.value),
                    items_data: JSON.stringify(itemBatch),
                    price_list: activePriceList.value
                }
            });

            const details = response.message || [];

            // Update items with details
            details.forEach(detail => {
                const item = getItemByCode(detail.item_code);
                if (item) {
                    Object.assign(item, detail);
                }
            });

            // Cache the details
            saveItemDetailsCache(
                posProfile.value.name,
                activePriceList.value,
                details
            );

        } catch (error) {
            console.error('Failed to load item details batch:', error);
        }
    };

    const assessCacheHealth = async () => {
        try {
            const health = {
                items: 'healthy',
                priceList: 'healthy',
                stock: 'healthy',
                lastCheck: Date.now()
            };

            // Check stock cache
            if (!isStockCacheReady()) {
                health.stock = 'missing';
            }

            // Check items cache age
            const lastSync = getItemsLastSync();
            if (lastSync) {
                const age = Date.now() - new Date(lastSync).getTime();
                if (age > 24 * 60 * 60 * 1000) { // 24 hours
                    health.items = 'stale';
                }
            } else {
                health.items = 'missing';
            }

            cacheHealth.value = health;

        } catch (error) {
            console.error('Cache health assessment failed:', error);
            cacheHealth.value = {
                items: 'error',
                priceList: 'error',
                stock: 'error',
                lastCheck: Date.now()
            };
        }
    };

    const loadCachedItems = async () => {
        try {
            const cachedCount = await getStoredItemsCount().catch(() => 0);
            const resolvedCount = Number.isFinite(cachedCount) ? cachedCount : 0;

            totalItemCount.value = resolvedCount;

            if (resolvedCount === 0) {
                resetCachedPagination();
                filteredItems.value = applyFilters(items.value);
                return;
            }

            const shouldLazyLoad = resolvedCount > LAZY_CACHE_THRESHOLD;
            const pageSize = CACHE_PAGE_SIZE;

            cachedPagination.value = {
                enabled: shouldLazyLoad,
                pageSize,
                pagesLoaded: 0,
                totalCount: resolvedCount,
                loading: false
            };

            let initialItems = [];

            if (shouldLazyLoad) {
                initialItems = await searchStoredItems({
                    limit: pageSize,
                    offset: 0
                }).catch(() => []);
                if (initialItems.length > 0) {
                    cachedPagination.value.pagesLoaded = 1;
                }
            } else {
                initialItems = await getAllStoredItems().catch(() => []);
                cachedPagination.value.enabled = false;
                cachedPagination.value.pagesLoaded = initialItems.length > 0 ? 1 : 0;
            }

            if (initialItems.length > 0) {
                setItems(initialItems, { updateTotal: !shouldLazyLoad });
                itemsLoaded.value = true;
            } else {
                itemsLoaded.value = false;
                filteredItems.value = applyFilters(items.value);
            }
        } catch (error) {
            console.warn('Failed to load cached items:', error);
            resetCachedPagination();
        }
    };

    const appendCachedItemsPage = async ({ search = '', group = 'ALL' } = {}) => {
        const pagination = cachedPagination.value;

        if (!pagination.enabled || pagination.loading) {
            return [];
        }

        if (items.value.length >= pagination.totalCount) {
            pagination.enabled = false;
            return [];
        }

        pagination.loading = true;

        try {
            const offset = pagination.pagesLoaded * pagination.pageSize;
            const normalizedGroup = typeof group === 'string' && group.length > 0 ? group : 'ALL';
            const normalizedSearch = typeof search === 'string' ? search : '';

            const nextItems = await searchStoredItems({
                search: normalizedSearch,
                itemGroup: normalizedGroup,
                limit: pagination.pageSize,
                offset
            }).catch(() => []);

            if (nextItems.length > 0) {
                setItems(nextItems, { append: true });
                pagination.pagesLoaded += 1;

                if (items.value.length >= pagination.totalCount) {
                    pagination.enabled = false;
                }
            } else {
                pagination.enabled = false;
            }

            return nextItems;
        } catch (error) {
            console.warn('Failed to append cached items page:', error);
            pagination.enabled = false;
            return [];
        } finally {
            pagination.loading = false;
        }
    };

    const clearAllCaches = async () => {
        // Clear memory caches
        cache.value.memory.searchResults.clear();
        cache.value.memory.priceListData.clear();
        cache.value.memory.itemDetails.clear();

        // Clear session cache
        if (cache.value.session.enabled) {
            const keys = Object.keys(sessionStorage);
            keys.forEach(key => {
                if (key.startsWith(cache.value.session.prefix)) {
                    sessionStorage.removeItem(key);
                }
            });
        }

        // Clear persistent cache
        await clearPriceListCache();

        resetCachedPagination();
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
        cachedPagination,
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

        // Computed
        activePriceList,
        itemStats,
        cacheStats,

        // Actions
        initialize,
        loadItems,
        loadItemGroups,
        searchItems,
        filterByGroup,
        updatePriceList,
        refreshItems,
        getItemByCode,
        getItemByBarcode,
        addScannedItem,
        clearAllCaches,
        clearSearchCache,
        assessCacheHealth,
        appendCachedItemsPage
    };
});

export default useItemsStore;