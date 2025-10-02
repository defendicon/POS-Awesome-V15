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

const PAGE_SIZE = 200;

function normalizeSearchTerm(term) {
        if (typeof term !== 'string') {
                return '';
        }
        return term.trim();
}

function normalizeProfile(profile) {
        if (!profile) {
                return null;
        }

        let resolved = profile;

        if (profile.pos_profile) {
                resolved = profile.pos_profile;
        }

        if (typeof resolved === 'string') {
                const trimmed = resolved.trim();
                if (!trimmed) {
                        return null;
                }

                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        try {
                                return JSON.parse(trimmed);
                        } catch (err) {
                                console.error('Failed to parse POS profile JSON', err);
                                return null;
                        }
                }

                return { name: trimmed };
        }

        return resolved;
}

function getSerializedProfile(profile) {
        if (!profile) {
                return null;
        }

        if (typeof profile === 'string') {
                const trimmed = profile.trim();
                if (!trimmed) {
                        return null;
                }
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        return trimmed;
                }
                return JSON.stringify({ name: trimmed });
        }

        let fallbackName = null;
        if (typeof profile === 'object' && profile !== null) {
                if (typeof profile.name === 'string') {
                        fallbackName = profile.name;
                } else if (typeof profile.pos_profile === 'string') {
                        fallbackName = profile.pos_profile;
                } else if (profile.pos_profile?.name) {
                        fallbackName = profile.pos_profile.name;
                }
        }

        try {
                return JSON.stringify(profile);
        } catch (err) {
                console.error('Failed to serialize POS profile', err);
                if (fallbackName) {
                        return JSON.stringify({ name: fallbackName });
                }
                return null;
        }
}

export const useCustomersStore = defineStore('customers', () => {
        const customers = ref([]);
        const selectedCustomer = ref(null);
        const customerInfo = ref({});
        const searchTerm = ref('');
        const page = ref(0);
        const hasMore = ref(true);
        const nextCustomerStart = ref(null);
        const loadingCustomers = ref(false);
        const customersLoaded = ref(false);
        const isCustomerBackgroundLoading = ref(false);
        const pendingCustomerSearch = ref(null);
        const loadProgress = ref(0);
        const totalCustomerCount = ref(0);
        const loadedCustomerCount = ref(0);
        const posProfile = ref(null);
        const refreshToken = ref(0);

        const filteredCustomers = computed(() =>
                isCustomerBackgroundLoading.value ? [] : customers.value,
        );

        const isLoadComplete = computed(
                () => customersLoaded.value && loadProgress.value >= 100,
        );

        async function ensureDatabase() {
                await memoryInitPromise;
                await checkDbHealth();
                if (!db.isOpen()) {
                        await db.open();
                }
        }

        function resetPagination() {
                page.value = 0;
                hasMore.value = true;
                customers.value = [];
        }

        function setPosProfile(profile) {
                posProfile.value = normalizeProfile(profile);
        }

        function setSelectedCustomer(name) {
                selectedCustomer.value = name || null;
        }

        function setCustomerInfo(info) {
                customerInfo.value = info || {};
        }

        function requestCustomerRefresh() {
                refreshToken.value += 1;
        }

        async function performSearch({ append = false } = {}) {
                await ensureDatabase();

                let collection = db.table('customers');
                const normalizedTerm = normalizeSearchTerm(searchTerm.value);
                if (normalizedTerm) {
                        const searchParts = normalizedTerm
                                .toLowerCase()
                                .split(/\s+/)
                                .filter(Boolean);
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

                const offset = page.value * PAGE_SIZE;
                const results = await collection.offset(offset).limit(PAGE_SIZE).toArray();

                if (append) {
                        customers.value = [...customers.value, ...results];
                } else {
                        customers.value = results;
                }

                hasMore.value = results.length === PAGE_SIZE;
                if (hasMore.value) {
                        page.value += 1;
                }

                return results.length;
        }

        async function searchCustomers(term = '', append = false) {
                if (!append) {
                        searchTerm.value = normalizeSearchTerm(term);
                        resetPagination();
                }
                return performSearch({ append });
        }

        async function queueSearch(term) {
                const normalized = normalizeSearchTerm(term);
                if (isCustomerBackgroundLoading.value) {
                        pendingCustomerSearch.value = normalized;
                        return null;
                }
                return searchCustomers(normalized, false);
        }

        async function loadMoreCustomers() {
                if (loadingCustomers.value) {
                        return 0;
                }
                const count = await performSearch({ append: true });
                if (count === PAGE_SIZE) {
                        return count;
                }
                if (nextCustomerStart.value) {
                        await backgroundLoadCustomers(
                                nextCustomerStart.value,
                                getCustomersLastSync(),
                        );
                        await performSearch({ append: true });
                }
                return count;
        }

        function fetchCustomerPage(startAfter, modifiedAfter, limit) {
                const serializedProfile = getSerializedProfile(posProfile.value);
                return new Promise((resolve, reject) => {
                        if (!serializedProfile) {
                                resolve([]);
                                return;
                        }
                        frappe.call({
                                method: 'posawesome.posawesome.api.customers.get_customer_names',
                                args: {
                                        pos_profile: serializedProfile,
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
        }

        async function backgroundLoadCustomers(startAfter, syncSince) {
                if (!posProfile.value || isOffline()) {
                        return;
                }
                const serializedProfile = getSerializedProfile(posProfile.value);
                if (!serializedProfile) {
                        return;
                }
                const limit = PAGE_SIZE;
                isCustomerBackgroundLoading.value = true;
                try {
                        let cursor = startAfter;
                        while (cursor) {
                                const rows = await fetchCustomerPage(cursor, syncSince, limit);
                                if (rows.length) {
                                        await setCustomerStorage(rows);
                                        loadedCustomerCount.value += rows.length;
                                        if (totalCustomerCount.value) {
                                                const progress = Math.min(
                                                        99,
                                                        Math.round(
                                                                (loadedCustomerCount.value /
                                                                        totalCustomerCount.value) *
                                                                        100,
                                                        ),
                                                );
                                                loadProgress.value = progress;
                                        }
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
                                const term = pendingCustomerSearch.value;
                                pendingCustomerSearch.value = null;
                                await searchCustomers(term);
                        }
                }
        }

        async function verifyServerCustomerCount() {
                if (!posProfile.value || isOffline()) {
                        return;
                }
                try {
                        const localCount = await getCustomerStorageCount();
                        const serializedProfile = getSerializedProfile(posProfile.value);
                        if (!serializedProfile) {
                                return;
                        }
                        const response = await frappe.call({
                                method: 'posawesome.posawesome.api.customers.get_customers_count',
                                args: { pos_profile: serializedProfile },
                        });
                        const serverCount = response.message || 0;
                        totalCustomerCount.value = serverCount;
                        loadedCustomerCount.value = localCount;
                        loadProgress.value = serverCount
                                ? Math.round((localCount / serverCount) * 100)
                                : 0;

                        if (serverCount > localCount) {
                                const syncSince = getCustomersLastSync();
                                const rows = await fetchCustomerPage(null, syncSince, PAGE_SIZE);
                                if (rows.length) {
                                        await setCustomerStorage(rows);
                                        loadedCustomerCount.value += rows.length;
                                        if (totalCustomerCount.value) {
                                                loadProgress.value = Math.min(
                                                        100,
                                                        Math.round(
                                                                (loadedCustomerCount.value /
                                                                        totalCustomerCount.value) *
                                                                        100,
                                                        ),
                                                );
                                        }
                                }
                                const startAfter =
                                        rows.length === PAGE_SIZE ? rows[rows.length - 1]?.name || null : null;
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
                                resetPagination();
                                await get_customer_names();
                        }
                } catch (err) {
                        console.error('Error verifying customer count:', err);
                }
        }

        async function get_customer_names() {
                if (!posProfile.value) {
                        return;
                }
                const serializedProfile = getSerializedProfile(posProfile.value);
                if (!serializedProfile) {
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
                                const countResponse = await frappe.call({
                                        method: 'posawesome.posawesome.api.customers.get_customers_count',
                                        args: { pos_profile: serializedProfile },
                                });
                                totalCustomerCount.value = countResponse.message || 0;
                        } catch (err) {
                                console.error('Failed to fetch customer count', err);
                                totalCustomerCount.value = 0;
                        }

                        const rows = await fetchCustomerPage(null, syncSince, PAGE_SIZE);
                        if (rows.length) {
                                await setCustomerStorage(rows);
                        }
                        loadedCustomerCount.value = rows.length;
                        if (totalCustomerCount.value) {
                                loadProgress.value = Math.min(
                                        100,
                                        Math.round(
                                                (loadedCustomerCount.value / totalCustomerCount.value) * 100,
                                        ),
                                );
                        }
                        nextCustomerStart.value =
                                rows.length === PAGE_SIZE ? rows[rows.length - 1]?.name || null : null;
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
        }

        async function addOrUpdateCustomer(customer) {
                if (!customer || !customer.name) {
                        return;
                }
                const existingIndex = customers.value.findIndex((c) => c.name === customer.name);
                if (existingIndex !== -1) {
                        const updated = [...customers.value];
                        updated.splice(existingIndex, 1, customer);
                        customers.value = updated;
                } else {
                        customers.value = [...customers.value, customer];
                }
                await setCustomerStorage([customer]);
                setSelectedCustomer(customer.name);
                requestCustomerRefresh();
        }

        function clearLocalState() {
                resetPagination();
                selectedCustomer.value = null;
                customerInfo.value = {};
                loadProgress.value = 0;
                totalCustomerCount.value = 0;
                loadedCustomerCount.value = 0;
                customersLoaded.value = false;
                nextCustomerStart.value = null;
        }

        return {
                customers,
                filteredCustomers,
                selectedCustomer,
                customerInfo,
                searchTerm,
                page,
                hasMore,
                nextCustomerStart,
                loadingCustomers,
                customersLoaded,
                isCustomerBackgroundLoading,
                pendingCustomerSearch,
                loadProgress,
                totalCustomerCount,
                loadedCustomerCount,
                posProfile,
                refreshToken,
                isLoadComplete,
                setPosProfile,
                setSelectedCustomer,
                setCustomerInfo,
                searchCustomers,
                queueSearch,
                loadMoreCustomers,
                verifyServerCustomerCount,
                get_customer_names,
                backgroundLoadCustomers,
                addOrUpdateCustomer,
                requestCustomerRefresh,
                clearLocalState,
        };
});
