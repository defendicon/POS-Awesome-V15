import { defineStore } from "pinia";
import { ref, computed } from "vue";

declare const frappe: any;
declare const __: any;
import type {
	CustomerInfo,
	CustomerSummary,
	POSProfile,
	StoredCustomer,
} from "../types/models";
import {
	normalizeCustomerSearchTerm,
	scoreCustomerSearchMatch,
} from "./customers/customerSearch";
import { resetCustomerLoadingCoordinator } from "../modules/customers/customerLoadingCoordinator";
// @ts-ignore
import {
	db,
	checkDbHealth,
	memory,
	setCustomerStorage,
	searchStoredCustomers,
	saveStoredValueSnapshot,
	memoryInitPromise,
	getCustomersLastSync,
	setCustomersLastSync,
	getCustomerStorageCount,
	clearCustomerStorage,
	isOffline,
	refreshBootstrapSnapshotFromCacheState,
} from "../../offline/index";

const PAGE_SIZE = 1000;
const MAX_CUSTOMER_SEARCH_RESULTS = 50;
const CUSTOMER_SCOPE_STORAGE_KEY = "posa_customers_profile_scope";

function getCustomerProfileScope(profile: POSProfile | null): string {
	const profileName =
		typeof profile?.name === "string" ? profile.name.trim() : "";
	return profileName || "";
}

function getStoredCustomerScope(): string {
	if (typeof localStorage === "undefined") {
		return "";
	}
	const stored = localStorage.getItem(CUSTOMER_SCOPE_STORAGE_KEY);
	return typeof stored === "string" ? stored : "";
}

function setStoredCustomerScope(scope: string): void {
	if (typeof localStorage === "undefined") {
		return;
	}
	if (scope) {
		localStorage.setItem(CUSTOMER_SCOPE_STORAGE_KEY, scope);
		return;
	}
	localStorage.removeItem(CUSTOMER_SCOPE_STORAGE_KEY);
}

function getStringField(
	source: Record<string, unknown>,
	field: string,
): string | undefined {
	const value = source[field];
	return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeProfile(profile: unknown): POSProfile | null {
	if (!profile) {
		return null;
	}

	let resolved: unknown = profile;

	if (
		typeof profile === "object" &&
		profile !== null &&
		"pos_profile" in profile &&
		(profile as { pos_profile?: unknown }).pos_profile
	) {
		resolved = (profile as { pos_profile?: unknown }).pos_profile;
	}

	if (typeof resolved === "string") {
		const trimmed = resolved.trim();
		if (!trimmed) {
			return null;
		}

		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				return JSON.parse(trimmed) as POSProfile;
			} catch (err) {
				console.error("Failed to parse POS profile JSON", err);
				return null;
			}
		}

		return { name: trimmed } as POSProfile;
	}

	return resolved as POSProfile;
}

function getSerializedProfile(profile: unknown): string | null {
	if (!profile) {
		return null;
	}

	if (typeof profile === "string") {
		const trimmed = profile.trim();
		if (!trimmed) {
			return null;
		}
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			return trimmed;
		}
		return JSON.stringify({ name: trimmed });
	}

	let fallbackName: string | null = null;
	if (typeof profile === "object" && profile !== null) {
		const typedProfile = profile as {
			name?: unknown;
			pos_profile?: unknown;
		};
		if (typeof typedProfile.name === "string") {
			fallbackName = typedProfile.name;
		} else if (typeof typedProfile.pos_profile === "string") {
			fallbackName = typedProfile.pos_profile;
		} else if (
			typeof typedProfile.pos_profile === "object" &&
			typedProfile.pos_profile !== null &&
			"name" in typedProfile.pos_profile &&
			typeof (typedProfile.pos_profile as { name?: unknown }).name === "string"
		) {
			fallbackName = (typedProfile.pos_profile as { name: string }).name;
		}
	}

	try {
		return JSON.stringify(profile);
	} catch (err) {
		console.error("Failed to serialize POS profile", err);
		if (fallbackName) {
			return JSON.stringify({ name: fallbackName });
		}
		return null;
	}
}

export const useCustomersStore = defineStore("customers", () => {
	const customers = ref<CustomerSummary[]>([]);
	const selectedCustomer = ref<string | null>(null);
	const customerInfo = ref<CustomerInfo>({});
	const searchTerm = ref("");
	const page = ref(0);
	const hasMore = ref(true);
	const nextCustomerStart = ref<string | null>(null);
	const loadingCustomers = ref(false);
	const customersLoaded = ref(false);
	const isCustomerBackgroundLoading = ref(false);
	const pendingCustomerSearch = ref<string | null>(null);
	const loadProgress = ref(0);
	const totalCustomerCount = ref(0);
	const loadedCustomerCount = ref(0);
	const posProfile = ref<POSProfile | null>(null);
	const customerProfileScope = ref("");
	const refreshToken = ref(0);
	const isUpdateCustomerDialogOpen = ref(false);
	const customerToUpdate = ref<StoredCustomer | null>(null);
	let customerFetchPromise: Promise<void> | null = null;
	const customerSearchCache = new Map<string, CustomerSummary[]>();
	const customerLoadLogState = {
		local: false,
		server: false,
		final: false,
	};

	function resetCustomerLoadLogState() {
		customerLoadLogState.local = false;
		customerLoadLogState.server = false;
		customerLoadLogState.final = false;
	}

	function logLocalCustomerCount(count: number) {
		if (customerLoadLogState.local) return;
		console.log(`Local customer count: ${count}`);
		customerLoadLogState.local = true;
	}

	function logServerCustomerCount(count: number) {
		if (customerLoadLogState.server) return;
		console.log(`Server customer count: ${count}`);
		customerLoadLogState.server = true;
	}

	function logFinalLoadedCustomerCount() {
		if (customerLoadLogState.final) return;
		const count = Number(loadedCustomerCount.value || customers.value.length || 0);
		console.log(`Customers loaded: ${count}`);
		customerLoadLogState.final = true;
	}

	const filteredCustomers = computed(() => customers.value);

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

	function clearCustomerSearchCache() {
		customerSearchCache.clear();
	}

	function hydrateRuntimeCustomerCache(rows: CustomerSummary[]) {
		if (!Array.isArray(rows) || rows.length === 0) {
			return;
		}
		const merged = new Map<string, CustomerSummary>();
		const existingRows = Array.isArray(memory.customer_storage)
			? (memory.customer_storage as CustomerSummary[])
			: [];
		existingRows.forEach((row) => {
			if (row?.name) {
				merged.set(row.name, row);
			}
		});
		rows.forEach((row) => {
			if (row?.name) {
				merged.set(row.name, row);
			}
		});
		memory.customer_storage = Array.from(merged.values());
	}

	function setPosProfile(profile: unknown) {
		posProfile.value = normalizeProfile(profile);
		customerProfileScope.value = getCustomerProfileScope(posProfile.value);
	}

	function setSelectedCustomer(name: string | null) {
		selectedCustomer.value = name || null;
	}

	function upsertCustomerSummaryFromInfo(info: CustomerInfo) {
		const customerName = getStringField(info, "name") || getStringField(info, "customer");
		if (!customerName) {
			return;
		}

		const existingIndex = customers.value.findIndex(
			(customer) => customer.name === customerName,
		);
		const existing =
			existingIndex >= 0 ? customers.value[existingIndex] : null;
		const summary: CustomerSummary = {
			...(existing || {}),
			...info,
			name: customerName,
			customer_name:
				getStringField(info, "customer_name") ||
				existing?.customer_name ||
				customerName,
		};
		const email = getStringField(info, "email_id");
		const mobile = getStringField(info, "mobile_no");
		const primaryAddress =
			getStringField(info, "primary_address") ||
			getStringField(info, "customer_address");
		const taxId = getStringField(info, "tax_id");
		if (email) summary.email_id = email;
		if (mobile) summary.mobile_no = mobile;
		if (primaryAddress) summary.primary_address = primaryAddress;
		if (taxId) summary.tax_id = taxId;

		if (existingIndex >= 0) {
			const updated = [...customers.value];
			updated.splice(existingIndex, 1, summary);
			customers.value = updated;
			clearCustomerSearchCache();
			return;
		}

		customers.value = [...customers.value, summary];
		clearCustomerSearchCache();
	}

	function setCustomerInfo(info: CustomerInfo) {
		customerInfo.value = info || {};
		upsertCustomerSummaryFromInfo(customerInfo.value);
		const customerName =
			getStringField(customerInfo.value, "name") ||
			getStringField(customerInfo.value, "customer");
		if (customerName) {
			void setCustomerStorage([{ ...customerInfo.value, name: customerName }]);
		}
		if (
			customerName &&
			posProfile.value?.company &&
			typeof info?.stored_value_balance !== "undefined"
		) {
			const totalCredit = Number(info.stored_value_balance || 0);
			saveStoredValueSnapshot(
				customerName,
				posProfile.value.company,
				totalCredit > 0
					? [
							{
								type: "Snapshot",
								credit_origin: "offline-customer-cache",
								total_credit: totalCredit,
								source_type: "Stored Value Snapshot",
							},
						]
					: [],
			);
		}
	}

	function requestCustomerRefresh() {
		refreshToken.value += 1;
	}

	function syncBootstrapCustomerReadiness(count: number | boolean) {
		refreshBootstrapSnapshotFromCacheState({
			customersCount: count,
		});
	}

	async function ensureCustomerScopeIsolation() {
		const currentScope =
			customerProfileScope.value || getCustomerProfileScope(posProfile.value);
		if (!currentScope) {
			return;
		}

		const storedScope = getStoredCustomerScope();
		if (storedScope === currentScope) {
			return;
		}

		await clearCustomerStorage();
		setCustomersLastSync(null);
		setStoredCustomerScope(currentScope);
		resetPagination();
		customersLoaded.value = false;
		loadProgress.value = 0;
		totalCustomerCount.value = 0;
		loadedCustomerCount.value = 0;
		nextCustomerStart.value = null;
		syncBootstrapCustomerReadiness(0);
	}

	async function performSearch({ append = false } = {}) {
		await ensureDatabase();

		const normalizedTerm = normalizeCustomerSearchTerm(searchTerm.value);

		if (normalizedTerm) {
			const offset = append ? page.value * MAX_CUSTOMER_SEARCH_RESULTS : 0;
			const results = await searchCustomerRows(
				normalizedTerm,
				MAX_CUSTOMER_SEARCH_RESULTS,
				offset,
			);

			if (append) {
				customers.value = [...customers.value, ...results];
			} else {
				customers.value = results;
			}

			hasMore.value = results.length === MAX_CUSTOMER_SEARCH_RESULTS;
			if (hasMore.value) {
				page.value += 1;
			}

			return results.length;
		}

		let collection = db.table("customers");
		const offset = page.value * PAGE_SIZE;
		const results = await collection
			.offset(offset)
			.limit(PAGE_SIZE)
			.toArray();

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

	async function searchCustomerRows(
		term: string,
		limit: number,
		offset: number,
	): Promise<CustomerSummary[]> {
		const normalized = normalizeCustomerSearchTerm(term);
		const cacheKey = `${customerProfileScope.value || "global"}:${normalized.toLowerCase()}:${limit}:${offset}`;
		const cached = customerSearchCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const memoryRows = Array.isArray(memory.customer_storage)
			? (memory.customer_storage as CustomerSummary[])
			: [];
		const memoryHasCompleteCustomerSet =
			memoryRows.length > 0 &&
			!nextCustomerStart.value &&
			(!totalCustomerCount.value || memoryRows.length >= totalCustomerCount.value);
		const memoryResults = rankCustomerRows(memoryRows, normalized, limit, offset);
		if (memoryHasCompleteCustomerSet) {
			customerSearchCache.set(cacheKey, memoryResults);
			trimCustomerSearchCache();
			return memoryResults;
		}

		if (normalized && memoryResults.length > 0) {
			customerSearchCache.set(cacheKey, memoryResults);
			trimCustomerSearchCache();
			return memoryResults;
		}

		const ranked = (await searchStoredCustomers({
			search: normalized,
			limit,
			offset,
		})) as CustomerSummary[];
		hydrateRuntimeCustomerCache(ranked);
		customerSearchCache.set(cacheKey, ranked);
		trimCustomerSearchCache();
		return ranked;
	}

	function rankCustomerRows(
		rows: CustomerSummary[],
		term: string,
		limit: number,
		offset: number,
	) {
		return rows
			.map((customer) => ({
				customer,
				score: scoreCustomerSearchMatch(customer, term),
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name))
			.slice(offset, offset + limit)
			.map((entry) => entry.customer);
	}

	function trimCustomerSearchCache() {
		while (customerSearchCache.size > 100) {
			const firstKey = customerSearchCache.keys().next().value;
			if (!firstKey) break;
			customerSearchCache.delete(firstKey);
		}
	}

	async function searchCustomers(term = "", append = false) {
		if (!append) {
			searchTerm.value = normalizeCustomerSearchTerm(term);
			resetPagination();
		}
		return performSearch({ append });
	}

	async function queueSearch(term: string) {
		const normalized = normalizeCustomerSearchTerm(term);
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

	function fetchCustomerPage(
		startAfter: string | null,
		modifiedAfter: string | null,
		limit: number,
	): Promise<CustomerSummary[]> {
		const serializedProfile = getSerializedProfile(posProfile.value);
		return new Promise((resolve, reject) => {
			if (!serializedProfile) {
				resolve([]);
				return;
			}
			frappe.call({
				method: "posawesome.posawesome.api.customers.get_customer_names",
				args: {
					pos_profile: serializedProfile,
					modified_after: modifiedAfter,
					limit,
					start_after: startAfter,
				},
				callback: (r: any) => resolve(r.message || []),
				error: (err: any) => {
					console.error("Failed to fetch customers", err);
					reject(err);
				},
			});
		});
	}

	async function backgroundLoadCustomers(
		startAfter: string | null,
		syncSince: string | null,
	) {
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
			let cursor: string | null = startAfter;
			while (cursor) {
				const rows: CustomerSummary[] = await fetchCustomerPage(
					cursor,
					syncSince,
					limit,
				);
				if (rows.length) {
					await setCustomerStorage(rows);
					clearCustomerSearchCache();
					loadedCustomerCount.value += rows.length;
					syncBootstrapCustomerReadiness(loadedCustomerCount.value);
					if (totalCustomerCount.value) {
						const progress = Math.min(
							100,
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
					syncBootstrapCustomerReadiness(loadedCustomerCount.value);
					logFinalLoadedCustomerCount();
				}
			}
		} catch (err) {
			console.error("Failed to background load customers", err);
		} finally {
			isCustomerBackgroundLoading.value = false;
			if (
				!nextCustomerStart.value &&
				customersLoaded.value &&
				loadProgress.value >= 99
			) {
				loadProgress.value = 100;
			}
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
			const response = await (frappe.call as any)({
				method: "posawesome.posawesome.api.customers.get_customers_count",
				args: { pos_profile: serializedProfile },
			});
			const serverCount = response.message || 0;
			logServerCustomerCount(serverCount);
			totalCustomerCount.value = serverCount;
			loadedCustomerCount.value = localCount;
			syncBootstrapCustomerReadiness(localCount);
			loadProgress.value = serverCount
				? Math.round((localCount / serverCount) * 100)
				: 0;

			if (serverCount > localCount) {
				const syncSince = getCustomersLastSync();
				const rows: CustomerSummary[] = await fetchCustomerPage(
					null,
					syncSince,
					PAGE_SIZE,
				);
				if (rows.length) {
					await setCustomerStorage(rows);
					clearCustomerSearchCache();
					loadedCustomerCount.value += rows.length;
					syncBootstrapCustomerReadiness(loadedCustomerCount.value);
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
					rows.length === PAGE_SIZE
						? rows[rows.length - 1]?.name || null
						: null;
				if (startAfter) {
					await backgroundLoadCustomers(startAfter, syncSince);
				} else {
					setCustomersLastSync(new Date().toISOString());
					loadProgress.value = 100;
					customersLoaded.value = true;
					syncBootstrapCustomerReadiness(loadedCustomerCount.value);
					logFinalLoadedCustomerCount();
				}
				await searchCustomers(searchTerm.value);
			} else if (serverCount < localCount) {
				await clearCustomerStorage();
				setCustomersLastSync(null);
				syncBootstrapCustomerReadiness(0);
				resetPagination();
				await load_customer_names_internal();
			} else {
				if (customersLoaded.value || localCount > 0) {
					logFinalLoadedCustomerCount();
				}
			}
		} catch (err) {
			console.error("Error verifying customer count:", err);
		}
	}

	async function load_customer_names_internal() {
		if (!posProfile.value) {
			console.debug("Customer fetch skipped: POS Profile not ready");
			return;
		}
		await ensureCustomerScopeIsolation();
		const serializedProfile = getSerializedProfile(posProfile.value);
		if (!serializedProfile) {
			return;
		}

		await ensureDatabase();
		const localCount = await getCustomerStorageCount();
		logLocalCustomerCount(localCount);
		syncBootstrapCustomerReadiness(localCount);

		if (localCount > 0) {
			const cachedRows = (await searchStoredCustomers({
				search: "",
				limit: PAGE_SIZE,
				offset: 0,
			})) as CustomerSummary[];
			if (cachedRows.length) {
				hydrateRuntimeCustomerCache(cachedRows);
				customers.value = cachedRows;
				loadedCustomerCount.value = Math.max(localCount, cachedRows.length);
			}
			customersLoaded.value = true;
			await searchCustomers(searchTerm.value);
			await verifyServerCustomerCount();
			if (!nextCustomerStart.value) {
				logFinalLoadedCustomerCount();
			}
			return;
		}

		let syncSince = getCustomersLastSync();
		// Ensure syncSince is a valid ISO string or null.
		if (
			!syncSince ||
			syncSince === "null" ||
			syncSince === "undefined" ||
			!syncSince.trim()
		) {
			syncSince = null;
		}

		loadProgress.value = 0;
		loadingCustomers.value = true;
		try {
			try {
				const countResponse = await (frappe.call as any)({
					method: "posawesome.posawesome.api.customers.get_customers_count",
					args: { pos_profile: serializedProfile },
				});
				totalCustomerCount.value = countResponse.message || 0;
				logServerCustomerCount(totalCustomerCount.value);
			} catch (err) {
				console.error("Failed to fetch customer count", err);
				totalCustomerCount.value = 0;
			}

			const rows: CustomerSummary[] = await fetchCustomerPage(
				null,
				syncSince,
				PAGE_SIZE,
			);

			if (rows.length) {
				await setCustomerStorage(rows);
				clearCustomerSearchCache();
			}
			loadedCustomerCount.value = rows.length;
			syncBootstrapCustomerReadiness(loadedCustomerCount.value);
			if (totalCustomerCount.value) {
				loadProgress.value = Math.min(
					100,
					Math.round(
						(loadedCustomerCount.value / totalCustomerCount.value) *
							100,
					),
				);
			}
			nextCustomerStart.value =
				rows.length === PAGE_SIZE
					? rows[rows.length - 1]?.name || null
					: null;
			if (nextCustomerStart.value) {
				backgroundLoadCustomers(nextCustomerStart.value, syncSince);
			} else {
				setCustomersLastSync(new Date().toISOString());
				loadProgress.value = 100;
				customersLoaded.value = true;
				syncBootstrapCustomerReadiness(loadedCustomerCount.value);
				logFinalLoadedCustomerCount();
			}
			customersLoaded.value = true;
		} catch (err) {
			console.error("Failed to fetch customers:", err);
		} finally {
			loadingCustomers.value = false;
			customersLoaded.value = true;
			await searchCustomers(searchTerm.value);
		}
	}

	async function get_customer_names() {
		if (customerFetchPromise) {
			return customerFetchPromise;
		}

		resetCustomerLoadLogState();
		customerFetchPromise = load_customer_names_internal().finally(() => {
			customerFetchPromise = null;
		});
		return customerFetchPromise;
	}

	async function addOrUpdateCustomer(customer: StoredCustomer) {
		if (!customer || !customer.name) {
			return;
		}
		const existingIndex = customers.value.findIndex(
			(c) => c.name === customer.name,
		);
		if (existingIndex !== -1) {
			const updated = [...customers.value];
			updated.splice(existingIndex, 1, customer);
			customers.value = updated;
		} else {
			customers.value = [...customers.value, customer];
		}
		await setCustomerStorage([customer]);
		clearCustomerSearchCache();
		syncBootstrapCustomerReadiness(Math.max(customers.value.length, 1));
		setSelectedCustomer(customer.name);
		requestCustomerRefresh();
	}

	async function reloadCustomers() {
		if (isOffline()) {
			console.warn("Cannot reload customers while offline");
			return;
		}

		resetCustomerLoadingCoordinator();
		clearLocalState();
		await clearCustomerStorage();
		clearCustomerSearchCache();
		setCustomersLastSync(null);
		syncBootstrapCustomerReadiness(0);

		await get_customer_names();

		if (posProfile.value && posProfile.value.customer) {
			setSelectedCustomer(posProfile.value.customer);
		}
		requestCustomerRefresh();
	}

	function openUpdateCustomerDialog(customer: StoredCustomer | null = null) {
		customerToUpdate.value = customer;
		isUpdateCustomerDialogOpen.value = true;
	}

	function closeUpdateCustomerDialog() {
		isUpdateCustomerDialogOpen.value = false;
		customerToUpdate.value = null;
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
		resetCustomerLoadLogState();
		clearCustomerSearchCache();
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
		reloadCustomers,
		clearLocalState,
		isUpdateCustomerDialogOpen,
		customerToUpdate,
		openUpdateCustomerDialog,
		closeUpdateCustomerDialog,
	};
});
