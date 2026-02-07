/**
 * Search utility functions for ItemsSelector
 * Handles search string manipulation, especially for scale barcodes
 */

/**
 * Extract item code from a potential scale barcode
 * @param searchString - The search/barcode string
 * @param scalePrefix - The scale barcode prefix
 * @param scaleBarcodeMatches - Function to check if string matches scale barcode
 * @returns Extracted item code or original string
 */
export function extractItemCodeFromSearch(
	searchString: string,
	scalePrefix: string,
	scaleBarcodeMatches: (_val: string) => boolean,
): string {
	if (!searchString) return "";

	const prefix = scalePrefix || "";
	const prefix_len = prefix.length;

	if (!scaleBarcodeMatches || !scaleBarcodeMatches(searchString)) {
		return searchString;
	}

	// Calculate item code length from total barcode length
	// Scale barcodes typically have: prefix + item_code + 6 digits for qty/price
	const item_code_len = searchString.length - prefix_len - 6;
	if (item_code_len <= 0) return searchString;

	return searchString.substring(0, prefix_len + item_code_len);
}

/**
 * Sanitize and normalize a search query
 * @param query - Raw search query
 * @returns Normalized query
 */
export function normalizeSearchQuery(query: any): string {
	if (!query) return "";
	return String(query).trim().toLowerCase();
}

/**
 * Check if a search query is valid (non-empty after trimming)
 * @param query - Search query to validate
 * @returns True if query is valid
 */
export function isValidSearchQuery(query: any): boolean {
	const s = String(query || "");
	return Boolean(s && s.trim());
}

/**
 * Interface for reload parameters
 */
export interface ReloadOnSearchClearParams {
	currentSearch: string;
	previousSearch: string;
	itemsLoaded: boolean;
	itemsCount: number;
}

/**
 * Check if search should trigger a reload
 * @param params - Parameters
 * @returns True if reload is needed
 */
export function shouldReloadOnSearchClear(
	params: ReloadOnSearchClearParams,
): boolean {
	const { currentSearch, previousSearch, itemsLoaded, itemsCount } = params;

	const hadQuery = Boolean(
		(currentSearch && currentSearch.trim()) ||
		(previousSearch && previousSearch.trim()),
	);

	return hadQuery || !itemsLoaded || !itemsCount;
}

/**
 * Normalize input event value to a string
 * @param event - Event or raw string
 * @returns string
 */
export function normalizeSearchInputValue(event: any): string {
	if (
		event &&
		typeof event === "object" &&
		"target" in event &&
		event.target &&
		typeof event.target.value === "string"
	) {
		return event.target.value;
	}
	return typeof event === "string" ? event : "";
}
