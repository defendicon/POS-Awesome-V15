export function prepareItemForStorage(item) {
        if (!item || typeof item !== "object") {
                return item;
        }

        const normalized = item;
        const lower = (value) => (value != null ? String(value).toLowerCase() : "");
        const toCleanArray = (collection, extractor) => {
                if (!Array.isArray(collection)) {
                        return [];
                }
                return collection
                        .map((entry) => {
                                try {
                                        const value = extractor(entry);
                                        return value != null ? String(value) : "";
                                } catch {
                                        return "";
                                }
                        })
                        .map((value) => value.trim())
                        .filter(Boolean);
        };

        normalized.item_code_lower = lower(normalized.item_code);
        normalized.item_name_lower = lower(normalized.item_name);
        normalized.item_group_lower = lower(normalized.item_group);

        if (Array.isArray(normalized.item_barcode)) {
                        normalized.barcodes = toCleanArray(normalized.item_barcode, (b) =>
                                typeof b === "object" && b !== null ? b.barcode : b,
                        );
        } else if (normalized.item_barcode) {
                normalized.barcodes = [String(normalized.item_barcode)];
        } else if (Array.isArray(normalized.barcodes)) {
                normalized.barcodes = toCleanArray(normalized.barcodes, (b) => b);
        } else {
                normalized.barcodes = [];
        }

        const nameLower = normalized.item_name_lower;
        if (nameLower) {
                normalized.name_keywords = nameLower.split(/\s+/).map((kw) => kw.trim()).filter(Boolean);
        } else if (Array.isArray(normalized.name_keywords)) {
                normalized.name_keywords = toCleanArray(normalized.name_keywords, (kw) =>
                        typeof kw === "string" ? kw.toLowerCase() : kw,
                );
        } else {
                normalized.name_keywords = [];
        }

        if (Array.isArray(normalized.serial_no_data)) {
                normalized.serials = toCleanArray(normalized.serial_no_data, (s) => s && s.serial_no);
        } else if (Array.isArray(normalized.serials)) {
                normalized.serials = toCleanArray(normalized.serials, (s) => s);
        } else {
                normalized.serials = [];
        }

        if (Array.isArray(normalized.batch_no_data)) {
                normalized.batches = toCleanArray(normalized.batch_no_data, (b) => b && b.batch_no);
        } else if (Array.isArray(normalized.batches)) {
                normalized.batches = toCleanArray(normalized.batches, (b) => b);
        } else {
                normalized.batches = [];
        }

        return normalized;
}

export function prepareItemsForStorage(items) {
        if (!Array.isArray(items)) {
                return [];
        }
        return items.map((item) => prepareItemForStorage(item));
}
