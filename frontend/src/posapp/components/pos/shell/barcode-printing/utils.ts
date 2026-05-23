import type { BarcodePrintItem, LabelSize, ScaleBarcodeSettings } from "./types";

export function normalizeLabelQty(value: unknown): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 1;
	}
	return Math.max(1, Math.round(parsed));
}

export function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function normalizeScaleGrams(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return Math.round(parsed);
}

export function normalizeUomToken(uom: unknown): string {
	return String(uom || "")
		.trim()
		.toLowerCase()
		.replace(/[\s._-]+/g, "");
}

export function isLikelyWeightUom(uom: unknown): boolean {
	const token = normalizeUomToken(uom);
	if (!token) return false;
	const directMatches = new Set([
		"kg",
		"kgs",
		"kilogram",
		"kilograms",
		"kilogramme",
		"kilogrammes",
		"kilo",
		"gram",
		"grams",
		"gm",
		"gms",
	]);
	if (directMatches.has(token)) return true;
	return token.includes("kilo") || token.includes("gram");
}

export function getBarcodeRowsForItem(item: BarcodePrintItem | null | undefined) {
	return Array.isArray(item?.item_barcode) ? item.item_barcode.filter((row) => row?.barcode) : [];
}

export function isScaleSettingsConfigured(settings: ScaleBarcodeSettings | null | undefined): boolean {
	const s = settings || {};
	return Boolean(
		Number(s.item_code_starting_digit) > 0 &&
			Number(s.item_code_total_digits) > 0 &&
			Number(s.weight_starting_digit) > 0 &&
			Number(s.weight_total_digits) > 0,
	);
}

export function getScaleRequiredLength(settings: ScaleBarcodeSettings = {}): number {
	const toNum = (v: unknown) => Number(v) || 0;
	const itemEnd =
		toNum(settings.item_code_starting_digit) + toNum(settings.item_code_total_digits) - 1;
	const weightEnd =
		toNum(settings.weight_starting_digit) +
		toNum(settings.weight_total_digits) +
		toNum(settings.weight_decimals) -
		1;
	let priceEnd = 0;
	if (toNum(settings.price_included_in_barcode_or_not)) {
		priceEnd =
			toNum(settings.price_starting_digit) +
			toNum(settings.price_total_digit) +
			toNum(settings.price_decimals) -
			1;
	}
	return Math.max(itemEnd, weightEnd, priceEnd, 0);
}

export function isPotentialScaleTemplate(
	barcode: unknown,
	settings: ScaleBarcodeSettings | null | undefined,
): boolean {
	const value = String(barcode || "").trim();
	if (!value || !isScaleSettingsConfigured(settings)) return false;
	const prefix = String(settings?.prefix || "").trim();
	if (prefix && !value.startsWith(prefix)) return false;
	const requiredLen = getScaleRequiredLength(settings || {});
	return value.length >= requiredLen;
}

export function getScaleTemplateBarcode(
	item: BarcodePrintItem | null | undefined,
	settings: ScaleBarcodeSettings | null | undefined,
): string {
	if (!item) return "";
	const normalize = (value: unknown) => String(value || "").trim();
	const currentUom = String(item.uom || "").trim();
	const barcodeRows = getBarcodeRowsForItem(item);
	const settingsReady = isScaleSettingsConfigured(settings);

	const byCurrentUom = currentUom
		? barcodeRows.filter((row) => String(row?.uom || "").trim() === currentUom)
		: [];

	const pickTemplate = (rows: typeof barcodeRows) =>
		rows.find((row) => isPotentialScaleTemplate(row?.barcode, settings))?.barcode || "";

	if (settingsReady) {
		const fromUom = pickTemplate(byCurrentUom);
		if (fromUom) return normalize(fromUom);
		const fromRows = pickTemplate(barcodeRows);
		if (fromRows) return normalize(fromRows);
		const known = [
			item._scale_template_barcode,
			item._scanned_scale_barcode,
			item._scanned_barcode,
			item.barcode,
		]
			.map(normalize)
			.find((code) => code && isPotentialScaleTemplate(code, settings));
		return known || "";
	}

	const fallbackRow = byCurrentUom[0]?.barcode || barcodeRows[0]?.barcode;
	return (
		normalize(item._scale_template_barcode) ||
		normalize(item._scanned_scale_barcode) ||
		normalize(item._scanned_barcode) ||
		normalize(fallbackRow) ||
		normalize(item.barcode)
	);
}

export function isScaleBarcodePayload(item: BarcodePrintItem | null | undefined): boolean {
	if (!item || typeof item !== "object") return false;
	return Boolean(
		item._is_scale_barcode ||
			item._scanned_scale_barcode ||
			item._scale_qty ||
			item._scale_price ||
			(item._barcode_qty && item._scanned_barcode),
	);
}

export function extractScaleScannedBarcode(item: BarcodePrintItem | null | undefined): string {
	if (!isScaleBarcodePayload(item)) return "";
	const scanned = item?._scanned_scale_barcode || item?._scanned_barcode || item?.barcode || "";
	return String(scanned || "").trim();
}

export function shouldShowScaleGramsInput(
	item: BarcodePrintItem | null | undefined,
	settings: ScaleBarcodeSettings | null | undefined,
): boolean {
	if (!item) return false;
	if (item._is_scale_barcode || isScaleBarcodePayload(item)) return true;
	const templateBarcode = getScaleTemplateBarcode(item, settings);
	if (templateBarcode && isPotentialScaleTemplate(templateBarcode, settings)) return true;
	return isLikelyWeightUom(item.uom);
}

export function resolveBarcodeForUom(
	item: Pick<BarcodePrintItem, "item_barcode" | "barcode" | "barcodes">,
	uom: string,
): string {
	const barcodeRows = Array.isArray(item.item_barcode) ? item.item_barcode : [];
	if (uom && barcodeRows.length > 0) {
		const matched = barcodeRows.find((row) => row?.barcode && row.uom === uom);
		if (matched?.barcode) return matched.barcode;
	}
	if (item.barcode) return item.barcode;
	if (barcodeRows.length > 0 && barcodeRows[0]?.barcode) return barcodeRows[0].barcode;
	if (Array.isArray(item.barcodes) && item.barcodes.length > 0) return item.barcodes[0] || "";
	return "";
}

export function getItemUomOptions(item: BarcodePrintItem): string[] {
	const options = Array.isArray(item.item_uoms)
		? item.item_uoms.map((row) => row?.uom).filter(Boolean)
		: [];
	if (!options.length && Array.isArray(item.item_barcode)) {
		item.item_barcode.forEach((row) => {
			const uom = row?.uom;
			if (uom) options.push(uom);
		});
	}
	if (item.uom && !options.includes(item.uom)) {
		options.unshift(item.uom);
	}
	return Array.from(new Set(options as string[]));
}

export function parseLabelSize(
	pageFormat: string,
	gridCols: number,
	gridRows: number,
): LabelSize {
	if (pageFormat === "A4") {
		return {
			type: "A4",
			cols: parseInt(String(gridCols)) || 3,
			rows: parseInt(String(gridRows)) || 7,
		};
	}
	return { type: "A4", cols: 3, rows: 7 };
}

export function getScaleSettingsSnapshot(
	settings: ScaleBarcodeSettings | null | undefined,
	configured: boolean,
) {
	const s = settings || {};
	return {
		prefix: s.prefix || "",
		prefix_included_or_not: Number(s.prefix_included_or_not) || 0,
		no_of_prefix_characters: Number(s.no_of_prefix_characters) || 0,
		item_code_starting_digit: Number(s.item_code_starting_digit) || 0,
		item_code_total_digits: Number(s.item_code_total_digits) || 0,
		weight_starting_digit: Number(s.weight_starting_digit) || 0,
		weight_total_digits: Number(s.weight_total_digits) || 0,
		weight_decimals: Number(s.weight_decimals) || 0,
		price_included_in_barcode_or_not: Number(s.price_included_in_barcode_or_not) || 0,
		price_starting_digit: Number(s.price_starting_digit) || 0,
		price_total_digit: Number(s.price_total_digit) || 0,
		price_decimals: Number(s.price_decimals) || 0,
		configured,
	};
}
