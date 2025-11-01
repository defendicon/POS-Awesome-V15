import { memory } from "./cache.js";
import { persist } from "./core.js";

// Modify initializeStockCache function to set the flag
export async function initializeStockCache(items, pos_profile) {
	try {
		const existingCache = memory.local_stock_cache || {};
		const missingItems = Array.isArray(items) ? items.filter((it) => !existingCache[it.item_code]) : [];

		if (missingItems.length === 0) {
			if (!memory.stock_cache_ready) {
				memory.stock_cache_ready = true;
				persist("stock_cache_ready", memory.stock_cache_ready);
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
			persist("local_stock_cache", memory.local_stock_cache);
			persist("stock_cache_ready", memory.stock_cache_ready);
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
	persist("stock_cache_ready", memory.stock_cache_ready);
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
		persist("local_stock_cache", memory.local_stock_cache);
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
		persist("local_stock_cache", memory.local_stock_cache);
	} catch (e) {
		console.error("Failed to refresh local stock cache", e);
	}
}

export function clearLocalStockCache() {
	memory.local_stock_cache = {};
	persist("local_stock_cache", memory.local_stock_cache);
}

// Add this new function to fetch stock quantities
export async function fetchItemStockQuantities(items, pos_profile, chunkSize = 100) {
	const allItems = [];
	try {
		for (let i = 0; i < items.length; i += chunkSize) {
			const chunk = items.slice(i, i + chunkSize);
			const response = await new Promise((resolve, reject) => {
				frappe.call({
					method: "posawesome.posawesome.api.items.get_items_details",
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
		persist("local_stock_cache", memory.local_stock_cache);
	} catch (e) {
		console.error("Failed to update local stock with actual quantities", e);
	}
}

export function getLocalStockCache() {
	return memory.local_stock_cache || {};
}

export function setLocalStockCache(cache) {
	memory.local_stock_cache = cache || {};
	persist("local_stock_cache", memory.local_stock_cache);
}
