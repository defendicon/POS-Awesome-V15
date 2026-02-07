import { memory, persist, isOffline, db } from "./db.js";

export function saveOfflineCustomer(entry) {
	const key = "offline_customers";
	const entries = memory.offline_customers;
	// Serialize to avoid storing reactive objects that IndexedDB
	// cannot clone.
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline customer", e);
		throw e;
	}
	entries.push(cleanEntry);
	memory.offline_customers = entries;
	persist(key);
}

export function updateOfflineInvoicesCustomer(oldName, newName) {
	let updated = false;
	const invoices = memory.offline_invoices || [];
	invoices.forEach((inv) => {
		if (inv.invoice && inv.invoice.customer === oldName) {
			inv.invoice.customer = newName;
			if (inv.invoice.customer_name) {
				inv.invoice.customer_name = newName;
			}
			updated = true;
		}
	});
	if (updated) {
		memory.offline_invoices = invoices;
		persist("offline_invoices");
	}
}

export function getOfflineCustomers() {
	return memory.offline_customers;
}

export function clearOfflineCustomers() {
	memory.offline_customers = [];
	persist("offline_customers");
}

export async function syncOfflineCustomers() {
	const customers = getOfflineCustomers();
	if (!customers.length) {
		return { pending: 0, synced: 0 };
	}
	if (isOffline()) {
		return { pending: customers.length, synced: 0 };
	}

	const failures = [];
	let synced = 0;

	for (const cust of customers) {
		try {
			const result = await frappe.call({
				method: "posawesome.posawesome.api.customers.create_customer",
				args: cust.args,
			});
			synced++;
			if (
				result &&
				result.message &&
				result.message.name &&
				result.message.name !== cust.args.customer_name
			) {
				updateOfflineInvoicesCustomer(cust.args.customer_name, result.message.name);
			}
		} catch (error) {
			console.error("Failed to create customer", error);
			failures.push(cust);
		}
	}

	if (failures.length) {
		memory.offline_customers = failures;
		persist("offline_customers");
	} else {
		clearOfflineCustomers();
	}

	return { pending: failures.length, synced };
}

export function getCustomerStorage() {
	return memory.customer_storage || [];
}

export async function getStoredCustomer(customerName) {
	try {
		const customers = getCustomerStorage();
		return customers.find((c) => c.name === customerName) || null;
	} catch (e) {
		console.error("Failed to get stored customer", e);
		return null;
	}
}

export async function setCustomerStorage(customers) {
	try {
		const clean = customers.map((c) => ({
			name: c.name,
			customer_name: c.customer_name,
			mobile_no: c.mobile_no,
			email_id: c.email_id,
			primary_address: c.primary_address,
			tax_id: c.tax_id,
		}));

		await db.table("customers").bulkPut(clean);
		memory.customer_storage = clean;
	} catch (e) {
		console.error("Failed to save customers to storage", e);
		memory.customer_storage = [];
	}
	persist("customer_storage");
}

export function saveCustomerBalance(customer, balance) {
	try {
		const cache = memory.customer_balance_cache;
		cache[customer] = {
			balance: balance,
			timestamp: Date.now(),
		};
		memory.customer_balance_cache = cache;
		persist("customer_balance_cache");
	} catch (e) {
		console.error("Failed to cache customer balance", e);
	}
}

export function getCachedCustomerBalance(customer) {
	try {
		const cache = memory.customer_balance_cache || {};
		const cachedData = cache[customer];
		if (cachedData) {
			const isValid = Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData.balance : null;
		}
		return null;
	} catch (e) {
		console.error("Failed to get cached customer balance", e);
		return null;
	}
}

export function clearCustomerBalanceCache() {
	try {
		memory.customer_balance_cache = {};
		persist("customer_balance_cache");
	} catch (e) {
		console.error("Failed to clear customer balance cache", e);
	}
}

export function clearExpiredCustomerBalances() {
	try {
		const cache = memory.customer_balance_cache || {};
		const now = Date.now();
		const validCache = {};

		Object.keys(cache).forEach((customer) => {
			const cachedData = cache[customer];
			if (cachedData && now - cachedData.timestamp < 24 * 60 * 60 * 1000) {
				validCache[customer] = cachedData;
			}
		});

		memory.customer_balance_cache = validCache;
		persist("customer_balance_cache");
	} catch (e) {
		console.error("Failed to clear expired customer balances", e);
	}
}
