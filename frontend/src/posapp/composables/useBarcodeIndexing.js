import { ref } from "vue";
import {
    ensureBarcodeIndex,
    resetBarcodeIndex,
    indexItemInBarcodeIndex,
    replaceBarcodeIndex,
    lookupItemInBarcodeIndex
} from "../utils/barcodeIndex.js";

/**
 * useBarcodeIndexing
 * 
 * Manages the high-performance barcode-to-item lookup index.
 * Handles background indexing, barcode matching, and scanned item processing.
 */
export function useBarcodeIndexing({ itemSelection, toastStore, eventBus } = {}) {
    const barcodeIndex = ref(new Map());
    const isIndexing = ref(false);

    const ensureIndex = () => {
        barcodeIndex.value = ensureBarcodeIndex(barcodeIndex.value);
    };

    const resetIndex = () => {
        barcodeIndex.value = resetBarcodeIndex(barcodeIndex.value);
    };

    const indexItem = (item) => {
        barcodeIndex.value = indexItemInBarcodeIndex(barcodeIndex.value, item);
    };

    const replaceIndex = (items = []) => {
        isIndexing.value = true;
        try {
            barcodeIndex.value = replaceBarcodeIndex(barcodeIndex.value, items);
        } finally {
            isIndexing.value = false;
        }
    };

    const lookupItem = (code) => {
        return lookupItemInBarcodeIndex(barcodeIndex.value, code);
    };

    /**
     * processScannedItem
     * Logic for handling a successfully scanned barcode/ID.
     */
    const processScannedItem = async (barcode, context) => {
        if (!barcode) return null;

        const item = lookupItem(barcode);
        if (item) {
            if (context?.addItem) {
                await context.addItem(item);
            }
            return item;
        }

        // Handle case where item is not in index (possibly a scale barcode or needs server fetch)
        return null;
    };

    return {
        barcodeIndex,
        isIndexing,
        ensureIndex,
        resetIndex,
        indexItem,
        replaceIndex,
        lookupItem,
        processScannedItem,
    };
}
