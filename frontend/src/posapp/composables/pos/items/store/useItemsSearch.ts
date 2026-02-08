import { ref } from "vue";
import type { Item, POSProfile } from "../../../../types/models";

export function useItemsSearch() {
	const itemsMap = ref(new Map<string, Item>()); // O(1) lookup by item_code
	const barcodeIndex = ref(new Map<string, Item>()); // O(1) barcode lookup

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

		itemList.forEach((item) => {
			if (!item || !item.item_code) {
				return;
			}
			itemsMap.value.set(item.item_code, item);

			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((entry: any) => {
					if (entry?.barcode) {
						barcodeIndex.value.set(String(entry.barcode), item);
					}
				});
			}

			if (item.barcode) {
				barcodeIndex.value.set(String(item.barcode), item);
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

			item._search_index = searchFields
				.filter(Boolean)
				.map((f) => String(f).toLowerCase())
				.join(" ");
		});
	};

	const resetIndexes = () => {
		itemsMap.value.clear();
		barcodeIndex.value.clear();
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
