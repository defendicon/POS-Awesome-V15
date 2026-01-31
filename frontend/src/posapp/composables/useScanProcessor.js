import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useToastStore } from "../stores/toastStore.js";
import { useUIStore } from "../stores/uiStore.js";
import { withPerf, perfMarkStart, perfMarkEnd } from "../utils/perf.js";
// import { get_currency_symbol } from "../utils/currency.js"; // File does not exist and unused
import { formatStockShortageError, parseBooleanSetting } from "../utils/stock.js";
import {
    normalizeScaleBarcodeSettings,
    parseScaleBarcodeSettingsResponse,
} from "../utils/scaleBarcode.js";
import { saveItems, savePriceListItems } from "../../offline/index.js";
import { openItemSelectionDialog } from "../utils/itemSelectionDialog.js";
// Image import path was correct relative to composables (posapp/composables -> posapp/components/pos)
import placeholderImage from "../components/pos/placeholder-image.png";

/**
 * Manages the logic for processing scanned barcodes, including:
 * - Scale barcode parsing
 * - Server fetch for missing items
 * - Stock availability validation
 * - UOM price conversion
 * - Adding to invoice via useItemAddition
 */
export function useScanProcessor(context) {
    // Deconstruct required context
    const {
        items, // Ref to local items list (should be same as ItemsSelector uses)
        pos_profile, // Ref
        active_price_list, // Ref
        customer_price_list, // Ref
        itemDetailFetcher, // { update_items_details }
        itemAddition, // { addItem, add_item (wrapper) } - actually we use local add_item logic mostly
        barcodeIndex, // { ensureBarcodeIndex, lookupItemByBarcode, replaceBarcodeIndex, indexItem }
        scannerInput, // { ensureScaleBarcodeSettings, updateScaleBarcodeSettings, getScaleBarcodePrefix, scaleBarcodeMatches, scanErrorDialog... }
        searchCache, // Ref to Search Cache (Map)
        eventBus, // For 'set_all_items' emission (legacy)
        format_number, // Utility
        float_precision, // Ref
        hide_qty_decimals, // Ref
        blockSaleBeyondAvailableQty, // Ref
        currency_precision, // Ref
        exchange_rate, // Ref
        format_currency, // Utility function
        ratePrecision, // Utility function
        customer, // Ref for fetching item details context
    } = context;

    const toastStore = useToastStore();
    const uiStore = useUIStore();

    const awaitingScanResult = ref(false);
    const pendingScanCode = ref("");

    const isNegativeStockEnabled = (item = null) => {
        const allowNegativeSetting = parseBooleanSetting(context.stock_settings?.allow_negative_stock);
        const allowNegativeItem = item ? parseBooleanSetting(item.allow_negative_stock) : false;
        return allowNegativeSetting || allowNegativeItem;
    };

    const showScanError = (error) => {
        if (scannerInput.scanErrorDialog) {
            scannerInput.scanErrorDialog.value = true;
            scannerInput.scanErrorMessage.value = error.message;
            scannerInput.scanErrorCode.value = error.code;
            scannerInput.scanErrorDetails.value = error.details;
            scannerInput.playScanTone("error");
        }
    };

    const showMultipleItemsDialog = (itemsList, scannedCode) => {
        openItemSelectionDialog({
            items: itemsList,
            scannedCode,
            currency: pos_profile.value.currency,
            formatCurrency: format_currency,
            ratePrecision: ratePrecision,
            placeholderImage,
            translate: __,
            onSelect: (item) => addScannedItemToInvoice(item, scannedCode, null, null),
        });
    };

    const addScannedItemToInvoice = async (item, scannedCode, qtyFromBarcode = null, priceFromBarcode = null) => {
        console.log("Adding scanned item to invoice:", item, scannedCode);

        // Clone the item to avoid mutating list data
        const newItem = { ...item };

        // If the scanned barcode has a specific UOM, apply it
        if (Array.isArray(newItem.item_barcode)) {
            const barcodeMatch = newItem.item_barcode.find((b) => b.barcode === scannedCode);
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
                        newItem.item_uoms.find((u) => u.uom === barcodeMatch.posa_uom);
                    const conversionFactor =
                        uomInfo && uomInfo.conversion_factor
                            ? parseFloat(uomInfo.conversion_factor)
                            : null;
                    const currentConversion = newItem.conversion_factor || 1;
                    const baseUnitRate =
                        parseFloat(
                            (newItem.base_price_list_rate ||
                                newItem.base_rate ||
                                newItem.price_list_rate ||
                                newItem.rate ||
                                0) / (currentConversion || 1),
                        ) || 0;

                    if (res.message) {
                        const price = parseFloat(res.message);
                        newItem.rate = price;
                        newItem.price_list_rate = price;
                        const basePrice = conversionFactor ? price / conversionFactor : price;
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

        let effectiveQty = qtyFromBarcode;
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

        let effectivePrice = priceFromBarcode;
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
            const parsedPrice = parseFloat(effectivePrice);
            if (!Number.isNaN(parsedPrice)) {
                newItem.rate = parsedPrice;
                newItem.price_list_rate = parsedPrice;
                newItem.base_rate = parsedPrice;
                newItem.base_price_list_rate = parsedPrice;
                newItem._manual_rate_set = true;
                newItem.skip_force_update = true;
            }
        }

        const requestedQtyRaw =
            qtyFromBarcode !== null && !isNaN(qtyFromBarcode) ? qtyFromBarcode : (newItem.qty ?? 1);
        const requestedQty = Math.abs(requestedQtyRaw || 1);
        const availableQty =
            typeof newItem.available_qty === "number"
                ? newItem.available_qty
                : typeof newItem.actual_qty === "number"
                    ? newItem.actual_qty
                    : null;

        if (availableQty !== null && availableQty < requestedQty) {
            const formattedAvailable = format_number(availableQty, hide_qty_decimals.value ? 0 : float_precision.value); // Use prop ref
            const formattedRequested = format_number(requestedQty, hide_qty_decimals.value ? 0 : float_precision.value); // Use prop ref
            const negativeStockEnabled = isNegativeStockEnabled(newItem);
            const exceedsAvailable = availableQty < requestedQty;
            const shouldBlock =
                (blockSaleBeyondAvailableQty.value && exceedsAvailable) || // Use prop ref
                (!negativeStockEnabled && exceedsAvailable);

            if (shouldBlock) {
                showScanError({
                    message: formatStockShortageError(
                        newItem.item_name || newItem.item_code || scannedCode,
                        availableQty,
                        requestedQty,
                    ),
                    code: scannedCode,
                    details: __("Adjust the quantity or enable negative stock to continue."),
                });
                return;
            }

            // Suppress low stock notifications when negative stock is allowed
        }

        awaitingScanResult.value = true;

        try {
            // Use the context-aware add_item wrapper provided by ItemsSelector (via context)
            await context.add_item_wrapper(newItem, {
                suppressNegativeWarning: true,
                skipNotification: true,
            });
            scannerInput.playScanTone("success");
            if (scannerInput.scannerLocked) scannerInput.scannerLocked.value = false;
            context.search_from_scanner_ref.value = false; // Access ref directly
            pendingScanCode.value = "";

            // Show success message
            const itemName = newItem.item_name || newItem.item_code || scannedCode || __("Item");
            const rawPrecision = Number(float_precision.value);
            const precision = Number.isInteger(rawPrecision) ? Math.min(Math.max(rawPrecision, 0), 6) : 2;
            const displayQty = Number.isInteger(requestedQty)
                ? requestedQty
                : Number(requestedQty.toFixed(precision));

            if (eventBus && eventBus.emit) {
                toastStore.show({
                    title: __("Item {0} added to invoice", [itemName]),
                    summary: __("Items added to invoice"),
                    detail: __("{0} (Qty: {1})", [itemName, displayQty]),
                    color: "success",
                    groupId: "invoice-item-added",
                });
            } else if (frappe?.show_alert) {
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

    const processScannedItem = async (scannedCode) => {
        const mark = perfMarkStart("pos:scan-process");
        pendingScanCode.value = scannedCode;
        await scannerInput.ensureScaleBarcodeSettings();
        // Handle scale barcodes by extracting the item code and quantity
        let searchCode = scannedCode;
        let qtyFromBarcode = null;
        let priceFromBarcode = null;
        let scaleResponse = null;

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

        if (scaleResponse && scaleResponse.settings) {
            scannerInput.updateScaleBarcodeSettings(scaleResponse.settings);
        }

        const configuredPrefix = scannerInput.getScaleBarcodePrefix();

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
        } else if (scannerInput.scaleBarcodeMatches(scannedCode)) {
            // Fallback: these methods (get_search, get_item_qty) need to be passed or accessed from context/vm
            // Assuming ItemsSelector has them or we duplicate logic?
            // These were mixin methods in ItemsSelector usually.
            // Let's assume for now scaleResponse handles it, or we rely on 'context.get_search' if passed.
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
                        item.item_barcode.some((b) => b.barcode === searchCode)) ||
                    (Array.isArray(item.barcodes) &&
                        item.barcodes.some((bc) => String(bc) === searchCode));
                return barcodeMatch || item.item_code === searchCode;
            });
        }

        if (foundItem) {
            console.log("Found item by processed code:", foundItem);
            await addScannedItemToInvoice(foundItem, searchCode, qtyFromBarcode, priceFromBarcode);
            return;
        }

        // If not found locally, attempt to fetch from server using processed code
        try {
            let newItem = null;
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

                await saveItems(items.value);
                await savePriceListItems(customer_price_list.value, items.value);
                if (eventBus) eventBus.emit("set_all_items", items.value);

                await itemDetailFetcher.update_items_details([newItem]);
                await addScannedItemToInvoice(newItem, searchCode, qtyFromBarcode, priceFromBarcode);
                return;
            }

            // Report Not Found
            // context.setSearch(scannedCode); // Update UI search
            if (context.onItemNotFound) context.onItemNotFound(scannedCode);

            showScanError({
                message: `${__("Item not found")}: ${scannedCode}`,
                code: scannedCode,
                details: __("Please verify the barcode or check the item's availability."),
            });
            return;
        } catch (e) {
            console.error("Error fetching item from barcode:", e);
            if (context.onItemNotFound) context.onItemNotFound(scannedCode);

            showScanError({
                message: `${__("Item not found")}: ${scannedCode}`,
                code: scannedCode,
                details: __("The system could not retrieve the item details. Please try again."),
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
        showMultipleItemsDialog, // Expose if needed by UI
    };
}
