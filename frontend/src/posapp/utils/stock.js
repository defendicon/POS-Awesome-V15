/* global __ */

export function parseBooleanSetting(value) {
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

export function formatStockShortageError(itemName, availableQty, requestedQty) {
	const label = itemName || __("this item");
	const available = availableQty ?? 0;
	const requested = requestedQty ?? 0;

	return __("{0} has only {1} in stock. You requested {2}. Adjust quantity or restock.", [
		label,
		available,
		requested,
	]);
}

export function formatNegativeStockWarning(itemName, availableQty, requestedQty) {
	const label = itemName || __("this item");
	const available = availableQty ?? 0;
	const requested = requestedQty ?? 0;

	return __("Stock update: {0} has {1} available. Adding {2} will bring the stock below zero.", [
		label,
		available,
		requested,
	]);
}
