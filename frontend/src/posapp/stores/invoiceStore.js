/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently and keeps totals in sync.
 */

import { defineStore } from "pinia";
import { computed, reactive, shallowRef, triggerRef } from "vue";

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

const computeContribution = (item) => {
        if (!item || typeof item !== "object") {
                return {
                        qty: 0,
                        gross: 0,
                        discount: 0,
                };
        }

        const qty = toNumber(item.qty);
        const rate = toNumber(item.rate);
        const discount = Math.abs(qty) * toNumber(item.discount_amount || 0);

        return {
                qty,
                gross: qty * rate,
                discount,
        };
};

const cloneForCollection = (item) => {
        if (!item || typeof item !== "object") {
                return {};
        }
        return { ...item };
};

export const useInvoiceStore = defineStore("invoice", () => {
        const invoiceDoc = shallowRef(null);
        const items = shallowRef([]);
        const packedItems = shallowRef([]);
        const itemsMap = shallowRef(new Map());
        const totals = reactive({
                qty: 0,
                gross: 0,
                discount: 0,
        });
        const metadata = reactive({
                lastUpdated: Date.now(),
                changeVersion: 0,
                itemsVersion: 0,
                totalsVersion: 0,
                packedVersion: 0,
        });

        const getNow = () => Date.now();

        const touch = (flags = {}) => {
                metadata.lastUpdated = getNow();
                metadata.changeVersion += 1;

                if (flags.items) {
                        metadata.itemsVersion += 1;
                }

                if (flags.totals) {
                        metadata.totalsVersion += 1;
                }

                if (flags.packed) {
                        metadata.packedVersion += 1;
                }
        };

        const resetTotals = () => {
                totals.qty = 0;
                totals.gross = 0;
                totals.discount = 0;
        };

        const applyTotalsDelta = (previousItem, nextItem) => {
                const prev = computeContribution(previousItem);
                const next = computeContribution(nextItem);

                totals.qty += next.qty - prev.qty;
                totals.gross += next.gross - prev.gross;
                totals.discount += next.discount - prev.discount;
        };

        const ensureItemsMap = () => {
                if (!(itemsMap.value instanceof Map)) {
                        itemsMap.value = new Map();
                }
                return itemsMap.value;
        };

        const setMapEntry = (rowId, index, item) => {
                if (!rowId) {
                        return;
                }

                const map = ensureItemsMap();
                const entry = map.get(rowId);
                if (entry) {
                        entry.index = index;
                        entry.item = item;
                } else {
                        map.set(rowId, { index, item });
                }
        };

        const deleteMapEntry = (rowId) => {
                if (!rowId) {
                        return false;
                }

                const map = ensureItemsMap();
                return map.delete(rowId);
        };

        const reindexFrom = (startIndex = 0) => {
                for (let i = startIndex; i < items.value.length; i += 1) {
                        const item = items.value[i];
                        const rowId = item?.posa_row_id;
                        if (rowId) {
                                setMapEntry(rowId, i, item);
                        }
                }
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
                const normalized = Array.isArray(list) ? list.map(cloneForCollection) : [];
                items.value = normalized;

                const map = ensureItemsMap();
                map.clear();

                let totalQty = 0;
                let totalGross = 0;
                let totalDiscount = 0;

                normalized.forEach((item, index) => {
                        const { qty, gross, discount } = computeContribution(item);
                        totalQty += qty;
                        totalGross += gross;
                        totalDiscount += discount;

                        if (item?.posa_row_id) {
                                map.set(item.posa_row_id, { index, item });
                        }
                });

                totals.qty = totalQty;
                totals.gross = totalGross;
                totals.discount = totalDiscount;

                triggerRef(itemsMap);
                touch({ items: true, totals: true });
        };

        const replaceItemAt = (index, item) => {
                if (index < 0 || index >= items.value.length) {
                        return;
                }

                const current = items.value[index];
                const updatedItem = cloneForCollection(item);

                items.value[index] = updatedItem;
                applyTotalsDelta(current, updatedItem);

                const previousRowId = current?.posa_row_id;
                const nextRowId = updatedItem?.posa_row_id;

                if (previousRowId && previousRowId !== nextRowId) {
                        deleteMapEntry(previousRowId);
                }

                if (nextRowId) {
                        setMapEntry(nextRowId, index, updatedItem);
                }

                triggerRef(items);
                triggerRef(itemsMap);
                touch({ items: true, totals: true });
        };

        const upsertItem = (item) => {
                if (!item) {
                        return;
                }

                const rowId = item.posa_row_id;
                const map = ensureItemsMap();

                if (rowId && map.has(rowId)) {
                        const { index } = map.get(rowId);
                        let target = items.value[index];
                        if (!target || typeof target !== "object") {
                                target = {};
                                items.value[index] = target;
                        }

                        const snapshot = { ...target };
                        Object.assign(target, item);
                        applyTotalsDelta(snapshot, target);
                        setMapEntry(rowId, index, target);

                        triggerRef(items);
                        triggerRef(itemsMap);
                        touch({ items: true, totals: true });
                        return;
                }

                const appended = cloneForCollection(item);
                items.value.push(appended);
                applyTotalsDelta(null, appended);

                const newIndex = items.value.length - 1;
                if (rowId) {
                        setMapEntry(rowId, newIndex, appended);
                }

                triggerRef(items);
                triggerRef(itemsMap);
                touch({ items: true, totals: true });
        };

        const removeItemByRowId = (rowId) => {
                if (!rowId) {
                        return;
                }

                const map = ensureItemsMap();
                const entry = map.get(rowId);
                if (!entry) {
                        return;
                }

                const { index, item } = entry;
                map.delete(rowId);

                items.value.splice(index, 1);
                applyTotalsDelta(item, null);

                reindexFrom(index);

                triggerRef(items);
                triggerRef(itemsMap);
                touch({ items: true, totals: true });
        };

        const clearItems = () => {
                if (items.value.length) {
                        items.value = [];
                        ensureItemsMap().clear();
                        resetTotals();

                        triggerRef(items);
                        triggerRef(itemsMap);
                        touch({ items: true, totals: true });
                }
        };

        const setPackedItems = (list) => {
                packedItems.value = Array.isArray(list) ? list.map(cloneForCollection) : [];
                touch({ packed: true });
        };

        const clear = () => {
                invoiceDoc.value = null;
                items.value = [];
                packedItems.value = [];
                ensureItemsMap().clear();
                resetTotals();

                triggerRef(items);
                triggerRef(itemsMap);
                touch({ items: true, totals: true, packed: true });
        };

        const getItemByRowId = (rowId) => {
                if (!rowId) {
                        return undefined;
                }

                const entry = ensureItemsMap().get(rowId);
                return entry ? entry.item : undefined;
        };

        const totalQty = computed(() => totals.qty);
        const grossTotal = computed(() => totals.gross);
        const discountTotal = computed(() => totals.discount);
        const itemsCount = computed(() => items.value.length);

        return {
                invoiceDoc,
                items,
                packedItems,
                itemsMap,
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
                getItemByRowId,
        };
});

export default useInvoiceStore;
