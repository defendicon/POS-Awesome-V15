import { markRaw, shallowRef } from "vue";
import type { Item, POSProfile } from "../../../../types/models";

type IndexedItem = Item & {
	_search_index?: string;
	_search_tokens?: string[];
};

const normalizeToken = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const splitTokens = (value: unknown): string[] =>
	normalizeToken(value).split(/\s+/).filter(Boolean);

const addToSetMap = <T>(map: Map<string, Set<T>>, key: string, value: T) => {
	if (!key) {
		return;
	}
	const existing = map.get(key);
	if (existing) {
		existing.add(value);
		return;
	}
	map.set(key, new Set([value]));
};

const getRate = (item: IndexedItem) => {
	const candidates = [
		item.price_list_rate,
		item.rate,
		(item as any).original_rate,
		(item as any).base_rate,
		(item as any).base_price_list_rate,
	];
	for (const candidate of candidates) {
		const parsed = Number(candidate);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return 0;
};

export function useItemsSearch() {
	const itemByCode = shallowRef(markRaw(new Map<string, Item>()));
	const barcodeToItem = shallowRef(markRaw(new Map<string, Item>()));
	const itemNameSearchIndex = shallowRef(markRaw(new Map<string, Set<string>>()));
	const priceByItemAndPriceList = shallowRef(markRaw(new Map<string, Record<string, unknown>>()));
	const stockByItemAndWarehouse = shallowRef(markRaw(new Map<string, Record<string, unknown>>()));
	const uomConversionByItem = shallowRef(markRaw(new Map<string, number>()));

	// Backwards-compatible aliases used by existing store callers.
	const itemsMap = itemByCode;
	const barcodeIndex = barcodeToItem;

	const normalizeBooleanSetting = (value: any): boolean => {
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			return (
				normalized === "1" ||
				normalized === "true" ||
				normalized === "yes"
			);
		}

		if (typeof value === "number") {
			return value === 1;
		}

		return Boolean(value);
	};

	const updateIndexes = (itemList: Item[], posProfile: POSProfile | null) => {
		if (!Array.isArray(itemList)) {
			return;
		}

		const includeSerial = normalizeBooleanSetting(
			posProfile?.posa_search_serial_no,
		);
		const includeBatch = normalizeBooleanSetting(
			posProfile?.posa_search_batch_no,
		);

		const priceList = posProfile?.selling_price_list || "";
		const profileWarehouse = posProfile?.warehouse || "";

		itemList.forEach((item: IndexedItem) => {
			if (!item || !item.item_code) {
				return;
			}
			itemByCode.value.set(item.item_code, item);

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry: any) => {
					if (entry?.barcode) {
						barcodeToItem.value.set(String(entry.barcode), item);
					}
				});
			}

			if (item.barcode) {
				barcodeToItem.value.set(String(item.barcode), item);
			}

			// Pre-compute search index for performance
			const searchFields = [
				item.item_code,
				item.item_name,
				item.barcode,
				item.description,
			];

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((b: any) =>
					searchFields.push(b?.barcode),
				);
			} else if (item.item_barcode) {
				searchFields.push(String(item.item_barcode));
			}

			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((b: string) => searchFields.push(b));
			}

			if (includeSerial && Array.isArray(item.serial_no_data)) {
				item.serial_no_data.forEach((s: any) =>
					searchFields.push(s?.serial_no),
				);
			}

			if (includeBatch && Array.isArray(item.batch_no_data)) {
				item.batch_no_data.forEach((b: any) =>
					searchFields.push(b?.batch_no),
				);
			}

			const searchTokens = Array.from(
				new Set(searchFields.flatMap((field) => splitTokens(field))),
			);
			item._search_tokens = searchTokens;
			item._search_index = searchFields
				.filter(Boolean)
				.map((f) => String(f).toLowerCase())
				.join(" ");

			searchTokens.forEach((token) => {
				addToSetMap(itemNameSearchIndex.value, token, item.item_code);
			});

			if (priceList) {
				priceByItemAndPriceList.value.set(`${priceList}::${item.item_code}`, {
					rate: getRate(item),
					price_list_rate: item.price_list_rate,
					currency: item.currency || (item as any).original_currency || posProfile?.currency,
				});
			}

			const warehouse = String((item as any).warehouse || profileWarehouse || "");
			if (warehouse) {
				stockByItemAndWarehouse.value.set(`${warehouse}::${item.item_code}`, {
					actual_qty: item.actual_qty ?? 0,
					projected_qty: (item as any).projected_qty,
					warehouse,
				});
			}

			if (Array.isArray((item as any).item_uoms)) {
				(item as any).item_uoms.forEach((uom: any) => {
					if (!uom?.uom) {
						return;
					}
					const factor = Number(uom.conversion_factor || 1);
					uomConversionByItem.value.set(
						`${item.item_code}::${uom.uom}`,
						Number.isFinite(factor) ? factor : 1,
					);
				});
			}
		});
	};

	const resetIndexes = () => {
		itemByCode.value = markRaw(new Map<string, Item>());
		barcodeToItem.value = markRaw(new Map<string, Item>());
		itemNameSearchIndex.value = markRaw(new Map<string, Set<string>>());
		priceByItemAndPriceList.value = markRaw(new Map<string, Record<string, unknown>>());
		stockByItemAndWarehouse.value = markRaw(new Map<string, Record<string, unknown>>());
		uomConversionByItem.value = markRaw(new Map<string, number>());
	};

	const getSearchCandidateCodes = (terms: string[]) => {
		if (!terms.length) {
			return null;
		}

		let current: Set<string> | null = null;
		for (const term of terms) {
			let termMatches = itemNameSearchIndex.value.get(term);
			if (!termMatches) {
				const prefixMatches = new Set<string>();
				itemNameSearchIndex.value.forEach((codes, token) => {
					if (token.includes(term)) {
						codes.forEach((code) => prefixMatches.add(code));
					}
				});
				termMatches = prefixMatches;
			}
			if (!termMatches.size) {
				return new Set<string>();
			}
			if (!current) {
				current = new Set(termMatches);
				continue;
			}
			current = new Set([...current].filter((code) => termMatches!.has(code)));
			if (!current.size) {
				return current;
			}
		}
		return current;
	};

	const performLocalSearch = (
		term: string,
		itemList: Item[],
		itemGroup: string,
	) => {
		if (!term) {
			return filterItemsByGroup(itemList, itemGroup);
		}

		const searchTerm = term.toLowerCase();
		const searchTerms = searchTerm.split(/\s+/).filter(Boolean);
		const indexedCandidateCodes = getSearchCandidateCodes(searchTerms);
		if (indexedCandidateCodes) {
			if (!indexedCandidateCodes.size) {
				return [];
			}
			return filterItemsByGroup(
				itemList.filter((item) => item?.item_code && indexedCandidateCodes.has(item.item_code)),
				itemGroup,
			);
		}

		return itemList.filter((item) => {
			if (!item) {
				return false;
			}

			// Use pre-computed search index if available
			if (item._search_index) {
				return searchTerms.every((t) =>
					item._search_index!.includes(t),
				);
			}

			// Fallback for items without index
			const fields = [
				item.item_code,
				item.item_name,
				item.barcode,
				item.description,
			];

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry: any) =>
					fields.push(entry?.barcode),
				);
			} else if (item.item_barcode) {
				fields.push(String(item.item_barcode));
			}

			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((code: string) => fields.push(code));
			}

			return fields
				.filter(Boolean)
				.some((field) =>
					String(field).toLowerCase().includes(searchTerm),
				);
		});
	};

	const filterItemsByGroup = (itemList: Item[], group: string) => {
		if (group === "ALL") {
			return itemList;
		}
		return itemList.filter((item) => item.item_group === group);
	};

	const getItemByCode = (itemCode: string) => {
		return itemsMap.value.get(itemCode);
	};

	const getItemByBarcode = (barcode: string) => {
		return barcodeIndex.value.get(barcode);
	};

	return {
		itemByCode,
		barcodeToItem,
		itemNameSearchIndex,
		priceByItemAndPriceList,
		stockByItemAndWarehouse,
		uomConversionByItem,
		itemsMap,
		barcodeIndex,
		updateIndexes,
		resetIndexes,
		performLocalSearch,
		filterItemsByGroup,
		getItemByCode,
		getItemByBarcode,
	};
}
