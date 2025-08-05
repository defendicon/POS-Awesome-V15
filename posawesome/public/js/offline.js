import Dexie from "dexie/dist/dexie.mjs";

// --- Dexie initialization ---------------------------------------------------
const db = new Dexie("posawesome_offline");
db.version(1).stores({ keyval: "&key" });

let persistWorker = null;
if (typeof Worker !== "undefined") {
	try {
		// Use the plain URL so the service worker cache matches when offline
		const workerUrl = "/assets/posawesome/js/posapp/workers/itemWorker.js";
		persistWorker = new Worker(workerUrl, { type: "classic" });
	} catch (e) {
		console.error("Failed to init persist worker", e);
		persistWorker = null;
	}
}

// Add stock_cache_ready flag to memory object
const memory = {
	offline_invoices: [],
	offline_customers: [],
	offline_payments: [],
	pos_last_sync_totals: { pending: 0, synced: 0, drafted: 0 },
	uom_cache: {},
	offers_cache: [],
	customer_balance_cache: {},
	local_stock_cache: {},
	stock_cache_ready: false, // New flag to track if stock cache is initialized
	customer_storage: [],
	pos_opening_storage: null,
	opening_dialog_storage: null,
	sales_persons_storage: [],
	price_list_cache: {},
	item_details_cache: {},
	tax_template_cache: {},
	tax_inclusive: false,
	manual_offline: false,
};

// Flag to avoid concurrent invoice syncs which can cause duplicate submissions
let invoiceSyncInProgress = false;

// Modify initializeStockCache function to set the flag
export async function initializeStockCache(items, pos_profile) {
	try {
		const existingCache = memory.local_stock_cache || {};
		const missingItems = Array.isArray(items) ? items.filter((it) => !existingCache[it.item_code]) : [];

		if (missingItems.length === 0) {
			if (!memory.stock_cache_ready) {
				memory.stock_cache_ready = true;
				persist("stock_cache_ready");
			}
			console.debug("Stock cache already initialized");
			console.info("Stock cache initialized with", Object.keys(existingCache).length, "items");
			return true;
		}

		console.info("Initializing stock cache for", missingItems.length, "new items");

		const updatedItems = await fetchItemStockQuantities(missingItems, pos_profile);

		if (updatedItems && updatedItems.length > 0) {
			updatedItems.forEach((item) => {
				if (item.actual_qty !== undefined) {
					existingCache[item.item_code] = {
						actual_qty: item.actual_qty,
						last_updated: new Date().toISOString(),
					};
				}
			});

			memory.local_stock_cache = existingCache;
			memory.stock_cache_ready = true;
			persist("local_stock_cache");
			persist("stock_cache_ready");
			console.info("Stock cache initialized with", Object.keys(existingCache).length, "items");
			return true;
		}
		return false;
	} catch (error) {
		console.error("Failed to initialize stock cache:", error);
		return false;
	}
}

// Add getter and setter for stock_cache_ready flag
export function isStockCacheReady() {
	return memory.stock_cache_ready || false;
}

export function setStockCacheReady(ready) {
	memory.stock_cache_ready = ready;
	persist("stock_cache_ready");
}

export const initPromise = new Promise((resolve) => {
	const init = async () => {
		try {
			await db.open();
			for (const key of Object.keys(memory)) {
				const stored = await db.table("keyval").get(key);
				if (stored && stored.value !== undefined) {
					memory[key] = stored.value;
					continue;
				}
				if (typeof localStorage !== "undefined") {
					const ls = localStorage.getItem(`posa_${key}`);
					if (ls) {
						try {
							memory[key] = JSON.parse(ls);
							continue;
						} catch (err) {
							console.error("Failed to parse localStorage for", key, err);
						}
					}
				}
			}
		} catch (e) {
			console.error("Failed to initialize offline DB", e);
		} finally {
			resolve();
		}
	};

	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(init);
	} else {
		setTimeout(init, 0);
	}
});

function persist(key) {
	if (persistWorker) {
		let clean = memory[key];
		try {
			clean = JSON.parse(JSON.stringify(memory[key]));
		} catch (e) {
			console.error("Failed to serialize", key, e);
		}
		persistWorker.postMessage({ type: "persist", key, value: clean });
		return;
	}
	db.table("keyval")
		.put({ key, value: memory[key] })
		.catch((e) => console.error(`Failed to persist ${key}`, e));

	if (typeof localStorage !== "undefined") {
		try {
			localStorage.setItem(`posa_${key}`, JSON.stringify(memory[key]));
		} catch (err) {
			console.error("Failed to persist", key, "to localStorage", err);
		}
	}
}

// Reset cached invoices and customers after syncing
// but preserve the stock cache so offline validation
// still has access to the last known quantities
export function resetOfflineState() {
	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };

	persist("offline_invoices");
	persist("offline_customers");
	persist("offline_payments");
	persist("pos_last_sync_totals");
}

export function reduceCacheUsage() {
	memory.price_list_cache = {};
	memory.item_details_cache = {};
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.coupons_cache = {};
	memory.item_groups_cache = [];
	persist("price_list_cache");
	persist("item_details_cache");
	persist("uom_cache");
	persist("offers_cache");
	persist("customer_balance_cache");
	persist("local_stock_cache");
	persist("stock_cache_ready");
	persist("coupons_cache");
	persist("item_groups_cache");
}

// Add new validation function
export function validateStockForOfflineInvoice(items) {
	const allowNegativeStock = memory.pos_opening_storage?.stock_settings?.allow_negative_stock;
	if (allowNegativeStock) {
		return { isValid: true, invalidItems: [], errorMessage: "" };
	}

	const stockCache = memory.local_stock_cache || {};
	const invalidItems = [];

	items.forEach((item) => {
		const itemCode = item.item_code;
		const requestedQty = Math.abs(item.qty || 0);
		const currentStock = stockCache[itemCode]?.actual_qty || 0;

		if (currentStock - requestedQty < 0) {
			invalidItems.push({
				item_code: itemCode,
				item_name: item.item_name || itemCode,
				requested_qty: requestedQty,
				available_qty: currentStock,
			});
		}
	});

	// Create clean error message
	let errorMessage = "";
	if (invalidItems.length === 1) {
		const item = invalidItems[0];
		errorMessage = `Not enough stock for ${item.item_name}. You need ${item.requested_qty} but only ${item.available_qty} available.`;
	} else if (invalidItems.length > 1) {
		errorMessage =
			"Insufficient stock for multiple items:\n" +
			invalidItems
				.map((item) => `• ${item.item_name}: Need ${item.requested_qty}, Have ${item.available_qty}`)
				.join("\n");
	}

	return {
		isValid: invalidItems.length === 0,
		invalidItems: invalidItems,
		errorMessage: errorMessage,
	};
}

export function saveOfflineInvoice(entry) {
	// Validate that invoice has items before saving
	if (!entry.invoice || !Array.isArray(entry.invoice.items) || !entry.invoice.items.length) {
		throw new Error("Cart is empty. Add items before saving.");
	}

	const validation = validateStockForOfflineInvoice(entry.invoice.items);
	if (!validation.isValid) {
		throw new Error(validation.errorMessage);
	}

	const key = "offline_invoices";
	const entries = memory.offline_invoices;
	// Clone the entry before storing to strip Vue reactivity
	// and other non-serializable properties. IndexedDB only
	// supports structured cloneable data, so reactive proxies
	// cause a DataCloneError without this step.
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline invoice", e);
		throw e;
	}

	entries.push(cleanEntry);
	memory.offline_invoices = entries;
	persist(key);

	// Update local stock quantities
	if (entry.invoice && entry.invoice.items) {
		updateLocalStock(entry.invoice.items);
	}
}

export function isOffline() {
	if (typeof window === "undefined") {
		// Not in a browser (SSR/Node), assume online (or handle explicitly if needed)
		return memory.manual_offline || false;
	}

	const { protocol, hostname, navigator } = window;
	const online = navigator.onLine;

	const serverOnline = typeof window.serverOnline === "boolean" ? window.serverOnline : true;

	const isIpAddress = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
	const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
	const isDnsName = !isIpAddress && !isLocalhost;

	if (memory.manual_offline) {
		return true;
	}

	if (protocol === "https:" && isDnsName) {
		return !online || !serverOnline;
	}

	return !online || !serverOnline;
}

export function getOfflineInvoices() {
	return memory.offline_invoices;
}

export function clearOfflineInvoices() {
	memory.offline_invoices = [];
	persist("offline_invoices");
}

export function deleteOfflineInvoice(index) {
	if (Array.isArray(memory.offline_invoices) && index >= 0 && index < memory.offline_invoices.length) {
		memory.offline_invoices.splice(index, 1);
		persist("offline_invoices");
	}
}

export function getPendingOfflineInvoiceCount() {
	return memory.offline_invoices.length;
}

export function saveOfflinePayment(entry) {
	const key = "offline_payments";
	const entries = memory.offline_payments;
	// Strip down POS Profile to essential fields to avoid
	// serialization errors from complex reactive objects
	if (entry?.args?.payload?.pos_profile) {
		const profile = entry.args.payload.pos_profile;
		entry.args.payload.pos_profile = {
			posa_use_pos_awesome_payments: profile.posa_use_pos_awesome_payments,
			posa_allow_make_new_payments: profile.posa_allow_make_new_payments,
			posa_allow_reconcile_payments: profile.posa_allow_reconcile_payments,
			posa_allow_mpesa_reconcile_payments: profile.posa_allow_mpesa_reconcile_payments,
			cost_center: profile.cost_center,
			posa_cash_mode_of_payment: profile.posa_cash_mode_of_payment,
			name: profile.name,
		};
	}
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline payment", e);
		throw e;
	}
	entries.push(cleanEntry);
	memory.offline_payments = entries;
	persist(key);
}

export function getOfflinePayments() {
	return memory.offline_payments;
}

export function clearOfflinePayments() {
	memory.offline_payments = [];
	persist("offline_payments");
}

export function deleteOfflinePayment(index) {
	if (Array.isArray(memory.offline_payments) && index >= 0 && index < memory.offline_payments.length) {
		memory.offline_payments.splice(index, 1);
		persist("offline_payments");
	}
}

export function getPendingOfflinePaymentCount() {
	return memory.offline_payments.length;
}

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

export function setLastSyncTotals(totals) {
	memory.pos_last_sync_totals = totals;
	persist("pos_last_sync_totals");
}

export function getLastSyncTotals() {
	return memory.pos_last_sync_totals;
}

export function getTaxInclusiveSetting() {
	return !!memory.tax_inclusive;
}

export function setTaxInclusiveSetting(value) {
	memory.tax_inclusive = !!value;
	persist("tax_inclusive");
}

// Add sync function to clear local cache when invoices are successfully synced
export async function syncOfflineInvoices() {
	// Prevent concurrent syncs which can lead to duplicate submissions
	if (invoiceSyncInProgress) {
		return { pending: getPendingOfflineInvoiceCount(), synced: 0, drafted: 0 };
	}
	invoiceSyncInProgress = true;
	try {
		// Ensure any offline customers are synced first so that invoices
		// referencing them do not fail during submission
		await syncOfflineCustomers();

		const invoices = getOfflineInvoices();
		if (!invoices.length) {
			// No invoices to sync; clear last totals to avoid repeated messages
			const totals = { pending: 0, synced: 0, drafted: 0 };
			setLastSyncTotals(totals);
			return totals;
		}
		if (isOffline()) {
			// When offline just return the pending count without attempting a sync
			return { pending: invoices.length, synced: 0, drafted: 0 };
		}

		const failures = [];
		let synced = 0;
		let drafted = 0;

		for (const inv of invoices) {
			try {
				await frappe.call({
					method: "posawesome.posawesome.api.posapp.submit_invoice",
					args: {
						invoice: inv.invoice,
						data: inv.data,
					},
				});
				synced++;
			} catch (error) {
				console.error("Failed to submit invoice, saving as draft", error);
				try {
					await frappe.call({
						method: "posawesome.posawesome.api.posapp.update_invoice",
						args: { data: inv.invoice },
					});
					drafted += 1;
				} catch (draftErr) {
					console.error("Failed to save invoice as draft", draftErr);
					failures.push(inv);
				}
			}
		}

		// Reset saved invoices and totals after successful sync
		if (synced > 0) {
			resetOfflineState();
		}

		const pendingLeft = failures.length;

		if (pendingLeft) {
			memory.offline_invoices = failures;
			persist("offline_invoices");
		} else {
			clearOfflineInvoices();
			if (synced > 0 && drafted === 0) {
				reduceCacheUsage();
			}
		}

		const totals = { pending: pendingLeft, synced, drafted };
		if (pendingLeft || drafted) {
			// Persist totals only if there are invoices still pending or drafted
			setLastSyncTotals(totals);
		} else {
			// Clear totals so success message only shows once
			setLastSyncTotals({ pending: 0, synced: 0, drafted: 0 });
		}
		return totals;
	} finally {
		invoiceSyncInProgress = false;
	}
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
				method: "posawesome.posawesome.api.posapp.create_customer",
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

export async function syncOfflinePayments() {
	await syncOfflineCustomers();

	const payments = getOfflinePayments();
	if (!payments.length) {
		return { pending: 0, synced: 0 };
	}
	if (isOffline()) {
		return { pending: payments.length, synced: 0 };
	}

	const failures = [];
	let synced = 0;

	for (const pay of payments) {
		try {
			await frappe.call({
				method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
				args: pay.args,
			});
			synced++;
		} catch (error) {
			console.error("Failed to submit payment", error);
			failures.push(pay);
		}
	}

	if (failures.length) {
		memory.offline_payments = failures;
		persist("offline_payments");
	} else {
		clearOfflinePayments();
	}

	return { pending: failures.length, synced };
}
export function saveItemUOMs(itemCode, uoms) {
	try {
		const cache = memory.uom_cache;
		// Clone to avoid persisting reactive objects which cause
		// DataCloneError when stored in IndexedDB
		const cleanUoms = JSON.parse(JSON.stringify(uoms));
		cache[itemCode] = cleanUoms;
		memory.uom_cache = cache;
		persist("uom_cache");
	} catch (e) {
		console.error("Failed to cache UOMs", e);
	}
}

export function getItemUOMs(itemCode) {
	try {
		const cache = memory.uom_cache || {};
		return cache[itemCode] || [];
	} catch (e) {
		return [];
	}
}

export function saveOffers(offers) {
	try {
		memory.offers_cache = offers;
		persist("offers_cache");
	} catch (e) {
		console.error("Failed to cache offers", e);
	}
}

export function getCachedOffers() {
	try {
		return memory.offers_cache || [];
	} catch (e) {
		return [];
	}
}

// Customer balance caching functions
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

// Price list items caching functions
export function savePriceListItems(priceList, items) {
	try {
		const cache = memory.price_list_cache || {};

		// Clone the items to remove any Vue reactivity objects.
		// Reactive proxies cannot be structured cloned and will
		// trigger a DataCloneError when sent to a Web Worker.
		let cleanItems;
		try {
			cleanItems = JSON.parse(JSON.stringify(items));
		} catch (err) {
			console.error("Failed to serialize price list items", err);
			cleanItems = [];
		}

		cache[priceList] = {
			items: cleanItems,
			timestamp: Date.now(),
		};
		memory.price_list_cache = cache;
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to cache price list items", e);
	}
}

export function getCachedPriceListItems(priceList) {
	try {
		const cache = memory.price_list_cache || {};
		const cachedData = cache[priceList];
		if (cachedData) {
			const isValid = Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000;
			return isValid ? cachedData.items : null;
		}
		return null;
	} catch (e) {
		console.error("Failed to get cached price list items", e);
		return null;
	}
}

export function clearPriceListCache() {
	try {
		memory.price_list_cache = {};
		persist("price_list_cache");
	} catch (e) {
		console.error("Failed to clear price list cache", e);
	}
}

// Item details caching functions
export function saveItemDetailsCache(profileName, priceList, items) {
	try {
		const cache = memory.item_details_cache || {};
		const profileCache = cache[profileName] || {};
		const priceCache = profileCache[priceList] || {};
		let cleanItems;
		try {
			cleanItems = JSON.parse(JSON.stringify(items));
		} catch (err) {
			console.error("Failed to serialize item details", err);
			cleanItems = [];
		}
		cleanItems.forEach((item) => {
			priceCache[item.item_code] = {
				data: item,
				timestamp: Date.now(),
			};
		});
		profileCache[priceList] = priceCache;
		cache[profileName] = profileCache;
		memory.item_details_cache = cache;
		persist("item_details_cache");
	} catch (e) {
		console.error("Failed to cache item details", e);
	}
}

export function getCachedItemDetails(profileName, priceList, itemCodes, ttl = 15 * 60 * 1000) {
	try {
		const cache = memory.item_details_cache || {};
		const priceCache = cache[profileName]?.[priceList] || {};
		const now = Date.now();
		const cached = [];
		const missing = [];
		itemCodes.forEach((code) => {
			const entry = priceCache[code];
			if (entry && now - entry.timestamp < ttl) {
				cached.push(entry.data);
			} else {
				missing.push(code);
			}
		});
		return { cached, missing };
	} catch (e) {
		console.error("Failed to get cached item details", e);
		return { cached: [], missing: itemCodes };
	}
}

// Tax template caching functions
export function saveTaxTemplate(name, doc) {
	try {
		const cache = memory.tax_template_cache || {};
		const cleanDoc = JSON.parse(JSON.stringify(doc));
		cache[name] = cleanDoc;
		memory.tax_template_cache = cache;
		persist("tax_template_cache");
	} catch (e) {
		console.error("Failed to cache tax template", e);
	}
}

export function getCachedTaxTemplate(name) {
	try {
		const cache = memory.tax_template_cache || {};
		return cache[name] || null;
	} catch (e) {
		console.error("Failed to get cached tax template", e);
		return null;
	}
}

// Local stock management functions
export function updateLocalStock(items) {
	try {
		const stockCache = memory.local_stock_cache || {};

		items.forEach((item) => {
			const key = item.item_code;

			// Only update if the item already exists in cache
			// Don't create new entries without knowing the actual stock
			if (stockCache[key]) {
				// Reduce quantity by sold amount
				const soldQty = Math.abs(item.qty || 0);
				stockCache[key].actual_qty = Math.max(0, stockCache[key].actual_qty - soldQty);
				stockCache[key].last_updated = new Date().toISOString();
			}
			// If item doesn't exist in cache, we don't create it
			// because we don't know the actual stock quantity
		});

		memory.local_stock_cache = stockCache;
		persist("local_stock_cache");
	} catch (e) {
		console.error("Failed to update local stock", e);
	}
}

export function getLocalStock(itemCode) {
	try {
		const stockCache = memory.local_stock_cache || {};
		return stockCache[itemCode]?.actual_qty || null;
	} catch (e) {
		return null;
	}
}

// Update the local stock cache with latest quantities
export function updateLocalStockCache(items) {
	try {
		const stockCache = memory.local_stock_cache || {};

		items.forEach((item) => {
			if (!item || !item.item_code) return;

			if (item.actual_qty !== undefined) {
				stockCache[item.item_code] = {
					actual_qty: item.actual_qty,
					last_updated: new Date().toISOString(),
				};
			}
		});

		memory.local_stock_cache = stockCache;
		persist("local_stock_cache");
	} catch (e) {
		console.error("Failed to refresh local stock cache", e);
	}
}

export function clearLocalStockCache() {
	memory.local_stock_cache = {};
	persist("local_stock_cache");
}

// Add this new function to fetch stock quantities
export async function fetchItemStockQuantities(items, pos_profile, chunkSize = 100) {
	const allItems = [];
	try {
		for (let i = 0; i < items.length; i += chunkSize) {
			const chunk = items.slice(i, i + chunkSize);
			const response = await new Promise((resolve, reject) => {
				frappe.call({
					method: "posawesome.posawesome.api.posapp.get_items_details",
					args: {
						pos_profile: JSON.stringify(pos_profile),
						items_data: JSON.stringify(chunk),
					},
					freeze: false,
					callback: function (r) {
						if (r.message) {
							resolve(r.message);
						} else {
							reject(new Error("No response from server"));
						}
					},
					error: function (err) {
						reject(err);
					},
				});
			});
			if (response) {
				allItems.push(...response);
			}
		}
		return allItems;
	} catch (error) {
		console.error("Failed to fetch item stock quantities:", error);
		return null;
	}
}

// New function to update local stock with actual quantities
export function updateLocalStockWithActualQuantities(invoiceItems, serverItems) {
	try {
		const stockCache = memory.local_stock_cache || {};

		invoiceItems.forEach((invoiceItem) => {
			const key = invoiceItem.item_code;

			// Find corresponding server item with actual quantity
			const serverItem = serverItems.find((item) => item.item_code === invoiceItem.item_code);

			if (serverItem && serverItem.actual_qty !== undefined) {
				// Initialize or update cache with actual server quantity
				if (!stockCache[key]) {
					stockCache[key] = {
						actual_qty: serverItem.actual_qty,
						last_updated: new Date().toISOString(),
					};
				} else {
					// Update with server quantity if it's more recent
					stockCache[key].actual_qty = serverItem.actual_qty;
					stockCache[key].last_updated = new Date().toISOString();
				}

				// Now reduce quantity by sold amount
				const soldQty = Math.abs(invoiceItem.qty || 0);
				stockCache[key].actual_qty = Math.max(0, stockCache[key].actual_qty - soldQty);
			}
		});

		memory.local_stock_cache = stockCache;
		persist("local_stock_cache");
	} catch (e) {
		console.error("Failed to update local stock with actual quantities", e);
	}
}

// --- Generic getters and setters for cached data ----------------------------
export async function getStoredItems() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		return await db.table("items").toArray();
	} catch (e) {
		console.error("Failed to get stored items", e);
		return [];
	}
}

export async function searchStoredItems({ search = "", itemGroup = "", limit = 100, offset = 0 } = {}) {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		let collection = db.table("items");
		if (itemGroup && itemGroup.toLowerCase() !== "all") {
			collection = collection.where("item_group").equalsIgnoreCase(itemGroup);
		}
                if (search) {
                        const term = search.toLowerCase();
                        collection = collection.filter((it) => {
                                const nameMatch = it.item_name && it.item_name.toLowerCase().includes(term);
                                const codeMatch = it.item_code && it.item_code.toLowerCase().includes(term);
                                const barcodeMatch = Array.isArray(it.item_barcode)
                                        ? it.item_barcode.some((b) => b.barcode && b.barcode.toLowerCase() === term)
                                        : it.item_barcode && String(it.item_barcode).toLowerCase().includes(term);
                                return nameMatch || codeMatch || barcodeMatch;
                        });
                }
		return await collection.offset(offset).limit(limit).toArray();
	} catch (e) {
		console.error("Failed to query stored items", e);
		return [];
	}
}

export async function saveItems(items) {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		await db.table("items").bulkPut(items);
	} catch (e) {
		console.error("Failed to save items", e);
	}
}

export async function clearStoredItems() {
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		await db.table("items").clear();
	} catch (e) {
		console.error("Failed to clear stored items", e);
	}
}

export function getCustomerStorage() {
	return memory.customer_storage || [];
}

export function setCustomerStorage(customers) {
	try {
		memory.customer_storage = customers.map((c) => ({
			name: c.name,
			customer_name: c.customer_name,
			mobile_no: c.mobile_no,
			email_id: c.email_id,
			primary_address: c.primary_address,
			tax_id: c.tax_id,
		}));
	} catch (e) {
		console.error("Failed to trim customers for storage", e);
		memory.customer_storage = [];
	}
	persist("customer_storage");
}

export function getSalesPersonsStorage() {
	return memory.sales_persons_storage || [];
}

export function setSalesPersonsStorage(data) {
	try {
		memory.sales_persons_storage = JSON.parse(JSON.stringify(data));
		persist("sales_persons_storage");
	} catch (e) {
		console.error("Failed to set sales persons storage", e);
	}
}

export function getOpeningStorage() {
	return memory.pos_opening_storage || null;
}

export function setOpeningStorage(data) {
	try {
		memory.pos_opening_storage = JSON.parse(JSON.stringify(data));
		persist("pos_opening_storage");
	} catch (e) {
		console.error("Failed to set opening storage", e);
	}
}

export function clearOpeningStorage() {
	try {
		memory.pos_opening_storage = null;
		persist("pos_opening_storage");
	} catch (e) {
		console.error("Failed to clear opening storage", e);
	}
}

export function getOpeningDialogStorage() {
	return memory.opening_dialog_storage || null;
}

export function setOpeningDialogStorage(data) {
	try {
		memory.opening_dialog_storage = JSON.parse(JSON.stringify(data));
		persist("opening_dialog_storage");
	} catch (e) {
		console.error("Failed to set opening dialog storage", e);
	}
}

export function getLocalStockCache() {
	return memory.local_stock_cache || {};
}

export function setLocalStockCache(cache) {
	memory.local_stock_cache = cache || {};
	persist("local_stock_cache");
}

export function isManualOffline() {
	return memory.manual_offline || false;
}

export function setManualOffline(state) {
	memory.manual_offline = !!state;
	persist("manual_offline");
}

export function toggleManualOffline() {
	setManualOffline(!memory.manual_offline);
}

export async function clearAllCache() {
	try {
		if (db.isOpen()) {
			await db.close();
		}
		await Dexie.delete("posawesome_offline");
		await db.open();
	} catch (e) {
		console.error("Failed to clear IndexedDB cache", e);
	}

	if (typeof localStorage !== "undefined") {
		Object.keys(localStorage).forEach((key) => {
			if (key.startsWith("posa_")) {
				localStorage.removeItem(key);
			}
		});
	}

	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.customer_storage = [];
	memory.pos_opening_storage = null;
	memory.opening_dialog_storage = null;
	memory.sales_persons_storage = [];
	memory.price_list_cache = {};
	memory.item_details_cache = {};
	memory.tax_template_cache = {};
	memory.tax_inclusive = false;
	memory.manual_offline = false;
}

export async function forceClearAllCache() {
	if (typeof localStorage !== "undefined") {
		Object.keys(localStorage).forEach((key) => {
			if (key.startsWith("posa_")) {
				localStorage.removeItem(key);
			}
		});
	}

	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.pos_last_sync_totals = { pending: 0, synced: 0, drafted: 0 };
	memory.uom_cache = {};
	memory.offers_cache = [];
	memory.customer_balance_cache = {};
	memory.local_stock_cache = {};
	memory.stock_cache_ready = false;
	memory.customer_storage = [];
	memory.pos_opening_storage = null;
	memory.opening_dialog_storage = null;
	memory.sales_persons_storage = [];
	memory.price_list_cache = {};
	memory.item_details_cache = {};
	memory.tax_template_cache = {};
	memory.tax_inclusive = false;
	memory.manual_offline = false;

	try {
		await Dexie.delete("posawesome_offline");
	} catch (e) {
		console.error("Failed to clear IndexedDB cache", e);
	}
}
