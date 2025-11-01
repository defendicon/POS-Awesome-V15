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
		touch();
	};

	const replaceItemAt = (index, item) => {
		if (index < 0 || index >= items.value.length) {
			return;
		}

		const updated = items.value.slice();
		updated[index] = cloneItem(item);
		items.value = updated;
		touch();
	};

	const upsertItem = (item) => {
		if (!item) {
			return;
		}

		const rowId = item.posa_row_id;
		if (!rowId) {
			items.value = [...items.value, cloneItem(item)];
			touch();
			return;
		}

		const index = items.value.findIndex((entry) => entry.posa_row_id === rowId);
		if (index === -1) {
			items.value = [...items.value, cloneItem(item)];
		} else {
			const updated = items.value.slice();
			updated[index] = { ...updated[index], ...item };
			items.value = updated;
		}
		touch();
	};

	const removeItemByRowId = (rowId) => {
		if (!rowId) {
			return;
		}

		const filtered = items.value.filter((item) => item.posa_row_id !== rowId);
		if (filtered.length !== items.value.length) {
			items.value = filtered;
			touch();
		}
	};

	const clearItems = () => {
		if (items.value.length) {
			items.value = [];
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
		touch();
	};

	const totalQty = computed(() => {
		return items.value.reduce((sum, item) => sum + toNumber(item.qty), 0);
	});

	const grossTotal = computed(() => {
		return items.value.reduce((sum, item) => sum + toNumber(item.qty) * toNumber(item.rate), 0);
	});

	const discountTotal = computed(() => {
		return items.value.reduce((sum, item) => {
			const qty = Math.abs(toNumber(item.qty));
			return sum + qty * toNumber(item.discount_amount || 0);
		}, 0);
	});

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

	watch(
		items,
		() => {
			touch();
		},
		{ deep: true },
	);

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
