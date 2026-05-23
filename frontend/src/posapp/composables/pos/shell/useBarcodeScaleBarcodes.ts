import { ref } from "vue";

import type { BarcodePrintItem, ScaleBarcodeSettings } from "../../../components/pos/shell/barcode-printing/types";
import {
	getScaleSettingsSnapshot,
	getScaleTemplateBarcode,
	isScaleSettingsConfigured,
	normalizeScaleGrams,
	shouldShowScaleGramsInput,
} from "../../../components/pos/shell/barcode-printing/utils";

declare const frappe: any;
declare const __: typeof Function.prototype;

export function useBarcodeScaleBarcodes({
	includePrice,
	pendingAddItem,
	pendingScaleGrams,
	toastStore,
	logDebug,
}) {
	const scaleBarcodeSettings = ref<ScaleBarcodeSettings | null>(null);
	const scaleBarcodeSettingsLoaded = ref(false);
	let pendingScaleBarcodeTimer: ReturnType<typeof setTimeout> | null = null;

	function settingsSnapshot() {
		return getScaleSettingsSnapshot(
			scaleBarcodeSettings.value,
			isScaleSettingsConfigured(scaleBarcodeSettings.value),
		);
	}

	function showScaleGrams(item: BarcodePrintItem | null | undefined) {
		return shouldShowScaleGramsInput(item, scaleBarcodeSettings.value);
	}

	function clearPendingScaleBarcodeTimer() {
		if (pendingScaleBarcodeTimer) {
			clearTimeout(pendingScaleBarcodeTimer);
			pendingScaleBarcodeTimer = null;
		}
	}

	async function ensureScaleBarcodeSettings(force = false) {
		logDebug("ensureScaleBarcodeSettings:start", {
			force,
			loaded: scaleBarcodeSettingsLoaded.value,
		});
		if (!force && scaleBarcodeSettingsLoaded.value && scaleBarcodeSettings.value) {
			logDebug("ensureScaleBarcodeSettings:cached", {
				settings: settingsSnapshot(),
			});
			return scaleBarcodeSettings.value;
		}
		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.items.parse_scale_barcode",
				args: { barcode: "" },
			});
			const settings =
				(res && res.message && res.message.settings) || (res && res.message) || null;
			if (settings && typeof settings === "object") {
				scaleBarcodeSettings.value = settings;
			}
			logDebug("ensureScaleBarcodeSettings:loaded", {
				settings: settingsSnapshot(),
			});
		} catch (error) {
			console.warn("Failed to load scale barcode settings for printing", error);
			scaleBarcodeSettings.value = null;
			logDebug("ensureScaleBarcodeSettings:error", {
				error: String((error as Error)?.message || error || ""),
			});
		} finally {
			scaleBarcodeSettingsLoaded.value = true;
		}
		return scaleBarcodeSettings.value;
	}

	async function generateScaleBarcodeForItem(
		item: BarcodePrintItem,
		grams: unknown,
		{ silent = false } = {},
	) {
		logDebug("generateScaleBarcodeForItem:start", {
			item_code: item?.item_code,
			uom: item?.uom,
			input_grams: grams,
			silent,
		});
		if (!item) return false;
		const normalizedGrams = normalizeScaleGrams(grams);
		if (!normalizedGrams) {
			logDebug("generateScaleBarcodeForItem:invalid-grams", {
				item_code: item?.item_code,
				input_grams: grams,
			});
			return false;
		}

		await ensureScaleBarcodeSettings();
		logDebug("generateScaleBarcodeForItem:settings", {
			settings: settingsSnapshot(),
		});
		if (!isScaleSettingsConfigured(scaleBarcodeSettings.value)) {
			item.scale_grams = normalizedGrams;
			item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
			if (!silent) {
				toastStore.show({
					title: __("Scale barcode settings are not configured. Using item barcode only."),
					color: "warning",
				});
			}
			logDebug("generateScaleBarcodeForItem:fallback-no-settings", {
				item_code: item?.item_code,
				uom: item?.uom,
				grams: normalizedGrams,
				barcode: item?.barcode || "",
			});
			return true;
		}

		const templateBarcode = getScaleTemplateBarcode(item, scaleBarcodeSettings.value);
		logDebug("generateScaleBarcodeForItem:template", {
			item_code: item?.item_code,
			uom: item?.uom,
			template_barcode: templateBarcode || "",
		});

		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.items.build_scale_barcode",
				args: {
					barcode_template: templateBarcode,
					item_code: item.item_code,
					uom: item.uom,
					weight_grams: normalizedGrams,
					price: includePrice.value ? item.price : null,
				},
			});
			const generated = res && res.message ? res.message : null;
			logDebug("generateScaleBarcodeForItem:api-response", {
				item_code: item?.item_code,
				uom: item?.uom,
				grams: normalizedGrams,
				generated,
			});
			if (generated && generated.warning) {
				item.scale_grams = normalizedGrams;
				item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
				if (!silent) {
					toastStore.show({
						title: __(
							"Scale template barcode is missing for this item/UOM. Using item barcode only.",
						),
						color: "warning",
					});
				}
				logDebug("generateScaleBarcodeForItem:fallback-warning", {
					item_code: item?.item_code,
					uom: item?.uom,
					grams: normalizedGrams,
					warning: generated.warning,
					barcode: item?.barcode || "",
				});
				return true;
			}
			if (!generated || !generated.barcode) {
				if (!silent) {
					toastStore.show({
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
			logDebug("generateScaleBarcodeForItem:success", {
				item_code: item?.item_code,
				uom: item?.uom,
				grams: normalizedGrams,
				barcode: item?.barcode || "",
				scale_qty: item?._scale_qty,
			});
			return true;
		} catch (error) {
			console.warn("Scale barcode generation failed", error);
			item.scale_grams = normalizedGrams;
			item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
			if (!silent) {
				toastStore.show({
					title: __("Failed to generate scale barcode. Using item barcode only."),
					color: "warning",
				});
			}
			logDebug("generateScaleBarcodeForItem:error-fallback", {
				item_code: item?.item_code,
				uom: item?.uom,
				grams: normalizedGrams,
				error: String((error as Error)?.message || error || ""),
				barcode: item?.barcode || "",
			});
			return true;
		}
	}

	function onPendingScaleGramsInput() {
		logDebug("onPendingScaleGramsInput", {
			pending_grams: pendingScaleGrams.value,
		});
		clearPendingScaleBarcodeTimer();
		pendingScaleBarcodeTimer = setTimeout(() => {
			syncPendingScaleBarcode(true);
		}, 250);
	}

	async function syncPendingScaleBarcode(silent = false) {
		logDebug("syncPendingScaleBarcode:start", {
			silent,
			has_pending_item: Boolean(pendingAddItem.value),
			pending_grams: pendingScaleGrams.value,
		});
		if (!pendingAddItem.value || !showScaleGrams(pendingAddItem.value)) {
			logDebug("syncPendingScaleBarcode:skip", {
				reason: "no-pending-item-or-not-scale-uom",
			});
			return false;
		}
		const grams = normalizeScaleGrams(pendingScaleGrams.value);
		if (!grams) {
			logDebug("syncPendingScaleBarcode:invalid-grams", {
				pending_grams: pendingScaleGrams.value,
			});
			return false;
		}
		pendingScaleGrams.value = grams;
		const result = await generateScaleBarcodeForItem(pendingAddItem.value, grams, { silent });
		logDebug("syncPendingScaleBarcode:done", {
			result,
			grams,
			barcode: pendingAddItem.value?.barcode || "",
		});
		return result;
	}

	return {
		scaleBarcodeSettings,
		scaleBarcodeSettingsLoaded,
		settingsSnapshot,
		showScaleGrams,
		clearPendingScaleBarcodeTimer,
		ensureScaleBarcodeSettings,
		generateScaleBarcodeForItem,
		onPendingScaleGramsInput,
		syncPendingScaleBarcode,
	};
}
