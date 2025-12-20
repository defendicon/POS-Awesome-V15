const normalizePart = (value) => {
	if (value === null || value === undefined) {
		return "";
	}
	if (Array.isArray(value)) {
		return [...value].filter(Boolean).sort().join("|");
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value ?? "").trim();
};

export function buildCartKey(item = {}, fallbackPriceList = "") {
	const stableParts = [
		normalizePart(item.item_code),
		normalizePart(item.uom || item.stock_uom),
		normalizePart(item.batch_no),
		normalizePart(item.price_list || item.price_list_name || fallbackPriceList),
	];

	// Preserve uniqueness for serial-controlled or bundled items
	if (item.serial_no_selected && item.serial_no_selected.length) {
		stableParts.push(normalizePart([...new Set(item.serial_no_selected)].sort()));
	} else if (item.serial_no) {
		stableParts.push(normalizePart(item.serial_no));
	}

	if (item.bundle_id) {
		stableParts.push(normalizePart(item.bundle_id));
	}

	return stableParts.join("::");
}

export default buildCartKey;
