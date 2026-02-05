/**
 * Centralized invoice state management using Pinia.
 * Handles large invoice datasets efficiently and keeps totals in sync.
 */

import { defineStore } from "pinia";
import { computed, ref, reactive, watch } from "vue";

declare const frappe: any;
declare const __: any;
import type { CartItem, InvoiceDoc, InvoiceMetadata, DeliveryCharge } from "../types/models";

const toNumber = (value: any): number => {
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

const cloneItem = <T>(item: T): T => ({ ...item });

export const useInvoiceStore = defineStore("invoice", () => {
  const invoiceDoc = ref<InvoiceDoc | null>(null);
  // Normalized state: keys array + items map
  const itemOrder = ref<string[]>([]);
  const itemsData = reactive(new Map<string, CartItem>());

  const packedItems = ref<any[]>([]);
  const metadata = ref<InvoiceMetadata>({
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
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  const triggerUpdateTotals = () => {
    if (updateTimer) return;
    updateTimer = setTimeout(() => {
      recalculateTotals();
      updateTimer = null;
    }, 50);
  };

  const normalizeDoc = (doc: any): InvoiceDoc | null => {
    if (!doc) {
      return null;
    }

    if (typeof doc === "string") {
      return doc.trim() ? { name: doc, doctype: 'POS Invoice' } as InvoiceDoc : null;
    }

    return { ...doc };
  };

  const setInvoiceDoc = (doc: any) => {
    invoiceDoc.value = normalizeDoc(doc);
    touch();
  };

  const mergeInvoiceDoc = (patch: Partial<InvoiceDoc> = {}) => {
    const current = invoiceDoc.value ? { ...invoiceDoc.value } : {} as InvoiceDoc;
    invoiceDoc.value = Object.assign(current, patch || {});
    touch();
  };

  const posProfile = ref<any>(null);
  const invoiceToLoad = ref<any>(null);
  const orderToLoad = ref<any>(null);
  const postingDate = ref(frappe.datetime.nowdate());

  // Sticky fields moved from local component state
  const discountAmount = ref(0);
  const additionalDiscount = ref(0);
  const additionalDiscountPercentage = ref(0);
  const deliveryCharges = ref<DeliveryCharge[]>([]);
  const deliveryChargesRate = ref(0);
  const selectedDeliveryCharge = ref("");

  const setPostingDate = (date: string) => {
    postingDate.value = date;
  };

  const resetPostingDate = () => {
    postingDate.value = frappe.datetime.nowdate();
  };

  const setDiscountAmount = (val: any) => {
    discountAmount.value = toNumber(val);
  };

  const setAdditionalDiscount = (val: any) => {
    additionalDiscount.value = toNumber(val);
  };

  const setAdditionalDiscountPercentage = (val: any) => {
    additionalDiscountPercentage.value = toNumber(val);
  };

  const setDeliveryCharges = (val: any) => {
    deliveryCharges.value = Array.isArray(val) ? val : [];
  };

  const setDeliveryChargesRate = (val: any) => {
    deliveryChargesRate.value = toNumber(val);
  };

  const setSelectedDeliveryCharge = (val: string) => {
    selectedDeliveryCharge.value = val;
  };

  const setItems = (list: any[]) => {
    itemsData.clear();
    const order: string[] = [];
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (!item) return;
        const rowId = item.posa_row_id || Math.random().toString(36).substring(2, 20);
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

  const addItem = (item: any, index = -1) => {
    if (!item) return;
    const rowId = item.posa_row_id || Math.random().toString(36).substring(2, 20);
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
    triggerUpdateTotals();
    // Return the reactive proxy from the map
    return itemsData.get(rowId);
  };

  const addItems = (items: any[], index = -1) => {
    if (!Array.isArray(items) || !items.length) return [];
    const addedIds: string[] = [];

    items.forEach((item) => {
      if (!item) return;
      const rowId = item.posa_row_id || Math.random().toString(36).substring(2, 20);
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

  const replaceItemAt = (index: number, item: any) => {
    if (index < 0 || index >= itemOrder.value.length) {
      return;
    }
    const oldId = itemOrder.value[index];
    if (oldId === undefined) return;

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

  const upsertItem = (item: any) => {
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
      if (existing) {
        Object.assign(existing, item);
      }
      touch();
    } else {
      addItem(item);
    }
  };

  const removeItemByRowId = (rowId: string) => {
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

  const setPackedItems = (list: any[]) => {
    packedItems.value = Array.isArray(list) ? list.map(cloneItem) : [];
    touch();
  };

  const clear = (options: { preserveStickies?: boolean } = {}) => {
    const { preserveStickies = false } = options;
    invoiceDoc.value = null;
    clearItems();
    packedItems.value = [];

    if (!preserveStickies) {
      discountAmount.value = 0;
      additionalDiscount.value = 0;
      additionalDiscountPercentage.value = 0;
      deliveryChargesRate.value = 0;
      selectedDeliveryCharge.value = "";
    }

    touch();
  };

  // Computed property that reconstructs the array from map + order
  const items = computed(() => {
    return itemOrder.value
      .map((id) => itemsData.get(id))
      .filter((item): item is CartItem => item !== undefined && item !== null);
  });

  const itemsCount = computed(() => itemOrder.value.length);

  const itemsMap = computed(() => {
    const map = new Map<string, { index: number; item: CartItem }>();
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
    invoiceToLoad,
    postingDate,
    setPostingDate,
    resetPostingDate,
    triggerLoadInvoice: (doc: any) => {
      invoiceToLoad.value = doc;
    },
    orderToLoad,
    triggerLoadOrder: (doc: any) => {
      orderToLoad.value = doc;
    },
    // Exposed sticky fields
    discountAmount,
    additionalDiscount,
    additionalDiscountPercentage,
    deliveryCharges,
    deliveryChargesRate,
    selectedDeliveryCharge,
    // Setters
    setDiscountAmount,
    setAdditionalDiscount,
    setAdditionalDiscountPercentage,
    setDeliveryCharges,
    setDeliveryChargesRate,
    setSelectedDeliveryCharge,
  };
});

export default useInvoiceStore;
