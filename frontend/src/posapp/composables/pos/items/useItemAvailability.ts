import { ref, onUnmounted } from "vue";
import stockCoordinator from "../../../utils/stockCoordinator.js";
import {
	indexItemInBarcodeIndex,
	lookupItemInBarcodeIndex,
	replaceBarcodeIndex,
	resetBarcodeIndex,
} from "./useBarcodeIndexing";
import type { BarcodeIndexedItem } from "./useBarcodeIndexing";

type AvailabilityItem = BarcodeIndexedItem & {
	item_code?: string | number | null;
	actual_qty?: number | null;
	available_qty?: number | null;
	_base_actual_qty?: number | null;
	_base_available_qty?: number | null;
};

type AvailabilityCallbacks = {
	getItems: () => AvailabilityItem[];
	getDisplayedItems: () => AvailabilityItem[];
	getFilteredItems: () => AvailabilityItem[];
	updateItemsDetails: (
		_items: AvailabilityItem[],
		_options?: { forceRefresh?: boolean },
	) => Promise<void>;
};

export function useItemAvailability() {
	// Callbacks/Getters (Mutable for late binding)
	const callbacks: AvailabilityCallbacks = {
		getItems: () => [],
		getDisplayedItems: () => [],
		getFilteredItems: () => [],
		updateItemsDetails: async () => {},
	};

	const registerCallbacks = (
		newCallbacks: Partial<AvailabilityCallbacks>,
	) => {
		Object.assign(callbacks, newCallbacks);
	};

	const barcodeIndex = ref<Map<string, BarcodeIndexedItem>>(new Map());
	const stockUnsubscribe = ref<(() => void) | null>(null);

	// --- Indexing ---

	const indexItem = (item: AvailabilityItem) => {
		if (barcodeIndex.value) {
			indexItemInBarcodeIndex(barcodeIndex.value, item);
		}
	};

	const lookupItemByBarcode = (code: unknown) => {
		if (!barcodeIndex.value) return null;
		return lookupItemInBarcodeIndex(barcodeIndex.value, code);
	};

	const rebuildBarcodeIndex = (
		newItems: AvailabilityItem[] | null | undefined,
	) => {
		if (barcodeIndex.value) {
			replaceBarcodeIndex(barcodeIndex.value, newItems || []);
		}
	};

	const clearBarcodeIndex = () => {
		if (barcodeIndex.value) {
			resetBarcodeIndex(barcodeIndex.value);
		}
	};

	// --- Availability ---

	/**
	 * Syncs items with the latest stock state from StockCoordinator
	 */
	const syncItemsWithStockState = (
		codes: unknown = null,
		options: Record<string, unknown> = {},
	) => {
		const collections: AvailabilityItem[][] = [];
		const items = callbacks.getItems();
		const displayedItems = callbacks.getDisplayedItems();
		const filteredItems = callbacks.getFilteredItems();

		if (Array.isArray(items)) {
			collections.push(items);
		}
		if (Array.isArray(displayedItems)) {
			collections.push(displayedItems);
		}
		if (Array.isArray(filteredItems)) {
			collections.push(filteredItems);
		}

		const codesSet = (() => {
			if (codes === null) {
				return null;
			}
			const iterableCandidate = codes as any;
			const iterable = Array.isArray(codes)
				? codes
				: codes instanceof Set ||
					  typeof iterableCandidate?.[Symbol.iterator] === "function"
					? Array.from(iterableCandidate)
					: [codes];
			return new Set(
				iterable
					.map((code) =>
						code !== undefined && code !== null
							? String(code).trim()
							: "",
					)
					.filter(Boolean),
			);
		})();

		collections.forEach((collection) => {
			stockCoordinator.applyAvailabilityToCollection(
				collection,
				codesSet,
				options,
			);
		});
	};

	/**
	 * Prime stock state from loaded items
	 */
	const primeStockState = (source = "items-selector") => {
		const items = callbacks.getItems();
		const displayedItems = callbacks.getDisplayedItems();

		const allItems = Array.isArray(items) ? [...items] : [];
		// Also include visible items if they differ
		const extra = Array.isArray(displayedItems) ? displayedItems : [];
		extra.forEach((item: AvailabilityItem) => {
			if (!allItems.includes(item)) {
				allItems.push(item);
			}
		});

		if (!allItems.length) {
			return;
		}

		stockCoordinator.primeFromItems(allItems, { silent: true, source });
		syncItemsWithStockState(
			allItems
				.map((item) =>
					item && item.item_code !== undefined
						? String(item.item_code).trim()
						: null,
				)
				.filter(Boolean),
			{ updateBaseAvailable: false },
		);
	};

	/**
	 * Handle updates from StockCoordinator
	 */
	const handleStockSnapshotUpdate = (event: { codes?: unknown[] } = {}) => {
		const codes = Array.isArray(event.codes) ? event.codes : [];
		if (!codes.length) {
			return;
		}
		syncItemsWithStockState(codes, { updateBaseAvailable: false });
	};

	/**
	 * Capture base availability (initial fetch state)
	 */
	const captureBaseAvailability = (
		item: AvailabilityItem,
		explicitActualQty: number | undefined = undefined,
	) => {
		if (!item) return;

		let resolvedBase: number | null = null;

		if (
			typeof item.available_qty === "number" &&
			!Number.isNaN(item.available_qty)
		) {
			item._base_available_qty = item.available_qty;
			resolvedBase = item.available_qty;
		}

		const hasExplicit =
			typeof explicitActualQty === "number" &&
			!Number.isNaN(explicitActualQty);
		if (hasExplicit) {
			item._base_actual_qty = explicitActualQty;
			resolvedBase = explicitActualQty;
		} else if (
			typeof item.actual_qty === "number" &&
			!Number.isNaN(item.actual_qty)
		) {
			item._base_actual_qty = item.actual_qty;
			resolvedBase = item.actual_qty;
		}

		if (resolvedBase !== null && item.item_code) {
			stockCoordinator.updateBaseQuantities(
				[
					{
						item_code: item.item_code,
						actual_qty: resolvedBase,
					},
				],
				{ silent: true, source: "items-selector" },
			);
		}
	};

	/**
	 * Helper to get base actual qty
	 */
	const getBaseActualQty = (
		item: AvailabilityItem | null | undefined,
	): number | null => {
		if (!item) return null;

		if (
			typeof item._base_actual_qty === "number" &&
			!Number.isNaN(item._base_actual_qty)
		) {
			return item._base_actual_qty;
		}
		if (
			typeof item.actual_qty === "number" &&
			!Number.isNaN(item.actual_qty)
		) {
			item._base_actual_qty = item.actual_qty;
			return item.actual_qty;
		}
		if (
			typeof item.available_qty === "number" &&
			!Number.isNaN(item.available_qty)
		) {
			item._base_available_qty = item.available_qty;
			item._base_actual_qty = item.available_qty;
			return item.available_qty;
		}
		return null;
	};

	/**
	 * Re-apply reservation logic to a specific item
	 */
	const applyReservationToItem = (item: AvailabilityItem) => {
		if (!item || !item.item_code) return;

		const codeKey = String(item.item_code).trim();
		if (!codeKey) return;

		const baseQty = getBaseActualQty(item);
		if (baseQty !== null) {
			stockCoordinator.updateBaseQuantities(
				[
					{
						item_code: codeKey,
						actual_qty: baseQty,
					},
				],
				{ silent: true, source: "items-selector" },
			);
		}

		stockCoordinator.applyAvailabilityToItem(item, {
			updateBaseAvailable: false,
		});
	};

	/**
	 * Recompute availability for a list of codes
	 */
	const recomputeAvailabilityForCodes = (codes: unknown[] = []) => {
		if (!Array.isArray(codes) || !codes.length) return;

		const normalizedCodes = codes
			.filter(
				(code) =>
					code !== undefined && code !== null && String(code).trim(),
			)
			.map((code) => String(code).trim());
		if (!normalizedCodes.length) return;

		const targetCodes = new Set(normalizedCodes);
		syncItemsWithStockState(targetCodes, { updateBaseAvailable: false });

		targetCodes.forEach((code) => {
			const indexedItem = lookupItemByBarcode(code);
			if (indexedItem) {
				applyReservationToItem(indexedItem);
			}
		});
	};

	// --- Event Handlers (External) ---

	const handleCartQuantitiesUpdated = (
		totals: Record<string, unknown> = {},
	) => {
		const impacted = stockCoordinator.updateReservations(totals, {
			source: "items-selector",
		});
		if (impacted.length) {
			recomputeAvailabilityForCodes(impacted);
		}
	};

	const handleInvoiceStockAdjusted = async (payload: unknown = {}) => {
		const payloadItems =
			payload && typeof payload === "object" && Array.isArray((payload as any).items)
				? (payload as any).items
				: [];
		const baseEntries = payloadItems
			.map((entry: any) => {
				if (!entry) return null;
				const item_code =
					entry.item_code !== undefined && entry.item_code !== null
						? String(entry.item_code).trim()
						: "";
				const actual_qty = Number(entry.actual_qty);
				if (!item_code || !Number.isFinite(actual_qty)) {
					return null;
				}
				return {
					item_code,
					actual_qty,
				};
			})
			.filter((entry): entry is { item_code: string; actual_qty: number } => !!entry);

		if (baseEntries.length) {
			stockCoordinator.updateBaseQuantities(baseEntries, {
				source: "realtime",
			});
		}

		const collectedCodes = new Set<string>();
		const collectCode = (code: unknown) => {
			if (code === undefined || code === null) return;
			const normalized = String(code).trim();
			if (normalized) collectedCodes.add(normalized);
		};
		const collectFromItems = (items: unknown) => {
			if (!Array.isArray(items)) return;
			items.forEach((entry) => {
				if (!entry) return;
				if (typeof entry === "string" || typeof entry === "number")
					collectCode(entry);
				else if ((entry as AvailabilityItem).item_code !== undefined)
					collectCode((entry as AvailabilityItem).item_code);
			});
		};

		if (Array.isArray(payload)) collectFromItems(payload);
		else if (payload && typeof payload === "object") {
			const payloadObj = payload as {
				items?: unknown;
				item_codes?: unknown;
				item_code?: unknown;
			};
			collectFromItems(payloadObj.items);
			collectFromItems(payloadObj.item_codes);
			if (payloadObj.item_code !== undefined)
				collectCode(payloadObj.item_code);
		} else {
			collectCode(payload);
		}

		if (!collectedCodes.size) return;

		const codes = Array.from(collectedCodes);
		const targetCodes = new Set(codes);
		const seenItems = new Set<AvailabilityItem>();
		const candidates: AvailabilityItem[] = [];

		const considerItem = (item: AvailabilityItem | null | undefined) => {
			if (!item || !item.item_code) return;
			const code = String(item.item_code).trim();
			if (!code || !targetCodes.has(code)) return;
			if (seenItems.has(item)) return;
			seenItems.add(item);
			candidates.push(item);
		};

		const items = callbacks.getItems();
		const displayedItems = callbacks.getDisplayedItems();
		if (Array.isArray(items)) items.forEach(considerItem);
		if (Array.isArray(displayedItems)) displayedItems.forEach(considerItem);

		targetCodes.forEach((code) => {
			const indexed = lookupItemByBarcode(code);
			if (indexed) considerItem(indexed);
		});

		try {
			if (candidates.length && callbacks.updateItemsDetails) {
				await callbacks.updateItemsDetails(candidates, {
					forceRefresh: true,
				});
			}
		} catch (error) {
			console.error(
				"Failed to refresh item details after invoice submission",
				error,
			);
		} finally {
			recomputeAvailabilityForCodes(codes);
		}
	};

	// --- Lifecycle ---
	const initAvailability = () => {
		stockUnsubscribe.value = stockCoordinator.subscribe(
			handleStockSnapshotUpdate,
		);
	};

	onUnmounted(() => {
		if (stockUnsubscribe.value) {
			stockUnsubscribe.value();
			stockUnsubscribe.value = null;
		}
	});

	return {
		registerCallbacks,
		barcodeIndex,
		indexItem,
		lookupItemByBarcode,
		rebuildBarcodeIndex,
		clearBarcodeIndex,

		syncItemsWithStockState,
		primeStockState,
		captureBaseAvailability,
		applyReservationToItem,
		recomputeAvailabilityForCodes,
		handleCartQuantitiesUpdated,
		handleInvoiceStockAdjusted,
		initAvailability,
	};
}
