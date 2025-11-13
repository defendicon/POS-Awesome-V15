/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently and keeps totals in sync.
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

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
	const items = ref([]);
	const packedItems = ref([]);

	// Running totals for O(1) access
	const totalQty = ref(0);
	const grossTotal = ref(0);
	const discountTotal = ref(0);

	const metadata = ref({
		lastUpdated: Date.now(),
		changeVersion: 0,
	});

	const touch = () => {
		metadata.value = {
			lastUpdated: Date.now(),
			changeVersion: metadata.value.changeVersion + 1,
		};
	};

	// Private method to recalculate all totals from scratch.
	// Used when the entire item list is replaced.
	const _recalculateTotals = () => {
		let newTotalQty = 0;
		let newGrossTotal = 0;
		let newDiscountTotal = 0;

		for (const item of items.value) {
			const qty = toNumber(item.qty);
			const rate = toNumber(item.rate);
			const discount = toNumber(item.discount_amount);

			newTotalQty += qty;
			newGrossTotal += qty * rate;
			newDiscountTotal += Math.abs(qty) * discount;
		}

		totalQty.value = newTotalQty;
		grossTotal.value = newGrossTotal;
		discountTotal.value = newDiscountTotal;
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
		items.value = Array.isArray(list) ? list.map(cloneItem) : [];
		_recalculateTotals();
		touch();
	};

	const replaceItemAt = (index, item) => {
		if (index < 0 || index >= items.value.length) {
			return;
		}

		const oldItem = items.value[index];
		const newItem = cloneItem(item);

		// Incrementally update totals
		const qtyDiff = toNumber(newItem.qty) - toNumber(oldItem.qty);
		const grossDiff =
			toNumber(newItem.qty) * toNumber(newItem.rate) - toNumber(oldItem.qty) * toNumber(oldItem.rate);
		const discountDiff =
			Math.abs(toNumber(newItem.qty)) * toNumber(newItem.discount_amount) -
			Math.abs(toNumber(oldItem.qty)) * toNumber(oldItem.discount_amount);

		totalQty.value += qtyDiff;
		grossTotal.value += grossDiff;
		discountTotal.value += discountDiff;

		const updated = items.value.slice();
		updated[index] = newItem;
		items.value = updated;
		touch();
	};

	const upsertItem = (item) => {
		if (!item) {
			return;
		}

		const rowId = item.posa_row_id;
		if (!rowId) {
			// This is a new item
			const newItem = cloneItem(item);
			totalQty.value += toNumber(newItem.qty);
			grossTotal.value += toNumber(newItem.qty) * toNumber(newItem.rate);
			discountTotal.value += Math.abs(toNumber(newItem.qty)) * toNumber(newItem.discount_amount);
			items.value = [...items.value, newItem];
			touch();
			return;
		}

		const index = items.value.findIndex((entry) => entry.posa_row_id === rowId);
		if (index === -1) {
			// Item not found, treat as new
			const newItem = cloneItem(item);
			totalQty.value += toNumber(newItem.qty);
			grossTotal.value += toNumber(newItem.qty) * toNumber(newItem.rate);
			discountTotal.value += Math.abs(toNumber(newItem.qty)) * toNumber(newItem.discount_amount);
			items.value = [...items.value, newItem];
		} else {
			// This is an update
			const oldItem = items.value[index];
			const newItem = { ...oldItem, ...item };

			const qtyDiff = toNumber(newItem.qty) - toNumber(oldItem.qty);
			const grossDiff =
				toNumber(newItem.qty) * toNumber(newItem.rate) -
				toNumber(oldItem.qty) * toNumber(oldItem.rate);
			const discountDiff =
				Math.abs(toNumber(newItem.qty)) * toNumber(newItem.discount_amount) -
				Math.abs(toNumber(oldItem.qty)) * toNumber(oldItem.discount_amount);

			totalQty.value += qtyDiff;
			grossTotal.value += grossDiff;
			discountTotal.value += discountDiff;

			const updated = items.value.slice();
			updated[index] = newItem;
			items.value = updated;
		}
		touch();
	};

	const removeItemByRowId = (rowId) => {
		if (!rowId) {
			return;
		}

		if (!rowId) {
			return;
		}

		const index = items.value.findIndex((item) => item.posa_row_id === rowId);
		if (index !== -1) {
			const removedItem = items.value[index];
			totalQty.value -= toNumber(removedItem.qty);
			grossTotal.value -= toNumber(removedItem.qty) * toNumber(removedItem.rate);
			discountTotal.value -=
				Math.abs(toNumber(removedItem.qty)) * toNumber(removedItem.discount_amount);

			const updated = items.value.slice();
			updated.splice(index, 1);
			items.value = updated;
			touch();
		}
	};

	const clearItems = () => {
		if (items.value.length) {
			items.value = [];
			totalQty.value = 0;
			grossTotal.value = 0;
			discountTotal.value = 0;
			touch();
		}
	};

	const setPackedItems = (list) => {
		packedItems.value = Array.isArray(list) ? list.map(cloneItem) : [];
		touch();
	};

	const clear = () => {
		invoiceDoc.value = null;
		items.value = [];
		packedItems.value = [];
		totalQty.value = 0;
		grossTotal.value = 0;
		discountTotal.value = 0;
		touch();
	};

	const itemsCount = computed(() => items.value.length);

	const itemsMap = computed(() => {
		const map = new Map();
		items.value.forEach((item, index) => {
			if (item && item.posa_row_id) {
				map.set(item.posa_row_id, { index, item });
			}
		});
		return map;
	});

	return {
		invoiceDoc,
		items,
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
		replaceItemAt,
		upsertItem,
		removeItemByRowId,
		clearItems,
		setPackedItems,
		clear,
	};
});

export default useInvoiceStore;
