import { describe, expect, it } from "vitest";

import { collectUsedSerialsForItem } from "../src/posapp/composables/pos/items/addition/serialSelection";

describe("item addition serial selection helpers", () => {
	it("collects serials already used by matching item lines", () => {
		const item = {
			item_code: "ITEM-001",
			posa_row_id: "current",
		};
		const context = {
			items: [
				{
					item_code: "ITEM-001",
					posa_row_id: "line-1",
					serial_no_selected: [" SN-001 ", "", "SN-002"],
				},
				{
					item_code: "ITEM-001",
					posa_row_id: "line-2",
					serial_no: "SN-003\n\n SN-004 ",
				},
			],
		};

		expect([...collectUsedSerialsForItem(item, context)].sort()).toEqual([
			"SN-001",
			"SN-002",
			"SN-003",
			"SN-004",
		]);
	});

	it("ignores current row, other items, and different selected batches", () => {
		const item = {
			item_code: "ITEM-001",
			posa_row_id: "current",
			has_batch_no: 1,
			batch_no: "B-001",
		};
		const context = {
			items: [
				{
					item_code: "ITEM-001",
					posa_row_id: "current",
					serial_no_selected: ["SN-CURRENT"],
				},
				{
					item_code: "ITEM-002",
					posa_row_id: "other-item",
					serial_no_selected: ["SN-OTHER-ITEM"],
				},
				{
					item_code: "ITEM-001",
					posa_row_id: "other-batch",
					batch_no: "B-002",
					serial_no_selected: ["SN-OTHER-BATCH"],
				},
				{
					item_code: "ITEM-001",
					posa_row_id: "same-batch",
					batch_no: "B-001",
					serial_no_selected: ["SN-SAME-BATCH"],
				},
			],
		};

		expect([...collectUsedSerialsForItem(item, context)]).toEqual([
			"SN-SAME-BATCH",
		]);
	});
});
