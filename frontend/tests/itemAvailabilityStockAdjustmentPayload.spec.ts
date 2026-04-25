import { describe, expect, it } from "vitest";

import { normalizeInvoiceStockAdjustmentPayload } from "../src/posapp/composables/pos/items/availability/stockAdjustmentPayload";

describe("normalizeInvoiceStockAdjustmentPayload", () => {
	it("normalizes base stock entries and deduplicated impacted codes from object payloads", () => {
		const result = normalizeInvoiceStockAdjustmentPayload({
			items: [
				{ item_code: " ITEM-1 ", actual_qty: "5" },
				{ item_code: "ITEM-2", actual_qty: "not-a-number" },
				{ item_code: " ", actual_qty: 8 },
				{ item_code: null, actual_qty: 9 },
			],
			item_codes: ["ITEM-2", " ITEM-3 ", "", null, "ITEM-1"],
			item_code: " ITEM-4 ",
		});

		expect(result.baseEntries).toEqual([
			{ item_code: "ITEM-1", actual_qty: 5 },
		]);
		expect(result.codes).toEqual(["ITEM-1", "ITEM-2", "ITEM-3", "ITEM-4"]);
	});

	it("collects impacted codes from array and scalar payload shapes", () => {
		expect(
			normalizeInvoiceStockAdjustmentPayload([
				" ITEM-1 ",
				{ item_code: "ITEM-2" },
				123,
				"ITEM-1",
				{ item_code: " " },
			]).codes,
		).toEqual(["ITEM-1", "ITEM-2", "123"]);

		expect(normalizeInvoiceStockAdjustmentPayload(" ITEM-5 ").codes).toEqual([
			"ITEM-5",
		]);
	});
});
