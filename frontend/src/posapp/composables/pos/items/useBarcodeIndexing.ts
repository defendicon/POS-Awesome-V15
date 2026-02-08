import { ref, type Ref } from "vue";

type BarcodeLike = { barcode?: string | null };
type SerialLike = { serial_no?: string | null };
type BatchLike = { batch_no?: string | null };

export interface BarcodeIndexedItem {
	item_code?: string | null;
	item_name?: string | null;
	barcode?: string | null;
	barcodes?: Array<string | number>;
	item_barcode?: BarcodeLike[];
	serial_no_data?: SerialLike[];
	batch_no_data?: BatchLike[];
	[key: string]: unknown;
}

type BarcodeIndex = Map<string, BarcodeIndexedItem>;
type ItemSource =
	| BarcodeIndexedItem[]
	| Ref<BarcodeIndexedItem[]>
	| (() => BarcodeIndexedItem[] | Ref<BarcodeIndexedItem[]>);

// --- Stateless Helpers (formerly utils/barcodeIndex.js) ---

export const ensureBarcodeIndex = (index: unknown): BarcodeIndex => {
	if (index instanceof Map) {
		return index as BarcodeIndex;
	}
	return new Map<string, BarcodeIndexedItem>();
};

export const resetBarcodeIndex = (index: unknown): BarcodeIndex => {
	const map = ensureBarcodeIndex(index);
	map.clear();
	return map;
};

const registerCode = (
	index: BarcodeIndex,
	item: BarcodeIndexedItem,
	code: unknown,
) => {
	if (code === undefined || code === null) {
		return;
	}
	const normalized = String(code).trim();
	if (!normalized) {
		return;
	}
	if (!index.has(normalized)) {
		index.set(normalized, item);
	}
	const lower = normalized.toLowerCase();
	if (!index.has(lower)) {
		index.set(lower, item);
	}
};

export const indexItemInBarcodeIndex = (
	index: unknown,
	item: BarcodeIndexedItem | null | undefined,
): BarcodeIndex => {
	if (!item) {
		return ensureBarcodeIndex(index);
	}
	const map = ensureBarcodeIndex(index);
	registerCode(map, item, item.item_code);
	registerCode(map, item, item.barcode);
	if (Array.isArray(item.item_barcode)) {
		item.item_barcode.forEach((barcode) =>
			registerCode(map, item, barcode?.barcode),
		);
	}
	if (Array.isArray(item.barcodes)) {
		item.barcodes.forEach((barcode) => registerCode(map, item, barcode));
	}
	if (Array.isArray(item.serial_no_data)) {
		item.serial_no_data.forEach((serial) =>
			registerCode(map, item, serial?.serial_no),
		);
	}
	if (Array.isArray(item.batch_no_data)) {
		item.batch_no_data.forEach((batch) =>
			registerCode(map, item, batch?.batch_no),
		);
	}
	return map;
};

export const replaceBarcodeIndex = (
	index: unknown,
	items: BarcodeIndexedItem[] = [],
): BarcodeIndex => {
	const map = resetBarcodeIndex(index);
	items.forEach((item) => indexItemInBarcodeIndex(map, item));
	return map;
};

export const lookupItemInBarcodeIndex = (
	index: unknown,
	code: unknown,
): BarcodeIndexedItem | null => {
	if (code === undefined || code === null) {
		return null;
	}
	const map = ensureBarcodeIndex(index);
	const normalized = String(code).trim();
	if (!normalized) {
		return null;
	}
	return map.get(normalized) || map.get(normalized.toLowerCase()) || null;
};

// --- Composable ---

export function useBarcodeIndexing() {
	const barcodeIndex = ref<BarcodeIndex | null>(null);

	const ensureIndex = () => {
		barcodeIndex.value = ensureBarcodeIndex(barcodeIndex.value);
		return barcodeIndex.value;
	};

	const reset = () => {
		barcodeIndex.value = resetBarcodeIndex(barcodeIndex.value);
	};

	const indexItem = (item: BarcodeIndexedItem) => {
		barcodeIndex.value = indexItemInBarcodeIndex(ensureIndex(), item);
	};

	const unwrapItemsSource = (items: ItemSource): BarcodeIndexedItem[] => {
		const resolved = typeof items === "function" ? items() : items;
		if (Array.isArray(resolved)) {
			return resolved;
		}
		return Array.isArray(resolved?.value) ? resolved.value : [];
	};

	const replaceIndex = (items: ItemSource) => {
		barcodeIndex.value = replaceBarcodeIndex(
			ensureIndex(),
			unwrapItemsSource(items),
		);
	};

	const lookupItem = (code: unknown) => {
		return lookupItemInBarcodeIndex(ensureIndex(), code);
	};

	// Logic extracted from ItemsSelector.vue: searchItemsByCode
	const searchItemsByCode = (items: ItemSource, code: string) => {
		if (!items || !code) return [];
		const itemsList = unwrapItemsSource(items);
		const searchTerm = code.toLowerCase();

		return itemsList.filter((item) => {
			const barcodeMatch =
				(item.barcode &&
					String(item.barcode).toLowerCase().includes(searchTerm)) ||
				(Array.isArray(item.barcodes) &&
					item.barcodes.some((bc) =>
						String(bc).toLowerCase().includes(searchTerm),
					)) ||
				(Array.isArray(item.item_barcode) &&
					item.item_barcode.some(
						(b) =>
							b.barcode &&
							String(b.barcode)
								.toLowerCase()
								.includes(searchTerm),
					));
			return (
				String(item.item_code || "")
					.toLowerCase()
					.includes(searchTerm) ||
				String(item.item_name || "")
					.toLowerCase()
					.includes(searchTerm) ||
				barcodeMatch
			);
		});
	};

	return {
		barcodeIndex,
		ensureBarcodeIndex: ensureIndex,
		resetBarcodeIndex: reset,
		indexItem,
		replaceBarcodeIndex: replaceIndex,
		lookupItemByBarcode: lookupItem,
		searchItemsByCode,
	};
}
