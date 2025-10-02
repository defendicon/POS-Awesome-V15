import { computed, ref } from "vue";
import { defineStore } from "pinia";
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
} from "../../offline/index.js";

const normalizeSearchTerm = (term) => {
        if (typeof term !== "string") {
                return "";
        }
        return term.trim().toLowerCase();
};

const splitSearchTerm = (term) => {
        const normalized = normalizeSearchTerm(term);
        if (!normalized) {
                return [];
        }
        return normalized.split(/\s+/).filter(Boolean);
};

async function ensureDatabaseReady() {
        await memoryInitPromise;
        await checkDbHealth();
        if (!db.isOpen()) {
                await db.open();
        }
}

function normalizeCustomer(customer) {
        if (!customer || typeof customer !== "object") {
                return {};
        }
        return { ...customer };
}

export const useCustomersStore = defineStore("customers", () => {
        const posProfilePayload = ref(null);
        const customers = ref([]);
        const customersLoaded = ref(false);
        const loadingCustomers = ref(false);
        const searchTerm = ref("");
        const page = ref(0);
        const pageSize = ref(200);
        const hasMore = ref(true);
        const nextCustomerStart = ref(null);
        const isCustomerBackgroundLoading = ref(false);
        const pendingCustomerSearch = ref(null);
        const loadProgress = ref(0);
        const totalCustomerCount = ref(0);
        const loadedCustomerCount = ref(0);
        const selectedCustomer = ref(null);
        const customerInfo = ref({});
        const readonly = ref(false);

        const posProfileDoc = computed(() => posProfilePayload.value?.pos_profile || null);
        const posProfileName = computed(() => posProfileDoc.value?.pos_profile || null);
        const effectiveReadonly = computed(() => readonly.value && navigator.onLine);
        const filteredCustomers = computed(() =>
                isCustomerBackgroundLoading.value ? [] : customers.value,
        );

        const resetPagination = () => {
                page.value = 0;
                hasMore.value = true;
                customers.value = [];
        };

        const setSearchTerm = (term) => {
                searchTerm.value = normalizeSearchTerm(term);
                resetPagination();
        };

        const setReadonly = (value) => {
                readonly.value = Boolean(value);
        };

        const setCustomerInfo = (info) => {
                customerInfo.value = normalizeCustomer(info);
        };

        const setSelectedCustomer = (customer) => {
                selectedCustomer.value = customer || null;
        };

        const registerPosProfile = async (payload) => {
                posProfilePayload.value = payload || null;
                if (payload) {
                        await get_customer_names();
                }
        };

        const ensurePosProfile = () => {
                const profile = posProfileDoc.value;
                if (!profile) {
                        throw new Error("POS profile is not registered");
                }
                return profile;
        };

        const updateCustomersList = (list, append = false) => {
                const normalized = Array.isArray(list) ? list.map(normalizeCustomer) : [];
                if (append && customers.value.length) {
                        customers.value = [...customers.value, ...normalized];
                } else {
                        customers.value = normalized;
                }
        };

        const searchCustomers = async (term = searchTerm.value, append = false) => {
                try {
                        await ensureDatabaseReady();
                        const normalizedTerm = normalizeSearchTerm(term);
                        const searchParts = splitSearchTerm(normalizedTerm);
                        let collection = db.table("customers");

                        if (searchParts.length) {
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

                                        return searchParts.every((part) =>
                                                values.some((value) => value.includes(part)),
                                        );
                                });
                        }

                        const offset = page.value * pageSize.value;
                        const results = await collection.offset(offset).limit(pageSize.value).toArray();

                        if (append) {
                                updateCustomersList(results, true);
                        } else {
                                updateCustomersList(results, false);
                        }

                        hasMore.value = results.length === pageSize.value;
                        if (hasMore.value) {
                                page.value += 1;
                        }
                        return results.length;
                } catch (error) {
                        console.error("Failed to search customers", error);
                        return 0;
                }
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
                const profile = ensurePosProfile();
                return new Promise((resolve, reject) => {
                        frappe.call({
                                method: "posawesome.posawesome.api.customers.get_customer_names",
                                args: {
                                        pos_profile: profile.pos_profile,
                                        modified_after: modifiedAfter,
                                        limit,
                                        start_after: startAfter,
                                },
                                callback: (r) => resolve(r.message || []),
                                error: (err) => {
                                        console.error("Failed to fetch customers", err);
                                        reject(err);
                                },
                        });
                });
        };

        const backgroundLoadCustomers = async (startAfter, syncSince) => {
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
                } catch (error) {
                        console.error("Failed to background load customers", error);
                } finally {
                        isCustomerBackgroundLoading.value = false;
                        if (pendingCustomerSearch.value !== null) {
                                const term = pendingCustomerSearch.value;
                                pendingCustomerSearch.value = null;
                                setSearchTerm(term);
                                await searchCustomers(term);
                        }
                }
        };

        const verifyServerCustomerCount = async () => {
                if (isOffline()) {
                        return;
                }

                try {
                        const profile = ensurePosProfile();
                        const localCount = await getCustomerStorageCount();
                        const res = await frappe.call({
                                method: "posawesome.posawesome.api.customers.get_customers_count",
                                args: { pos_profile: profile.pos_profile },
                        });
                        const serverCount = res.message || 0;
                        if (typeof serverCount === "number") {
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
                                                rows.length === pageSize.value ? rows[rows.length - 1]?.name || null : null;
                                        if (startAfter) {
                                                await backgroundLoadCustomers(startAfter, syncSince);
                                        } else {
                                                setCustomersLastSync(new Date().toISOString());
                                                loadProgress.value = 100;
                                                customersLoaded.value = true;
                                        }
                                        const currentTerm = searchTerm.value;
                                        setSearchTerm(currentTerm);
                                        await searchCustomers(currentTerm);
                                } else if (serverCount < localCount) {
                                        await clearCustomerStorage();
                                        setCustomersLastSync(null);
                                        customers.value = [];
                                        await get_customer_names();
                                }
                        }
                } catch (error) {
                        console.error("Error verifying customer count", error);
                }
        };

        const get_customer_names = async () => {
                await ensureDatabaseReady();
                const localCount = await getCustomerStorageCount();
                if (localCount > 0) {
                        customersLoaded.value = true;
                        const currentTerm = searchTerm.value;
                        setSearchTerm(currentTerm);
                        await searchCustomers(currentTerm);
                        await verifyServerCustomerCount();
                        return;
                }

                const syncSince = getCustomersLastSync();
                loadProgress.value = 0;
                loadingCustomers.value = true;
                try {
                        try {
                                const profile = ensurePosProfile();
                                const countRes = await frappe.call({
                                        method: "posawesome.posawesome.api.customers.get_customers_count",
                                        args: { pos_profile: profile.pos_profile },
                                });
                                totalCustomerCount.value = countRes.message || 0;
                        } catch (error) {
                                console.error("Failed to fetch customer count", error);
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
                } catch (error) {
                        console.error("Failed to fetch customers", error);
                } finally {
                        loadingCustomers.value = false;
                        await searchCustomers(searchTerm.value);
                }
        };

        const addOrUpdateCustomer = async (customer) => {
                if (!customer || !customer.name) {
                        return;
                }
                await setCustomerStorage([customer]);
                const index = customers.value.findIndex((entry) => entry.name === customer.name);
                if (index !== -1) {
                                const updated = customers.value.slice();
                                updated.splice(index, 1, normalizeCustomer(customer));
                                customers.value = updated;
                } else {
                                customers.value = [...customers.value, normalizeCustomer(customer)];
                }
        };

        return {
                posProfilePayload,
                posProfileDoc,
                posProfileName,
                customers,
                customersLoaded,
                loadingCustomers,
                searchTerm,
                page,
                pageSize,
                hasMore,
                nextCustomerStart,
                isCustomerBackgroundLoading,
                pendingCustomerSearch,
                loadProgress,
                totalCustomerCount,
                loadedCustomerCount,
                selectedCustomer,
                customerInfo,
                readonly,
                effectiveReadonly,
                filteredCustomers,
                setSearchTerm,
                setReadonly,
                setCustomerInfo,
                setSelectedCustomer,
                registerPosProfile,
                searchCustomers,
                loadMoreCustomers,
                verifyServerCustomerCount,
                get_customer_names,
                addOrUpdateCustomer,
        };
});
