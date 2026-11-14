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
	buildCustomerSearchParts,
	buildCustomerMobileSearchKeys,
	customerMobileMatchesSearch,
	customerMatchesSearchParts,
	customerMatchesSearchTerm,
	getCustomerDuplicateFields,
	isCustomerMobileSearchTerm,
	normalizeCustomerSearchTerm,
} from "./customers/customerSearch";
import { resetCustomerLoadingCoordinator } from "../modules/customers/customerLoadingCoordinator";
// @ts-ignore
import {
	db,
	checkDbHealth,
	setCustomerStorage,
	saveStoredValueSnapshot,
	memoryInitPromise,
	getCustomersLastSync,
	setCustomersLastSync,
	getCustomerStorageCount,
	clearCustomerStorage,
	isOffline,
	refreshBootstrapSnapshotFromCacheState,
} from "../../offline/index";

const PAGE_SIZE = 200;
const CUSTOMER_SYNC_CONCURRENCY = 5;
const CUSTOMER_PROGRESS_YIELD_INTERVAL = 50;
const CUSTOMER_SCOPE_STORAGE_KEY = "posa_customers_profile_scope";

const yieldCustomerProgress = () =>
	new Promise<void>((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => resolve());
			return;
		}
		setTimeout(resolve, 0);
	});

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
			typeof (typedProfile.pos_profile as { name?: unknown }).name ===
				"string"
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
	const nextCustomerOffset = ref(0);
	const loadingCustomers = ref(false);
	const searchingCustomers = ref(false);
	const customersLoaded = ref(false);
	const isCustomerBackgroundLoading = ref(false);
	const loadProgress = ref(0);
	const totalCustomerCount = ref(0);
	const loadedCustomerCount = ref(0);
	const posProfile = ref<POSProfile | null>(null);
	const customerProfileScope = ref("");
	const refreshToken = ref(0);
	const isUpdateCustomerDialogOpen = ref(false);
	const customerToUpdate = ref<StoredCustomer | null>(null);
	let customerFetchPromise: Promise<void> | null = null;
	let customerSearchRequestId = 0;
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
		const count = Number(
			loadedCustomerCount.value || customers.value.length || 0,
		);
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

	function setPosProfile(profile: unknown) {
		posProfile.value = normalizeProfile(profile);
		customerProfileScope.value = getCustomerProfileScope(posProfile.value);
	}

	function setSelectedCustomer(name: string | null) {
		selectedCustomer.value = name || null;
	}

	function upsertCustomerSummaryFromInfo(info: CustomerInfo) {
		const customerName =
			getStringField(info, "name") || getStringField(info, "customer");
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
			return;
		}

		customers.value = [...customers.value, summary];
	}

	function setCustomerInfo(info: CustomerInfo) {
		customerInfo.value = info || {};
		upsertCustomerSummaryFromInfo(customerInfo.value);
		const customerName =
			getStringField(customerInfo.value, "name") ||
			getStringField(customerInfo.value, "customer");
		if (customerName) {
			void setCustomerStorage([
				{ ...customerInfo.value, name: customerName },
			]);
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

	async function ensureCustomerScopeIsolation(localOnly: boolean) {
		const currentScope =
			customerProfileScope.value ||
			getCustomerProfileScope(posProfile.value);
		if (!currentScope) {
			return true;
		}

		const storedScope = getStoredCustomerScope();
		if (storedScope === currentScope) {
			return true;
		}

		if (localOnly) {
			resetPagination();
			return false;
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
		nextCustomerOffset.value = 0;
		syncBootstrapCustomerReadiness(0);
		return true;
	}

	async function fetchServerCustomerMatches(
		term: string,
	): Promise<CustomerSummary[]> {
		if (!posProfile.value || isOffline()) {
			return [];
		}
		const serializedProfile = getSerializedProfile(posProfile.value);
		if (!serializedProfile) {
			return [];
		}

		return new Promise((resolve) => {
			frappe.call({
				method: "posawesome.posawesome.api.customers.search_customers",
				args: {
					pos_profile: serializedProfile,
					search_term: term,
					limit: PAGE_SIZE,
				},
				callback: (response: any) => resolve(response.message || []),
				error: (error: any) => {
					console.error(
						"Failed to search customers on the server",
						error,
					);
					resolve([]);
				},
			});
		});
	}

	async function searchIndexedMobileCustomers(
		term: string,
		requestedPage: number,
	): Promise<CustomerSummary[]> {
		const searchKeys = buildCustomerMobileSearchKeys(term);
		if (!searchKeys.length) {
			return [];
		}
		const requestedLimit = (requestedPage + 1) * PAGE_SIZE;
		const mobilePages = await Promise.all(
			searchKeys.map((key) =>
				db
					.table("customers")
					.where("_mobile_search_keys")
					.startsWith(key)
					.limit(requestedLimit)
					.toArray(),
			),
		);
		const identifierPages = await Promise.all(
			["name", "customer_name", "tax_id"].map((field) =>
				db
					.table("customers")
					.where(field)
					.startsWith(term)
					.limit(requestedLimit)
					.toArray(),
			),
		);
		const normalizedMatches = await db
			.table("customers")
			.filter((customer: CustomerSummary) =>
				customerMatchesSearchTerm(customer, term),
			)
			.limit(requestedLimit)
			.toArray();
		const uniqueMatches = new Map<string, CustomerSummary>();
		mobilePages.flat().forEach((customer: CustomerSummary) => {
			if (
				customer?.name &&
				customerMobileMatchesSearch(customer.mobile_no, term)
			) {
				uniqueMatches.set(customer.name, customer);
			}
		});
		identifierPages.flat().forEach((customer: CustomerSummary) => {
			if (customer?.name && customerMatchesSearchTerm(customer, term)) {
				uniqueMatches.set(customer.name, customer);
			}
		});
		normalizedMatches.forEach((customer: CustomerSummary) => {
			if (customer?.name) {
				uniqueMatches.set(customer.name, customer);
			}
		});
		return Array.from(uniqueMatches.values())
			.sort((left, right) => left.name.localeCompare(right.name))
			.slice(requestedPage * PAGE_SIZE, requestedLimit);
	}

	async function performSearch({ append = false, allowRemote = false } = {}) {
		const requestId = ++customerSearchRequestId;
		const requestedTerm = normalizeCustomerSearchTerm(searchTerm.value);
		const requestedPage = page.value;
		if (!append) {
			searchingCustomers.value = true;
		}

		try {
			await ensureDatabase();
			const scope = customerProfileScope.value;
			if (scope && getStoredCustomerScope() !== scope) return 0;
			let results: CustomerSummary[];
			const isMobileSearch =
				isCustomerMobileSearchTerm(requestedTerm) &&
				buildCustomerMobileSearchKeys(requestedTerm).length > 0;
			if (isMobileSearch) {
				results = await searchIndexedMobileCustomers(
					requestedTerm,
					requestedPage,
				);
			} else {
				let collection = db.table("customers");
				if (requestedTerm) {
					const searchParts = buildCustomerSearchParts(requestedTerm);
					collection = collection.filter(
						(customer: CustomerSummary) =>
							customerMatchesSearchParts(customer, searchParts),
					);
				}
				const offset = requestedPage * PAGE_SIZE;
				results = await collection
					.offset(offset)
					.limit(PAGE_SIZE)
					.toArray();
			}

			if (!append && allowRemote && Boolean(requestedTerm)) {
				const remoteResults =
					await fetchServerCustomerMatches(requestedTerm);
				if (remoteResults.length) {
					await setCustomerStorage(remoteResults);
					const mergedResults = new Map<string, CustomerSummary>();
					[...results, ...remoteResults].forEach((customer) => {
						if (customer?.name) {
							mergedResults.set(customer.name, customer);
						}
					});
					results = Array.from(mergedResults.values())
						.sort((left, right) =>
							left.name.localeCompare(right.name),
						)
						.slice(0, PAGE_SIZE);
				}
			}

			// IndexedDB searches can overlap while the cashier is typing or while a
			// background sync publishes a new batch. Only the latest request may
			// replace the selector results.
			if (
				requestId !== customerSearchRequestId ||
				requestedTerm !== normalizeCustomerSearchTerm(searchTerm.value)
			) {
				return 0;
			}

			if (append) {
				customers.value = [...customers.value, ...results];
			} else {
				customers.value = results;
			}

			hasMore.value = results.length === PAGE_SIZE;
			if (hasMore.value) {
				page.value = requestedPage + 1;
			}

			return results.length;
		} finally {
			if (!append && requestId === customerSearchRequestId) {
				searchingCustomers.value = false;
			}
		}
	}

	async function searchCustomers(
		term = "",
		append = false,
		allowRemote = false,
	) {
		if (!append) {
			searchTerm.value = normalizeCustomerSearchTerm(term);
			page.value = 0;
			hasMore.value = true;
		}
		return performSearch({ append, allowRemote });
	}

	async function queueSearch(term: string) {
		const normalized = normalizeCustomerSearchTerm(term);
		return searchCustomers(normalized, false, true);
	}

	async function findLocalDuplicateCustomers(
		candidate: Partial<CustomerSummary>,
		excludeCustomer: string | null = null,
	) {
		await ensureDatabase();
		const allowDuplicateNames = Boolean(
			(
				posProfile.value as POSProfile & {
					posa_allow_duplicate_customer_names?: boolean | number;
				}
			)?.posa_allow_duplicate_customer_names,
		);
		const results = await db
			.table("customers")
			.filter((customer: CustomerSummary) => {
				if (excludeCustomer && customer.name === excludeCustomer) {
					return false;
				}
				return Boolean(
					getCustomerDuplicateFields(
						customer,
						candidate,
						!allowDuplicateNames,
					).length,
				);
			})
			.limit(5)
			.toArray();
		return results.map((customer: CustomerSummary) => ({
			...customer,
			matching_fields: getCustomerDuplicateFields(
				customer,
				candidate,
				!allowDuplicateNames,
			),
		}));
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
		offset: number | null = null,
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
					offset,
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
		_startAfter: string | null,
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
		const updateProgress = (count: number) => {
			loadedCustomerCount.value = totalCustomerCount.value
				? Math.min(totalCustomerCount.value, count)
				: count;
			if (totalCustomerCount.value > 0) {
				loadProgress.value = Math.min(
					99,
					Math.round(
						(loadedCustomerCount.value / totalCustomerCount.value) *
							100,
					),
				);
			}
		};
		const publishProgress = async (
			previousCount: number,
			batchSize: number,
		) => {
			for (let index = 1; index <= batchSize; index += 1) {
				updateProgress(previousCount + index);
				if (
					index % CUSTOMER_PROGRESS_YIELD_INTERVAL === 0 ||
					index === batchSize
				) {
					await yieldCustomerProgress();
				}
			}
		};
		const fetchWave = async (waveOffset: number) =>
			await Promise.all(
				Array.from(
					{ length: CUSTOMER_SYNC_CONCURRENCY },
					(_, index) => waveOffset + index * limit,
				).map(async (offset) => ({
					offset,
					rows: await fetchCustomerPage(
						null,
						syncSince,
						limit,
						offset,
					),
				})),
			);
		const prepareWave = async (
			results: Array<{ offset: number; rows: CustomerSummary[] }>,
		) => {
			const pages: CustomerSummary[][] = [];
			let reachedEnd = false;
			for (const { rows } of results) {
				if (rows.length > 0) {
					pages.push(rows);
				}
				reachedEnd = rows.length < limit;
				if (reachedEnd) break;
			}
			const rows = pages.flat();
			if (rows.length > 0) {
				await setCustomerStorage(rows);
				if (normalizeCustomerSearchTerm(searchTerm.value)) {
					await searchCustomers(searchTerm.value);
				}
			}
			return { rows, reachedEnd };
		};
		try {
			let waveOffset = nextCustomerOffset.value;
			let pendingPreparedWave = fetchWave(waveOffset).then(prepareWave);
			while (true) {
				const { rows, reachedEnd } = await pendingPreparedWave;
				const previousCount = loadedCustomerCount.value;
				const nextWaveOffset =
					waveOffset + CUSTOMER_SYNC_CONCURRENCY * limit;
				const nextPreparedWave = !reachedEnd
					? fetchWave(nextWaveOffset).then(prepareWave)
					: null;

				if (rows.length > 0) {
					nextCustomerStart.value =
						rows[rows.length - 1]?.name || null;
					nextCustomerOffset.value = nextWaveOffset;
					await publishProgress(previousCount, rows.length);
					syncBootstrapCustomerReadiness(loadedCustomerCount.value);
					if (customers.value.length === 0) {
						await searchCustomers(searchTerm.value);
					}
				}

				if (reachedEnd) {
					nextCustomerStart.value = null;
					nextCustomerOffset.value = 0;
					setCustomersLastSync(new Date().toISOString());
					loadProgress.value = 100;
					customersLoaded.value = true;
					syncBootstrapCustomerReadiness(loadedCustomerCount.value);
					logFinalLoadedCustomerCount();
					break;
				}

				waveOffset = nextWaveOffset;
				pendingPreparedWave = nextPreparedWave!;
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
					nextCustomerOffset.value = PAGE_SIZE;
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

	async function load_customer_names_internal(localOnly = false) {
		if (!posProfile.value) {
			console.debug("Customer fetch skipped: POS Profile not ready");
			return;
		}
		const offlineLoad = localOnly || isOffline();
		if (!(await ensureCustomerScopeIsolation(offlineLoad))) {
			customersLoaded.value = true;
			return;
		}
		const serializedProfile = getSerializedProfile(posProfile.value);
		if (!serializedProfile) {
			return;
		}

		await ensureDatabase();
		const localCount = await getCustomerStorageCount();
		logLocalCustomerCount(localCount);
		syncBootstrapCustomerReadiness(localCount);

		if (localCount > 0) {
			customersLoaded.value = true;
			await searchCustomers(searchTerm.value);
			if (!offlineLoad) await verifyServerCustomerCount();
			if (!nextCustomerStart.value) {
				logFinalLoadedCustomerCount();
			}
			return;
		}

		if (offlineLoad || isOffline()) {
			await searchCustomers(searchTerm.value);
			customersLoaded.value = true;
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
				nextCustomerOffset.value = PAGE_SIZE;
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

	async function get_customer_names(localOnly = false) {
		if (customerFetchPromise) {
			return customerFetchPromise;
		}

		resetCustomerLoadLogState();
		customerFetchPromise = load_customer_names_internal(localOnly).finally(() => {
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
		nextCustomerOffset.value = 0;
		resetCustomerLoadLogState();
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
		nextCustomerOffset,
		loadingCustomers,
		searchingCustomers,
		customersLoaded,
		isCustomerBackgroundLoading,
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
		findLocalDuplicateCustomers,
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
