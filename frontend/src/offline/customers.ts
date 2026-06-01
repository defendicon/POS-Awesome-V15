import { checkDbHealth, db, isOffline, memory, persist } from "./db";
import {
	claimRetryableQueueEntries,
	clearWriteQueueEntries,
	deleteWriteQueueEntryByIndex,
	enqueueWriteQueueEntry,
	getQueuedPayloadCount,
	getQueuedPayloadSnapshots,
	markWriteQueueEntryFailed,
	markWriteQueueEntrySynced,
	refreshQueueMemory,
	updateQueuedPayloads,
	type OfflineEntityType,
} from "./writeQueue";

type AnyRecord = Record<string, any>;

const CUSTOMER_ENTITY: OfflineEntityType = "customer";
const CUSTOMER_SEARCH_WORKER_TIMEOUT_MS = 3000;

type CustomerSearchRequest = {
	search?: string;
	limit?: number;
	offset?: number;
};

let customerSearchWorker: Worker | null = null;
let customerSearchRequestId = 0;
const pendingCustomerSearchRequests = new Map<
	number,
	{
		resolve: (_customers: AnyRecord[] | null) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}
>();

function normalizeCustomerSearchTerm(term: string | null | undefined): string {
	return typeof term === "string" ? term.trim() : "";
}

function getCustomerSearchValues(customer: AnyRecord | null | undefined) {
	if (!customer) {
		return [];
	}

	return [
		customer.customer_name,
		customer.name,
		customer.mobile_no,
		customer.email_id,
		customer.tax_id,
	]
		.filter((value) => value !== null && value !== undefined)
		.map((value) => String(value).toLowerCase());
}

function customerMatchesSearchTerm(
	customer: AnyRecord | null | undefined,
	term: string | null | undefined,
) {
	const searchParts = normalizeCustomerSearchTerm(term)
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);

	if (!searchParts.length) {
		return true;
	}
	if (!customer) {
		return false;
	}

	const values = getCustomerSearchValues(customer);
	return searchParts.every((part) =>
		values.some((value) => value.includes(part)),
	);
}

function scoreCustomerSearchMatch(
	customer: AnyRecord | null | undefined,
	term: string | null | undefined,
) {
	const normalized = normalizeCustomerSearchTerm(term).toLowerCase();
	if (!normalized || !customer) {
		return normalized ? 0 : 1;
	}

	const values = getCustomerSearchValues(customer);
	if (!values.length) {
		return 0;
	}

	const customerName = String(customer.customer_name || "").toLowerCase();
	const id = String(customer.name || "").toLowerCase();
	const mobile = String(customer.mobile_no || "").toLowerCase();
	const email = String(customer.email_id || "").toLowerCase();
	const parts = normalized.split(/\s+/).filter(Boolean);

	if (!parts.every((part) => values.some((value) => value.includes(part)))) {
		return 0;
	}

	if (customerName === normalized) return 300;
	if (id === normalized) return 290;
	if (mobile === normalized) return 280;
	if (email === normalized) return 260;
	if (customerName.startsWith(normalized)) return 240;
	if (mobile.startsWith(normalized)) return 220;
	if (email.startsWith(normalized)) return 200;
	if (id.startsWith(normalized)) return 180;
	if (customerName.includes(normalized)) return 140;
	if (mobile.includes(normalized)) return 120;
	if (email.includes(normalized)) return 100;
	if (id.includes(normalized)) return 90;

	return 50;
}

function rankCustomerRows(
	rows: AnyRecord[],
	term: string,
	limit: number,
	offset: number,
) {
	const deduped = new Map<string, AnyRecord>();
	rows.forEach((row) => {
		const name = String(row?.name || "").trim();
		if (name && !deduped.has(name)) {
			deduped.set(name, row);
		}
	});

	return Array.from(deduped.values())
		.map((customer) => ({
			customer,
			score: scoreCustomerSearchMatch(customer, term),
		}))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name))
		.slice(offset, offset + limit)
		.map((entry) => entry.customer);
}

function getCustomerSearchWorker() {
	if (typeof Worker === "undefined") {
		return null;
	}
	if (customerSearchWorker) {
		return customerSearchWorker;
	}

	try {
		customerSearchWorker = new Worker(
			"/assets/posawesome/dist/js/posapp/workers/itemWorker.js",
			{ type: "classic" },
		);
		customerSearchWorker.onmessage = (event) => {
			const data = event.data || {};
			if (
				data.type !== "search_stored_customers_result" &&
				data.type !== "search_stored_customers_error"
			) {
				return;
			}

			const id = Number(data.id);
			const pending = pendingCustomerSearchRequests.get(id);
			if (!pending) {
				return;
			}

			clearTimeout(pending.timeoutId);
			pendingCustomerSearchRequests.delete(id);
			pending.resolve(
				data.type === "search_stored_customers_result" &&
					Array.isArray(data.customers)
					? data.customers
					: null,
			);
		};
		customerSearchWorker.onerror = () => {
			pendingCustomerSearchRequests.forEach((pending) => {
				clearTimeout(pending.timeoutId);
				pending.resolve(null);
			});
			pendingCustomerSearchRequests.clear();
			customerSearchWorker?.terminate();
			customerSearchWorker = null;
		};
		return customerSearchWorker;
	} catch {
		customerSearchWorker = null;
		return null;
	}
}

function searchStoredCustomersInWorker(
	payload: CustomerSearchRequest,
): Promise<AnyRecord[] | null> {
	const worker = getCustomerSearchWorker();
	if (!worker) {
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		const id = ++customerSearchRequestId;
		const timeoutId = setTimeout(() => {
			pendingCustomerSearchRequests.delete(id);
			resolve(null);
		}, CUSTOMER_SEARCH_WORKER_TIMEOUT_MS);

		pendingCustomerSearchRequests.set(id, { resolve, timeoutId });
		try {
			worker.postMessage({
				type: "search_stored_customers",
				id,
				payload,
			});
		} catch {
			clearTimeout(timeoutId);
			pendingCustomerSearchRequests.delete(id);
			resolve(null);
		}
	});
}

export async function saveOfflineCustomer(entry: AnyRecord) {
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (error) {
		console.error("Failed to serialize offline customer", error);
		throw error;
	}

	return enqueueWriteQueueEntry(CUSTOMER_ENTITY, cleanEntry);
}

export async function updateOfflineInvoicesCustomer(
	oldName: string,
	newName: string,
) {
	let updated = false;

	await updateQueuedPayloads("invoice", (payload) => {
		if (payload?.invoice?.customer === oldName) {
			payload.invoice.customer = newName;
			if (payload.invoice.customer_name) {
				payload.invoice.customer_name = newName;
			}
			updated = true;
		}
		return payload;
	});

	if (updated) {
		await refreshQueueMemory("invoice");
	}
}

export function getOfflineCustomers() {
	return getQueuedPayloadSnapshots(CUSTOMER_ENTITY);
}

export async function clearOfflineCustomers() {
	await clearWriteQueueEntries(CUSTOMER_ENTITY);
}

export async function deleteOfflineCustomer(index: number) {
	await deleteWriteQueueEntryByIndex(CUSTOMER_ENTITY, index);
}

export function getPendingOfflineCustomerCount() {
	return getQueuedPayloadCount(CUSTOMER_ENTITY);
}

export async function syncOfflineCustomers() {
	const customers = getOfflineCustomers();
	if (!customers.length) {
		return { pending: 0, synced: 0 };
	}
	if (isOffline()) {
		return { pending: customers.length, synced: 0 };
	}

	const claimedEntries = await claimRetryableQueueEntries(CUSTOMER_ENTITY);
	if (!claimedEntries.length) {
		return { pending: getPendingOfflineCustomerCount(), synced: 0 };
	}

	let synced = 0;

	for (const entry of claimedEntries) {
		const queuedCustomer = entry.payload;
		try {
			const result = await frappe.call({
				method: "posawesome.posawesome.api.customers.create_customer",
				args: queuedCustomer.args,
			});
			synced += 1;
			await markWriteQueueEntrySynced(
				CUSTOMER_ENTITY,
				Number(entry.queue_id),
				entry.last_attempt_at,
			);

			if (
				result &&
				result.message &&
				result.message.name &&
				result.message.name !== queuedCustomer.args.customer_name
			) {
				await updateOfflineInvoicesCustomer(
					queuedCustomer.args.customer_name,
					result.message.name,
				);
			}
		} catch (error) {
			console.error("Failed to create customer", error);
			await markWriteQueueEntryFailed(
				CUSTOMER_ENTITY,
				Number(entry.queue_id),
				error,
				entry.last_attempt_at,
			);
		}
	}

	return { pending: getPendingOfflineCustomerCount(), synced };
}

export function getCustomerStorage() {
	return memory.customer_storage || [];
}

export async function searchStoredCustomers({
	search = "",
	limit = 50,
	offset = 0,
}: CustomerSearchRequest = {}) {
	const normalized = normalizeCustomerSearchTerm(search);
	const safeLimit = Math.max(1, Number(limit) || 50);
	const safeOffset = Math.max(0, Number(offset) || 0);

	const workerCustomers = await searchStoredCustomersInWorker({
		search: normalized,
		limit: safeLimit,
		offset: safeOffset,
	});
	if (workerCustomers) {
		return workerCustomers;
	}

	try {
		await checkDbHealth();
		if (!db.isOpen()) {
			await db.open();
		}

		const table = db.table("customers");
		if (!normalized) {
			return await table.offset(safeOffset).limit(safeLimit).toArray();
		}

		const rowsByName = new Map<string, AnyRecord>();
		const candidateLimit = Math.max(safeLimit + safeOffset, safeLimit * 3);

		async function addRows(promiseFactory: () => Promise<AnyRecord[]>) {
			try {
				const rows = await promiseFactory();
				rows.forEach((row) => {
					if (row?.name) {
						rowsByName.set(row.name, row);
					}
				});
			} catch {
				// Older Dexie adapters may not expose every indexed query helper.
			}
		}

		const indexedFields = ["name", "customer_name", "mobile_no", "email_id"] as const;
		await Promise.all(
			indexedFields.map((field) =>
				addRows(async () => {
					const where = (table as any).where?.(field);
					if (!where?.startsWithIgnoreCase) return [];
					return await where
						.startsWithIgnoreCase(normalized)
						.limit(candidateLimit)
						.toArray();
				}),
			),
		);

		let ranked = rankCustomerRows(
			Array.from(rowsByName.values()),
			normalized,
			safeLimit,
			safeOffset,
		);
		if (ranked.length >= safeLimit) {
			return ranked;
		}

		await addRows(async () => {
			const filtered = (table as any).filter?.((customer: AnyRecord) =>
				customerMatchesSearchTerm(customer, normalized),
			);
			if (!filtered?.limit) return [];
			return await filtered.limit(candidateLimit).toArray();
		});

		ranked = rankCustomerRows(
			Array.from(rowsByName.values()),
			normalized,
			safeLimit,
			safeOffset,
		);
		return ranked;
	} catch (error) {
		console.error("Failed to search stored customers", error);
		return [];
	}
}

function mergeCustomerStorageRows(rows: AnyRecord[]) {
	const merged = new Map<string, AnyRecord>();
	const existingRows = Array.isArray(memory.customer_storage)
		? memory.customer_storage
		: [];

	existingRows.forEach((row) => {
		if (!row?.name) {
			return;
		}
		merged.set(row.name, row);
	});

	rows.forEach((row) => {
		if (!row?.name) {
			return;
		}
		merged.set(row.name, row);
	});

	return Array.from(merged.values());
}

export async function getStoredCustomer(customerName: string) {
	try {
		const customers = getCustomerStorage();
		const cachedCustomer = customers.find((c) => c.name === customerName);
		if (cachedCustomer) {
			return cachedCustomer;
		}

		await checkDbHealth();
		if (!db.isOpen()) {
			await db.open();
		}

		const storedCustomer = await db.table("customers").get(customerName);
		if (storedCustomer?.name) {
			memory.customer_storage = mergeCustomerStorageRows([storedCustomer]);
			return storedCustomer;
		}
		return null;
	} catch (error) {
		console.error("Failed to get stored customer", error);
		return null;
	}
}

export async function setCustomerStorage(customers: AnyRecord[]) {
	try {
		const existingByName = new Map<string, AnyRecord>();
		const existingRows = Array.isArray(memory.customer_storage)
			? memory.customer_storage
			: [];
		existingRows.forEach((row) => {
			if (row?.name) {
				existingByName.set(row.name, row);
			}
		});

		const clean = customers.flatMap((customer, index) => {
			const name = customer.name || customer.customer;
			if (!name) {
				const customerIdentifier =
					customer.id ?? customer.customerId ?? customer.customer_id ?? `row:${index}`;
				console.warn(
					"Skipping customer cache row without a name",
					{ customerIdentifier },
				);
				return [];
			}
			const existing = name ? existingByName.get(name) : null;
			return [
				{
					...customer,
					name,
					customer_name:
						customer.customer_name || customer.name || customer.customer,
					mobile_no: customer.mobile_no,
					email_id: customer.email_id,
					primary_address: customer.primary_address,
					tax_id: customer.tax_id,
					loyalty_program: customer.loyalty_program,
					loyalty_points:
						customer.loyalty_points !== undefined
							? customer.loyalty_points
							: existing?.loyalty_points,
					conversion_factor:
						customer.conversion_factor !== undefined
							? customer.conversion_factor
							: existing?.conversion_factor,
					stored_value_balance:
						customer.stored_value_balance ?? existing?.stored_value_balance ?? 0,
					stored_value_sources:
						customer.stored_value_sources ?? existing?.stored_value_sources ?? 0,
				},
			];
		});

		await db.table("customers").bulkPut(clean);
		memory.customer_storage = mergeCustomerStorageRows(clean);
	} catch (error) {
		console.error("Failed to save customers to storage", error);
	}
}

export async function deleteCustomerStorageByNames(names: string[]) {
	try {
		const normalizedNames = Array.from(
			new Set(
				(Array.isArray(names) ? names : [])
					.map((name) => String(name || "").trim())
					.filter(Boolean),
			),
		);
		if (!normalizedNames.length) {
			return;
		}
		await db.table("customers").bulkDelete(normalizedNames);
		const existingRows = Array.isArray(memory.customer_storage)
			? memory.customer_storage
			: [];
		memory.customer_storage = existingRows.filter(
			(row) => !normalizedNames.includes(String(row?.name || "").trim()),
		);
	} catch (error) {
		console.error("Failed to delete customers from storage", error);
	}
}

function getStoredValueSnapshotKey(customer: string, company: string) {
	return `${String(company || "").trim()}::${String(customer || "").trim()}`;
}

export function saveStoredValueSnapshot(
	customer: string,
	company: string,
	sources: AnyRecord[],
) {
	try {
		const key = getStoredValueSnapshotKey(customer, company);
		if (!key.trim() || !Array.isArray(sources)) {
			return;
		}
		const cleanSources = JSON.parse(JSON.stringify(sources));
		const availableAmount = cleanSources.reduce(
			(sum: number, row: AnyRecord) => sum + Number(row?.total_credit || 0),
			0,
		);
		const cache = memory.stored_value_snapshot_cache || {};
		cache[key] = {
			customer,
			company,
			sources: cleanSources,
			available_amount: availableAmount,
			source_count: cleanSources.length,
			timestamp: Date.now(),
		};
		memory.stored_value_snapshot_cache = cache;
		persist("stored_value_snapshot_cache");
	} catch (error) {
		console.error("Failed to cache stored value snapshot", error);
	}
}

export function getCachedStoredValueSnapshot(customer: string, company: string) {
	try {
		const key = getStoredValueSnapshotKey(customer, company);
		const cache = memory.stored_value_snapshot_cache || {};
		const cachedData = cache[key];
		if (cachedData) {
			const isValid =
				Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData : null;
		}
		return null;
	} catch (error) {
		console.error("Failed to get cached stored value snapshot", error);
		return null;
	}
}

export function clearStoredValueSnapshotCache() {
	try {
		memory.stored_value_snapshot_cache = {};
		persist("stored_value_snapshot_cache");
	} catch (error) {
		console.error("Failed to clear stored value snapshot cache", error);
	}
}

export function saveGiftCardSnapshot(giftCardCode: string, snapshot: AnyRecord) {
	try {
		const code = String(giftCardCode || "").trim().toUpperCase();
		if (!code) {
			return;
		}
		const cache = memory.gift_card_snapshot_cache || {};
		cache[code] = {
			...JSON.parse(JSON.stringify(snapshot || {})),
			timestamp: Date.now(),
		};
		memory.gift_card_snapshot_cache = cache;
		persist("gift_card_snapshot_cache");
	} catch (error) {
		console.error("Failed to cache gift card snapshot", error);
	}
}

export function getCachedGiftCardSnapshot(giftCardCode: string) {
	try {
		const code = String(giftCardCode || "").trim().toUpperCase();
		const cache = memory.gift_card_snapshot_cache || {};
		const cachedData = cache[code];
		if (cachedData) {
			const isValid =
				Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData : null;
		}
		return null;
	} catch (error) {
		console.error("Failed to get cached gift card snapshot", error);
		return null;
	}
}

export function clearGiftCardSnapshotCache() {
	try {
		memory.gift_card_snapshot_cache = {};
		persist("gift_card_snapshot_cache");
	} catch (error) {
		console.error("Failed to clear gift card snapshot cache", error);
	}
}

export function saveCustomerBalance(customer: string, balance: number, currency?: string) {
	try {
		const cache = memory.customer_balance_cache;
		cache[customer] = {
			balance,
			currency: currency || undefined,
			timestamp: Date.now(),
		};
		memory.customer_balance_cache = cache;
		persist("customer_balance_cache");
	} catch (error) {
		console.error("Failed to cache customer balance", error);
	}
}

export function getCachedCustomerBalance(customer: string) {
	try {
		const cache = memory.customer_balance_cache || {};
		const cachedData = cache[customer];
		if (cachedData) {
			const isValid =
				Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData : null;
		}
		return null;
	} catch (error) {
		console.error("Failed to get cached customer balance", error);
		return null;
	}
}

export function clearCustomerBalanceCache() {
	try {
		memory.customer_balance_cache = {};
		persist("customer_balance_cache");
	} catch (error) {
		console.error("Failed to clear customer balance cache", error);
	}
}

export function clearExpiredCustomerBalances() {
	try {
		const cache = memory.customer_balance_cache || {};
		const now = Date.now();
		const validCache: AnyRecord = {};

		Object.keys(cache).forEach((customer) => {
			const cachedData = cache[customer];
			if (cachedData && now - cachedData.timestamp < 24 * 60 * 60 * 1000) {
				validCache[customer] = cachedData;
			}
		});

		memory.customer_balance_cache = validCache;
		persist("customer_balance_cache");
	} catch (error) {
		console.error("Failed to clear expired customer balances", error);
	}
}
