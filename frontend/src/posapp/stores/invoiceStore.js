/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently and keeps totals in sync.
 * Uses a Map for items to achieve O(1) complexity for updates, additions, and removals.
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";

// Helper to ensure a value is a valid, finite number.
const toNumber = (value) => {
	if (value == null) return 0;
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (typeof value === "string") {
		const normalized = value.trim();
		if (!normalized) return 0;
		const parsed = Number.parseFloat(normalized);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

// Creates a shallow clone of an item.
const cloneItem = (item) => ({ ...item });

export const useInvoiceStore = defineStore("invoice", () => {
	// --- State ---
	const invoiceDoc = ref(null);
	const itemsMap = ref(new Map()); // Primary data structure for O(1) access
	const packedItems = ref([]);
	const metadata = ref({
		lastUpdated: Date.now(),
		changeVersion: 0,
	});

	// Running totals, updated incrementally
	const totalQty = ref(0);
	const grossTotal = ref(0);
	const discountTotal = ref(0);

	// --- Private Helpers ---

	// Increments running totals based on an item's properties.
	const _addItemToTotals = (item) => {
		const qty = toNumber(item.qty);
		totalQty.value += qty;
		grossTotal.value += qty * toNumber(item.rate);
		discountTotal.value += Math.abs(qty) * toNumber(item.discount_amount || 0);
	};

	// Decrements running totals based on an item's properties.
	const _subtractItemFromTotals = (item) => {
		const qty = toNumber(item.qty);
		totalQty.value -= qty;
		grossTotal.value -= qty * toNumber(item.rate);
		discountTotal.value -= Math.abs(qty) * toNumber(item.discount_amount || 0);
	};

	// Resets all running totals to zero.
	const _resetTotals = () => {
		totalQty.value = 0;
		grossTotal.value = 0;
		discountTotal.value = 0;
	};

	// Bumps the metadata version to trigger reactivity.
	const touch = () => {
		metadata.value = {
			lastUpdated: Date.now(),
			changeVersion: metadata.value.changeVersion + 1,
		};
	};

	// --- Getters (Computed) ---

	const items = computed(() => Array.from(itemsMap.value.values()));
	const itemsCount = computed(() => itemsMap.value.size);

	// --- Actions ---

	const setInvoiceDoc = (doc) => {
		invoiceDoc.value = doc && typeof doc === "string" && doc.trim() ? { name: doc } : doc ? { ...doc } : null;
		touch();
	};

	const mergeInvoiceDoc = (patch = {}) => {
		const current = invoiceDoc.value ? { ...invoiceDoc.value } : {};
		invoiceDoc.value = Object.assign(current, patch || {});
		touch();
	};

	const setItems = (list) => {
		itemsMap.value.clear();
		_resetTotals();
		if (Array.isArray(list)) {
			list.forEach((item) => {
				if (item && item.posa_row_id) {
					itemsMap.value.set(item.posa_row_id, cloneItem(item));
					_addItemToTotals(item);
				}
			});
		}
		touch();
	};

	const replaceItemAt = (index, item) => {
		const currentItem = items.value[index];
		if (!currentItem || !item) return;

		const rowId = currentItem.posa_row_id;
		if (rowId !== item.posa_row_id) {
			removeItemByRowId(rowId);
			upsertItem(item);
		} else {
			_subtractItemFromTotals(currentItem);
			_addItemToTotals(item);
			itemsMap.value.set(rowId, cloneItem(item));
			touch();
		}
	};

	const upsertItem = (item) => {
		if (!item || !item.posa_row_id) return;

		const rowId = item.posa_row_id;
		const existingItem = itemsMap.value.get(rowId);

		if (existingItem) {
			_subtractItemFromTotals(existingItem);
			itemsMap.value.delete(rowId);
		}

		const newItem = existingItem ? { ...existingItem, ...item } : cloneItem(item);
		const newMap = new Map();
		newMap.set(rowId, newItem);

		for (const [key, value] of itemsMap.value.entries()) {
			newMap.set(key, value);
		}

		itemsMap.value = newMap;
		_addItemToTotals(newItem);

		touch();
	};

	const removeItemByRowId = (rowId) => {
		if (!rowId || !itemsMap.value.has(rowId)) return;

		const itemToRemove = itemsMap.value.get(rowId);
		_subtractItemFromTotals(itemToRemove);
		itemsMap.value.delete(rowId);

		touch();
	};

	const clearItems = () => {
		if (itemsMap.value.size > 0) {
			itemsMap.value.clear();
			_resetTotals();
			touch();
		}
	};

	const setPackedItems = (list) => {
		packedItems.value = Array.isArray(list) ? list.map(cloneItem) : [];
		touch();
	};

	const clear = () => {
		invoiceDoc.value = null;
		packedItems.value = [];
		clearItems();
	};

	return {
		invoiceDoc,
		itemsMap,
		packedItems,
		metadata,
		items,
		totalQty,
		grossTotal,
		discountTotal,
		itemsCount,
		setInvoiceDoc,
		mergeInvoiceDoc,
		setItems,
		replaceItemAt,
		upsertItem,
		removeItemByRowId,
		clearItems,
		setPackedItems,
		clear,
	};
});

export default useInvoiceStore;
