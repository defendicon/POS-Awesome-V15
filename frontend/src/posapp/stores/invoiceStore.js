/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently and keeps totals in sync.
 */

import { defineStore } from "pinia";
import { computed, ref, reactive, watch } from "vue";

const toNumber = (value) => {
	if (value == null) {
		return 0;
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}

	if (typeof value === "string") {
		const normalized = value.trim();
		if (!normalized) {
			return 0;
		}
		const parsed = Number.parseFloat(normalized);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
};

const cloneItem = (item) => ({ ...item });

export const useInvoiceStore = defineStore("invoice", () => {
	const invoiceDoc = ref(null);
	// Normalized state: keys array + items map
	const itemOrder = ref([]);
	const itemsData = reactive(new Map());

	const packedItems = ref([]);
	const metadata = ref({
		lastUpdated: Date.now(),
		changeVersion: 0,
	});

	// Totals as refs for O(1) access and controlled updates
	const totalQty = ref(0);
	const grossTotal = ref(0);
	const discountTotal = ref(0);

	const touch = () => {
		metadata.value = {
			lastUpdated: Date.now(),
			changeVersion: metadata.value.changeVersion + 1,
		};
	};

	// O(n) calculation of totals
	const recalculateTotals = () => {
		let tQty = 0;
		let tGross = 0;
		let tDisc = 0;

		for (const item of itemsData.values()) {
			const qty = toNumber(item.qty);
			const rate = toNumber(item.rate);
			const disc = toNumber(item.discount_amount || 0);

			tQty += qty;
			tGross += qty * rate;
			tDisc += Math.abs(qty * disc);
		}

		totalQty.value = tQty;
		grossTotal.value = tGross;
		discountTotal.value = tDisc;
	};

	// Throttled update trigger
	let updateTimer = null;
	const triggerUpdateTotals = () => {
		if (updateTimer) return;
		updateTimer = setTimeout(() => {
			recalculateTotals();
			updateTimer = null;
		}, 50);
	};

	const normalizeDoc = (doc) => {
		if (!doc) {
			return null;
		}

		if (typeof doc === "string") {
			return doc.trim() ? { name: doc } : null;
		}

		return { ...doc };
	};

	const setInvoiceDoc = (doc) => {
		invoiceDoc.value = normalizeDoc(doc);
		touch();
	};

	const mergeInvoiceDoc = (patch = {}) => {
		const current = invoiceDoc.value ? { ...invoiceDoc.value } : {};
		invoiceDoc.value = Object.assign(current, patch || {});
		touch();
	};

	const setItems = (list) => {
		itemsData.clear();
		const order = [];
		if (Array.isArray(list)) {
			list.forEach((item) => {
				if (!item) return;
				const rowId = item.posa_row_id || Math.random().toString(36).substr(2, 20);
				// Ensure item has ID
				if (!item.posa_row_id) item.posa_row_id = rowId;
				itemsData.set(rowId, cloneItem(item));
				order.push(rowId);
			});
		}
		itemOrder.value = order;
		touch();
		recalculateTotals(); // Immediate update on set
	};

	const addItem = (item, index = -1) => {
		if (!item) return;
		const rowId = item.posa_row_id || Math.random().toString(36).substr(2, 20);
		if (!item.posa_row_id) item.posa_row_id = rowId;

		const cloned = cloneItem(item);
		itemsData.set(rowId, cloned);

		if (index >= 0 && index < itemOrder.value.length) {
			itemOrder.value.splice(index, 0, rowId);
		} else if (index === 0) {
			itemOrder.value.unshift(rowId);
		} else {
			itemOrder.value.push(rowId);
		}
		touch();
		triggerUpdateTotals(); // Throttled update for additions (can be immediate if preferred)
		// Return the reactive proxy from the map
		return itemsData.get(rowId);
	};

	const addItems = (items, index = -1) => {
		if (!Array.isArray(items) || !items.length) return [];
		const addedIds = [];

		items.forEach((item) => {
			if (!item) return;
			const rowId = item.posa_row_id || Math.random().toString(36).substr(2, 20);
			if (!item.posa_row_id) item.posa_row_id = rowId;
			itemsData.set(rowId, cloneItem(item));
			addedIds.push(rowId);
		});

		if (addedIds.length > 0) {
			if (index >= 0 && index < itemOrder.value.length) {
				itemOrder.value.splice(index, 0, ...addedIds);
			} else if (index === 0) {
				itemOrder.value.unshift(...addedIds);
			} else {
				itemOrder.value.push(...addedIds);
			}
			touch();
			recalculateTotals(); // Immediate update for batch addition
		}

		return addedIds.map((id) => itemsData.get(id));
	};

	const replaceItemAt = (index, item) => {
		if (index < 0 || index >= itemOrder.value.length) {
			return;
		}
		const oldId = itemOrder.value[index];
		const rowId = item.posa_row_id || oldId;
		if (!item.posa_row_id) item.posa_row_id = rowId;

		if (oldId !== rowId) {
			itemsData.delete(oldId);
			itemOrder.value[index] = rowId;
		}
		itemsData.set(rowId, cloneItem(item));
		touch();
		triggerUpdateTotals();
	};

	const upsertItem = (item) => {
		if (!item) {
			return;
		}

		const rowId = item.posa_row_id;
		if (!rowId) {
			addItem(item);
			return;
		}

		if (itemsData.has(rowId)) {
			const existing = itemsData.get(rowId);
			Object.assign(existing, item);
			touch();
		} else {
			addItem(item);
		}
		// Watcher will catch this, or addItem triggers it
	};

	const removeItemByRowId = (rowId) => {
		if (!rowId) {
			return;
		}

		if (itemsData.has(rowId)) {
			itemsData.delete(rowId);
			const idx = itemOrder.value.indexOf(rowId);
			if (idx !== -1) {
				itemOrder.value.splice(idx, 1);
			}
			touch();
			recalculateTotals(); // Immediate update on remove
		}
	};

	const clearItems = () => {
		if (itemOrder.value.length > 0) {
			itemOrder.value = [];
			itemsData.clear();
			touch();
			totalQty.value = 0;
			grossTotal.value = 0;
			discountTotal.value = 0;
		}
	};

	const setPackedItems = (list) => {
		packedItems.value = Array.isArray(list) ? list.map(cloneItem) : [];
		touch();
	};

	const clear = () => {
		invoiceDoc.value = null;
		clearItems();
		packedItems.value = [];
		touch();
	};

	// Computed property that reconstructs the array from map + order
	const items = computed(() => {
		return itemOrder.value
			.map((id) => itemsData.get(id))
			.filter((item) => item !== undefined && item !== null);
	});

	const itemsCount = computed(() => itemOrder.value.length);

	const itemsMap = computed(() => {
		const map = new Map();
		itemOrder.value.forEach((id, index) => {
			const item = itemsData.get(id);
			if (item) {
				map.set(id, { index, item });
			}
		});
		return map;
	});

	// Watch deep changes in the map values
	watch(
		itemsData,
		() => {
			touch();
			triggerUpdateTotals();
		},
		{ deep: true },
	);

	return {
		invoiceDoc,
		items,
		itemOrder,
		itemsData, // Expose raw map if needed
		packedItems,
		metadata,
		totalQty,
		grossTotal,
		discountTotal,
		itemsCount,
		itemsMap,
		setInvoiceDoc,
		mergeInvoiceDoc,
		setItems,
		addItem,
		addItems,
		replaceItemAt,
		upsertItem,
		removeItemByRowId,
		clearItems,
		setPackedItems,
		clear,
		recalculateTotals, // Exposed for manual trigger if needed
	};
});

export default useInvoiceStore;
