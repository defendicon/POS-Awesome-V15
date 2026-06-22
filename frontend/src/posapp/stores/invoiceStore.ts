/**
 * Centralized invoice state management using Pinia.
 *
 * ## Storage model
 * Cart items are stored in a normalized two-part structure to avoid O(n) array scans
 * and to allow efficient in-place mutation without triggering a full array rebuild:
 * - `itemsData` — `reactive(Map<posa_row_id, CartItem>)` for O(1) keyed lookup and
 *   direct field mutation on the reactive proxy.
 * - `itemOrder` — `ref<string[]>` that preserves insertion order.
 *
 * The `items` computed property reconstructs an ordered `CartItem[]` from both structures
 * on each access and should be used wherever an array view of the cart is needed.
 *
 * `posa_row_id` is the stable key for every cart row. When an incoming item lacks one,
 * a random alphanumeric ID is generated and written back onto the input object.
 *
 * ## Totals
 * `totalQty`, `grossTotal`, and `discountTotal` are maintained as separate refs.
 * Row inserts/removals and store-mediated item edits update those totals
 * incrementally. Manual edit paths call the debounced total refresh explicitly.
 *
 * ## Sticky fields
 * Discount and delivery-charge fields that should survive an invoice reset are stored as
 * top-level refs. Pass `{ preserveStickies: true }` to `clear()` to retain them when
 * loading a new invoice without changing the operator's current settings.
 */

import { defineStore } from "pinia";
import { computed, ref, reactive } from "vue";

declare const frappe: any;
declare const __: any;
import type {
	CartItem,
	InvoiceDocRef,
	InvoiceMetadata,
	DeliveryCharge,
	PartialInvoiceDoc,
} from "../types/models";

/**
 * Converts an arbitrary value to a finite number.
 * Returns `0` for `null`, `undefined`, empty strings, `NaN`, and `±Infinity`.
 */
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

const getItemTotals = (item: any) => {
	const qty = toNumber(item?.qty);
	const rate = toNumber(item?.rate);
	const disc = toNumber(item?.discount_amount || 0);
	const lineAmount = toNumber(item?.amount);
	const hasLineAmount =
		item?.amount !== undefined &&
		item?.amount !== null &&
		item?.amount !== "" &&
		Number.isFinite(lineAmount);

	return {
		qty,
		gross: hasLineAmount ? lineAmount : qty * rate,
		discount: Math.abs(qty * disc),
	};
};

export const useInvoiceStore = defineStore("invoice", () => {
	const invoiceDoc = ref<PartialInvoiceDoc | null>(null);
	const invoiceType = ref("Invoice");
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

	/**
	 * Bumps `metadata.changeVersion` and records `lastUpdated = Date.now()`.
	 * Called after every state mutation so that watchers and downstream computed
	 * properties can detect that the invoice has changed.
	 */
	const touch = () => {
		metadata.value = {
			lastUpdated: Date.now(),
			changeVersion: metadata.value.changeVersion + 1,
		};
	};

	/**
	 * Walks every item in `itemsData` and recomputes `totalQty`, `grossTotal`,
	 * and `discountTotal` from scratch in a single O(n) pass.
	 *
	 * - `grossTotal` = Σ (qty × rate)
	 * - `discountTotal` = Σ |qty × discount_amount| (unsigned; sign is not preserved)
	 *
	 * Called immediately after `setItems`, `addItems`, `removeItemByRowId`, and
	 * `clearItems`. For incremental field edits it is invoked via the debounced
	 * `triggerUpdateTotals` to avoid recalculating on every keystroke.
	 */
	const recalculateTotals = () => {
		let tQty = 0;
		let tGross = 0;
		let tDisc = 0;

		for (const item of Array.from(itemsData.values())) {
			const qty = toNumber(item.qty);
			const rate = toNumber(item.rate);
			const disc = toNumber(item.discount_amount || 0);
			const rawLineAmount = item.amount as unknown;
			const lineAmount = toNumber(rawLineAmount);
			const hasLineAmount =
				rawLineAmount !== undefined &&
				rawLineAmount !== null &&
				rawLineAmount !== "" &&
				Number.isFinite(lineAmount);

			tQty += qty;
			tGross += hasLineAmount ? lineAmount : qty * rate;
			tDisc += Math.abs(qty * disc);
		}

		totalQty.value = tQty;
		grossTotal.value = tGross;
		discountTotal.value = tDisc;
	};

	const applyTotalsDelta = (
		deltaQty: number,
		deltaGross: number,
		deltaDiscount: number,
	) => {
		totalQty.value += deltaQty;
		grossTotal.value += deltaGross;
		discountTotal.value += deltaDiscount;
	};

	const addLineTotals = (item: any, multiplier = 1) => {
		const totals = getItemTotals(item);
		applyTotalsDelta(
			totals.qty * multiplier,
			totals.gross * multiplier,
			totals.discount * multiplier,
		);
	};

	const applyLineTotalsDiff = (before: any, after: any) => {
		const oldTotals = getItemTotals(before);
		const newTotals = getItemTotals(after);
		applyTotalsDelta(
			newTotals.qty - oldTotals.qty,
			newTotals.gross - oldTotals.gross,
			newTotals.discount - oldTotals.discount,
		);
	};

	/**
	 * Schedules a `recalculateTotals` call 50 ms in the future, coalescing multiple
	 * calls within the same tick into a single recalculation.
	 * Used by `addItem`, `replaceItemAt`, and the deep `itemsData` watcher.
	 */
	let updateTimer: ReturnType<typeof setTimeout> | null = null;
	const triggerUpdateTotals = () => {
		if (updateTimer) return;
		updateTimer = setTimeout(() => {
			recalculateTotals();
			touch();
			updateTimer = null;
		}, 50);
	};

	/**
	 * Normalises a raw invoice value into an `InvoiceDoc` object or `null`.
	 *
	 * - `null` / `undefined` → `null`.
	 * - A non-empty string → `{ name: string, doctype: "POS Invoice" }` (minimal stub).
	 * - An empty / whitespace-only string → `null`.
	 * - Any object → shallow clone of the input cast to `InvoiceDoc`.
	 */
	const normalizeDoc = (doc: unknown): PartialInvoiceDoc | null => {
		if (!doc) {
			return null;
		}

		if (typeof doc === "string") {
			const name = doc.trim();
			return name
				? ({ name, doctype: "POS Invoice" } satisfies InvoiceDocRef)
				: null;
		}

		return { ...(doc as PartialInvoiceDoc) };
	};

	/**
	 * Replaces `invoiceDoc` with a normalised copy of `doc` and calls `touch()`.
	 * Passing `null`, `undefined`, or an empty string clears the current document.
	 *
	 * @param doc - Raw invoice document object, a name string, or a nullish value.
	 */
	const setInvoiceDoc = (
		doc: PartialInvoiceDoc | string | null | undefined,
	) => {
		invoiceDoc.value = normalizeDoc(doc);
		touch();
	};

	/**
	 * Shallow-merges `patch` into the current `invoiceDoc` and calls `touch()`.
	 * If no document is set yet, the patch is applied onto an empty object.
	 * Existing fields not present in `patch` are preserved.
	 *
	 * @param patch - Partial `InvoiceDoc` fields to apply. Defaults to `{}`.
	 */
	const mergeInvoiceDoc = (patch: PartialInvoiceDoc = {}) => {
		const current = invoiceDoc.value
			? { ...invoiceDoc.value }
			: ({} as PartialInvoiceDoc);
		invoiceDoc.value = Object.assign(current, patch || {});
		touch();
	};

	const invoiceToLoad = ref<any>(null);
	const orderToLoad = ref<any>(null);
	const flowToLoad = ref<any>(null);
	const flowContext = ref<any | null>(null);
	const postingDate = ref(frappe.datetime.nowdate());

	// Sticky fields moved from local component state
	const discountAmount = ref(0);
	const additionalDiscount = ref(0);
	const additionalDiscountPercentage = ref(0);
	const deliveryCharges = ref<DeliveryCharge[]>([]);
	const deliveryChargesRate = ref(0);
	const selectedDeliveryCharge = ref("");
	/**
	 * `true` when `invoiceType` is `"Order"` or `"Quotation"`.
	 *
	 * When `true`, stock-level validation is skipped at cart-add time and deferred until
	 * the payment/confirmation step. This mirrors ERPNext order behaviour where stock can
	 * be committed before it is physically available.
	 *
	 * TODO: verify whether `"Quotation"` actually participates in stock-validation deferral
	 * in the current backend flow, or whether only `"Order"` does.
	 */
	const deferStockValidationToPayment = computed(() =>
		invoiceType.value === "Order" || invoiceType.value === "Quotation",
	);

	/**
	 * Sets `invoiceType`. Falls back to `"Invoice"` when `value` is empty or not a string.
	 *
	 * @param value - One of `"Invoice"`, `"Order"`, or `"Quotation"`.
	 */
	const setInvoiceType = (value: string) => {
		invoiceType.value = typeof value === "string" && value ? value : "Invoice";
	};

	/** Resets `invoiceType` to `"Invoice"`. */
	const resetInvoiceType = () => {
		invoiceType.value = "Invoice";
	};

	/**
	 * Overrides the invoice posting date.
	 *
	 * @param date - Date string in `"YYYY-MM-DD"` format.
	 */
	const setPostingDate = (date: string) => {
		postingDate.value = date;
	};

	/** Resets `postingDate` to today's date via `frappe.datetime.nowdate()`. */
	const resetPostingDate = () => {
		postingDate.value = frappe.datetime.nowdate();
	};

	/** Sets the line-level discount amount. Non-numeric values are coerced to `0`. */
	const setDiscountAmount = (val: any) => {
		discountAmount.value = toNumber(val);
	};

	/** Sets the transaction-level additional discount amount. Non-numeric values are coerced to `0`. */
	const setAdditionalDiscount = (val: any) => {
		additionalDiscount.value = toNumber(val);
	};

	/** Sets the transaction-level discount percentage. Non-numeric values are coerced to `0`. */
	const setAdditionalDiscountPercentage = (val: any) => {
		additionalDiscountPercentage.value = toNumber(val);
	};

	/** Replaces the delivery-charge list. Non-array values are coerced to `[]`. */
	const setDeliveryCharges = (val: any) => {
		deliveryCharges.value = Array.isArray(val) ? val : [];
	};

	/** Sets the active delivery charge rate. Non-numeric values are coerced to `0`. */
	const setDeliveryChargesRate = (val: any) => {
		deliveryChargesRate.value = toNumber(val);
	};

	/** Sets the name of the currently selected delivery charge option. */
	const setSelectedDeliveryCharge = (val: string) => {
		selectedDeliveryCharge.value = val;
	};

	/**
	 * Clears `deliveryCharges`, resets `deliveryChargesRate` to `0`,
	 * and clears `selectedDeliveryCharge`.
	 */
	const resetDeliveryCharges = () => {
		deliveryCharges.value = [];
		deliveryChargesRate.value = 0;
		selectedDeliveryCharge.value = "";
	};

	/**
	 * Replaces all cart items with the supplied list.
	 *
	 * Clears `itemsData` and `itemOrder` before inserting the new items. Each item
	 * must carry a `posa_row_id`; if absent, a random alphanumeric ID is generated and
	 * written back onto the input object. Items are shallow-cloned on insertion.
	 *
	 * Totals are recalculated immediately (not debounced) after the replacement.
	 *
	 * @param list - Array of cart items to set. Non-array values are ignored (cart is cleared).
	 */
	const setItems = (list: any[]) => {
		itemsData.clear();
		const order: string[] = [];
		if (Array.isArray(list)) {
			list.forEach((item) => {
				if (!item) return;
				const rowId =
					item.posa_row_id ||
					Math.random().toString(36).substring(2, 20);
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

	/**
	 * Adds a single item to the cart and returns its reactive map proxy.
	 *
	 * If `item.posa_row_id` is absent a random alphanumeric ID is generated and written
	 * back onto the input object. The item is shallow-cloned before being stored so that
	 * external mutations to the original object do not affect the stored copy.
	 *
	 * **Insertion position:**
	 * - `index >= 0` and within bounds → inserted at that position in `itemOrder`.
	 * - `index === 0` when the order array is empty → `unshift` (prepend).
	 * - Any other value (default `-1`) → appended at the end.
	 *
	 * Totals are updated via the debounced `triggerUpdateTotals`.
	 *
	 * @param item - Cart item to add. Must be a non-null object; null/undefined is a no-op.
	 * @param index - Insertion position in `itemOrder`. Defaults to `-1` (append).
	 * @returns The reactive proxy of the stored item, or `undefined` if `item` is falsy.
	 */
	const addItem = (item: any, index = -1) => {
		if (!item) return;
		const rowId =
			item.posa_row_id || Math.random().toString(36).substring(2, 20);
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
		addLineTotals(cloned);
		touch();
		// Return the reactive proxy from the map
		return itemsData.get(rowId);
	};

	/**
	 * Adds multiple items to the cart in a single operation.
	 *
	 * Items are inserted as a contiguous block at `index`, preserving their relative order
	 * within the batch. Totals are recalculated immediately (not debounced) after insertion.
	 *
	 * @param items - Array of cart items to add.
	 * @param index - Insertion position. Defaults to `-1` (append).
	 * @returns Array of reactive map proxies (one per added item), in insertion order.
	 */
	const addItems = (items: any[], index = -1) => {
		if (!Array.isArray(items) || !items.length) return [];
		const addedIds: string[] = [];
		let deltaQty = 0;
		let deltaGross = 0;
		let deltaDiscount = 0;

		items.forEach((item) => {
			if (!item) return;
			const rowId =
				item.posa_row_id || Math.random().toString(36).substring(2, 20);
			if (!item.posa_row_id) item.posa_row_id = rowId;
			const cloned = cloneItem(item);
			itemsData.set(rowId, cloned);
			const totals = getItemTotals(cloned);
			deltaQty += totals.qty;
			deltaGross += totals.gross;
			deltaDiscount += totals.discount;
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
			applyTotalsDelta(deltaQty, deltaGross, deltaDiscount);
			touch();
		}

		return addedIds.map((id) => itemsData.get(id));
	};

	/**
	 * Replaces the cart item at positional `index` with `item`.
	 *
	 * If `item.posa_row_id` differs from the ID currently held at `index`, the old entry
	 * is removed from `itemsData` and `itemOrder[index]` is updated to the new ID.
	 * When the IDs match, only the map entry is overwritten. The item is shallow-cloned.
	 *
	 * No-ops silently when `index` is out of range.
	 *
	 * @param index - Zero-based position in `itemOrder`.
	 * @param item - Replacement cart item. Its `posa_row_id` may differ from the existing row.
	 */
	const replaceItemAt = (index: number, item: any) => {
		if (index < 0 || index >= itemOrder.value.length) {
			return;
		}
		const oldId = itemOrder.value[index];
		if (oldId === undefined) return;

		const rowId = item.posa_row_id || oldId;
		if (!item.posa_row_id) item.posa_row_id = rowId;
		const previous = oldId ? itemsData.get(oldId) : undefined;

		if (oldId !== rowId) {
			itemsData.delete(oldId);
			itemOrder.value[index] = rowId;
		}
		const cloned = cloneItem(item);
		itemsData.set(rowId, cloned);
		applyLineTotalsDiff(previous, cloned);
		touch();
	};

	/**
	 * Updates an existing item in-place or inserts it as a new row.
	 *
	 * - If `item.posa_row_id` is present and already in `itemsData`, `Object.assign` is
	 *   used to merge all fields onto the existing reactive proxy (preserving reactivity
	 *   without replacing the object reference).
	 * - If the ID is absent or not yet in the map, the item is forwarded to `addItem`.
	 *
	 * @param item - Cart item to upsert. Null/undefined is a no-op.
	 */
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
			updateItemWithTotals(rowId, (existing) => {
				Object.assign(existing, item);
			});
		} else {
			addItem(item);
		}
	};

	const updateItemWithTotals = (
		rowId: string,
		updater: (_item: CartItem) => void,
	) => {
		if (!rowId || typeof updater !== "function") return;
		const item = itemsData.get(rowId);
		if (!item) return;

		const before = cloneItem(item);
		updater(item);
		applyLineTotalsDiff(before, item);
		touch();
		return item;
	};

	/**
	 * Removes the item identified by `rowId` from both `itemsData` and `itemOrder`,
	 * then recalculates totals immediately.
	 *
	 * No-ops silently when `rowId` is falsy or not found in the map.
	 *
	 * @param rowId - The `posa_row_id` of the item to remove.
	 */
	const removeItemByRowId = (rowId: string) => {
		if (!rowId) {
			return;
		}

		if (itemsData.has(rowId)) {
			const existing = itemsData.get(rowId);
			itemsData.delete(rowId);
			const idx = itemOrder.value.indexOf(rowId);
			if (idx !== -1) {
				itemOrder.value.splice(idx, 1);
			}
			if (existing) {
				addLineTotals(existing, -1);
			}
			touch();
		}
	};

	/**
	 * Empties all cart items and resets `totalQty`, `grossTotal`, and `discountTotal` to `0`.
	 * No-ops (without calling `touch()`) when the cart is already empty.
	 */
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

	/**
	 * Replaces the packed-items list (product bundles expanded by ERPNext).
	 * Each item is shallow-cloned. Non-array values are coerced to `[]`.
	 *
	 * @param list - Array of packed-item records from the ERPNext `packed_items` table.
	 */
	const setPackedItems = (list: any[]) => {
		packedItems.value = Array.isArray(list) ? list.map(cloneItem) : [];
		touch();
	};

	/**
	 * Resets the invoice to a blank state.
	 *
	 * Always clears: `invoiceDoc`, all cart items, and `packedItems`.
	 *
	 * When `preserveStickies` is `false` (default) the following sticky fields are
	 * also reset:
	 * - `invoiceType` → `"Invoice"`.
	 * - `discountAmount`, `additionalDiscount`, `additionalDiscountPercentage` → `0`.
	 * - Delivery charge fields → empty/zero.
	 *
	 * @param options.preserveStickies - When `true`, sticky discount and delivery charge
	 *   fields are left unchanged. Useful when loading a new invoice without clearing
	 *   the operator's current discount or delivery settings.
	 */
	const clear = (options: { preserveStickies?: boolean } = {}) => {
		const { preserveStickies = false } = options;
		invoiceDoc.value = null;
		flowContext.value = null;
		flowToLoad.value = null;
		clearItems();
		packedItems.value = [];

		if (!preserveStickies) {
			resetInvoiceType();
			discountAmount.value = 0;
			additionalDiscount.value = 0;
			additionalDiscountPercentage.value = 0;
			resetDeliveryCharges();
		}

		touch();
	};

	/**
	 * Ordered array of cart items, reconstructed from `itemOrder` and `itemsData`.
	 * Items missing from the map are silently filtered out (should not occur in normal use).
	 * Use this anywhere an array view of the cart is needed.
	 */
	// Computed property that reconstructs the array from map + order
	const items = computed(() => {
		return itemOrder.value
			.map((id) => itemsData.get(id))
			.filter(
				(item): item is CartItem => item !== undefined && item !== null,
			);
	});

	/** Number of rows currently in the cart (length of `itemOrder`). */
	const itemsCount = computed(() => itemOrder.value.length);

	/**
	 * Map from `posa_row_id` to `{ index, item }`, built from `itemOrder` and `itemsData`.
	 * Useful when callers need both the item and its positional index without scanning
	 * the `items` array. Reconstructed on every change to `itemOrder` or `itemsData`.
	 */
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

	return {
		invoiceDoc,
		invoiceType,
		deferStockValidationToPayment,
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
		setInvoiceType,
		resetInvoiceType,
		mergeInvoiceDoc,
		touch,
		setItems,
		addItem,
		addItems,
		replaceItemAt,
		upsertItem,
		updateItemWithTotals,
		triggerUpdateTotals,
		removeItemByRowId,
		clearItems,
		setPackedItems,
		clear,
		recalculateTotals, // Exposed for manual trigger if needed
		invoiceToLoad,
		postingDate,
		setPostingDate,
		resetPostingDate,
		/**
		 * Signals that `doc` should be loaded as the active invoice.
		 * Sets `invoiceToLoad`, which is watched by the invoice-loading composable.
		 *
		 * @param doc - Invoice document object or name string to load.
		 */
		triggerLoadInvoice: (
			doc: PartialInvoiceDoc | string | null | undefined,
		) => {
			invoiceToLoad.value = doc;
		},
		orderToLoad,
		flowToLoad,
		flowContext,
		/**
		 * Signals that `doc` should be loaded as the active order.
		 * Sets `orderToLoad`, which is watched by the order-loading composable.
		 *
		 * @param doc - Order document object or name string to load.
		 */
		triggerLoadOrder: (doc: any) => {
			orderToLoad.value = doc;
		},
		setFlowContext: (context: any) => {
			flowContext.value = context || null;
		},
		clearFlowContext: () => {
			flowContext.value = null;
		},
		triggerLoadFlow: (flow: any) => {
			flowContext.value = flow?.flow_context || null;
			flowToLoad.value = flow?.prepared_doc || flow;
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
		resetDeliveryCharges,
	};
});

export default useInvoiceStore;
