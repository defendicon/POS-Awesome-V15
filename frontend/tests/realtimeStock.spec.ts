import { describe, expect, it, vi } from "vitest";

import {
	dispatchRealtimeStockPayload,
	normalizeRealtimeStockPayload,
} from "../src/posapp/utils/realtimeStock";

describe("realtime stock payload dispatch", () => {
	it("normalizes stock updates and deduplicates item codes", () => {
		const payload = normalizeRealtimeStockPayload({
			source_doctype: "Bin",
			items: [
				{ item_code: " ITEM-1 ", warehouse: "Main", actual_qty: "5" },
				{ item_code: "ITEM-1", warehouse: "Main", actual_qty: 5 },
				{ item_code: "ITEM-2", warehouse: "Stores", actual_qty: 2 },
			],
		});

		expect(payload?.item_codes).toEqual(["ITEM-1", "ITEM-2"]);
		expect(payload?.warehouses).toEqual(["Main", "Stores"]);
		expect(payload?.items[0].actual_qty).toBe(5);
	});

	it("updates stock state and emits a remote adjustment event", () => {
		const updateBaseQuantities = vi.fn();
		const emit = vi.fn();
		const setLastStockAdjustment = vi.fn();

		const payload = dispatchRealtimeStockPayload(
			{
				source_doctype: "Bin",
				items: [
					{ item_code: "ITEM-1", warehouse: "Main", actual_qty: 9 },
					{ item_code: "ITEM-2", warehouse: "Main", actual_qty: "3" },
				],
			},
			{
				updateBaseQuantities,
				emit,
				setLastStockAdjustment,
			},
		);

		expect(updateBaseQuantities).toHaveBeenCalledWith(
			[
				{ item_code: "ITEM-1", warehouse: "Main", actual_qty: 9 },
				{ item_code: "ITEM-2", warehouse: "Main", actual_qty: 3 },
			],
			{ source: "realtime" },
		);
		expect(setLastStockAdjustment).toHaveBeenCalledWith(payload);
		expect(emit).toHaveBeenCalledWith("remote_stock_adjustment", payload);
	});
});
