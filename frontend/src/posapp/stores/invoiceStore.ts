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
 * Row contribution totals are cached by `posa_row_id`, so explicit row mutations update
 * only the affected row contribution. Row-scoped watchers remain as a compatibility
 * fallback for legacy direct mutations without rescanning the whole cart.
 *
 * ## Sticky fields
 * Discount and delivery-charge fields that should survive an invoice reset are stored as
 * top-level refs. Pass `{ preserveStickies: true }` to `clear()` to retain them when
 * loading a new invoice without changing the operator's current settings.
 */

import { defineStore } from "pinia";
import { computed, ref, reactive, watch, type WatchStopHandle } from "vue";

declare const frappe: any;
declare const __: any;
import type {
	CartItem,
	InvoiceDoc,
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

type CartMutationKind =
	| "quantity"
	| "rate"
	| "discount"
	| "pricing"
	| "stock"
	| "display"
	| "structure";

type CartMutationOptions = {
	kind?: CartMutationKind | CartMutationKind[];
	manual?: boolean;
	touch?: boolean;
};

type RowTotals = {
	qty: number;
	gross: number;
	discount: number;
	signature: string;
};

const emptyInvalidationState = () => ({
	version: 0,
	quantityRows: [] as string[],
	rateRows: [] as string[],
	discountRows: [] as string[],
	pricingRows: [] as string[],
	stockRows: [] as string[],
	displayRows: [] as string[],
	structureRows: [] as string[],
});

const dedupePush = (list: string[], rowId: string) => {
	if (rowId && !list.includes(rowId)) {
		list.push(rowId);
	}
};

const normalizeKinds = (
	kind?: CartMutationKind | CartMutationKind[],
): CartMutationKind[] => {
	if (!kind) return [];
	return Array.isArray(kind) ? kind.filter(Boolean) : [kind];
};

const classifyChangedFields = (fields: string[]): CartMutationKind[] => {
	const kinds = new Set<CartMutationKind>();
	const quantityFields = new Set([
		"qty",
		"stock_qty",
		"base_qty",
		"base_quantity",
		"conversion_factor",
	]);
	const rateFields = new Set([
		"rate",
		"base_rate",
		"price_list_rate",
		"base_price_list_rate",
	]);
	const discountFields = new Set([
		"discount_amount",
		"base_discount_amount",
		"discount_percentage",
	]);
	const stockFields = new Set([
		"qty",
		"stock_qty",
		"warehouse",
		"batch_no",
		"serial_no",
		"serial_no_selected",
		"conversion_factor",
		"uom",
	]);
	const pricingFields = new Set([
		"item_code",
		"item_group",
		"brand",
		"qty",
		"stock_qty",
		"uom",
		"conversion_factor",
		"rate",
		"base_rate",
		"price_list_rate",
		"base_price_list_rate",
	]);

	fields.forEach((field) => {
		if (quantityFields.has(field)) kinds.add("quantity");
		if (rateFields.has(field)) kinds.add("rate");
		if (discountFields.has(field)) kinds.add("discount");
		if (stockFields.has(field)) kinds.add("stock");
		if (pricingFields.has(field)) kinds.add("pricing");
	});

	if (!kinds.size && fields.length) {
		kinds.add("display");
	}

	return Array.from(kinds);
};

const computeRowTotals = (item: CartItem): RowTotals => {
	const qty = toNumber(item.qty);
	const rate = toNumber(item.rate);
	const discountAmount = toNumber(item.discount_amount || 0);

	return {
		qty,
		gross: qty * rate,
		discount: Math.abs(qty * discountAmount),
		signature: `${qty}|${rate}|${discountAmount}`,
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
	const rowTotals = reactive(new Map<string, RowTotals>());
	const rowWatchStops = new Map<string, WatchStopHandle>();
	const rowWatcherSuppressions = new Map<string, Set<string>>();
	const cartInvalidation = ref(emptyInvalidationState());

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

	const markRowsChanged = (
		rowIds: string | string[],
		kinds: CartMutationKind[] = [],
		options: { touchStore?: boolean } = {},
	) => {
		const ids = Array.isArray(rowIds) ? rowIds.filter(Boolean) : [rowIds];
		if (!ids.length || !kinds.length) {
			if (options.touchStore) touch();
			return;
		}

		const next = {
			...cartInvalidation.value,
			quantityRows: [...cartInvalidation.value.quantityRows],
			rateRows: [...cartInvalidation.value.rateRows],
			discountRows: [...cartInvalidation.value.discountRows],
			pricingRows: [...cartInvalidation.value.pricingRows],
			stockRows: [...cartInvalidation.value.stockRows],
			displayRows: [...cartInvalidation.value.displayRows],
			structureRows: [...cartInvalidation.value.structureRows],
			version: cartInvalidation.value.version + 1,
		};

		ids.forEach((rowId) => {
			kinds.forEach((kind) => {
				if (kind === "quantity") dedupePush(next.quantityRows, rowId);
				if (kind === "rate") dedupePush(next.rateRows, rowId);
				if (kind === "discount") dedupePush(next.discountRows, rowId);
				if (kind === "pricing") dedupePush(next.pricingRows, rowId);
				if (kind === "stock") dedupePush(next.stockRows, rowId);
				if (kind === "display") dedupePush(next.displayRows, rowId);
				if (kind === "structure") dedupePush(next.structureRows, rowId);
			});
		});

		cartInvalidation.value = next;
		if (options.touchStore) touch();
	};

	const clearCartInvalidation = () => {
		cartInvalidation.value = emptyInvalidationState();
	};

	const applyRowTotals = (rowId: string, item: CartItem) => {
		if (!rowId || !item) return false;

		const next = computeRowTotals(item);
		const previous = rowTotals.get(rowId);
		if (previous?.signature === next.signature) return false;

		if (previous) {
			totalQty.value -= previous.qty;
			grossTotal.value -= previous.gross;
			discountTotal.value -= previous.discount;
		}

		rowTotals.set(rowId, next);
		totalQty.value += next.qty;
		grossTotal.value += next.gross;
		discountTotal.value += next.discount;
		return true;
	};

	const removeRowTotals = (rowId: string) => {
		const previous = rowTotals.get(rowId);
		if (!previous) return;

		totalQty.value -= previous.qty;
		grossTotal.value -= previous.gross;
		discountTotal.value -= previous.discount;
		rowTotals.delete(rowId);
	};

	const unregisterRowWatcher = (rowId: string) => {
		const stop = rowWatchStops.get(rowId);
		if (stop) stop();
		rowWatchStops.delete(rowId);
		rowWatcherSuppressions.delete(rowId);
	};

	const unregisterAllRowWatchers = () => {
		rowWatchStops.forEach((stop) => stop());
		rowWatchStops.clear();
		rowWatcherSuppressions.clear();
	};

	const suppressRowWatcherFields = (rowId: string, fields: string[]) => {
		if (!rowId || !fields.length) return;
		const suppressed = rowWatcherSuppressions.get(rowId) || new Set<string>();
		fields.forEach((field) => suppressed.add(field));
		rowWatcherSuppressions.set(rowId, suppressed);
	};

	const registerRowWatcher = (rowId: string, item: CartItem) => {
		if (!rowId || !item) return;
		unregisterRowWatcher(rowId);
		const stop = watch(
			() => [
				item.qty,
				item.stock_qty,
				item.base_qty,
				item.rate,
				item.base_rate,
				item.price_list_rate,
				item.base_price_list_rate,
				item.discount_amount,
				item.base_discount_amount,
				item.discount_percentage,
				item.uom,
				item.conversion_factor,
				item.warehouse,
				item.batch_no,
				item.serial_no,
			],
			(newValues, oldValues = []) => {
				const watchedFields = [
					"qty",
					"stock_qty",
					"base_qty",
					"rate",
					"base_rate",
					"price_list_rate",
					"base_price_list_rate",
					"discount_amount",
					"base_discount_amount",
					"discount_percentage",
					"uom",
					"conversion_factor",
					"warehouse",
					"batch_no",
					"serial_no",
				];
				const changedFields = watchedFields.filter(
					(_field, index) => newValues[index] !== oldValues[index],
				);
				if (!changedFields.length) return;

				const suppressed = rowWatcherSuppressions.get(rowId);
				const unsuppressedFields = suppressed
					? changedFields.filter((field) => {
							if (suppressed.has(field)) {
								suppressed.delete(field);
								return false;
							}
							return true;
						})
					: changedFields;
				if (suppressed && !suppressed.size) {
					rowWatcherSuppressions.delete(rowId);
				}
				if (!unsuppressedFields.length) return;

				applyRowTotals(rowId, item);
				markRowsChanged(rowId, classifyChangedFields(unsuppressedFields), {
					touchStore: true,
				});
			},
			{ flush: "post" },
		);
		rowWatchStops.set(rowId, stop);
	};

	/**
	 * Walks every item in `itemsData` and recomputes `totalQty`, `grossTotal`,
	 * and `discountTotal` from scratch in a single O(n) pass.
	 *
	 * - `grossTotal` = Σ (qty × rate)
	 * - `discountTotal` = Σ |qty × discount_amount| (unsigned; sign is not preserved)
	 *
	 * Kept as a full consistency rebuild for bulk replacement and explicit callers.
	 * Normal row edits use `applyRowTotals()` instead of rescanning every row.
	 */
	const recalculateTotals = () => {
		let tQty = 0;
		let tGross = 0;
		let tDisc = 0;
		rowTotals.clear();

		for (const item of Array.from(itemsData.values())) {
			const rowId = item.posa_row_id;
			const row = computeRowTotals(item);
			if (rowId) {
				rowTotals.set(rowId, row);
			}

			tQty += row.qty;
			tGross += row.gross;
			tDisc += row.discount;
		}

		totalQty.value = tQty;
		grossTotal.value = tGross;
		discountTotal.value = tDisc;
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
		unregisterAllRowWatchers();
		itemsData.clear();
		rowTotals.clear();
		const order: string[] = [];
		if (Array.isArray(list)) {
			list.forEach((item) => {
				if (!item) return;
				const rowId =
					item.posa_row_id ||
					Math.random().toString(36).substring(2, 20);
				// Ensure item has ID
				if (!item.posa_row_id) item.posa_row_id = rowId;
				const cloned = cloneItem(item);
				itemsData.set(rowId, cloned);
				registerRowWatcher(rowId, cloned);
				order.push(rowId);
			});
		}
		itemOrder.value = order;
		touch();
		recalculateTotals(); // Immediate update on set
		if (order.length) {
			markRowsChanged(order, ["structure", "pricing", "stock"]);
		}
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
	 * Totals are updated immediately for this row's cached contribution.
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
		registerRowWatcher(rowId, cloned);
		applyRowTotals(rowId, cloned);

		if (index >= 0 && index < itemOrder.value.length) {
			itemOrder.value.splice(index, 0, rowId);
		} else if (index === 0) {
			itemOrder.value.unshift(rowId);
		} else {
			itemOrder.value.push(rowId);
		}
		touch();
		markRowsChanged(rowId, ["structure", "pricing", "stock"]);
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

		items.forEach((item) => {
			if (!item) return;
			const rowId =
				item.posa_row_id || Math.random().toString(36).substring(2, 20);
			if (!item.posa_row_id) item.posa_row_id = rowId;
			const cloned = cloneItem(item);
			itemsData.set(rowId, cloned);
			registerRowWatcher(rowId, cloned);
			applyRowTotals(rowId, cloned);
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
			markRowsChanged(addedIds, ["structure", "pricing", "stock"]);
		}

		return addedIds.map((id) => itemsData.get(id));
	};

	const resolveRowId = (rowIdOrItem: string | CartItem | any) => {
		if (typeof rowIdOrItem === "string") return rowIdOrItem;
		return rowIdOrItem?.posa_row_id || "";
	};

	const getItemByRowId = (rowId: string) => {
		if (!rowId) return undefined;
		return itemsData.get(rowId);
	};

	const updateItemFields = (
		rowIdOrItem: string | CartItem | any,
		patch: Partial<CartItem> = {},
		options: CartMutationOptions = {},
	) => {
		const rowId = resolveRowId(rowIdOrItem);
		const item = getItemByRowId(rowId);
		if (!rowId || !item || !patch) return item;

		const changedFields = Object.keys(patch).filter(
			(field) => (item as any)[field] !== (patch as any)[field],
		);
		if (!changedFields.length) return item;

		if (options.manual) {
			if (
				changedFields.some((field) =>
					["rate", "base_rate", "price_list_rate", "base_price_list_rate"].includes(field),
				)
			) {
				item._manual_rate_set = true;
			}
			if (
				changedFields.some((field) =>
					[
						"discount_amount",
						"base_discount_amount",
						"discount_percentage",
					].includes(field),
				)
			) {
				item._manual_discount_set = true;
			}
		}

		Object.assign(item, patch);
		suppressRowWatcherFields(rowId, changedFields);
		applyRowTotals(rowId, item);

		const explicitKinds = normalizeKinds(options.kind);
		const kinds = explicitKinds.length
			? explicitKinds
			: classifyChangedFields(changedFields);
		markRowsChanged(rowId, kinds);
		if (options.touch !== false) touch();
		return item;
	};

	const mutateItem = (
		rowIdOrItem: string | CartItem | any,
		mutator: (item: CartItem) => void,
		options: CartMutationOptions & { fields?: string[] } = {},
	) => {
		const rowId = resolveRowId(rowIdOrItem);
		const item = getItemByRowId(rowId);
		if (!rowId || !item || typeof mutator !== "function") return item;

		mutator(item);
		suppressRowWatcherFields(rowId, options.fields || []);
		applyRowTotals(rowId, item);

		const explicitKinds = normalizeKinds(options.kind);
		const kinds = explicitKinds.length
			? explicitKinds
			: classifyChangedFields(options.fields || []);
		if (kinds.length) markRowsChanged(rowId, kinds);
		if (options.touch !== false) touch();
		return item;
	};

	const updateItemQuantity = (
		rowIdOrItem: string | CartItem | any,
		qty: any,
		options: CartMutationOptions = {},
	) =>
		updateItemFields(
			rowIdOrItem,
			{ qty: toNumber(qty) } as Partial<CartItem>,
			{
				...options,
				kind: options.kind || ["quantity", "stock", "pricing"],
			},
		);

	const updateItemRate = (
		rowIdOrItem: string | CartItem | any,
		rate: any,
		options: CartMutationOptions = {},
	) =>
		updateItemFields(
			rowIdOrItem,
			{ rate: toNumber(rate) } as Partial<CartItem>,
			{
				...options,
				manual: options.manual ?? true,
				kind: options.kind || ["rate", "pricing"],
			},
		);

	const updateItemDiscountPercent = (
		rowIdOrItem: string | CartItem | any,
		discountPercentage: any,
		options: CartMutationOptions = {},
	) =>
		updateItemFields(
			rowIdOrItem,
			{ discount_percentage: toNumber(discountPercentage) } as Partial<CartItem>,
			{
				...options,
				manual: options.manual ?? true,
				kind: options.kind || ["discount"],
			},
		);

	const updateItemDiscountAmount = (
		rowIdOrItem: string | CartItem | any,
		discountAmount: any,
		options: CartMutationOptions = {},
	) =>
		updateItemFields(
			rowIdOrItem,
			{ discount_amount: toNumber(discountAmount) } as Partial<CartItem>,
			{
				...options,
				manual: options.manual ?? true,
				kind: options.kind || ["discount"],
			},
		);

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

		if (oldId !== rowId) {
			unregisterRowWatcher(oldId);
			removeRowTotals(oldId);
			itemsData.delete(oldId);
			itemOrder.value[index] = rowId;
		}
		const cloned = cloneItem(item);
		itemsData.set(rowId, cloned);
		registerRowWatcher(rowId, cloned);
		applyRowTotals(rowId, cloned);
		touch();
		markRowsChanged(rowId, ["structure", "pricing", "stock"]);
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
			const existing = itemsData.get(rowId);
			if (existing) {
				updateItemFields(rowId, item, {
					kind: classifyChangedFields(Object.keys(item)),
				});
			}
		} else {
			addItem(item);
		}
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
			unregisterRowWatcher(rowId);
			removeRowTotals(rowId);
			itemsData.delete(rowId);
			const idx = itemOrder.value.indexOf(rowId);
			if (idx !== -1) {
				itemOrder.value.splice(idx, 1);
			}
			touch();
			markRowsChanged(rowId, ["structure", "pricing", "stock"]);
		}
	};

	/**
	 * Empties all cart items and resets `totalQty`, `grossTotal`, and `discountTotal` to `0`.
	 * No-ops (without calling `touch()`) when the cart is already empty.
	 */
	const clearItems = () => {
		if (itemOrder.value.length > 0) {
			itemOrder.value = [];
			unregisterAllRowWatchers();
			itemsData.clear();
			rowTotals.clear();
			touch();
			totalQty.value = 0;
			grossTotal.value = 0;
			discountTotal.value = 0;
			clearCartInvalidation();
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
		cartInvalidation,
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
		getItemByRowId,
		updateItemFields,
		mutateItem,
		updateItemQuantity,
		updateItemRate,
		updateItemDiscountPercent,
		updateItemDiscountAmount,
		clearCartInvalidation,
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
