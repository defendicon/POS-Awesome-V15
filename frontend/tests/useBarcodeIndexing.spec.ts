import { describe, expect, it } from "vitest";

import {
	MAX_BARCODE_INDEX_ITEMS,
	replaceBarcodeIndex,
	useBarcodeIndexing,
} from "../src/posapp/composables/pos/items/useBarcodeIndexing";

describe("useBarcodeIndexing", () => {
	it("does not populate the Map above the catalog safety threshold", () => {
		const items = new Array(MAX_BARCODE_INDEX_ITEMS + 1);
		items[MAX_BARCODE_INDEX_ITEMS] = {
			item_code: "ITEM-LAST",
			barcode: "LARGE-CATALOG-BARCODE",
		};

		const index = replaceBarcodeIndex(new Map(), items);

		expect(index.size).toBe(0);
	});

	it("uses an exact linear barcode lookup when the catalog is too large to index", () => {
		const items = new Array(MAX_BARCODE_INDEX_ITEMS + 1);
		const expected = {
			item_code: "ITEM-LAST",
			item_barcode: [{ barcode: "BOX-LAST" }],
		};
		items[MAX_BARCODE_INDEX_ITEMS] = expected;
		const barcodeIndex = useBarcodeIndexing();
		barcodeIndex.replaceBarcodeIndex([
			{ item_code: "SMALL", barcode: "SMALL-BARCODE" },
		]);
		expect(barcodeIndex.ensureBarcodeIndex().size).toBeGreaterThan(0);

		const resolved = barcodeIndex.resolveItemByBarcode(items, "box-last");

		expect(resolved).toBe(expected);
		expect(barcodeIndex.ensureBarcodeIndex().size).toBe(0);
	});
});
