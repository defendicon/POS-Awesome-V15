import { ref, type Ref, type ComputedRef } from "vue";
import { useToastStore } from "../../../stores/toastStore";
import { perfMarkStart, perfMarkEnd } from "../../../utils/perf";
import {
	formatStockShortageError,
	parseBooleanSetting,
} from "../../../utils/stock";
import { saveItems, savePriceListItems } from "../../../../offline/index";
import { openItemSelectionDialog } from "../../../utils/itemSelectionDialog";
// @ts-ignore
import placeholderImage from "../../../components/pos/placeholder-image.png";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface ScanProcessorContext {
	items: Ref<any[]>;
	pos_profile: Ref<any>;
	isReturnInvoice?: Ref<boolean> | ComputedRef<boolean> | boolean;
	active_price_list: Ref<string>;
	customer_price_list: Ref<string | null>;
	itemDetailFetcher: {
		update_items_details: (_items: any[]) => Promise<void>;
	};
	itemAddition: {
		addItem: (_item: any, _options?: any) => Promise<void>;
	};
	barcodeIndex: {
		ensureBarcodeIndex: () => any;
		lookupItemByBarcode: (_barcode: string) => any;
		replaceBarcodeIndex: (_items: any[]) => void;
		indexItem: (_item: any) => void;
		searchItemsByCode: (_items: any, _code: string) => any[];
		resetBarcodeIndex: () => void;
	};
	scannerInput: any;
	searchCache?: Ref<Map<any, any>>;
	eventBus?: any;
	format_number: (_val: any, _precision?: number) => string;
	float_precision: ComputedRef<number>;
	hide_qty_decimals: ComputedRef<boolean>;
	blockSaleBeyondAvailableQty: ComputedRef<boolean>;
	deferStockValidationToPayment?: ComputedRef<boolean> | Ref<boolean> | boolean;
	currency_precision: ComputedRef<number>;
	exchange_rate: ComputedRef<number>;
	format_currency: (
		_value: number,
		_currency: string,
		_precision: number,
	) => string;
	ratePrecision: (_val: any) => number;
	customer: Ref<any>;
	onItemAdded?: () => void;
	onItemNotFound?: (_code: string) => void;
	stock_settings: Ref<any>;
	selected_currency?: Ref<string>;
	conversion_rate?: Ref<number> | ComputedRef<number>;
	// Callback for search focus or clear
	get_search?: (_code: string) => string;
	get_item_qty?: (_code: string) => string;
	search_from_scanner_ref?: Ref<boolean>;
}

/**
 * Manages the logic for processing scanned barcodes, including:
 * - Scale barcode parsing
 * - Server fetch for missing items
 * - Stock availability validation
 * - UOM price conversion
 * - Adding to invoice via useItemAddition
 */
export function useScanProcessor(context: ScanProcessorContext) {
	// Deconstruct required context
	const {
		items,
		pos_profile,
		active_price_list,
		customer_price_list,
		itemDetailFetcher,
		itemAddition,
		barcodeIndex,
		scannerInput,
		searchCache,
		eventBus,
		float_precision,
		blockSaleBeyondAvailableQty,
		// exchange_rate,
		format_currency,
		ratePrecision,
		// customer,
	} = context;

	const toastStore = useToastStore();
	// const uiStore = useUIStore();

	const awaitingScanResult = ref(false);
	const pendingScanCode = ref("");
	const logScanFlow = (step: string, payload?: any) => {
		console.debug(`[POS ScanFlow] ${step}`, payload || {});
	};

	const isNegativeStockEnabled = (item: any = null) => {
		const allowNegativeSetting = parseBooleanSetting(
			context.stock_settings.value?.allow_negative_stock,
		);
		const allowNegativeItem = item
			? parseBooleanSetting(item.allow_negative_stock)
			: false;
		return allowNegativeSetting || allowNegativeItem;
	};

	const isReturnMode = () => {
		const value = context.isReturnInvoice;
		if (typeof value === "boolean") return value;
		return Boolean(value?.value);
	};

	const shouldDeferStockValidation = () => {
		const value = context.deferStockValidationToPayment;
		if (typeof value === "boolean") return value;
		return Boolean(value?.value);
	};

	const showScanError = (error: {
		message: string;
		code: string;
		details: string;
	}) => {
		if (scannerInput.scanErrorDialog) {
			scannerInput.scanErrorDialog.value = true;
			scannerInput.scanErrorMessage.value = error.message;
			scannerInput.scanErrorCode.value = error.code;
			scannerInput.scanErrorDetails.value = error.details;
			if (typeof scannerInput.playScanTone === "function") {
				scannerInput.playScanTone("error");
			}
		}
	};

	const showMultipleItemsDialog = (itemsList: any[], scannedCode: string) => {
		openItemSelectionDialog({
			items: itemsList,
			scannedCode,
			currency: pos_profile.value.currency,
			formatCurrency: format_currency,
			ratePrecision: ratePrecision,
			placeholderImage,
			translate: __,
			onSelect: (item: any) =>
				addScannedItemToInvoice(item, scannedCode, null, null),
		});
	};

	type ScanAssignment = {
		serialNo: string | null;
		batchNo: string | null;
	};

	type ScanMeta = {
		isScaleBarcode?: boolean;
	};

	const extractScanAssignmentFromItem = (
		item: any,
		rawCode: string,
	): ScanAssignment => {
		const code = String(rawCode || "").trim();
		if (!item || !code) {
			return { serialNo: null, batchNo: null };
		}

		let serialNo: string | null = null;
		let batchNo: string | null = null;

		if (item.has_serial_no && Array.isArray(item.serial_no_data)) {
			const serialMatch = item.serial_no_data.find(
				(row: any) => String(row?.serial_no || "").trim() === code,
			);
			if (serialMatch?.serial_no) {
				serialNo = String(serialMatch.serial_no);
				if (!batchNo && serialMatch?.batch_no) {
					batchNo = String(serialMatch.batch_no);
				}
			}
		}

		if (item.has_batch_no && Array.isArray(item.batch_no_data)) {
			const batchMatch = item.batch_no_data.find(
				(row: any) => String(row?.batch_no || "").trim() === code,
			);
			if (batchMatch?.batch_no) {
				batchNo = String(batchMatch.batch_no);
			}
		}

		return { serialNo, batchNo };
	};

	const addScannedItemToInvoice = async (
		item: any,
		scannedCode: string,
		qtyFromBarcode: number | null = null,
		priceFromBarcode: number | null = null,
		scanAssignment: ScanAssignment = { serialNo: null, batchNo: null },
		scanMeta: ScanMeta = {},
	) => {
		logScanFlow("Preparing scanned item add", {
			scannedCode,
			item_code: item?.item_code,
			scanAssignment,
			qtyFromBarcode,
			priceFromBarcode,
			isScaleBarcode: Boolean(scanMeta?.isScaleBarcode),
		});

		// Clone the item to avoid mutating list data
		const newItem = { ...item };
		newItem._scanned_barcode = scannedCode;
		if (scanMeta?.isScaleBarcode) {
			newItem._is_scale_barcode = true;
			newItem._scanned_scale_barcode = scannedCode;
			if (!String(newItem.barcode || "").trim()) {
				newItem.barcode = scannedCode;
			}
		}

		// If the scanned barcode has a specific UOM, apply it
		if (Array.isArray(newItem.item_barcode)) {
			const barcodeMatch = newItem.item_barcode.find(
				(b: any) => b.barcode === scannedCode,
			);
			if (barcodeMatch && barcodeMatch.posa_uom) {
				newItem.uom = barcodeMatch.posa_uom;

				// Try fetching the rate for this UOM from the active price list
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_price_for_uom",
						args: {
							item_code: newItem.item_code,
							price_list: active_price_list.value,
							uom: barcodeMatch.posa_uom,
						},
					});

					const uomInfo =
						newItem.item_uoms &&
						newItem.item_uoms.find(
							(u: any) => u.uom === barcodeMatch.posa_uom,
						);
					const conversionFactor =
						uomInfo && uomInfo.conversion_factor
							? parseFloat(uomInfo.conversion_factor)
							: null;
					const currentConversion = newItem.conversion_factor || 1;
					const baseUnitRate =
						parseFloat(
							String(
								(newItem.base_price_list_rate ||
									newItem.base_rate ||
									newItem.price_list_rate ||
									newItem.rate ||
									0) / (currentConversion || 1),
							),
						) || 0;

					if (res.message) {
						const price = parseFloat(res.message);
						newItem.rate = price;
						newItem.price_list_rate = price;
						const basePrice = conversionFactor
							? price / conversionFactor
							: price;
						newItem.base_rate = basePrice;
						newItem.base_price_list_rate = basePrice;
						if (conversionFactor) {
							newItem.conversion_factor = conversionFactor;
						}
						newItem._manual_rate_set = true;
						newItem.skip_force_update = true;
					} else if (conversionFactor) {
						const newPrice = baseUnitRate * conversionFactor;

						newItem.rate = newPrice;
						newItem.price_list_rate = newPrice;
						newItem.base_rate = baseUnitRate;
						newItem.base_price_list_rate = baseUnitRate;
						newItem.conversion_factor = conversionFactor;
						newItem._manual_rate_set = true;
						newItem.skip_force_update = true;
					}
				} catch (e) {
					console.error("Failed to fetch UOM price", e);
				}
			}
		}

		let effectiveQty: number | null = qtyFromBarcode;
		if (
			(effectiveQty === null || Number.isNaN(effectiveQty)) &&
			newItem._scale_qty !== undefined &&
			newItem._scale_qty !== null
		) {
			const parsedScaleQty = parseFloat(newItem._scale_qty);
			if (!Number.isNaN(parsedScaleQty)) {
				effectiveQty = parsedScaleQty;
			}
		}

		// Apply quantity from scale barcode if available
		if (effectiveQty !== null && !Number.isNaN(effectiveQty)) {
			newItem.qty = effectiveQty;
			newItem._barcode_qty = true;
		}

		let effectivePrice: number | null = priceFromBarcode;
		if (
			(effectivePrice === null || Number.isNaN(effectivePrice)) &&
			newItem._scale_price !== undefined &&
			newItem._scale_price !== null
		) {
			const parsedScalePrice = parseFloat(newItem._scale_price);
			if (!Number.isNaN(parsedScalePrice)) {
				effectivePrice = parsedScalePrice;
			}
		}

		if (effectivePrice !== null && !Number.isNaN(effectivePrice)) {
			const parsedPrice = parseFloat(String(effectivePrice));
			if (!Number.isNaN(parsedPrice)) {
				const selectedCurrency = context.selected_currency?.value;
				const companyCurrency = pos_profile.value?.currency;
				const conversionRate =
					Number(context.conversion_rate?.value || 1) || 1;
				const basePrice =
					selectedCurrency &&
					companyCurrency &&
					selectedCurrency !== companyCurrency
						? parsedPrice * conversionRate
						: parsedPrice;

				newItem.rate = parsedPrice;
				newItem.price_list_rate = parsedPrice;
				newItem.base_rate = basePrice;
				newItem.base_price_list_rate = basePrice;
				newItem._manual_rate_set = true;
				newItem.skip_force_update = true;
			}
		}

		if (scanAssignment.serialNo && newItem.has_serial_no) {
			newItem.to_set_serial_no = scanAssignment.serialNo;
		}
		if (scanAssignment.batchNo && newItem.has_batch_no) {
			newItem.to_set_batch_no = scanAssignment.batchNo;
		}
		logScanFlow("Applied scan assignment", {
			item_code: newItem.item_code,
			to_set_serial_no: newItem.to_set_serial_no || null,
			to_set_batch_no: newItem.to_set_batch_no || null,
			qty: newItem.qty,
		});

		const requestedQtyRaw =
			qtyFromBarcode !== null && !isNaN(qtyFromBarcode)
				? qtyFromBarcode
				: (newItem.qty ?? 1);
		const requestedQty = Math.abs(requestedQtyRaw || 1);
		const availableQty =
			typeof newItem.available_qty === "number"
				? newItem.available_qty
				: typeof newItem.actual_qty === "number"
					? newItem.actual_qty
					: null;

		if (
			!isReturnMode() &&
			!shouldDeferStockValidation() &&
			availableQty !== null &&
			availableQty < requestedQty
		) {
			const negativeStockEnabled = isNegativeStockEnabled(newItem);
			const exceedsAvailable = availableQty < requestedQty;
			const shouldBlock =
				(blockSaleBeyondAvailableQty.value && exceedsAvailable) ||
				(!negativeStockEnabled && exceedsAvailable);

			if (shouldBlock) {
				showScanError({
					message: formatStockShortageError(
						newItem.item_name || newItem.item_code || scannedCode,
						availableQty,
						requestedQty,
					),
					code: scannedCode,
					details: __(
						"Adjust the quantity or enable negative stock to continue.",
					),
				});
				return;
			}

			// Suppress low stock notifications when negative stock is allowed
		}

		awaitingScanResult.value = true;

		try {
			// FIXED: Use itemAddition.addItem instead of context.add_item_wrapper
			await itemAddition.addItem(newItem, {
				suppressNegativeWarning: true,
				skipNotification: true,
			});
			logScanFlow("Item added from scanner", {
				item_code: newItem.item_code,
				qty: requestedQty,
				batch: newItem.to_set_batch_no || null,
				serial: newItem.to_set_serial_no || null,
			});
			if (typeof scannerInput.playScanTone === "function") {
				scannerInput.playScanTone("success");
			}
			if (scannerInput.scannerLocked)
				scannerInput.scannerLocked.value = false;

			if (context.search_from_scanner_ref) {
				context.search_from_scanner_ref.value = false;
			}
			pendingScanCode.value = "";

			// Show success message
			const itemName =
				newItem.item_name ||
				newItem.item_code ||
				scannedCode ||
				__("Item");
			const rawPrecision = Number(float_precision.value);
			const precision = Number.isInteger(rawPrecision)
				? Math.min(Math.max(rawPrecision, 0), 6)
				: 2;
			const displayQty = Number.isInteger(requestedQty)
				? requestedQty
				: Number(requestedQty.toFixed(precision));

			if (eventBus && eventBus.emit) {
				toastStore.show({
					title: __("Item {0} added to invoice", [itemName]),
					summary: __("Items added to invoice"),
					detail: __("{0} (Qty: {1})", [itemName, displayQty]),
					color: "success",
					key: "invoice-item-added",
				});
			} else if (typeof frappe !== "undefined" && frappe.show_alert) {
				frappe.show_alert(
					{
						message: `Added: ${itemName}`,
						indicator: "green",
					},
					3,
				);
			}

			// Clear search after successful addition and refocus input via context callback
			if (context.onItemAdded) context.onItemAdded();
		} finally {
			awaitingScanResult.value = false;
		}
	};

	const processScannedItem = async (scannedCode: string) => {
		const mark = perfMarkStart("pos:scan-process");
		logScanFlow("Start processing scan", { scannedCode });
		pendingScanCode.value = scannedCode;
		if (typeof scannerInput.ensureScaleBarcodeSettings === "function") {
			await scannerInput.ensureScaleBarcodeSettings();
		}

		// Handle scale barcodes by extracting the item code and quantity
		let searchCode = scannedCode;
		let qtyFromBarcode: number | null = null;
		let priceFromBarcode: number | null = null;
		let scaleResponse: any = null;
		let scanAssignment: ScanAssignment = { serialNo: null, batchNo: null };

		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.items.parse_scale_barcode",
				args: { barcode: scannedCode },
			});
			if (res && res.message) {
				scaleResponse = res.message;
			}
		} catch (error) {
			console.error("Failed to parse scale barcode via API:", error);
		}

		if (
			scaleResponse &&
			scaleResponse.settings &&
			typeof scannerInput.updateScaleBarcodeSettings === "function"
		) {
			scannerInput.updateScaleBarcodeSettings(scaleResponse.settings);
		}

		const configuredPrefix =
			typeof scannerInput.getScaleBarcodePrefix === "function"
				? scannerInput.getScaleBarcodePrefix()
				: null;

		if (
			scaleResponse &&
			configuredPrefix &&
			!String(scannedCode || "").startsWith(configuredPrefix)
		) {
			scaleResponse = null;
			searchCode = scannedCode;
			qtyFromBarcode = null;
			priceFromBarcode = null;
		}

		if (scaleResponse && scaleResponse.item_code) {
			searchCode = scaleResponse.item_code;
			const parsedQty = parseFloat(scaleResponse.qty);
			if (!Number.isNaN(parsedQty)) {
				qtyFromBarcode = parsedQty;
			}
			const parsedPrice = parseFloat(scaleResponse.price);
			if (!Number.isNaN(parsedPrice)) {
				priceFromBarcode = parsedPrice;
			}
		} else if (
			typeof scannerInput.scaleBarcodeMatches === "function" &&
			scannerInput.scaleBarcodeMatches(scannedCode)
		) {
			if (context.get_search && context.get_item_qty) {
				searchCode = context.get_search(scannedCode);
				qtyFromBarcode = parseFloat(context.get_item_qty(scannedCode));
			}
		}

		// First try to find exact match by processed code using the pre-built index
		const index = barcodeIndex.ensureBarcodeIndex();
		// Use barcodeIndex composable methods if available, else local logic
		let foundItem = barcodeIndex.lookupItemByBarcode(searchCode);

		if (!foundItem && (!index || index.size === 0)) {
			// Index not populated yet, build it and fall back to a direct scan once
			barcodeIndex.replaceBarcodeIndex(items.value);
			foundItem = items.value.find((item) => {
				const barcodeMatch =
					item.barcode === searchCode ||
					(Array.isArray(item.item_barcode) &&
						item.item_barcode.some(
							(b: any) => b.barcode === searchCode,
						)) ||
					(Array.isArray(item.barcodes) &&
						item.barcodes.some(
							(bc: any) => String(bc) === searchCode,
						)) ||
					(Array.isArray(item.serial_no_data) &&
						item.serial_no_data.some(
							(sn: any) =>
								String(sn?.serial_no || "") === searchCode,
						)) ||
					(Array.isArray(item.batch_no_data) &&
						item.batch_no_data.some(
							(bn: any) =>
								String(bn?.batch_no || "") === searchCode,
						));
				return barcodeMatch || item.item_code === searchCode;
			});
		}
		logScanFlow("Parsed scan code", {
			scannedCode,
			searchCode,
			qtyFromBarcode,
			priceFromBarcode,
			scaleParsed: Boolean(scaleResponse && scaleResponse.item_code),
		});
		const isScaleBarcodeScan = Boolean(
			(scaleResponse && scaleResponse.item_code) ||
				qtyFromBarcode !== null ||
				priceFromBarcode !== null,
		);

		if (!foundItem && qtyFromBarcode === null) {
			const searchSerialNo = parseBooleanSetting(
				pos_profile.value?.posa_search_serial_no,
			);
			const searchBatchNo = parseBooleanSetting(
				pos_profile.value?.posa_search_batch_no,
			);

			if (searchSerialNo || searchBatchNo) {
				try {
					const resolveRes = await frappe.call({
						method: "posawesome.posawesome.api.items.search_serial_or_batch_or_barcode_number",
						args: {
							search_value: scannedCode,
							search_serial_no: searchSerialNo ? 1 : 0,
							search_batch_no: searchBatchNo ? 1 : 0,
						},
					});

					const resolved = resolveRes?.message || {};
					if (resolved?.item_code) {
						searchCode = String(resolved.item_code);
						if (resolved?.serial_no) {
							scanAssignment.serialNo = String(resolved.serial_no);
						}
						if (resolved?.batch_no) {
							scanAssignment.batchNo = String(resolved.batch_no);
						}
						foundItem = barcodeIndex.lookupItemByBarcode(searchCode);
					}
				} catch (error) {
					console.error(
						"Failed to resolve serial/batch scan on server:",
						error,
					);
				}
			}
		}

		if (foundItem) {
			const localAssignment = extractScanAssignmentFromItem(
				foundItem,
				scannedCode,
			);
			scanAssignment = {
				serialNo: scanAssignment.serialNo || localAssignment.serialNo,
				batchNo: scanAssignment.batchNo || localAssignment.batchNo,
			};
			logScanFlow("Local item resolved", {
				item_code: foundItem?.item_code,
				scannedCode,
				scanAssignment,
			});
			await addScannedItemToInvoice(
				foundItem,
				scannedCode,
				qtyFromBarcode,
				priceFromBarcode,
				scanAssignment,
				{ isScaleBarcode: isScaleBarcodeScan },
			);
			return;
		}

		// If not found locally, attempt to fetch from server using processed code
		try {
			let newItem: any = null;
			if (qtyFromBarcode !== null) {
				// Scale barcodes use a direct, faster lookup
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_item_detail",
					args: {
						item: JSON.stringify({ item_code: searchCode }),
						warehouse: pos_profile.value.warehouse,
						price_list: active_price_list.value,
						company: pos_profile.value.company,
					},
				});
				if (res && res.message) {
					newItem = res.message;
				}
			} else {
				// Regular barcodes and searches use the generic search
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: pos_profile.value,
						price_list: active_price_list.value,
						search_value: searchCode,
					},
				});

				if (res && res.message && res.message.length > 0) {
					newItem = res.message[0];
				}
			}

			if (newItem) {
				items.value.push(newItem);
				barcodeIndex.indexItem(newItem);

				if (searchCache) {
					searchCache.value.clear();
				}

				const profileScope = `${pos_profile.value?.name || "no_profile"}_${pos_profile.value?.warehouse || "no_warehouse"}`;
				await saveItems(items.value, profileScope);
				await savePriceListItems(
					customer_price_list.value,
					items.value,
				);
				if (eventBus && eventBus.emit)
					eventBus.emit("set_all_items", items.value);

				await itemDetailFetcher.update_items_details([newItem]);
				const localAssignment = extractScanAssignmentFromItem(
					newItem,
					scannedCode,
				);
				scanAssignment = {
					serialNo: scanAssignment.serialNo || localAssignment.serialNo,
					batchNo: scanAssignment.batchNo || localAssignment.batchNo,
				};
				await addScannedItemToInvoice(
					newItem,
					scannedCode,
					qtyFromBarcode,
					priceFromBarcode,
					scanAssignment,
					{ isScaleBarcode: isScaleBarcodeScan },
				);
				return;
			}

			// Report Not Found
			if (context.onItemNotFound) context.onItemNotFound(scannedCode);

			showScanError({
				message: `${__("Item not found")}: ${scannedCode}`,
				code: scannedCode,
				details: __(
					"Please verify the barcode or check the item's availability.",
				),
			});
			return;
		} catch (e: any) {
			console.error("Error fetching item from barcode:", e);
			if (context.onItemNotFound) context.onItemNotFound(scannedCode);

			showScanError({
				message: `${__("Item not found")}: ${scannedCode}`,
				code: scannedCode,
				details: __(
					"The system could not retrieve the item details. Please try again.",
				),
			});
			return;
		} finally {
			perfMarkEnd("pos:scan-process", mark);
		}
	};

	return {
		processScannedItem,
		addScannedItemToInvoice,
		awaitingScanResult,
		showMultipleItemsDialog,
	};
}
