let db;
(async () => {
	let DexieLib;
	try {
		importScripts("/assets/posawesome/js/libs/dexie.min.js?v=1");
		DexieLib = { default: Dexie };
	} catch (e) {
		// Fallback to dynamic import when importScripts fails
		DexieLib = await import("/assets/posawesome/js/libs/dexie.min.js?v=1");
	}
	db = new DexieLib.default("posawesome_offline");
	db.version(4).stores({
		keyval: "&key",
		queue: "&key",
		cache: "&key",
		items: "&item_code,item_name,item_group",
		item_prices: "&[price_list+item_code],price_list,item_code",
	});
	try {
		await db.open();
	} catch (err) {
		console.error("Failed to open IndexedDB in worker", err);
	}
})();

const KEY_TABLE_MAP = {
	offline_invoices: "queue",
	offline_customers: "queue",
	offline_payments: "queue",
	item_details_cache: "cache",
	customer_storage: "cache",
};

function tableForKey(key) {
	return KEY_TABLE_MAP[key] || "keyval";
}

async function persist(key, value) {
	try {
		if (!db.isOpen()) {
			await db.open();
		}
		const table = tableForKey(key);
		await db.table(table).put({ key, value });
	} catch (e) {
		console.error("Worker persist failed", e);
	}

	if (typeof localStorage !== "undefined") {
		try {
			localStorage.setItem(`posa_${key}`, JSON.stringify(value));
		} catch (err) {
			console.error("Worker localStorage failed", err);
		}
	}
}

async function bulkPutItems(items) {
	try {
		if (!db.isOpen()) {
			await db.open();
		}
		await db.table("items").bulkPut(items);
	} catch (e) {
		console.error("Worker bulkPut items failed", e);
	}
}

async function bulkPutPrices(priceList, items) {
        try {
                if (!priceList) {
                        return;
                }
                if (!db.isOpen()) {
                        await db.open();
                }
		const records = items.map((it) => ({
			price_list: priceList,
			item_code: it.item_code,
			rate: it.rate,
			price_list_rate: it.price_list_rate || it.rate,
			timestamp: Date.now(),
		}));
		await db.table("item_prices").bulkPut(records);
	} catch (e) {
		console.error("Worker bulkPut prices failed", e);
	}
}

self.onmessage = async (event) => {
	// Logging every message can flood the console and increase memory usage
	// when the worker is used for frequent persistence operations. Remove
	// the noisy log to keep the console clean.
	const data = event.data || {};
	if (data.type === "parse_and_cache") {
		try {
			let parsed = JSON.parse(data.json);
			let itemsRaw = parsed.message || parsed;
			let items;
			try {
				if (typeof structuredClone === "function") {
					items = structuredClone(itemsRaw);
				} else {
					// Fallback for older browsers
					items = JSON.parse(JSON.stringify(itemsRaw));
				}
			} catch (e) {
				console.error("Failed to clone items", e);
				self.postMessage({ type: "error", error: e.message });
				return;
			}
                        let trimmed = items.map((it) => ({
				item_code: it.item_code,
				item_name: it.item_name,
				description: it.description,
				stock_uom: it.stock_uom,
				image: it.image,
				item_group: it.item_group,
				rate: it.rate,
				price_list_rate: it.price_list_rate,
				currency: it.currency,
				item_barcode: it.item_barcode,
				item_uoms: it.item_uoms,
				actual_qty: it.actual_qty,
				has_batch_no: it.has_batch_no,
				has_serial_no: it.has_serial_no,
				has_variants: !!it.has_variants,
			}));
			await bulkPutItems(trimmed);
			await bulkPutPrices(data.priceList, trimmed);
			// Clear references to release memory before posting back
			items = null;
			itemsRaw = null;
			data.json = null;
			parsed = null;
                       let out = trimmed;
                       self.postMessage({ type: "parsed", items: out });
			trimmed.length = 0;
			trimmed = null;
		} catch (err) {
			console.log(err);
			self.postMessage({ type: "error", error: err.message });
		}
	} else if (data.type === "persist") {
		await persist(data.key, data.value);
		self.postMessage({ type: "persisted", key: data.key });
	} else if (data.type === "bulk_put_items") {
		await bulkPutItems(data.items || []);
		self.postMessage({ type: "items_saved" });
	}
};
