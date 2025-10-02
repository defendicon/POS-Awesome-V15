/**
 * Pinia store responsible for managing customers in the POS application.
 * Centralizes customer caching, search, and background sync state so that
 * multiple components can reactively consume customer information without
 * relying on the legacy event bus.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
        db,
        checkDbHealth,
        setCustomerStorage,
        memoryInitPromise,
        getCustomersLastSync,
        setCustomersLastSync,
        getCustomerStorageCount,
        clearCustomerStorage,
        isOffline,
} from '../../offline/index.js';

const DEFAULT_PAGE_SIZE = 200;

/* global frappe */
export const useCustomersStore = defineStore('customers', () => {
        const posProfile = ref(null);
        const customers = ref([]);
        const searchTerm = ref('');
        const page = ref(0);
        const pageSize = ref(DEFAULT_PAGE_SIZE);
        const hasMore = ref(true);
        const nextCustomerStart = ref(null);
        const loadingCustomers = ref(false);
        const customersLoaded = ref(false);
        const isCustomerBackgroundLoading = ref(false);
        const pendingCustomerSearch = ref(null);
        const loadProgress = ref(0);
        const totalCustomerCount = ref(0);
        const loadedCustomerCount = ref(0);
        const selectedCustomer = ref('');
        const readonly = ref(false);
        const customerInfo = ref({});
        const customerRefreshKey = ref(0);

        const filteredCustomers = computed(() =>
                isCustomerBackgroundLoading.value ? [] : customers.value,
        );

        const effectiveReadonly = computed(() => {
                if (typeof navigator === 'undefined') {
                        return readonly.value;
                }
                return readonly.value && navigator.onLine;
        });

        const setPosProfile = (profile) => {
                posProfile.value = profile || null;
        };

        const setReadonly = (value) => {
                readonly.value = Boolean(value);
        };

        const setCustomerInfo = (info) => {
                customerInfo.value = info || {};
        };

        const setSelectedCustomer = (customerName) => {
                selectedCustomer.value = customerName || '';
        };

        const resetPagination = () => {
                page.value = 0;
                hasMore.value = true;
                nextCustomerStart.value = null;
        };

        const assignCustomers = (records, append) => {
                if (append) {
                        customers.value = [...customers.value, ...records];
                } else {
                        customers.value = records;
                }

                hasMore.value = records.length === pageSize.value;
                if (hasMore.value) {
                        page.value += 1;
                }
        };

        const fetchCustomerPage = (startAfter, modifiedAfter, limit) =>
                new Promise((resolve, reject) => {
                        frappe.call({
                                method: 'posawesome.posawesome.api.customers.get_customer_names',
                                args: {
                                        pos_profile: posProfile.value?.pos_profile,
                                        modified_after: modifiedAfter,
                                        limit,
                                        start_after: startAfter,
                                },
                                callback: (r) => resolve(r.message || []),
                                error: (err) => {
                                        console.error('Failed to fetch customers', err);
                                        reject(err);
                                },
                        });
                });

        const searchCustomers = async (term = searchTerm.value, append = false) => {
                await memoryInitPromise;

                try {
                        await checkDbHealth();
                        if (!db.isOpen()) {
                                await db.open();
                        }

                        let collection = db.table('customers');
                        const normalizedTerm = typeof term === 'string' ? term.trim().toLowerCase() : '';

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
                                                customer.tax_id,
                                        ]
                                                .filter((value) => value !== null && value !== undefined)
                                                .map((value) => String(value).toLowerCase());

                                        if (!searchParts.length) {
                                                return true;
                                        }

                                        return searchParts.every((part) =>
                                                values.some((value) => value.includes(part)),
                                        );
                                });
                        }

                        const results = await collection
                                .offset(page.value * pageSize.value)
                                .limit(pageSize.value)
                                .toArray();

                        assignCustomers(results, append);
                        return results.length;
                } catch (err) {
                        console.error('Failed to search customers', err);
                        return 0;
                }
        };

        const setSearchTerm = async (term) => {
                searchTerm.value = typeof term === 'string' ? term : '';
                resetPagination();
                customers.value = [];
                return searchCustomers(searchTerm.value);
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
                                                Math.round((loadedCustomerCount.value / totalCustomerCount.value) * 100),
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
                                        customersLoaded.value = true;
                                }
                        }
                } catch (err) {
                        console.error('Failed to background load customers', err);
                } finally {
                        isCustomerBackgroundLoading.value = false;

                        if (pendingCustomerSearch.value !== null) {
                                const value = pendingCustomerSearch.value;
                                pendingCustomerSearch.value = null;
                                await setSearchTerm(value);
                        }
                }
        };

        const verifyServerCustomerCount = async () => {
                if (isOffline()) {
                        return;
                }

                try {
                        const localCount = await getCustomerStorageCount();
                        const res = await frappe.call({
                                method: 'posawesome.posawesome.api.customers.get_customers_count',
                                args: { pos_profile: posProfile.value?.pos_profile },
                        });
                        const serverCount = res.message || 0;

                        if (typeof serverCount === 'number') {
                                totalCustomerCount.value = serverCount;
                                loadedCustomerCount.value = localCount;
                                loadProgress.value = serverCount
                                        ? Math.round((localCount / serverCount) * 100)
                                        : 0;

                                if (serverCount > localCount) {
                                        const syncSince = getCustomersLastSync();
                                        const rows = await fetchCustomerPage(null, syncSince, pageSize.value);
                                        await setCustomerStorage(rows);
                                        loadedCustomerCount.value += rows.length;

                                        if (totalCustomerCount.value) {
                                                loadProgress.value = Math.round(
                                                        (loadedCustomerCount.value / totalCustomerCount.value) * 100,
                                                );
                                        }

                                        const startAfter =
                                                rows.length === pageSize.value
                                                        ? rows[rows.length - 1]?.name || null
                                                        : null;

                                        if (startAfter) {
                                                await backgroundLoadCustomers(startAfter, syncSince);
                                        } else {
                                                setCustomersLastSync(new Date().toISOString());
                                                loadProgress.value = 100;
                                                customersLoaded.value = true;
                                        }

                                        await searchCustomers(searchTerm.value);
                                } else if (serverCount < localCount) {
                                        await clearCustomerStorage();
                                        setCustomersLastSync(null);
                                        customers.value = [];
                                        resetPagination();
                                        await get_customer_names();
                                }
                        }
                } catch (err) {
                        console.error('Error verifying customer count:', err);
                }
        };

        const get_customer_names = async () => {
                if (!posProfile.value) {
                        return;
                }

                const localCount = await getCustomerStorageCount();
                if (localCount > 0) {
                        customersLoaded.value = true;
                        await searchCustomers(searchTerm.value);
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
                                        args: { pos_profile: posProfile.value?.pos_profile },
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
                                        (loadedCustomerCount.value / totalCustomerCount.value) * 100,
                                );
                        }

                        nextCustomerStart.value =
                                rows.length === pageSize.value ? rows[rows.length - 1]?.name || null : null;

                        if (nextCustomerStart.value) {
                                backgroundLoadCustomers(nextCustomerStart.value, syncSince);
                        } else {
                                setCustomersLastSync(new Date().toISOString());
                                loadProgress.value = 100;
                                customersLoaded.value = true;
                        }

                        customersLoaded.value = true;
                } catch (err) {
                        console.error('Failed to fetch customers:', err);
                } finally {
                        loadingCustomers.value = false;
                        await searchCustomers(searchTerm.value);
                }
        };

        const queueSearchWhileLoading = (value) => {
                pendingCustomerSearch.value = value;
        };

        const addOrUpdateCustomer = async (customer) => {
                if (!customer || !customer.name) {
                        return;
                }

                const index = customers.value.findIndex((c) => c.name === customer.name);
                if (index !== -1) {
                                customers.value = [
                                        ...customers.value.slice(0, index),
                                        customer,
                                        ...customers.value.slice(index + 1),
                                ];
                } else {
                        customers.value = [...customers.value, customer];
                }

                await setCustomerStorage([customer]);
                setSelectedCustomer(customer.name);
                customerRefreshKey.value += 1;
        };

        return {
                // state
                posProfile,
                customers,
                searchTerm,
                page,
                pageSize,
                hasMore,
                nextCustomerStart,
                loadingCustomers,
                customersLoaded,
                isCustomerBackgroundLoading,
                pendingCustomerSearch,
                loadProgress,
                totalCustomerCount,
                loadedCustomerCount,
                selectedCustomer,
                readonly,
                customerInfo,
                customerRefreshKey,
                filteredCustomers,
                effectiveReadonly,
                // actions
                setPosProfile,
                setReadonly,
                setCustomerInfo,
                setSelectedCustomer,
                setSearchTerm,
                searchCustomers,
                loadMoreCustomers,
                backgroundLoadCustomers,
                verifyServerCustomerCount,
                get_customer_names,
                queueSearchWhileLoading,
                addOrUpdateCustomer,
                triggerCustomerRefresh: () => {
                        customerRefreshKey.value += 1;
                },
        };
});
