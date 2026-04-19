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
		const clean = customers.map((customer) => ({
			name: customer.name,
			customer_name: customer.customer_name,
			mobile_no: customer.mobile_no,
			email_id: customer.email_id,
			primary_address: customer.primary_address,
			tax_id: customer.tax_id,
			stored_value_balance: customer.stored_value_balance || 0,
			stored_value_sources: customer.stored_value_sources || 0,
		}));

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

export function saveCustomerBalance(customer: string, balance: number) {
	try {
		const cache = memory.customer_balance_cache;
		cache[customer] = {
			balance,
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
			return isValid ? cachedData.balance : null;
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
