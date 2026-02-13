import { ref } from "vue";
import { perfMarkStart, perfMarkEnd } from "../../../utils/perf.js";

declare const frappe: any;

type SearchItem = {
	item_code?: string;
	item_name?: string;
	barcode?: string;
	description?: string;
	brand?: string;
	item_group?: string;
	barcodes?: Array<string | number>;
	item_barcode?: Array<{ barcode?: string }>;
	serial_no_data?: Array<{ serial_no?: string }>;
	batch_no_data?: Array<{ batch_no?: string }>;
	rate?: number | string;
	original_rate?: number | string;
	price_list_rate?: number | string;
	standard_rate?: number | string;
	base_rate?: number | string;
	base_price_list_rate?: number | string;
	variant_of?: string;
	_search_index?: string;
	[key: string]: unknown;
};

export function useItemSearch() {
	const searchCache = new Map<string, SearchItem[]>();
	const showOnlyBarcodeItems = ref(false);

	/**
	 * Memoized search function to filter items based on search term and group.
	 * @param {Array} items - The list of items to search.
	 * @param {string} searchTerm - The search query.
	 * @param {string} itemGroup - The item group filter.
	 * @returns {Array} - Filtered list of items.
	 */
	const memoizedSearch = (
		items: SearchItem[],
		searchTerm: string,
		itemGroup: string,
	) => {
		const cacheKey = `${searchTerm || ""}_${itemGroup || "ALL"}_${showOnlyBarcodeItems.value}`;

		if (searchCache.has(cacheKey)) {
			return searchCache.get(cacheKey);
		}

		const result = performSearch(items, searchTerm, itemGroup);
		searchCache.set(cacheKey, result);
		return result;
	};

	/**
	 * Core search algorithm.
	 * @param {Array} items
	 * @param {string} searchTerm
	 * @param {string} itemGroup
	 * @returns {Array}
	 */
	const performSearch = (
		items: SearchItem[],
		searchTerm: string,
		itemGroup: string,
	) => {
		const mark = perfMarkStart("pos:search-filter");
		if (!items || !items.length) {
			perfMarkEnd("pos:search-filter", mark);
			return [];
		}

		let filtered = items;

		// Filter only barcode items if enabled
		if (showOnlyBarcodeItems.value) {
			filtered = filtered.filter((item) => {
				return (
					item.barcode ||
					(Array.isArray(item.barcodes) &&
						item.barcodes.length > 0) ||
					(Array.isArray(item.item_barcode) &&
						item.item_barcode.length > 0)
				);
			});
		}

		// Filter by item group
		if (itemGroup !== "ALL") {
			const group = itemGroup.toLowerCase();
			filtered = filtered.filter(
				(item) =>
					item.item_group && item.item_group.toLowerCase() === group,
			);
		}

		// Filter by search term
		const rawSearch = (searchTerm || "").trim();
		if (rawSearch && rawSearch.length >= 3) {
			const term = rawSearch.toLowerCase();
			const searchWords = term.split(/\s+/).filter(Boolean);

			filtered = filtered.filter((item) => {
				if (!searchWords.length) return true;

				// Collect all searchable values into a single string or array for checking
				const searchable: string[] = [];
				const pushValue = (v: unknown) => {
					if (v) searchable.push(String(v).toLowerCase());
				};

				pushValue(item.item_code);
				pushValue(item.item_name);
				pushValue(item.barcode);
				pushValue(item.description);
				pushValue(item.brand);

				// Handle arrays (barcodes, serials, batches)
				if (Array.isArray(item.item_barcode)) {
					item.item_barcode.forEach((b) => pushValue(b?.barcode));
				}
				if (Array.isArray(item.barcodes)) {
					item.barcodes.forEach((b) => pushValue(b));
				}
				if (Array.isArray(item.serial_no_data)) {
					item.serial_no_data.forEach((s) => pushValue(s?.serial_no));
				}
				if (Array.isArray(item.batch_no_data)) {
					item.batch_no_data.forEach((b) => pushValue(b?.batch_no));
				}

				// Verify EVERY search word is present in AT LEAST ONE of the fields
				return searchWords.every((word) => {
					return searchable.some((field) => field.includes(word));
				});
			});
		}

		perfMarkEnd("pos:search-filter", mark);
		return filtered;
	};

	/**
	 * Clears the internal search cache.
	 */
	const clearSearchCache = () => {
		searchCache.clear();
	};

	/**
	 * Fetches the latest 'modified' timestamp of the Item doctype from the server.
	 * Useful for checking if local items are stale.
	 * @returns {Promise<string|null>} - Timestamp string or null on failure.
	 */
	const fetchServerItemsTimestamp = async () => {
		try {
			const { message } = await frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Item",
					fields: ["modified"],
					order_by: "modified desc",
					limit_page_length: 1,
				},
			});
			return message && message[0] && message[0].modified;
		} catch (e) {
			console.error("Failed to fetch server items timestamp", e);
			return null;
		}
	};

	/**
	 * Optimized search and pagination.
	 * Filters items and returns a slice based on limit, doing both in a single pass for performance.
	 *
	 * @param {Array} items - Source items
	 * @param {Object} filters - Filter configuration
	 * @param {string} filters.searchTerm - Search query
	 * @param {boolean} filters.hideZeroRate - Hide items with 0 rate
	 * @param {boolean} filters.hideVariants - Hide variant items
	 * @param {boolean} filters.onlyBarcode - Show only items with barcode
	 * @param {number} filters.limit - Max items to return
	 * @returns {Array} - Filtered and paginated items
	 */
	const filterAndPaginate = (
		items: SearchItem[],
		{
			searchTerm = "",
			hideZeroRate = false,
			hideVariants = false,
			onlyBarcode = false,
			limit = 50,
		} = {},
	) => {
		if (!items || !items.length) return [];

		const term = (searchTerm || "").trim().toLowerCase();
		const needsLocalSearch = term && term.length >= 3;

		// PERF: If no filters needed, just slice and return
		if (
			!needsLocalSearch &&
			!hideZeroRate &&
			!hideVariants &&
			!onlyBarcode
		) {
			return items.slice(0, limit);
		}

		let searchTerms: string[] | null = null;
		if (needsLocalSearch) {
			searchTerms = term.split(/\s+/).filter(Boolean);
		}

		const result: SearchItem[] = [];
		const activeTerms = searchTerms || [];
		const resolveItemRate = (item: SearchItem): number => {
			const candidates = [
				item.original_rate,
				item.rate,
				item.price_list_rate,
				item.standard_rate,
				item.base_rate,
				item.base_price_list_rate,
			];
			for (const candidate of candidates) {
				const parsed = Number(candidate);
				if (Number.isFinite(parsed)) {
					return parsed;
				}
			}
			return 0;
		};
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item) continue;

			// 1. Search Filter
			if (needsLocalSearch) {
				let matches = false;
				if (item._search_index) {
					matches = activeTerms.every((t) =>
						item._search_index!.includes(t),
					);
				} else {
					// Fallback
					const rawIndex = (
						(item.item_code || "") +
						" " +
						(item.item_name || "") +
						" " +
						(item.barcode || "")
					).toLowerCase();
					matches = activeTerms.every((t) => rawIndex.includes(t));
				}
				if (!matches) continue;
			}

			// 2. Zero Rate Filter
			if (hideZeroRate) {
				if (resolveItemRate(item) <= 0) continue;
			}

			// 3. Variant Filter
			if (hideVariants) {
				if (item.variant_of) continue;
			}

			// 4. Barcode Filter
			if (onlyBarcode) {
				const hasBarcode =
					item.barcode ||
					(Array.isArray(item.barcodes) &&
						item.barcodes.length > 0) ||
					(Array.isArray(item.item_barcode) &&
						item.item_barcode.length > 0);

				if (!hasBarcode) continue;
			}

			result.push(item);

			if (result.length >= limit) {
				break;
			}
		}

		return result;
	};

	return {
		showOnlyBarcodeItems,
		memoizedSearch,
		clearSearchCache,
		fetchServerItemsTimestamp,
		filterAndPaginate,
	};
}
