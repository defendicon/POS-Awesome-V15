import { ref } from "vue";

export function useItemsTableSearch() {
	const searchCache = ref<{
		raw: string | null;
		normalized: string;
		terms: string[];
	}>({
		raw: null,
		normalized: "",
		terms: [],
	});

	const customItemFilter = (
		value: any,
		search: string | null,
		item: any,
	): boolean => {
		if (search == null) {
			return true;
		}

		let normalized = "";
		let terms: string[] = [];

		if (searchCache.value.raw === search) {
			// PERF: reuse normalized tokens for identical search text to avoid per-row lowercasing/splitting
			({ normalized, terms } = searchCache.value);
		} else {
			normalized = String(search).toLowerCase().trim();
			terms = normalized ? normalized.split(/\s+/).filter(Boolean) : [];

			searchCache.value = {
				raw: search,
				normalized,
				terms,
			};
		}

		if (!normalized) {
			return true;
		}

		if (!terms.length) {
			return true;
		}

		// PERF: Use pre-computed search index if available to avoid expensive traversal
		// @ts-ignore
		const rawItem = item?.raw ?? item;
		if (rawItem?._search_index) {
			return terms.every((term: string) =>
				rawItem._search_index.includes(term),
			);
		}

		const haystacks: string[] = [];
		const collect = (input: any) => {
			if (input == null) {
				return;
			}

			if (Array.isArray(input)) {
				input.forEach(collect);
				return;
			}

			if (typeof input === "object") {
				if (Object.prototype.hasOwnProperty.call(input, "barcode")) {
					collect(input.barcode);
					return;
				}

				Object.values(input).forEach(collect);
				return;
			}

			haystacks.push(String(input).toLowerCase());
		};

		collect(value);
		collect(rawItem?.item_name);
		collect(rawItem?.item_code);
		collect(rawItem?.description);
		collect(rawItem?.barcode);
		collect(rawItem?.serial_no);
		collect(rawItem?.batch_no);
		collect(rawItem?.uom);
		collect(rawItem?.item_barcode);
		collect(rawItem?.barcodes);

		if (!haystacks.length) {
			return false;
		}

		return terms.every((term) =>
			haystacks.some((text) => text.includes(term)),
		);
	};

	return {
		customItemFilter,
	};
}
