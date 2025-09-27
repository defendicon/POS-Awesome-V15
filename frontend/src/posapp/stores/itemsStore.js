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

    const LAZY_CACHE_THRESHOLD = 2000;
    const DEFAULT_CACHE_PAGE_SIZE = 200;
    const DEFAULT_SEARCH_LIMIT = 200;

    const cachedPagesState = ref({
        enabled: false,
        pageSize: DEFAULT_CACHE_PAGE_SIZE,
        nextOffset: 0,
        total: 0,
        loading: false,
        fullyLoaded: false,
        search: '',
        group: 'ALL'
    });

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

    const shouldUseIndexedSearch = computed(() => {
        return Boolean(posProfile.value?.posa_local_storage);
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
            const requestArgs = {
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
                requestArgs.limit = limit;
            }

            const response = await frappe.call({
                method: 'posawesome.posawesome.api.items.get_items',
                args: requestArgs,
                signal: abortController.signal
            });

            // Check if request is still valid
            if (requestToken.value !== currentRequestToken) {
                return;
            }

            const fetchedItems = response.message || [];

            // Update state
            setItems(fetchedItems, {
                totalCount: fetchedItems.length,
                applySearch: !(shouldUseIndexedSearch.value && Boolean(searchValue)),
                filteredSubset: Boolean(searchValue) ? fetchedItems : null
            });
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

    const searchItems = async (term) => {
        const normalizedTerm = typeof term === 'string' ? term.trim() : '';
        searchTerm.value = normalizedTerm;
        lastSearch.value = normalizedTerm;

        if (!normalizedTerm) {
            filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
            return [];
        }

        if (!shouldUseIndexedSearch.value && normalizedTerm.length < 2) {
            filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
            return [];
        }

        const normalizedGroup = typeof itemGroup.value === 'string' ? itemGroup.value : 'ALL';

        const cacheKey = `search_${normalizedTerm}_${normalizedGroup}`;
        const cached = getCachedSearchResult(cacheKey);
        if (cached) {
            filteredItems.value = cached;
            performanceMetrics.value.searchHits++;
            return cached;
        }

        try {
            let missRecorded = false;
            if (shouldUseIndexedSearch.value) {
                const offlineResults = await searchStoredItems({
                    search: normalizedTerm,
                    itemGroup: normalizedGroup,
                    limit: DEFAULT_SEARCH_LIMIT,
                    offset: 0
                }).catch(() => []);

                setCachedSearchResult(cacheKey, offlineResults);
                filteredItems.value = offlineResults;

                if (offlineResults.length) {
                    updateIndexes(offlineResults);
                    performanceMetrics.value.searchHits++;
                    return offlineResults;
                }

                performanceMetrics.value.searchMisses++;
                missRecorded = true;

                if (normalizedTerm.length < 3) {
                    return offlineResults;
                }
            }

            let searchResults = performLocalSearch(normalizedTerm, items.value);

            if (searchResults.length === 0 && normalizedTerm.length >= 3) {
                const fetched = await loadItems({
                    searchValue: normalizedTerm,
                    groupFilter: itemGroup.value,
                    forceServer: true
                });
                searchResults = Array.isArray(fetched) && fetched.length
                    ? fetched
                    : performLocalSearch(normalizedTerm, items.value);
            }

            searchResults = filterItemsByGroup(searchResults, itemGroup.value);

            setCachedSearchResult(cacheKey, searchResults);

            filteredItems.value = searchResults;
            if (!missRecorded) {
                performanceMetrics.value.searchMisses++;
            }

            return searchResults;

        } catch (error) {
            console.error('Search failed:', error);
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
            if (shouldUseIndexedSearch.value && cachedPagesState.value.enabled) {
                await appendCachedItemsPage({
                    reset: true,
                    group: group,
                    search: ''
                });
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
                    filteredItems.value = filterItemsByGroup(items.value, itemGroup.value);
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
    const setItems = (newItems, options = {}) => {
        const {
            totalCount = null,
            applySearch = true,
            filteredSubset = null
        } = options;

        const incoming = Array.isArray(newItems) ? newItems : [];
        items.value = incoming;
        totalItemCount.value = Number.isFinite(totalCount) ? totalCount : incoming.length;

        itemsMap.value.clear();
        barcodeIndex.value.clear();
        updateIndexes(incoming);

        if (applySearch && searchTerm.value) {
            if (shouldUseIndexedSearch.value) {
                filteredItems.value = filteredSubset || filterItemsByGroup(incoming, itemGroup.value);
            } else {
                filteredItems.value = filterItemsByGroup(
                    performLocalSearch(searchTerm.value, incoming),
                    itemGroup.value
                );
            }
        } else if (filteredSubset) {
            filteredItems.value = filteredSubset;
        } else {
            filteredItems.value = filterItemsByGroup(incoming, itemGroup.value);
        }
    };

    const updateIndexes = (itemList) => {
        itemList.forEach(item => {
            itemsMap.value.set(item.item_code, item);
            const barcodes = Array.isArray(item.item_barcode)
                ? item.item_barcode.map(b => b?.barcode).filter(Boolean)
                : item.barcodes || [];

            if (barcodes.length) {
                barcodes.forEach(code => barcodeIndex.value.set(code, item));
            } else if (item.barcode) {
                barcodeIndex.value.set(item.barcode, item);
            }
        });
    };

    const performLocalSearch = (term, itemList) => {
        const searchTerm = term.toLowerCase();
        return itemList.filter(item => {
            return (
                item.item_code.toLowerCase().includes(searchTerm) ||
                item.item_name.toLowerCase().includes(searchTerm) ||
                (item.barcode && item.barcode.toLowerCase().includes(searchTerm)) ||
                (item.description && item.description.toLowerCase().includes(searchTerm))
            );
        });
    };

    const filterItemsByGroup = (itemList, group) => {
        if (group === 'ALL') {
            return itemList;
        }
        return itemList.filter(item => item.item_group === group);
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

    const resetCachedPagesState = (overrides = {}) => {
        cachedPagesState.value = {
            enabled: false,
            pageSize: DEFAULT_CACHE_PAGE_SIZE,
            nextOffset: 0,
            total: 0,
            loading: false,
            fullyLoaded: false,
            search: '',
            group: 'ALL',
            ...overrides
        };
    };

    const loadCachedItems = async () => {
        try {
            const cachedCount = await getStoredItemsCount().catch(() => 0);
            const resolvedCount = Number.isFinite(cachedCount) ? cachedCount : 0;

            resetCachedPagesState({ total: resolvedCount });

            if (resolvedCount === 0) {
                setItems([], { totalCount: 0, applySearch: false });
                itemsLoaded.value = false;
                return;
            }

            if (resolvedCount > LAZY_CACHE_THRESHOLD) {
                const pageSize = Math.min(DEFAULT_CACHE_PAGE_SIZE, resolvedCount);
                resetCachedPagesState({
                    enabled: true,
                    pageSize,
                    total: resolvedCount,
                    nextOffset: 0,
                    fullyLoaded: false
                });

                const firstPage = await searchStoredItems({
                    search: '',
                    itemGroup: 'ALL',
                    limit: pageSize,
                    offset: 0
                }).catch(() => []);

                setItems(firstPage, {
                    totalCount: resolvedCount,
                    applySearch: false
                });

                cachedPagesState.value.nextOffset = firstPage.length;
                cachedPagesState.value.fullyLoaded = firstPage.length >= resolvedCount;
            } else {
                const itemsFromCache = await getAllStoredItems().catch(() => []);
                setItems(itemsFromCache, {
                    totalCount: resolvedCount || itemsFromCache.length,
                    applySearch: false
                });

                resetCachedPagesState({
                    enabled: false,
                    total: resolvedCount || itemsFromCache.length,
                    pageSize: itemsFromCache.length,
                    nextOffset: itemsFromCache.length,
                    fullyLoaded: true
                });
            }

            itemsLoaded.value = items.value.length > 0;
        } catch (error) {
            console.warn('Failed to load cached items:', error);
        }
    };

    const appendCachedItemsPage = async (options = {}) => {
        if (!cachedPagesState.value.enabled) {
            return [];
        }

        if (cachedPagesState.value.loading || cachedPagesState.value.fullyLoaded) {
            return [];
        }

        const {
            limit = null,
            offset = null,
            search = null,
            group = null,
            reset = false
        } = options;

        if (reset) {
            cachedPagesState.value.nextOffset = 0;
            cachedPagesState.value.fullyLoaded = false;
        }

        const effectiveSearch = typeof search === 'string' ? search : cachedPagesState.value.search || '';
        const effectiveGroup = typeof group === 'string' ? group : cachedPagesState.value.group || 'ALL';
        const pageSize = Number.isFinite(limit) && limit > 0 ? limit : cachedPagesState.value.pageSize;
        const pageOffset = Number.isFinite(offset) && offset >= 0 ? offset : cachedPagesState.value.nextOffset;

        cachedPagesState.value.search = effectiveSearch;
        cachedPagesState.value.group = effectiveGroup;
        cachedPagesState.value.loading = true;

        try {
            const pageItems = await searchStoredItems({
                search: effectiveSearch,
                itemGroup: effectiveGroup,
                limit: pageSize,
                offset: pageOffset
            }).catch(() => []);

            if (pageOffset === 0 && reset) {
                setItems(pageItems, {
                    totalCount: cachedPagesState.value.total,
                    applySearch: false
                });
                cachedPagesState.value.nextOffset = pageItems.length;
            } else if (pageItems.length) {
                const mergedMap = new Map(items.value.map(item => [item.item_code, item]));
                const merged = [...items.value];
                pageItems.forEach(item => {
                    if (!mergedMap.has(item.item_code)) {
                        mergedMap.set(item.item_code, item);
                        merged.push(item);
                    }
                });

                setItems(merged, {
                    totalCount: cachedPagesState.value.total,
                    applySearch: false
                });

                cachedPagesState.value.nextOffset = pageOffset + pageItems.length;
            }

            if (
                cachedPagesState.value.nextOffset >= cachedPagesState.value.total ||
                pageItems.length < pageSize
            ) {
                cachedPagesState.value.fullyLoaded = true;
            }

            return pageItems;
        } finally {
            cachedPagesState.value.loading = false;
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
        cachedPagesState,

        // Computed
        activePriceList,
        itemStats,
        cacheStats,
        shouldUseIndexedSearch,

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
        appendCachedItemsPage,
        clearAllCaches,
        clearSearchCache,
        assessCacheHealth
    };
});

export default useItemsStore;