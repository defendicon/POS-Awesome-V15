/**
 * Search utility functions for ItemsSelector
 * Handles search string manipulation, especially for scale barcodes
 */

/**
 * Extract item code from a potential scale barcode
 * @param {string} searchString - The search/barcode string
 * @param {string} scalePrefix - The scale barcode prefix
 * @param {Function} scaleBarcodeMatches - Function to check if string matches scale barcode
 * @returns {string} Extracted item code or original string
 */
export function extractItemCodeFromSearch(searchString, scalePrefix, scaleBarcodeMatches) {
    if (!searchString) return "";

    const prefix = scalePrefix || "";
    const prefix_len = prefix.length;

    if (!scaleBarcodeMatches || !scaleBarcodeMatches(searchString)) {
        return searchString;
    }

    // Calculate item code length from total barcode length
    // Scale barcodes typically have: prefix + item_code + 6 digits for qty/price
    const item_code_len = searchString.length - prefix_len - 6;
    return searchString.substr(0, prefix_len + item_code_len);
}

/**
 * Sanitize and normalize a search query
 * @param {string} query - Raw search query
 * @returns {string} Normalized query
 */
export function normalizeSearchQuery(query) {
    if (!query) return "";
    return String(query).trim().toLowerCase();
}

/**
 * Check if a search query is valid (non-empty after trimming)
 * @param {string} query - Search query to validate
 * @returns {boolean} True if query is valid
 */
export function isValidSearchQuery(query) {
    return Boolean(query && query.trim());
}

/**
 * Check if search should trigger a reload
 * @param {Object} params - Parameters
 * @param {string} params.currentSearch - Current search value
 * @param {string} params.previousSearch - Previous search value
 * @param {boolean} params.itemsLoaded - Whether items are loaded
 * @param {number} params.itemsCount - Number of items currently loaded
 * @returns {boolean} True if reload is needed
 */
export function shouldReloadOnSearchClear(params) {
    const { currentSearch, previousSearch, itemsLoaded, itemsCount } = params;

    const hadQuery = Boolean(
        (currentSearch && currentSearch.trim()) ||
        (previousSearch && previousSearch.trim())
    );

    return hadQuery || !itemsLoaded || !itemsCount;
}
