import { ref } from "vue";
import { useToastStore } from "../../../stores/toastStore";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface ScaleBarcodeSettingsSnapshot {
	prefix: string;
	prefix_included_or_not: number;
	no_of_prefix_characters: number;
	item_code_starting_digit: number;
	item_code_total_digits: number;
	weight_starting_digit: number;
	weight_total_digits: number;
	weight_decimals: number;
	price_included_in_barcode_or_not: number;
	price_starting_digit: number;
	price_total_digit: number;
	price_decimals: number;
	configured: boolean;
}

export function useScaleBarcodeSettings() {
	const scaleBarcodeSettings = ref<any>(null);
	const scaleBarcodeSettingsLoaded = ref(false);

	const logDebug = (step: string, payload: any = {}) => {
		try {
			console.debug("[POS ScaleBarcodeSettings]", step, payload);
		} catch {
			console.log("[POS ScaleBarcodeSettings]", step);
		}
	};

	const getScaleSettingsSnapshot = (): ScaleBarcodeSettingsSnapshot => {
		const settings = scaleBarcodeSettings.value || {};
		return {
			prefix: settings.prefix || "",
			prefix_included_or_not: Number(settings.prefix_included_or_not) || 0,
			no_of_prefix_characters: Number(settings.no_of_prefix_characters) || 0,
			item_code_starting_digit: Number(settings.item_code_starting_digit) || 0,
			item_code_total_digits: Number(settings.item_code_total_digits) || 0,
			weight_starting_digit: Number(settings.weight_starting_digit) || 0,
			weight_total_digits: Number(settings.weight_total_digits) || 0,
			weight_decimals: Number(settings.weight_decimals) || 0,
			price_included_in_barcode_or_not: Number(settings.price_included_in_barcode_or_not) || 0,
			price_starting_digit: Number(settings.price_starting_digit) || 0,
			price_total_digit: Number(settings.price_total_digit) || 0,
			price_decimals: Number(settings.price_decimals) || 0,
			configured: isScaleSettingsConfigured(),
		};
	};

	const isScaleSettingsConfigured = (): boolean => {
		const settings = scaleBarcodeSettings.value || {};
		return Boolean(
			Number(settings.item_code_starting_digit) > 0 &&
				Number(settings.item_code_total_digits) > 0 &&
				Number(settings.weight_starting_digit) > 0 &&
				Number(settings.weight_total_digits) > 0,
		);
	};

	const getScaleRequiredLength = (settings?: any): number => {
		const s = settings || scaleBarcodeSettings.value || {};
		const toNum = (v: any) => Number(v) || 0;
		const itemEnd = toNum(s.item_code_starting_digit) + toNum(s.item_code_total_digits) - 1;
		const weightEnd =
			toNum(s.weight_starting_digit) + toNum(s.weight_total_digits) + toNum(s.weight_decimals) - 1;
		let priceEnd = 0;
		if (toNum(s.price_included_in_barcode_or_not)) {
			priceEnd =
				toNum(s.price_starting_digit) + toNum(s.price_total_digit) + toNum(s.price_decimals) - 1;
		}
		return Math.max(itemEnd, weightEnd, priceEnd, 0);
	};

	const isPotentialScaleTemplate = (barcode: string, settings?: any): boolean => {
		const value = String(barcode || "").trim();
		if (!value || !isScaleSettingsConfigured()) return false;
		const s = settings || scaleBarcodeSettings.value || {};
		const prefix = String(s.prefix || "").trim();
		if (prefix && !value.startsWith(prefix)) return false;
		const requiredLen = getScaleRequiredLength(s);
		return value.length >= requiredLen;
	};

	const isScaleBarcodePayload = (item: any): boolean => {
		if (!item || typeof item !== "object") return false;
		return Boolean(
			item._is_scale_barcode ||
				item._scanned_scale_barcode ||
				item._scale_qty ||
				item._scale_price ||
				(item._barcode_qty && item._scanned_barcode),
		);
	};

	const extractScaleScannedBarcode = (item: any): string => {
		if (!isScaleBarcodePayload(item)) return "";
		return String(item._scanned_scale_barcode || item._scanned_barcode || item.barcode || "").trim();
	};

	const normalizeScaleGrams = (value: any): number | null => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed <= 0) return null;
		return Math.round(parsed);
	};

	const normalizeUomToken = (uom: string): string => {
		return String(uom || "")
			.trim()
			.toLowerCase()
			.replace(/[\s._-]+/g, "");
	};

	const isLikelyWeightUom = (uom: string): boolean => {
		const token = normalizeUomToken(uom);
		if (!token) return false;
		const directMatches = new Set([
			"kg", "kgs", "kilogram", "kilograms", "kilogramme", "kilogrammes",
			"kilo", "gram", "grams", "gm", "gms",
		]);
		if (directMatches.has(token)) return true;
		return token.includes("kilo") || token.includes("gram");
	};

	const getBarcodeRowsForItem = (item: any): any[] => {
		return Array.isArray(item?.item_barcode) ? item.item_barcode.filter((row: any) => row?.barcode) : [];
	};

	const getScaleTemplateBarcode = (item: any): string => {
		if (!item) return "";
		const _normalize = (value: string) => String(value || "").trim();
		const currentUom = String(item.uom || "").trim();
		const barcodeRows = getBarcodeRowsForItem(item);
		const settingsReady = isScaleSettingsConfigured();

		const byCurrentUom = currentUom
			? barcodeRows.filter((row: any) => String(row?.uom || "").trim() === currentUom)
			: [];

		const pickTemplate = (rows: any[]) =>
			rows.find((row: any) => isPotentialScaleTemplate(row?.barcode))?.barcode || "";

		if (settingsReady) {
			const fromUom = pickTemplate(byCurrentUom);
			if (fromUom) return _normalize(fromUom);
			const fromRows = pickTemplate(barcodeRows);
			if (fromRows) return _normalize(fromRows);
			const known = [
				item._scale_template_barcode,
				item._scanned_scale_barcode,
				item._scanned_barcode,
				item.barcode,
			]
				.map(_normalize)
				.find((code: string) => code && isPotentialScaleTemplate(code));
			return known || "";
		}

		const fallbackRow = byCurrentUom[0]?.barcode || barcodeRows[0]?.barcode;
		return (
			_normalize(item._scale_template_barcode) ||
			_normalize(item._scanned_scale_barcode) ||
			_normalize(item._scanned_barcode) ||
			_normalize(fallbackRow) ||
			_normalize(item.barcode)
		);
	};

	const shouldShowScaleGramsInput = (item: any): boolean => {
		if (!item) return false;
		if (item._is_scale_barcode || isScaleBarcodePayload(item)) return true;
		const templateBarcode = getScaleTemplateBarcode(item);
		if (templateBarcode && isPotentialScaleTemplate(templateBarcode)) return true;
		return isLikelyWeightUom(item.uom);
	};

	const ensureScaleBarcodeSettings = async (force = false): Promise<any> => {
		logDebug("ensureScaleBarcodeSettings:start", { force, loaded: scaleBarcodeSettingsLoaded.value });
		if (!force && scaleBarcodeSettingsLoaded.value && scaleBarcodeSettings.value) {
			logDebug("ensureScaleBarcodeSettings:cached", { settings: getScaleSettingsSnapshot() });
			return scaleBarcodeSettings.value;
		}
		try {
			const res: any = await frappe.call({
				method: "posawesome.posawesome.api.items.parse_scale_barcode",
				args: { barcode: "" },
			});
			const settings = (res && res.message && res.message.settings) || (res && res.message) || null;
			if (settings && typeof settings === "object") {
				scaleBarcodeSettings.value = settings;
			}
			logDebug("ensureScaleBarcodeSettings:loaded", { settings: getScaleSettingsSnapshot() });
		} catch (error: any) {
			console.warn("Failed to load scale barcode settings", error);
			scaleBarcodeSettings.value = null;
			logDebug("ensureScaleBarcodeSettings:error", { error: String(error?.message || error || "") });
		} finally {
			scaleBarcodeSettingsLoaded.value = true;
		}
		return scaleBarcodeSettings.value;
	};

	const generateScaleBarcodeForItem = async (
		item: any,
		grams: number,
		{ silent = false, includePrice = true }: { silent?: boolean; includePrice?: boolean } = {},
	): Promise<boolean> => {
		if (!item) return false;
		const normalizedGrams = normalizeScaleGrams(grams);
		if (!normalizedGrams) return false;

		await ensureScaleBarcodeSettings();
		if (!isScaleSettingsConfigured()) {
			item.scale_grams = normalizedGrams;
			item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
			if (!silent) {
				useToastStore().show({
					title: __("Scale barcode settings are not configured. Using item barcode only."),
					color: "warning",
				});
			}
			return true;
		}

		const templateBarcode = getScaleTemplateBarcode(item);

		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.items.build_scale_barcode",
				args: {
					barcode_template: templateBarcode,
					item_code: item.item_code,
					uom: item.uom,
					weight_grams: normalizedGrams,
					price: includePrice ? item.price : null,
				},
			});
			const generated = res && res.message ? res.message : null;
			if (generated && generated.warning) {
				item.scale_grams = normalizedGrams;
				item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
				if (!silent) {
					useToastStore().show({
						title: __("Scale template barcode is missing for this item/UOM. Using item barcode only."),
						color: "warning",
					});
				}
				return true;
			}
			if (!generated || !generated.barcode) {
				if (!silent) {
					useToastStore().show({
						title: __("Unable to generate scale barcode"),
						color: "warning",
					});
				}
				return false;
			}
			item._is_scale_barcode = true;
			item._scale_template_barcode = templateBarcode || generated.barcode;
			item._scanned_barcode = generated.barcode;
			item._scale_qty = Number(generated.qty || normalizedGrams / 1000);
			item.scale_grams = normalizedGrams;
			item.barcode = String(generated.barcode);
			return true;
		} catch (error) {
			console.warn("Scale barcode generation failed", error);
			item.scale_grams = normalizedGrams;
			item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
			if (!silent) {
				useToastStore().show({
					title: __("Failed to generate scale barcode. Using item barcode only."),
					color: "warning",
				});
			}
			return true;
		}
	};

	return {
		scaleBarcodeSettings,
		scaleBarcodeSettingsLoaded,
		getScaleSettingsSnapshot,
		isScaleSettingsConfigured,
		getScaleRequiredLength,
		isPotentialScaleTemplate,
		isScaleBarcodePayload,
		extractScaleScannedBarcode,
		normalizeScaleGrams,
		normalizeUomToken,
		isLikelyWeightUom,
		getBarcodeRowsForItem,
		getScaleTemplateBarcode,
		shouldShowScaleGramsInput,
		ensureScaleBarcodeSettings,
		generateScaleBarcodeForItem,
	};
}
