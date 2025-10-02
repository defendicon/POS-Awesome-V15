/**
 * Pinia store responsible for managing customer state in the POS.
 * Extracted from the legacy Customer component so that other modules
 * can subscribe to the same source of truth instead of relying on the
 * global event bus.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import debounce from 'lodash/debounce';
import {
    db,
    checkDbHealth,
    setCustomerStorage,
    memoryInitPromise,
    getCustomersLastSync,
    setCustomersLastSync,
    getCustomerStorageCount,
    clearCustomerStorage,
    isOffline
} from '../../offline/index.js';

const DEFAULT_PAGE_SIZE = 200;

export const useCustomersStore = defineStore('customers', () => {
    const posProfile = ref(null);
    const customers = ref([]);
    const customersLoaded = ref(false);
    const loadingCustomers = ref(false);
    const isCustomerBackgroundLoading = ref(false);
    const pendingCustomerSearch = ref(null);

    const searchTerm = ref('');
    const page = ref(0);
    const pageSize = ref(DEFAULT_PAGE_SIZE);
    const hasMore = ref(true);
    const nextCustomerStart = ref(null);

    const loadProgress = ref(0);
    const totalCustomerCount = ref(0);
    const loadedCustomerCount = ref(0);

    const selectedCustomer = ref('');
    const readonly = ref(false);
    const effectiveReadonly = ref(false);

    const isInitialized = ref(false);
    const searchHandler = ref(null);

    const filteredCustomers = computed(() => {
        return isCustomerBackgroundLoading.value ? [] : customers.value;
    });

    const updateEffectiveReadonly = () => {
        effectiveReadonly.value = readonly.value && navigator.onLine;
    };

    const ensureSearchHandler = () => {
        if (!searchHandler.value) {
            searchHandler.value = debounce(async (term) => {
                await performSearch(term ?? '');
            }, 300);
        }
        return searchHandler.value;
    };

    const resetSearchState = (term = '') => {
        searchTerm.value = term ?? '';
        page.value = 0;
        hasMore.value = true;
        customers.value = [];
    };

    const ensureDatabaseReady = async () => {
        await memoryInitPromise;
        await checkDbHealth();
        if (!db.isOpen()) {
            await db.open();
        }
    };

    const searchCustomers = async (term = searchTerm.value, append = false) => {
        await ensureDatabaseReady();

        const normalizedTerm = typeof term === 'string' ? term.trim().toLowerCase() : '';
        let collection = db.table('customers');

        if (normalizedTerm) {
            const searchParts = normalizedTerm.split(/\s+/).filter(Boolean);
            collection = collection.filter((customer) => {
                if (!customer) {
                    return false;
                }

                const values = [
                    customer.customer_name,
                    customer.name,
                    customer.mobile_no,
                    customer.email_id,
                    customer.tax_id
                ]
                    .filter((value) => value !== null && value !== undefined)
                    .map((value) => String(value).toLowerCase());

                if (!searchParts.length) {
                    return true;
                }

                return searchParts.every((part) => values.some((value) => value.includes(part)));
            });
        }

        const offset = append ? page.value * pageSize.value : 0;
        const results = await collection.offset(offset).limit(pageSize.value).toArray();

        if (append) {
            customers.value = [...customers.value, ...results];
        } else {
            customers.value = results;
        }

        hasMore.value = results.length === pageSize.value;
        if (hasMore.value) {
            page.value += 1;
        }

        return results.length;
    };

    const performSearch = async (term) => {
        const normalized = typeof term === 'string' ? term : '';
        resetSearchState(normalized);
        return searchCustomers(normalized, false);
    };

    const queueSearch = (term) => {
        if (isCustomerBackgroundLoading.value) {
            pendingCustomerSearch.value = term ?? '';
            return;
        }
        ensureSearchHandler()(term);
    };

    const loadMoreCustomers = async () => {
        if (loadingCustomers.value) {
            return;
        }
        const count = await searchCustomers(searchTerm.value, true);
        if (count === pageSize.value) {
            return;
        }
        if (nextCustomerStart.value) {
            await backgroundLoadCustomers(nextCustomerStart.value, getCustomersLastSync());
            await searchCustomers(searchTerm.value, true);
        }
    };

    const fetchCustomerPage = (startAfter, modifiedAfter, limit) => {
        return new Promise((resolve, reject) => {
            frappe.call({
                method: 'posawesome.posawesome.api.customers.get_customer_names',
                args: {
                    pos_profile: posProfile.value?.pos_profile,
                    modified_after: modifiedAfter,
                    limit,
                    start_after: startAfter
                },
                callback: (r) => resolve(r.message || []),
                error: (err) => {
                    console.error('Failed to fetch customers', err);
                    reject(err);
                }
            });
        });
    };

    const backgroundLoadCustomers = async (startAfter, syncSince) => {
        if (!posProfile.value) {
            return;
        }

        const limit = pageSize.value;
        isCustomerBackgroundLoading.value = true;
        try {
            let cursor = startAfter;
            while (cursor) {
                const rows = await fetchCustomerPage(cursor, syncSince, limit);
                await setCustomerStorage(rows);
                loadedCustomerCount.value += rows.length;
                if (totalCustomerCount.value) {
                    const progress = Math.min(
                        99,
                        Math.round((loadedCustomerCount.value / totalCustomerCount.value) * 100)
                    );
                    loadProgress.value = progress;
                }
                if (rows.length === limit) {
                    cursor = rows[rows.length - 1]?.name || null;
                    nextCustomerStart.value = cursor;
                } else {
                    cursor = null;
                    nextCustomerStart.value = null;
                    setCustomersLastSync(new Date().toISOString());
                    loadProgress.value = 100;
                }
            }
        } catch (err) {
            console.error('Failed to background load customers', err);
        } finally {
            isCustomerBackgroundLoading.value = false;
            if (pendingCustomerSearch.value !== null) {
                const term = pendingCustomerSearch.value;
                pendingCustomerSearch.value = null;
                await performSearch(term);
            }
        }
    };

    const verifyServerCustomerCount = async () => {
        if (!posProfile.value || isOffline()) {
            return;
        }
        try {
            const localCount = await getCustomerStorageCount();
            const res = await frappe.call({
                method: 'posawesome.posawesome.api.customers.get_customers_count',
                args: { pos_profile: posProfile.value.pos_profile }
            });
            const serverCount = res.message || 0;
            if (typeof serverCount === 'number') {
                totalCustomerCount.value = serverCount;
                loadedCustomerCount.value = localCount;
                loadProgress.value = serverCount ? Math.round((localCount / serverCount) * 100) : 0;
                if (serverCount > localCount) {
                    const syncSince = getCustomersLastSync();
                    const rows = await fetchCustomerPage(null, syncSince, pageSize.value);
                    await setCustomerStorage(rows);
                    loadedCustomerCount.value += rows.length;
                    if (totalCustomerCount.value) {
                        loadProgress.value = Math.round(
                            (loadedCustomerCount.value / totalCustomerCount.value) * 100
                        );
                    }
                    const startAfter = rows.length === pageSize.value ? rows[rows.length - 1]?.name || null : null;
                    if (startAfter) {
                        backgroundLoadCustomers(startAfter, syncSince);
                    } else {
                        setCustomersLastSync(new Date().toISOString());
                        loadProgress.value = 100;
                    }
                    await searchCustomers(searchTerm.value);
                } else if (serverCount < localCount) {
                    await clearCustomerStorage();
                    setCustomersLastSync(null);
                    customers.value = [];
                    customersLoaded.value = false;
                    await getCustomerNames();
                }
            }
        } catch (err) {
            console.error('Error verifying customer count:', err);
        }
    };

    const getCustomerNames = async () => {
        if (!posProfile.value) {
            return;
        }

        const localCount = await getCustomerStorageCount();
        if (localCount > 0) {
            customersLoaded.value = true;
            await performSearch(searchTerm.value);
            await verifyServerCustomerCount();
            return;
        }

        const syncSince = getCustomersLastSync();
        loadProgress.value = 0;
        loadingCustomers.value = true;
        try {
            try {
                const countRes = await frappe.call({
                    method: 'posawesome.posawesome.api.customers.get_customers_count',
                    args: { pos_profile: posProfile.value.pos_profile }
                });
                totalCustomerCount.value = countRes.message || 0;
            } catch (e) {
                console.error('Failed to fetch customer count', e);
                totalCustomerCount.value = 0;
            }

            const rows = await fetchCustomerPage(null, syncSince, pageSize.value);
            await setCustomerStorage(rows);
            loadedCustomerCount.value = rows.length;
            if (totalCustomerCount.value) {
                loadProgress.value = Math.round(
                    (loadedCustomerCount.value / totalCustomerCount.value) * 100
                );
            }

            nextCustomerStart.value = rows.length === pageSize.value ? rows[rows.length - 1]?.name || null : null;
            if (nextCustomerStart.value) {
                backgroundLoadCustomers(nextCustomerStart.value, syncSince);
            } else {
                setCustomersLastSync(new Date().toISOString());
                loadProgress.value = 100;
            }
            customersLoaded.value = true;
        } catch (err) {
            console.error('Failed to fetch customers:', err);
        } finally {
            loadingCustomers.value = false;
            await performSearch(searchTerm.value);
        }
    };

    const initialize = async () => {
        if (isInitialized.value) {
            return;
        }
        await ensureDatabaseReady();
        await searchCustomers('');
        updateEffectiveReadonly();
        isInitialized.value = true;
    };

    const setPosProfile = async (profile) => {
        posProfile.value = profile;
        if (profile) {
            await initialize();
            await getCustomerNames();
        }
    };

    const setSelectedCustomer = (customerName) => {
        selectedCustomer.value = customerName || '';
    };

    const addOrUpdateCustomer = async (customer) => {
        if (!customer) {
            return;
        }
        const index = customers.value.findIndex((c) => c.name === customer.name);
        if (index !== -1) {
            const updated = [...customers.value];
            updated.splice(index, 1, customer);
            customers.value = updated;
        } else {
            customers.value = [...customers.value, customer];
        }
        await setCustomerStorage([customer]);
        setSelectedCustomer(customer.name);
    };

    const setReadonlyState = (value) => {
        readonly.value = Boolean(value);
        updateEffectiveReadonly();
    };

    const refreshCustomers = async () => {
        await getCustomerNames();
    };

    return {
        // state
        posProfile,
        customers,
        customersLoaded,
        loadingCustomers,
        isCustomerBackgroundLoading,
        pendingCustomerSearch,
        searchTerm,
        page,
        pageSize,
        hasMore,
        nextCustomerStart,
        loadProgress,
        totalCustomerCount,
        loadedCustomerCount,
        selectedCustomer,
        readonly,
        effectiveReadonly,

        // computed
        filteredCustomers,

        // actions
        initialize,
        setPosProfile,
        searchCustomers,
        performSearch,
        queueSearch,
        loadMoreCustomers,
        verifyServerCustomerCount,
        getCustomerNames,
        backgroundLoadCustomers,
        fetchCustomerPage,
        setSelectedCustomer,
        addOrUpdateCustomer,
        setReadonlyState,
        refreshCustomers
    };
});
