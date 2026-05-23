/* global __, frappe */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useItemsStore } from "../../../stores/itemsStore";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import type { BarcodePrintItem } from "../../../components/pos/shell/barcode-printing/types";
import { useBarcodeScaleBarcodes } from "./useBarcodeScaleBarcodes";
import {
	buildPrintWindowHtml,
	generatePrintContent,
	getPrintStyles,
} from "../../../components/pos/shell/barcode-printing/print";
import {
	extractScaleScannedBarcode,
	getItemUomOptions,
	isLikelyWeightUom,
	isPotentialScaleTemplate,
	isScaleBarcodePayload,
	normalizeLabelQty,
	normalizeScaleGrams,
	parseLabelSize,
	resolveBarcodeForUom,
} from "../../../components/pos/shell/barcode-printing/utils";

export function useBarcodePrinting() {
	const toastStore = useToastStore();
	const uiStore = useUIStore();
	const itemsStore = useItemsStore();
	const { posProfile: storePosProfile } = storeToRefs(uiStore);

	const items = ref<BarcodePrintItem[]>([]);
	const nextRowId = ref(1);
	const pageFormat = ref("A4");
	const pageFormatOptions = ["A4"];
	const gridCols = ref(3);
	const gridRows = ref(7);
	const includePrice = ref(true);
	const includeBatchSerial = ref(false);
	const editingQtyValue = ref("");
	const pos_profile = ref<Record<string, unknown> | null>(null);
	const addItemDialog = ref(false);
	const addItemQty = ref(1);
	const pendingAddItem = ref<BarcodePrintItem | null>(null);
	const pendingScaleGrams = ref<number | null>(null);

	const headers = computed(() => [
		{ title: __("Item Code"), key: "item_code", width: "16%" },
		{ title: __("Item Name"), key: "item_name", width: "24%" },
		{ title: __("UOM"), key: "uom", width: "12%" },
		{ title: __("Barcode"), key: "barcode", width: "20%" },
		{ title: __("Weight (g)"), key: "grams", width: "12%" },
		{ title: __("Quantity"), key: "qty", align: "center", width: "12%" },
		{ title: "", key: "actions", align: "center", sortable: false, width: "4%" },
	]);

	const currentLabelSize = computed(() =>
		parseLabelSize(pageFormat.value, gridCols.value, gridRows.value),
	);

	function logDebug(step: string, payload: Record<string, unknown> = {}) {
		try {
			console.debug("[POS BarcodePrinting]", step, payload);
		} catch {
			console.log("[POS BarcodePrinting]", step);
		}
	}

	const {
		scaleBarcodeSettings,
		scaleBarcodeSettingsLoaded,
		settingsSnapshot,
		showScaleGrams,
		clearPendingScaleBarcodeTimer,
		ensureScaleBarcodeSettings,
		generateScaleBarcodeForItem,
		onPendingScaleGramsInput,
		syncPendingScaleBarcode,
	} = useBarcodeScaleBarcodes({
		includePrice,
		pendingAddItem,
		pendingScaleGrams,
		toastStore,
		logDebug,
	});

	async function onItemScaleGramsChange(item: BarcodePrintItem) {
		logDebug("onItemScaleGramsChange:start", {
			item_code: item?.item_code,
			uom: item?.uom,
			scale_grams: item?.scale_grams,
		});
		if (!showScaleGrams(item)) return;
		const grams = normalizeScaleGrams(item.scale_grams);
		if (!grams) {
			toastStore.show({
				title: __("Enter a valid grams value"),
				color: "warning",
			});
			return;
		}
		await generateScaleBarcodeForItem(item, grams);
		logDebug("onItemScaleGramsChange:done", {
			item_code: item?.item_code,
			uom: item?.uom,
			scale_grams: item?.scale_grams,
			barcode: item?.barcode || "",
		});
	}

	function closeAddItemDialog() {
		logDebug("closeAddItemDialog", {
			had_pending_item: Boolean(pendingAddItem.value),
			pending_item_code: pendingAddItem.value?.item_code || "",
		});
		clearPendingScaleBarcodeTimer();
		addItemDialog.value = false;
		pendingAddItem.value = null;
		pendingScaleGrams.value = null;
		addItemQty.value = 1;
	}

	function getPrintableItems({ notify = true } = {}) {
		const itemsToPrint = items.value.filter((item) => String(item?.barcode || "").trim());
		logDebug("getPrintableItems", {
			notify,
			total_items: items.value.length,
			printable_items: itemsToPrint.length,
		});
		if (!notify) {
			return itemsToPrint;
		}

		if (itemsToPrint.length === 0) {
			toastStore.show({
				title: __("No items with barcodes to print"),
				color: "error",
			});
		} else if (itemsToPrint.length < items.value.length) {
			toastStore.show({
				title: __("Skipping items without barcodes"),
				color: "warning",
			});
		}
		return itemsToPrint;
	}

	function addOrMergePrintableItem(
		item: BarcodePrintItem,
		qty: unknown,
		logPrefix = "addOrMergePrintableItem",
	) {
		if (!item) return null;
		const normalizedQty = normalizeLabelQty(qty);
		const normalizedBarcode = String(item.barcode || "").trim();
		const existingItem = items.value.find(
			(i) =>
				i.item_code === item.item_code &&
				(i.uom || "") === (item.uom || "") &&
				String(i.barcode || "").trim() === normalizedBarcode,
		);

		if (existingItem) {
			existingItem.qty += normalizedQty;
			logDebug(`${logPrefix}:merged-existing`, {
				item_code: existingItem?.item_code || "",
				uom: existingItem?.uom || "",
				barcode: existingItem?.barcode || "",
				new_qty: existingItem?.qty,
			});
			return existingItem;
		}

		const itemToAdd = { ...item, qty: normalizedQty };
		items.value.unshift(itemToAdd);
		logDebug(`${logPrefix}:added-new`, {
			item_code: itemToAdd?.item_code || "",
			uom: itemToAdd?.uom || "",
			barcode: itemToAdd?.barcode || "",
			qty: itemToAdd?.qty,
			is_scale: Boolean(itemToAdd?._is_scale_barcode),
			scale_grams: itemToAdd?.scale_grams || null,
		});
		return itemToAdd;
	}

	async function onAddItem(item: BarcodePrintItem & Record<string, unknown>) {
		logDebug("onAddItem:start", {
			item_code: item?.item_code || "",
			item_name: item?.item_name || "",
			uom: item?.uom || item?.stock_uom || "",
			barcode: item?.barcode || "",
		});
		if (!item) return;

		const profile =
			pos_profile.value && (pos_profile.value as { name?: string }).name
				? pos_profile.value
				: itemsStore && itemsStore.posProfile
					? itemsStore.posProfile
					: {};
		await ensureScaleBarcodeSettings();
		logDebug("onAddItem:settings", {
			settings: settingsSnapshot(),
		});

		const scannedScaleBarcode = extractScaleScannedBarcode(item);
		let barcode = scannedScaleBarcode || String(item.barcode || "");
		let itemBarcodes = Array.isArray(item.item_barcode) ? item.item_barcode : [];
		let itemUoms = Array.isArray(item.item_uoms) ? item.item_uoms : [];
		if (!itemUoms.length && itemBarcodes.length > 0) {
			const barcodeUoms = itemBarcodes
				.map((row) => row?.uom)
				.filter(Boolean)
				.map((uom) => ({ uom }));
			itemUoms = barcodeUoms;
		}
		let defaultUom = String(item.uom || item.stock_uom || itemUoms?.[0]?.uom || "");

		if (!scannedScaleBarcode && itemBarcodes.length > 0) {
			const resolved = resolveBarcodeForUom({ item_barcode: itemBarcodes, barcode }, defaultUom);
			if (resolved) {
				barcode = resolved;
			}
		}

		if (!barcode && Array.isArray(item.barcodes) && item.barcodes.length > 0) {
			barcode = item.barcodes[0] || "";
		}

		if (!barcode) {
			try {
				if ((profile as { name?: string }).name) {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_items_details",
						args: {
							items_data: JSON.stringify([{ item_code: item.item_code }]),
							pos_profile: JSON.stringify(profile),
							price_list: (profile as { selling_price_list?: string }).selling_price_list || "",
						},
						silent: true,
					});

					const details = res.message && res.message[0];
					if (details) {
						itemBarcodes = Array.isArray(details.item_barcode)
							? details.item_barcode
							: itemBarcodes;
						itemUoms = Array.isArray(details.item_uoms) ? details.item_uoms : itemUoms;
						if (!itemUoms.length && itemBarcodes.length > 0) {
							const barcodeUoms = itemBarcodes
								.map((row: { uom?: string }) => row?.uom)
								.filter((uom): uom is string => Boolean(uom))
								.map((uom) => ({ uom }));
							itemUoms = barcodeUoms;
						}
						defaultUom =
							details.uom || item.uom || item.stock_uom || itemUoms?.[0]?.uom || defaultUom;
						if (!scannedScaleBarcode && itemBarcodes.length > 0) {
							const resolved = resolveBarcodeForUom(
								{ item_barcode: itemBarcodes, barcode: details.barcode || barcode },
								defaultUom,
							);
							if (resolved) {
								barcode = resolved;
							}
						} else if (details.barcode) {
							barcode = details.barcode;
						} else if (Array.isArray(details.barcodes) && details.barcodes.length > 0) {
							barcode = details.barcodes[0];
						}
					}
				}
			} catch (e) {
				console.warn("Failed to fetch item details for barcode", e);
			}
		}

		if (!barcode && scannedScaleBarcode) {
			barcode = scannedScaleBarcode;
		}

		if (!barcode) {
			toastStore.show({
				title: __("Item '{0}' has no barcode", [item.item_name]),
				color: "warning",
			});
			logDebug("onAddItem:abort-no-barcode", {
				item_code: item?.item_code || "",
				uom: defaultUom,
			});
			return;
		}

		if (!defaultUom && itemUoms.length > 0) {
			defaultUom = itemUoms[0]?.uom || "";
		}

		const scaleTemplateFromRows = Array.isArray(itemBarcodes)
			? (() => {
					const currentUom = String(defaultUom || "").trim();
					const scopedRows = currentUom
						? itemBarcodes.filter((row) => String(row?.uom || "").trim() === currentUom)
						: itemBarcodes;
					const matched =
						scopedRows.find((row) =>
							isPotentialScaleTemplate(row?.barcode, scaleBarcodeSettings.value),
						) ||
						itemBarcodes.find((row) =>
							isPotentialScaleTemplate(row?.barcode, scaleBarcodeSettings.value),
						);
					return String((matched && matched.barcode) || "").trim();
				})()
			: "";

		const isScaleBarcode =
			isScaleBarcodePayload(item) ||
			isLikelyWeightUom(defaultUom) ||
			isPotentialScaleTemplate(
				scannedScaleBarcode || scaleTemplateFromRows || barcode,
				scaleBarcodeSettings.value,
			);
		const initialLabelQty = isScaleBarcode ? 1 : normalizeLabelQty(item.qty);
		const initialScaleGrams = normalizeScaleGrams(
			item.scale_grams ||
				(item._scale_qty !== undefined && item._scale_qty !== null
					? Number(item._scale_qty) * 1000
					: null),
		);

		const preparedItem: BarcodePrintItem = {
			_row_id: nextRowId.value++,
			item_code: item.item_code,
			item_name: item.item_name,
			barcode: String(barcode || "").trim(),
			qty: initialLabelQty,
			price: Number(item.rate || item.standard_rate || 0),
			item_barcode: itemBarcodes,
			item_uoms: itemUoms,
			uom: defaultUom || "",
			_is_scale_barcode: isScaleBarcode,
			_scanned_barcode: scannedScaleBarcode,
			_scale_template_barcode:
				scannedScaleBarcode || scaleTemplateFromRows || String(barcode || "").trim(),
			scale_grams: initialScaleGrams,
		};

		const shouldAutoAddScannedScale = Boolean(scannedScaleBarcode && isScaleBarcode);
		if (shouldAutoAddScannedScale) {
			if (addItemDialog.value) {
				closeAddItemDialog();
			}
			addOrMergePrintableItem(preparedItem, initialLabelQty, "onAddItem:auto-scale");
			logDebug("onAddItem:done-auto-scale", {
				item_code: preparedItem?.item_code || "",
				uom: preparedItem?.uom || "",
				barcode: preparedItem?.barcode || "",
				label_qty: initialLabelQty,
			});
			return;
		}

		pendingAddItem.value = preparedItem;
		addItemQty.value = initialLabelQty;
		pendingScaleGrams.value =
			initialScaleGrams || (isScaleBarcode && isLikelyWeightUom(defaultUom) ? 1000 : null);
		addItemDialog.value = true;
		logDebug("onAddItem:pending-created", {
			item_code: pendingAddItem.value?.item_code || "",
			uom: pendingAddItem.value?.uom || "",
			is_scale: Boolean(pendingAddItem.value?._is_scale_barcode),
			barcode: pendingAddItem.value?.barcode || "",
			pending_scale_grams: pendingScaleGrams.value,
			label_qty: addItemQty.value,
		});

		if (
			pendingAddItem.value &&
			pendingScaleGrams.value &&
			showScaleGrams(pendingAddItem.value)
		) {
			await syncPendingScaleBarcode(true);
		}
		logDebug("onAddItem:done", {
			pending_barcode: pendingAddItem.value?.barcode || "",
			pending_scale_grams: pendingScaleGrams.value,
		});
	}

	async function confirmAddItem() {
		logDebug("confirmAddItem:start", {
			has_pending_item: Boolean(pendingAddItem.value),
			label_qty: addItemQty.value,
			pending_scale_grams: pendingScaleGrams.value,
		});
		if (!pendingAddItem.value) return;

		const item = pendingAddItem.value;
		if (showScaleGrams(item)) {
			const grams = normalizeScaleGrams(pendingScaleGrams.value);
			if (!grams) {
				toastStore.show({
					title: __("Enter valid grams for scale barcode"),
					color: "warning",
				});
				return;
			}
			const generated = await generateScaleBarcodeForItem(item, grams);
			if (!generated) {
				logDebug("confirmAddItem:abort-scale-generate-failed", {
					item_code: item?.item_code || "",
					uom: item?.uom || "",
					pending_scale_grams: pendingScaleGrams.value,
				});
				return;
			}
		}

		const qty = normalizeLabelQty(addItemQty.value);
		addOrMergePrintableItem(item, qty, "confirmAddItem");

		closeAddItemDialog();
	}

	async function onPendingUomChange() {
		logDebug("onPendingUomChange:start", {
			pending_item_code: pendingAddItem.value?.item_code || "",
			uom: pendingAddItem.value?.uom || "",
		});
		if (!pendingAddItem.value) return;
		await onItemUomChange(pendingAddItem.value);
		if (showScaleGrams(pendingAddItem.value)) {
			if (!pendingScaleGrams.value) {
				pendingScaleGrams.value =
					normalizeScaleGrams(pendingAddItem.value.scale_grams) || 1000;
			}
			await syncPendingScaleBarcode(true);
		}
		logDebug("onPendingUomChange:done", {
			pending_item_code: pendingAddItem.value?.item_code || "",
			uom: pendingAddItem.value?.uom || "",
			barcode: pendingAddItem.value?.barcode || "",
			pending_scale_grams: pendingScaleGrams.value,
		});
	}

	function removeItem(item: BarcodePrintItem) {
		logDebug("removeItem", {
			item_code: item?.item_code || "",
			uom: item?.uom || "",
			barcode: item?.barcode || "",
			row_id: item?._row_id,
		});
		if (item && item._row_id != null) {
			items.value = items.value.filter((i) => i._row_id !== item._row_id);
			return;
		}
		items.value = items.value.filter((i) => i.item_code !== item.item_code);
	}

	async function onItemUomChange(item: BarcodePrintItem) {
		logDebug("onItemUomChange:start", {
			item_code: item?.item_code || "",
			uom: item?.uom || "",
			barcode: item?.barcode || "",
			scale_grams: item?.scale_grams || null,
		});
		if (showScaleGrams(item)) {
			const grams = normalizeScaleGrams(item.scale_grams) || 1000;
			item.scale_grams = grams;
			await generateScaleBarcodeForItem(item, grams, { silent: true });
			logDebug("onItemUomChange:scale-uom-updated", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
				scale_grams: item?.scale_grams || null,
			});
			return;
		}

		if (item._is_scale_barcode && item._scanned_barcode) {
			item.barcode = String(item._scanned_barcode);
			return;
		}

		const nextBarcode = resolveBarcodeForUom(item, item.uom);
		if (nextBarcode) {
			item.barcode = nextBarcode;
			logDebug("onItemUomChange:barcode-updated", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
			});
			return;
		}

		const hasAnyBarcodes = Array.isArray(item.item_barcode) && item.item_barcode.length > 0;
		if (hasAnyBarcodes) {
			toastStore.show({
				title: __("No barcode found for UOM '{0}'", [item.uom]),
				color: "warning",
			});
		}
		logDebug("onItemUomChange:done", {
			item_code: item?.item_code || "",
			uom: item?.uom || "",
			barcode: item?.barcode || "",
		});
	}

	function clearAll() {
		logDebug("clearAll", { count_before: items.value.length });
		items.value = [];
	}

	function incrementQty(item: BarcodePrintItem) {
		item.qty++;
		logDebug("incrementQty", {
			item_code: item?.item_code || "",
			uom: item?.uom || "",
			barcode: item?.barcode || "",
			qty: item?.qty,
		});
	}

	function decrementQty(item: BarcodePrintItem) {
		if (item.qty > 1) {
			item.qty--;
		}
		logDebug("decrementQty", {
			item_code: item?.item_code || "",
			uom: item?.uom || "",
			barcode: item?.barcode || "",
			qty: item?.qty,
		});
	}

	function formatCurrency(value: number) {
		const profile = pos_profile.value as { currency?: string } | null;
		if (profile?.currency) {
			return value + " " + profile.currency;
		}
		return String(value);
	}

	function getPrintWindowContent() {
		const size = currentLabelSize.value;
		const style = getPrintStyles(size);
		const content = generatePrintContent(getPrintableItems({ notify: false }), size, {
			includePrice: includePrice.value,
			includeBatchSerial: includeBatchSerial.value,
			formatCurrency,
		});
		logDebug("getPrintWindowContent", {
			style_length: style?.length || 0,
			content_length: content?.length || 0,
			settings: settingsSnapshot(),
		});
		return { style, content };
	}

	function openPrintPopup(
		itemsToPrint: BarcodePrintItem[],
		mode: "print" | "pdf",
		jsPdfOptions?: Record<string, unknown>,
	) {
		const printWindow = window.open("", "_blank");
		if (!printWindow) {
			toastStore.show({
				title: __("Popup blocked. Please allow popups."),
				color: "error",
			});
			return;
		}

		const size = currentLabelSize.value;
		const style = getPrintStyles(size);
		const content = generatePrintContent(itemsToPrint, size, {
			includePrice: includePrice.value,
			includeBatchSerial: includeBatchSerial.value,
			formatCurrency,
		});

		printWindow.document.write(
			buildPrintWindowHtml(style, content, mode, mode === "pdf" ? jsPdfOptions : undefined),
		);
		printWindow.document.close();
	}

	function printLabels() {
		logDebug("printLabels:start", {
			items_count: items.value.length,
			settings: settingsSnapshot(),
		});
		if (!items.value.length) return;

		const itemsToPrint = getPrintableItems();
		if (!itemsToPrint.length) {
			logDebug("printLabels:abort-no-printable-items", {
				items_count: items.value.length,
			});
			return;
		}

		const size = currentLabelSize.value;
		const style = getPrintStyles(size);
		const content = generatePrintContent(itemsToPrint, size, {
			includePrice: includePrice.value,
			includeBatchSerial: includeBatchSerial.value,
			formatCurrency,
		});
		logDebug("printLabels:render", {
			items_to_print: itemsToPrint.length,
			style_length: style?.length || 0,
			content_length: content?.length || 0,
		});

		openPrintPopup(itemsToPrint, "print");
		logDebug("printLabels:window-ready", {
			items_to_print: itemsToPrint.length,
		});
	}

	function downloadPdf() {
		logDebug("downloadPdf:start", {
			items_count: items.value.length,
			settings: settingsSnapshot(),
		});
		if (!items.value.length) return;

		const itemsToPrint = getPrintableItems();
		if (!itemsToPrint.length) {
			logDebug("downloadPdf:abort-no-printable-items", {
				items_count: items.value.length,
			});
			return;
		}

		const size = currentLabelSize.value;
		const style = getPrintStyles(size);
		const content = generatePrintContent(itemsToPrint, size, {
			includePrice: includePrice.value,
			includeBatchSerial: includeBatchSerial.value,
			formatCurrency,
		});
		const isA4 = size.type === "A4";
		let jsPdfOptions: Record<string, unknown> = {
			unit: "mm",
			format: "a4",
			orientation: "portrait",
		};
		if (!isA4) {
			jsPdfOptions = {
				unit: "mm",
				format: [size.width, size.height],
				orientation: "portrait",
			};
		}
		logDebug("downloadPdf:render", {
			items_to_print: itemsToPrint.length,
			jsPdfOptions,
			style_length: style?.length || 0,
			content_length: content?.length || 0,
		});

		openPrintPopup(itemsToPrint, "pdf", jsPdfOptions);
		logDebug("downloadPdf:window-ready", {
			items_to_print: itemsToPrint.length,
		});
	}

	function openQtyEdit(item: BarcodePrintItem) {
		logDebug("openQtyEdit", {
			item_code: item?.item_code || "",
			row_id: item?._row_id,
			current_qty: item?.qty,
		});
		items.value.forEach((i) => (i._editingQty = false));

		item._editingQty = true;
		editingQtyValue.value = "";
		nextTick(() => {
			const input = document.getElementById("qty-input-" + item._row_id);
			if (input) input.focus();
		});
	}

	function closeQtyEdit(item: BarcodePrintItem) {
		logDebug("closeQtyEdit:start", {
			item_code: item?.item_code || "",
			row_id: item?._row_id,
			editing_value: editingQtyValue.value,
		});
		if (item._editingQty) {
			if (editingQtyValue.value !== "" && editingQtyValue.value != null) {
				item.qty = normalizeLabelQty(editingQtyValue.value);
			}
			item._editingQty = false;
			editingQtyValue.value = "";
		}
		logDebug("closeQtyEdit:done", {
			item_code: item?.item_code || "",
			row_id: item?._row_id,
			qty: item?.qty,
		});
	}

	watch(
		storePosProfile,
		(profile) => {
			if (profile) pos_profile.value = profile || {};
			logDebug("posProfile:watch", {
				profile_name: (profile as { name?: string })?.name || "",
				currency: (profile as { currency?: string })?.currency || "",
			});
		},
		{ deep: true, immediate: true },
	);

	onMounted(() => {
		logDebug("created", {
			settings_loaded: scaleBarcodeSettingsLoaded.value,
		});
		ensureScaleBarcodeSettings();
	});

	onBeforeUnmount(() => {
		logDebug("beforeUnmount", {
			pending_item_code: pendingAddItem.value?.item_code || "",
			items_count: items.value.length,
		});
		clearPendingScaleBarcodeTimer();
	});

	return {
		items,
		pageFormat,
		pageFormatOptions,
		gridCols,
		gridRows,
		includePrice,
		includeBatchSerial,
		editingQtyValue,
		addItemDialog,
		addItemQty,
		pendingAddItem,
		pendingScaleGrams,
		headers,
		getItemUomOptions,
		shouldShowScaleGramsInput: showScaleGrams,
		onAddItem,
		clearAll,
		downloadPdf,
		printLabels,
		removeItem,
		onItemUomChange,
		onItemScaleGramsChange,
		incrementQty,
		decrementQty,
		openQtyEdit,
		closeQtyEdit,
		closeAddItemDialog,
		confirmAddItem,
		onPendingUomChange,
		onPendingScaleGramsInput,
		syncPendingScaleBarcode,
		getPrintWindowContent,
	};
}
