/**
 * Utility functions for stock-related logic and message formatting.
 */

declare const __: any;

/**
 * Parses a value into a boolean based on standard Frappe/POS settings.
 * @param value The value to parse (string, number, or boolean)
 * @returns boolean
 */
export function parseBooleanSetting(value: any): boolean {
    if (value === undefined || value === null) {
        return false;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return ["1", "true", "yes", "on"].includes(normalized);
    }

    if (typeof value === "number") {
        return value === 1;
    }

    return Boolean(value);
}

/**
 * Formats a stock shortage error message.
 * @param itemName The name of the item
 * @param availableQty The quantity currently available
 * @param requestedQty The quantity requested by the user
 * @returns Formatted translated string
 */
export function formatStockShortageError(itemName: string | null, availableQty: number, requestedQty: number): string {
    const label = itemName || __("this item");
    const available = availableQty ?? 0;
    const requested = requestedQty ?? 0;

    return __("{0} has only {1} in stock. You requested {2}. Adjust quantity or restock.", [
        label,
        available,
        requested,
    ]);
}

/**
 * Formats a negative stock warning message.
 * @param itemName The name of the item
 * @param availableQty The quantity currently available
 * @param requestedQty The quantity that would be added/removed
 * @returns Formatted translated string
 */
export function formatNegativeStockWarning(itemName: string | null, availableQty: number, requestedQty: number): string {
    const label = itemName || __("this item");
    const available = availableQty ?? 0;
    const requested = requestedQty ?? 0;

    return __("Stock update: {0} has {1} available. Adding {2} will bring the stock below zero.", [
        label,
        available,
        requested,
    ]);
}
