import { ref, nextTick } from "vue";
import { useToastStore } from "../../../stores/toastStore";
import { useItemsStore } from "../../../stores/itemsStore";
import { useScaleBarcodeSettings } from "./useScaleBarcodeSettings";
import { useSerializationEngine } from "./useSerializationEngine";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface BatchData {
	batch_no: string;
	batch_qty?: number;
	expiry_date?: string;
	manufacturing_date?: string;
	batch_price?: number;
}

export interface SerialData {
	serial_no: string;
	batch_no?: string;
}

export interface BarcodePrintItem {
	_row_id: number;
	item_code: string;
	item_name: string;
	barcode: string;
	qty: number;
	price: number;
	item_barcode: any[];
	item_uoms: any[];
	uom: string;
	_is_scale_barcode: boolean;
	_scanned_barcode: string;
	_scale_template_barcode: string;
	scale_grams: number | null;
	_editingQty?: boolean;
	_selectedBarcodeIndex?: number;
	batch_no?: string;
	serial_no?: string;
	expiry_date?: string;
	warehouseLocation?: string;
	batch_no_data?: BatchData[];
	serial_no_data?: SerialData[];
	_epc_data?: string;
	[key: string]: any;
}

export function useBarcodePrintQueue() {
	const items = ref<BarcodePrintItem[]>([]);
	const nextRowId = ref(1);
	const editingQtyValue = ref("");
	const addItemDialog = ref(false);
	const addItemQty = ref(1);
	const pendingAddItem = ref<BarcodePrintItem | null>(null);
	const pendingScaleGrams = ref<number | null>(null);
	const pendingScaleBarcodeTimer = ref<any>(null);

	const toastStore = useToastStore();
	const itemsStore = useItemsStore();
	const scaleBarcode = useScaleBarcodeSettings();
	const variableDataDialog = ref(false);
	const variableDataItem = ref<BarcodePrintItem | null>(null);
	const warehouseOptions = ref<Array<{ name: string; warehouse_name: string }>>([]);
	const warehouseLoading = ref(false);

	const fetchWarehouseOptions = async () => {
		warehouseLoading.value = true;
		try {
			const company = itemsStore.posProfile?.company;
			const { message } = await frappe.call({
				method: "posawesome.posawesome.api.utils.get_warehouses",
				args: { company },
			});
			warehouseOptions.value = Array.isArray(message) ? message : [];
		} catch {
			warehouseOptions.value = [];
		} finally {
			warehouseLoading.value = false;
		}
	};
	fetchWarehouseOptions();

	const logDebug = (step: string, payload: any = {}) => {
		try {
			console.debug("[POS BarcodePrintQueue]", step, payload);
		} catch {
			console.log("[POS BarcodePrintQueue]", step);
		}
	};

	const normalizeLabelQty = (value: any): number => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed <= 0) return 1;
		return Math.max(1, Math.round(parsed));
	};

	const getItemUomOptions = (item: any): string[] => {
		const options: string[] = Array.isArray(item.item_uoms)
			? item.item_uoms.map((row: any) => row?.uom).filter(Boolean)
			: [];
		if (!options.length && Array.isArray(item.item_barcode)) {
			item.item_barcode.forEach((row: any) => {
				const uom = row?.uom;
				if (uom) options.push(uom);
			});
		}
		if (item.uom && !options.includes(item.uom)) {
			options.unshift(item.uom);
		}
		return Array.from(new Set(options));
	};

	const resolveBarcodeForUom = (item: any, uom: string): string => {
		const barcodeRows = Array.isArray(item.item_barcode) ? item.item_barcode : [];
		if (uom && barcodeRows.length > 0) {
			const matched = barcodeRows.find((row: any) => row?.barcode && row.uom === uom);
			if (matched?.barcode) return matched.barcode;
		}
		if (item.barcode) return item.barcode;
		if (barcodeRows.length > 0 && barcodeRows[0]?.barcode) return barcodeRows[0].barcode;
		if (Array.isArray(item.barcodes) && item.barcodes.length > 0) return item.barcodes[0];
		return "";
	};

	const addOrMergePrintableItem = (item: any, qty: number, logPrefix = "addOrMergePrintableItem") => {
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

		const itemToAdd = { ...item, qty: normalizedQty } as BarcodePrintItem;
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
	};

	const removeItem = (item: any) => {
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
	};

	const clearAll = () => {
		logDebug("clearAll", { count_before: items.value.length });
		items.value = [];
	};

	const serializationEngine = useSerializationEngine();
	const serializationEnabled = ref(false);

	const importItems = (importedItems: any[]) => {
		if (!Array.isArray(importedItems) || !importedItems.length) return;
		importedItems.forEach((item) => {
			addOrMergePrintableItem(item, Number(item.qty) || 1, "import");
		});
	};

	const incrementQty = (item: any) => {
		item.qty++;
	};

	const decrementQty = (item: any) => {
		if (item.qty > 1) item.qty--;
	};

	const openQtyEdit = (item: any) => {
		items.value.forEach((i) => (i._editingQty = false));
		item._editingQty = true;
		editingQtyValue.value = "";
		nextTick(() => {
			const input = document.getElementById("qty-input-" + item._row_id);
			if (input) input.focus();
		});
	};

	const closeQtyEdit = (item: any) => {
		if (item._editingQty) {
			if (editingQtyValue.value !== "" && editingQtyValue.value != null) {
				item.qty = normalizeLabelQty(editingQtyValue.value);
			}
			item._editingQty = false;
			editingQtyValue.value = "";
		}
	};

	const closeAddItemDialog = () => {
		if (pendingScaleBarcodeTimer.value) {
			clearTimeout(pendingScaleBarcodeTimer.value);
			pendingScaleBarcodeTimer.value = null;
		}
		addItemDialog.value = false;
		pendingAddItem.value = null;
		pendingScaleGrams.value = null;
		addItemQty.value = 1;
	};

	const onPendingScaleGramsInput = () => {
		if (pendingScaleBarcodeTimer.value) {
			clearTimeout(pendingScaleBarcodeTimer.value);
		}
		pendingScaleBarcodeTimer.value = setTimeout(() => {
			syncPendingScaleBarcode(true);
		}, 250);
	};

	const syncPendingScaleBarcode = async (silent = false) => {
		if (!pendingAddItem.value || !scaleBarcode.shouldShowScaleGramsInput(pendingAddItem.value)) {
			return false;
		}
		const grams = scaleBarcode.normalizeScaleGrams(pendingScaleGrams.value);
		if (!grams) return false;
		pendingScaleGrams.value = grams;
		return await scaleBarcode.generateScaleBarcodeForItem(pendingAddItem.value, grams, { silent });
	};

	const onItemScaleGramsChange = async (item: any) => {
		if (!scaleBarcode.shouldShowScaleGramsInput(item)) return;
		const grams = scaleBarcode.normalizeScaleGrams(item.scale_grams);
		if (!grams) {
			toastStore.show({ title: __("Enter a valid grams value"), color: "warning" });
			return;
		}
		await scaleBarcode.generateScaleBarcodeForItem(item, grams);
	};

	const onItemUomChange = async (item: any) => {
		if (scaleBarcode.shouldShowScaleGramsInput(item)) {
			const grams = scaleBarcode.normalizeScaleGrams(item.scale_grams) || 1000;
			item.scale_grams = grams;
			await scaleBarcode.generateScaleBarcodeForItem(item, grams, { silent: true });
		}

		if (item._is_scale_barcode && item._scanned_barcode) {
			item.barcode = String(item._scanned_barcode);
		}

		const nextBarcode = resolveBarcodeForUom(item, item.uom);
		if (nextBarcode) {
			item.barcode = nextBarcode;
		}

		const hasAnyBarcodes = Array.isArray(item.item_barcode) && item.item_barcode.length > 0;
		if (!nextBarcode && hasAnyBarcodes) {
			toastStore.show({
				title: __("No barcode found for UOM '{0}'", [item.uom]),
				color: "warning",
			});
		}

		// Recalculate price for new UOM
		const newUom = item.uom;
		const uomPrices = item._prices_by_uom || {};
		const hadExactUomPrice = Boolean(uomPrices[newUom]);
		let matchedPrice = uomPrices[newUom] || uomPrices[""] || null;
		if (matchedPrice) {
			item.price = matchedPrice.price_list_rate ?? item.price;
			item.currency = matchedPrice.currency ?? item.currency;
		} else {
			const priceList = itemsStore.posProfile?.selling_price_list;
			if (priceList && typeof frappe !== 'undefined') {
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.item_processing.price.get_price_for_uom",
						args: { item_code: item.item_code, price_list: priceList, uom: newUom },
						silent: true,
					});
					if (res.message != null) {
						item.price = Number(res.message);
						if (!item._prices_by_uom) item._prices_by_uom = {};
						item._prices_by_uom[""] = { price_list_rate: Number(res.message) };
					}
				} catch { /* keep existing price */ }
			}
		}
		if (!hadExactUomPrice && newUom && item.price != null) {
			const uomEntry = (item.item_uoms || []).find((u: any) => u.uom === newUom);
			if (uomEntry?.conversion_factor && uomEntry.conversion_factor !== 1) {
				item.price = (item.price || 0) * uomEntry.conversion_factor;
			}
		}
	};

	const onPendingUomChange = async () => {
		if (!pendingAddItem.value) return;
		await onItemUomChange(pendingAddItem.value);
		if (scaleBarcode.shouldShowScaleGramsInput(pendingAddItem.value)) {
			if (!pendingScaleGrams.value) {
				pendingScaleGrams.value = scaleBarcode.normalizeScaleGrams(pendingAddItem.value.scale_grams) || 1000;
			}
			await syncPendingScaleBarcode(true);
		}
	};

	const onAddItem = async (item: any) => {
		if (!item) return;

		const profile: any =
			itemsStore.posProfile && itemsStore.posProfile.name
				? itemsStore.posProfile
				: {};

		await scaleBarcode.ensureScaleBarcodeSettings();

		const scannedScaleBarcode = scaleBarcode.extractScaleScannedBarcode(item);
		let barcode = scannedScaleBarcode || item.barcode;
		let itemBarcodes = Array.isArray(item.item_barcode) ? item.item_barcode : [];
		let itemUoms = Array.isArray(item.item_uoms) ? item.item_uoms : [];
		if (!itemUoms.length && itemBarcodes.length > 0) {
			itemUoms = itemBarcodes
				.map((row: any) => row?.uom)
				.filter(Boolean)
				.map((uom: string) => ({ uom }));
		}
		let defaultUom = item.uom || item.stock_uom || itemUoms?.[0]?.uom || "";

		if (!scannedScaleBarcode && itemBarcodes.length > 0) {
			const resolved = resolveBarcodeForUom(
				{ item_barcode: itemBarcodes, barcode },
				defaultUom,
			);
			if (resolved) barcode = resolved;
		}

		if (!barcode && Array.isArray(item.barcodes) && item.barcodes.length > 0) {
			barcode = item.barcodes[0];
		}

		if (!barcode) {
			try {
				if (profile.name) {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_items_details",
						args: {
							items_data: JSON.stringify([{ item_code: item.item_code }]),
							pos_profile: JSON.stringify(profile),
							price_list: profile.selling_price_list || "",
						},
						silent: true,
					});
					const details = res.message && res.message[0];
					if (details) {
						itemBarcodes = Array.isArray(details.item_barcode) ? details.item_barcode : itemBarcodes;
						itemUoms = Array.isArray(details.item_uoms) ? details.item_uoms : itemUoms;
						if (!itemUoms.length && itemBarcodes.length > 0) {
							itemUoms = itemBarcodes
								.map((row: any) => row?.uom)
								.filter(Boolean)
								.map((uom: string) => ({ uom }));
						}
						defaultUom = details.uom || item.uom || item.stock_uom || itemUoms?.[0]?.uom || defaultUom;
						if (!scannedScaleBarcode && itemBarcodes.length > 0) {
							const resolved = resolveBarcodeForUom(
								{ item_barcode: itemBarcodes, barcode: details.barcode || barcode },
								defaultUom,
							);
							if (resolved) barcode = resolved;
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
			return;
		}

		if (!defaultUom && itemUoms.length > 0) {
			defaultUom = itemUoms[0].uom;
		}

		const scaleTemplateFromRows = Array.isArray(itemBarcodes)
			? (() => {
					const currentUom = String(defaultUom || "").trim();
					const scopedRows = currentUom
						? itemBarcodes.filter((row: any) => String(row?.uom || "").trim() === currentUom)
						: itemBarcodes;
					const matched =
						scopedRows.find((row: any) => scaleBarcode.isPotentialScaleTemplate(row?.barcode)) ||
						itemBarcodes.find((row: any) => scaleBarcode.isPotentialScaleTemplate(row?.barcode));
					return String((matched && matched.barcode) || "").trim();
				})()
			: "";

		const isScaleBarcode =
			scaleBarcode.isScaleBarcodePayload(item) ||
			scaleBarcode.isLikelyWeightUom(defaultUom) ||
			scaleBarcode.isPotentialScaleTemplate(scannedScaleBarcode || scaleTemplateFromRows || barcode);
		const initialLabelQty = isScaleBarcode ? 1 : normalizeLabelQty(item.qty);
		const initialScaleGrams = scaleBarcode.normalizeScaleGrams(
			item.scale_grams ||
				(item._scale_qty !== undefined && item._scale_qty !== null
					? Number(item._scale_qty) * 1000
					: null),
		);

		let initialPrice = item.rate || item.standard_rate || 0;
		const uomPrices = item._prices_by_uom || {};
		if (!uomPrices[defaultUom] && defaultUom) {
			const uomEntry = (itemUoms || []).find((u: any) => u.uom === defaultUom);
			if (uomEntry?.conversion_factor && uomEntry.conversion_factor !== 1) {
				initialPrice = (initialPrice || 0) * uomEntry.conversion_factor;
			}
		}

		const preparedItem: BarcodePrintItem = {
			_row_id: nextRowId.value++,
			item_code: item.item_code,
			item_name: item.item_name,
			barcode: String(barcode || "").trim(),
			qty: initialLabelQty,
			price: initialPrice,
			item_barcode: itemBarcodes,
			item_uoms: itemUoms,
			uom: defaultUom || "",
			_is_scale_barcode: isScaleBarcode,
			_scanned_barcode: scannedScaleBarcode,
			_scale_template_barcode: scannedScaleBarcode || scaleTemplateFromRows || String(barcode || "").trim(),
			scale_grams: initialScaleGrams,
			batch_no_data: Array.isArray(item.batch_no_data) ? item.batch_no_data : [],
			serial_no_data: Array.isArray(item.serial_no_data) ? item.serial_no_data : [],
		};

		if (item._prices_by_uom) {
			preparedItem._prices_by_uom = item._prices_by_uom;
		}

		const batchData = preparedItem.batch_no_data || [];
		const firstBatch = batchData.length > 0 ? batchData[0] : null;
		if (firstBatch && firstBatch.expiry_date && !preparedItem.expiry_date) {
			preparedItem.expiry_date = firstBatch.expiry_date;
		}
		preparedItem.warehouseLocation = itemsStore.posProfile?.warehouse || "";

		const shouldAutoAddScannedScale = Boolean(scannedScaleBarcode && isScaleBarcode);
		if (shouldAutoAddScannedScale) {
			if (addItemDialog.value) closeAddItemDialog();
			addOrMergePrintableItem(preparedItem, initialLabelQty, "onAddItem:auto-scale");
			return;
		}

		pendingAddItem.value = preparedItem;
		addItemQty.value = initialLabelQty;
		pendingScaleGrams.value =
			initialScaleGrams || (isScaleBarcode && scaleBarcode.isLikelyWeightUom(defaultUom) ? 1000 : null);
		addItemDialog.value = true;

		if (
			pendingAddItem.value &&
			pendingScaleGrams.value &&
			scaleBarcode.shouldShowScaleGramsInput(pendingAddItem.value)
		) {
			await syncPendingScaleBarcode(true);
		}
	};

	const confirmAddItem = async () => {
		if (!pendingAddItem.value) return;

		const item = pendingAddItem.value;
		if (scaleBarcode.shouldShowScaleGramsInput(item)) {
			const grams = scaleBarcode.normalizeScaleGrams(pendingScaleGrams.value);
			if (!grams) {
				toastStore.show({ title: __("Enter valid grams for scale barcode"), color: "warning" });
				return;
			}
			const generated = await scaleBarcode.generateScaleBarcodeForItem(item, grams);
			if (!generated) return;
		}

		const qty = normalizeLabelQty(addItemQty.value);
		addOrMergePrintableItem(item, qty, "confirmAddItem");
		closeAddItemDialog();
	};

	const mapBarcodeType = (type: string): string => {
		if (!type) return "";
		if (type === "EAN" || type === "EAN-13" || type === "ISBN-13" || type === "JAN") return "EAN13";
		if (type === "EAN-8" || type === "ISSN") return "EAN8";
		if (type === "UPC" || type === "UPC-A") return "UPC";
		if (type === "ITF-14" || type === "GTIN-14") return "ITF14";
		if (type === "ITF") return "ITF";
		if (type === "GS1-128" || type === "GS1") return "GS1_128";
		if (type === "CODABAR") return "CODABAR";
		if (type === "Code 39" || type === "CODE-39") return "CODE39";
		if (type === "Code 128") return "CODE128";
		if (type === "ISBN-10") return "CODE128";
		if (type === "PZN") return "CODE128";
		if (type === "GTIN") return "";
		if (type === "ISBN") return "";
		if (type === "QR Code") return "";
		return "";
	};

	const getAvailableBarcodes = (item: BarcodePrintItem): { barcode: string; uom: string; barcode_type?: string }[] => {
		const result: { barcode: string; uom: string; barcode_type?: string }[] = [];
		const seen = new Set<string>();
		const barcodeRows = Array.isArray(item.item_barcode) ? item.item_barcode : [];
		barcodeRows.forEach((row: any) => {
			const b = String(row?.barcode || "").trim();
			if (b && !seen.has(b)) {
				seen.add(b);
				result.push({
					barcode: b,
					uom: String(row?.uom || "").trim(),
					barcode_type: String(row?.barcode_type || "").trim(),
				});
			}
		});
		if (item.barcode && !seen.has(item.barcode)) {
			result.unshift({ barcode: item.barcode, uom: item.uom || "" });
		}
		return result;
	};

	const selectBarcode = (item: BarcodePrintItem, barcode: string) => {
		const available = getAvailableBarcodes(item);
		const idx = available.findIndex((b) => b.barcode === barcode);
		item._selectedBarcodeIndex = idx >= 0 ? idx : 0;
		item.barcode = barcode;
		if (idx >= 0) {
			const matched = available[idx];
			if (matched && matched.barcode_type) {
				const mapped = mapBarcodeType(matched.barcode_type);
				if (mapped) {
					item._symbology = mapped;
				}
			}
		}
	};

	const openVariableDataDialog = (item: BarcodePrintItem) => {
		variableDataItem.value = item;
		variableDataDialog.value = true;
	};

	const closeVariableDataDialog = () => {
		variableDataItem.value = null;
		variableDataDialog.value = false;
	};

	const expandVariableData = (items: BarcodePrintItem[]): BarcodePrintItem[] => {
		const expanded: BarcodePrintItem[] = [];
		items.forEach((item) => {
			const sn = (item.serial_no || "").trim();
			if (sn && /^\d+-\d+$/.test(sn)) {
				const [startStr, endStr] = sn.split("-");
				const start = startStr ? parseInt(startStr, 10) : 0;
				const end = endStr ? parseInt(endStr, 10) : 0;
				if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
					for (let n = start; n <= end; n++) {
						expanded.push({ ...item, serial_no: String(n) });
					}
					return;
				}
			}
			expanded.push({ ...item });
		});
		return expanded;
	};

	const getAvailableBatches = (item: BarcodePrintItem): BatchData[] => {
		return Array.isArray(item.batch_no_data) ? item.batch_no_data : [];
	};

	const getAvailableSerials = (item: BarcodePrintItem): SerialData[] => {
		return Array.isArray(item.serial_no_data) ? item.serial_no_data : [];
	};

	const onSelectBatch = (item: BarcodePrintItem, batchNo: string) => {
		const batches = getAvailableBatches(item);
		const match = batches.find((b) => b.batch_no === batchNo);
		if (match && match.expiry_date) {
			item.expiry_date = match.expiry_date;
		}
	};

	const onSelectSerial = (item: BarcodePrintItem, serialNo: string) => {
		const serials = getAvailableSerials(item);
		const match = serials.find((s) => s.serial_no === serialNo);
		if (match && match.batch_no && !item.batch_no) {
			item.batch_no = match.batch_no;
			onSelectBatch(item, match.batch_no);
		}
	};

	const cleanup = () => {
		if (pendingScaleBarcodeTimer.value) {
			clearTimeout(pendingScaleBarcodeTimer.value);
			pendingScaleBarcodeTimer.value = null;
		}
	};

	return {
		items,
		nextRowId,
		editingQtyValue,
		addItemDialog,
		addItemQty,
		pendingAddItem,
		pendingScaleGrams,
		pendingScaleBarcodeTimer,
		addOrMergePrintableItem,
		removeItem,
		clearAll,
		importItems,
		serializationEngine,
		serializationEnabled,
		incrementQty,
		decrementQty,
		normalizeLabelQty,
		openQtyEdit,
		closeQtyEdit,
		onAddItem,
		confirmAddItem,
		closeAddItemDialog,
		onPendingUomChange,
		onPendingScaleGramsInput,
		syncPendingScaleBarcode,
		onItemScaleGramsChange,
		onItemUomChange,
		getItemUomOptions,
		resolveBarcodeForUom,
		getAvailableBarcodes,
		selectBarcode,
		variableDataDialog,
		variableDataItem,
		openVariableDataDialog,
		closeVariableDataDialog,
		expandVariableData,
		warehouseOptions,
		warehouseLoading,
		getAvailableBatches,
		getAvailableSerials,
		onSelectBatch,
		onSelectSerial,
		cleanup,
	};
}
