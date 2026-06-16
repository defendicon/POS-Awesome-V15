import { ref } from "vue";
import type { Item, POSProfile } from "../../../../types/models";

export function useItemsSearch() {
	const itemsMap = ref(new Map<string, Item>()); // O(1) lookup by item_code
	const barcodeIndex = ref(new Map<string, Item>()); // O(1) barcode lookup

	const normalizeSearchText = (value: unknown): string =>
		String(value || "")
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase();

	const tokenizeSearchText = (value: unknown): string[] => {
		const normalized = normalizeSearchText(value)
			.replace(/[^a-z0-9]+/g, " ")
			.trim();
		if (!normalized) {
			return [];
		}
		return Array.from(new Set(normalized.split(/\s+/).filter(Boolean)));
	};

	const isNearTokenMatch = (query: string, token: string): boolean => {
		if (!query || !token) {
			return false;
		}
		if (token.includes(query) || query.includes(token)) {
			return true;
		}
		if (query.length < 4 || token.length < 4) {
			return false;
		}
		const maxDistance = Math.min(query.length, token.length) >= 7 ? 2 : 1;
		if (Math.abs(query.length - token.length) > maxDistance) {
			return false;
		}

		let previous = Array.from(
			{ length: token.length + 1 },
			(_, index) => index,
		);
		for (let i = 1; i <= query.length; i++) {
			const current: number[] = [i];
			let rowMin = i;
			for (let j = 1; j <= token.length; j++) {
				const substitutionCost =
					query[i - 1] === token[j - 1] ? 0 : 1;
				const next = Math.min(
					(current[j - 1] ?? i) + 1,
					(previous[j] ?? j) + 1,
					(previous[j - 1] ?? j - 1) + substitutionCost,
				);
				current[j] = next;
				rowMin = Math.min(rowMin, next);
			}
			if (rowMin > maxDistance) {
				return false;
			}
			previous = current;
		}

		return (previous[token.length] ?? Number.POSITIVE_INFINITY) <= maxDistance;
	};

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

			const normalizedFields = searchFields
				.filter(Boolean)
				.map((field) => normalizeSearchText(field));
			item._search_index = normalizedFields.join(" ");
			item._search_tokens = normalizedFields.flatMap(tokenizeSearchText);
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

		const searchTerm = normalizeSearchText(term);
		const searchTerms = tokenizeSearchText(searchTerm);
		const normalizedGroup =
			typeof itemGroup === "string" && itemGroup.length > 0
				? itemGroup
				: "ALL";

		return itemList.filter((item) => {
			if (!item) {
				return false;
			}
			if (
				normalizedGroup !== "ALL" &&
				(!item.item_group ||
					item.item_group.toLowerCase() !==
						normalizedGroup.toLowerCase())
			) {
				return false;
			}

			// Use pre-computed search index if available
			if (item._search_index) {
				const tokens = Array.isArray(item._search_tokens)
					? item._search_tokens
					: tokenizeSearchText(item._search_index);
				return searchTerms.every((searchToken) => {
					if (item._search_index!.includes(searchToken)) {
						return true;
					}
					return tokens.some((token) =>
						isNearTokenMatch(searchToken, String(token)),
					);
				});
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
				.some((field) => {
					const fieldIndex = normalizeSearchText(field);
					if (fieldIndex.includes(searchTerm)) {
						return true;
					}
					const tokens = tokenizeSearchText(fieldIndex);
					return searchTerms.every((searchToken) =>
						tokens.some((token) =>
							isNearTokenMatch(searchToken, token),
						),
					);
				});
		});
	};

	const filterItemsByGroup = (itemList: Item[], group: string) => {
		const normalizedGroup =
			typeof group === "string" && group.length > 0 ? group : "ALL";
		if (normalizedGroup === "ALL") {
			return itemList;
		}
		return itemList.filter((item) => item.item_group === normalizedGroup);
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
