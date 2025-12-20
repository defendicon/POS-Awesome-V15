/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently using normalized state and running totals.
 */

import { defineStore } from "pinia";
import { computed, ref, reactive, watch, markRaw } from "vue";

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

	// Normalized State
	const itemsMap = reactive(new Map());
	const itemOrder = ref([]);

	// Legacy/UI Projection (kept in sync for v-data-table and legacy code)
	const items = ref([]);

	const packedItems = ref([]);
	const metadata = ref({
		lastUpdated: Date.now(),
		changeVersion: 0,
	});

	// Running Totals (O(1) updates)
	const totals = reactive({
		qty: 0,
		gross: 0,
		discount: 0,
		net: 0
	});

	const touch = () => {
		metadata.value = {
			lastUpdated: Date.now(),
			changeVersion: metadata.value.changeVersion + 1,
		};
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

	// Helper to calculate totals for a single item
	const calculateItemTotals = (item) => {
		const qty = toNumber(item.qty);
		const rate = toNumber(item.rate);
		const discount = toNumber(item.discount_amount);
		return {
			qty,
			gross: qty * rate,
			discount: Math.abs(qty) * discount,
		};
	};

	// Re-calculate all totals from scratch (safe fallback)
	const recalculateTotals = () => {
		let q = 0, g = 0, d = 0;
		items.value.forEach(item => {
			const t = calculateItemTotals(item);
			q += t.qty;
			g += t.gross;
			d += t.discount;
		});
		totals.qty = q;
		totals.gross = g;
		totals.discount = d;
	};

	// Batch updates to avoid multiple recalculations
	const batchUpdate = (callback) => {
		callback();
		recalculateTotals();
		touch();
	};

	const setItems = (list) => {
		itemsMap.clear();
		itemOrder.value = [];
		items.value = [];

		if (Array.isArray(list)) {
			list.forEach(item => {
				const cloned = cloneItem(item);
				// Ensure row ID
				if (!cloned.posa_row_id) {
					cloned.posa_row_id = Math.random().toString(36).substr(2, 10);
				}
				// Important: Add to array first, then use the array's object reference for Map
				// to ensure shared reactivity reference.
				items.value.push(cloned);
				const pushedItem = items.value[items.value.length - 1];

				itemsMap.set(cloned.posa_row_id, pushedItem);
				itemOrder.value.push(cloned.posa_row_id);
			});
		}
		recalculateTotals();
		touch();
	};

	const replaceItemAt = (index, item) => {
		if (index < 0 || index >= items.value.length) {
			return;
		}
		const oldItem = items.value[index];
		const newItem = cloneItem(item);

		// Update Normalized State
		itemsMap.delete(oldItem.posa_row_id);

		// Update Projection
		items.value[index] = newItem;
		const pushedItem = items.value[index];

		itemsMap.set(newItem.posa_row_id, pushedItem);
		itemOrder.value[index] = newItem.posa_row_id;

		recalculateTotals();
		touch();
	};

	const upsertItem = (item) => {
		if (!item) return;

		const rowId = item.posa_row_id;
		if (!rowId) {
			// New item without ID
			const newItem = cloneItem(item);
			newItem.posa_row_id = Math.random().toString(36).substr(2, 10);

			items.value.push(newItem);
			const pushedItem = items.value[items.value.length - 1];

			itemsMap.set(newItem.posa_row_id, pushedItem);
			itemOrder.value.push(newItem.posa_row_id);
		} else {
			const existing = itemsMap.get(rowId);
			if (existing) {
				// Update existing in-place (updates array too since references are shared)
				Object.assign(existing, item);
			} else {
				// Add new with existing ID
				const newItem = cloneItem(item);
				items.value.push(newItem);
				const pushedItem = items.value[items.value.length - 1];

				itemsMap.set(rowId, pushedItem);
				itemOrder.value.push(rowId);
			}
		}
		recalculateTotals();
		touch();
	};

	const removeItemByRowId = (rowId) => {
		if (!rowId || !itemsMap.has(rowId)) return;

		itemsMap.delete(rowId);
		const idx = items.value.findIndex(item => item.posa_row_id === rowId);
		if (idx > -1) {
			// Remove from array (O(N), unavoidable for standard array, but fast enough for UI op)
			// For bulk removal, clearItems should be used.
			items.value.splice(idx, 1);

			const orderIdx = itemOrder.value.indexOf(rowId);
			if (orderIdx > -1) {
				itemOrder.value.splice(orderIdx, 1);
			}
		}
		recalculateTotals();
		touch();
	};

	const clearItems = () => {
		if (items.value.length) {
			itemsMap.clear();
			itemOrder.value = [];
			items.value = [];
			recalculateTotals();
			touch();
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

	const totalQty = computed(() => totals.qty);
	const grossTotal = computed(() => totals.gross);
	const discountTotal = computed(() => totals.discount);
	const itemsCount = computed(() => items.value.length);

	// Public actions
	return {
		invoiceDoc,
		items, // Read-only projection for UI (but elements are reactive)
		itemsMap, // Read-write normalized state
		itemOrder,
		packedItems,
		metadata,

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
		batchUpdate,
		recalculateTotals
	};
});

export default useInvoiceStore;
