/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently and keeps totals in sync.
 */

import { defineStore } from "pinia";
import { computed, ref, shallowReactive, shallowRef, watch } from "vue";
import { buildCartKey } from "../utils/cartKeys.js";

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

const cloneItem = (item, priceList = "") => {
	if (!item) return null;
	const copy = { ...item };
	copy.posa_row_key = buildCartKey(copy, priceList);
	if (!copy.posa_row_id) {
		const stableSeed = copy.posa_row_key || copy.item_code || "row";
		copy.posa_row_id = `${stableSeed}::${Math.random().toString(36).slice(2, 10)}`;
	}
	return copy;
};

const toLineTotals = (line) => {
	if (!line) {
		return { qty: 0, gross: 0, discount: 0 };
	}
	const qty = toNumber(line.qty);
	const gross = qty * toNumber(line.rate);
	const discount = Math.abs(qty) * toNumber(line.discount_amount || 0);
	return { qty, gross, discount };
};

const buildSnapshot = (list, priceList = "") => {
	const snapshot = {
		order: [],
		byId: new Map(),
		keyIndex: new Map(),
		items: [],
		totals: { qty: 0, gross: 0, discount: 0 },
	};

	(Array.isArray(list) ? list : []).forEach((entry) => {
		const normalized = cloneItem(entry, priceList);
		if (!normalized) return;
		snapshot.order.push(normalized.posa_row_id);
		snapshot.byId.set(normalized.posa_row_id, normalized);
		if (normalized.posa_row_key) {
			snapshot.keyIndex.set(normalized.posa_row_key, normalized.posa_row_id);
		}
		const { qty, gross, discount } = toLineTotals(normalized);
		snapshot.totals.qty += qty;
		snapshot.totals.gross += gross;
		snapshot.totals.discount += discount;
		snapshot.items.push(normalized);
	});

	return snapshot;
};

export const useInvoiceStore = defineStore("invoice", () => {
	const invoiceDoc = ref(null);
	const items = shallowRef([]);
	const packedItems = ref([]);
	const itemOrder = ref([]);
	const itemById = shallowReactive(new Map());
	const keyIndex = shallowReactive(new Map());
	const metadata = ref({
		lastUpdated: Date.now(),
		changeVersion: 0,
	});
	const runningTotals = ref({ qty: 0, gross: 0, discount: 0 });
	let suppressSync = false;

	const resolvePriceList = (explicit = "") => {
		if (explicit) return explicit;
		return invoiceDoc.value?.price_list || invoiceDoc.value?.selling_price_list || "";
	};

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

	const applySnapshot = (snapshot, { skipTouch = false } = {}) => {
		suppressSync = true;
		try {
			itemOrder.value = snapshot.order;
			itemById.clear();
			snapshot.byId.forEach((value, key) => itemById.set(key, value));
			keyIndex.clear();
			snapshot.keyIndex.forEach((value, key) => keyIndex.set(key, value));
			items.value = snapshot.items;
			runningTotals.value = { ...snapshot.totals };
		} finally {
			suppressSync = false;
		}
		if (!skipTouch) {
			touch();
		}
	};

	const setItems = (list, priceList = "") => {
		const snapshot = buildSnapshot(list, resolvePriceList(priceList));
		applySnapshot(snapshot);
	};

	const replaceItemAt = (index, item) => {
		if (index < 0 || index >= items.value.length) {
			return;
		}

		const previous = items.value[index];
		const prevTotals = toLineTotals(previous);
		const updated = cloneItem(item);
		const previousRowId = itemOrder.value[index];
		if (previousRowId && previousRowId !== updated.posa_row_id) {
			itemById.delete(previousRowId);
		}
		itemById.set(updated.posa_row_id, updated);
		items.value.splice(index, 1, updated);
		itemOrder.value.splice(index, 1, updated.posa_row_id);
		if (updated.posa_row_key) {
			keyIndex.set(updated.posa_row_key, updated.posa_row_id);
		}
		const nextTotals = toLineTotals(updated);
		runningTotals.value = {
			qty: runningTotals.value.qty - prevTotals.qty + nextTotals.qty,
			gross: runningTotals.value.gross - prevTotals.gross + nextTotals.gross,
			discount: runningTotals.value.discount - prevTotals.discount + nextTotals.discount,
		};
		touch();
	};

	const upsertItem = (item, priceList = "") => {
		if (!item) {
			return;
		}

		const normalized = cloneItem(item, resolvePriceList(priceList));
		const rowId = normalized.posa_row_id;
		const index = itemOrder.value.indexOf(rowId);

		if (index === -1) {
			itemOrder.value.push(rowId);
			itemById.set(rowId, normalized);
			items.value.push(normalized);
			const totals = toLineTotals(normalized);
			runningTotals.value = {
				qty: runningTotals.value.qty + totals.qty,
				gross: runningTotals.value.gross + totals.gross,
				discount: runningTotals.value.discount + totals.discount,
			};
		} else {
			const existing = itemById.get(rowId) || items.value[index];
			const prevTotals = toLineTotals(existing);
			const merged = { ...existing, ...normalized };
			itemById.set(rowId, merged);
			items.value.splice(index, 1, merged);
			const nextTotals = toLineTotals(merged);
			runningTotals.value = {
				qty: runningTotals.value.qty - prevTotals.qty + nextTotals.qty,
				gross: runningTotals.value.gross - prevTotals.gross + nextTotals.gross,
				discount: runningTotals.value.discount - prevTotals.discount + nextTotals.discount,
			};
		}

		if (normalized.posa_row_key) {
			keyIndex.set(normalized.posa_row_key, normalized.posa_row_id);
		}
		touch();
	};

	const removeItemByRowId = (rowId) => {
		if (!rowId) {
			return;
		}

		const index = itemOrder.value.indexOf(rowId);
		if (index === -1) {
			return;
		}

		const existing = itemById.get(rowId) || items.value[index];
		const prevTotals = toLineTotals(existing);
		itemOrder.value.splice(index, 1);
		items.value.splice(index, 1);
		itemById.delete(rowId);
		const nextTotals = {
			qty: runningTotals.value.qty - prevTotals.qty,
			gross: runningTotals.value.gross - prevTotals.gross,
			discount: runningTotals.value.discount - prevTotals.discount,
		};
		runningTotals.value = nextTotals;
		if (existing?.posa_row_key) {
			keyIndex.delete(existing.posa_row_key);
		}
		touch();
	};

	const clearItems = () => {
		if (items.value.length) {
			applySnapshot(
				{
					order: [],
					byId: new Map(),
					keyIndex: new Map(),
					items: [],
					totals: { qty: 0, gross: 0, discount: 0 },
				},
				{ skipTouch: false },
			);
		}
	};

	const setPackedItems = (list) => {
		packedItems.value = Array.isArray(list) ? list.map(cloneItem) : [];
		touch();
	};

	const clear = () => {
		invoiceDoc.value = null;
		setItems([]);
		packedItems.value = [];
	};

	const totalQty = computed(() => runningTotals.value.qty);

	const grossTotal = computed(() => runningTotals.value.gross);

	const discountTotal = computed(() => runningTotals.value.discount);

	const itemsCount = computed(() => itemOrder.value.length);

	const itemsMap = computed(() => {
		const map = new Map();
		itemOrder.value.forEach((rowId, index) => {
			const line = itemById.get(rowId);
			if (line) {
				map.set(rowId, { index, item: line });
			}
		});
		return map;
	});

	watch(
		items,
		(newList) => {
			if (suppressSync) return;
			const snapshot = buildSnapshot(newList, resolvePriceList());
			applySnapshot(snapshot, { skipTouch: true });
			touch();
		},
		{ deep: true },
	);

	return {
		invoiceDoc,
		items,
		packedItems,
		itemOrder,
		itemById,
		keyIndex,
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
