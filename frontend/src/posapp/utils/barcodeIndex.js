export const ensureBarcodeIndex = (index) => {
	if (index && typeof index.set === "function") {
		return index;
	}
	return new Map();
};

export const resetBarcodeIndex = (index) => {
	const map = ensureBarcodeIndex(index);
	map.clear();
	return map;
};

const registerCode = (index, item, code) => {
	if (code === undefined || code === null) {
		return;
	}
	const normalized = String(code).trim();
	if (!normalized) {
		return;
	}
	if (!index.has(normalized)) {
		index.set(normalized, item);
	}
	const lower = normalized.toLowerCase();
	if (!index.has(lower)) {
		index.set(lower, item);
	}
};

export const indexItemInBarcodeIndex = (index, item) => {
	if (!item) {
		return index;
	}
	const map = ensureBarcodeIndex(index);
	registerCode(map, item, item.item_code);
	registerCode(map, item, item.barcode);
	if (Array.isArray(item.item_barcode)) {
		item.item_barcode.forEach((barcode) => registerCode(map, item, barcode?.barcode));
	}
	if (Array.isArray(item.barcodes)) {
		item.barcodes.forEach((barcode) => registerCode(map, item, barcode));
	}
	if (Array.isArray(item.serial_no_data)) {
		item.serial_no_data.forEach((serial) => registerCode(map, item, serial?.serial_no));
	}
	if (Array.isArray(item.batch_no_data)) {
		item.batch_no_data.forEach((batch) => registerCode(map, item, batch?.batch_no));
	}
	return map;
};

export const replaceBarcodeIndex = (index, items = []) => {
	const map = resetBarcodeIndex(index);
	items.forEach((item) => indexItemInBarcodeIndex(map, item));
	return map;
};

export const lookupItemInBarcodeIndex = (index, code) => {
	if (code === undefined || code === null) {
		return null;
	}
	const map = ensureBarcodeIndex(index);
	const normalized = String(code).trim();
	if (!normalized) {
		return null;
	}
	return map.get(normalized) || map.get(normalized.toLowerCase()) || null;
};
