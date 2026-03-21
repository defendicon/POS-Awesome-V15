import { ref } from "vue";
import { describe, expect, it } from "vitest";

import { resetNewItemDialogState } from "../src/posapp/components/pos/items/newItemDialogState";

describe("resetNewItemDialogState", () => {
	it("clears the scanned barcode and awaiting-scan flag together", () => {
		const scannedBarcode = ref("123456");
		const awaitingScan = ref(true);

		resetNewItemDialogState(scannedBarcode, awaitingScan);

		expect(scannedBarcode.value).toBe("");
		expect(awaitingScan.value).toBe(false);
	});
});
