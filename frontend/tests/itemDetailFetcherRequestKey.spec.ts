import { describe, expect, it } from "vitest";

import { buildItemDetailsRequestIdentity } from "../src/posapp/composables/pos/items/detailFetcher/requestIdentity";

describe("buildItemDetailsRequestIdentity", () => {
	it("uses a trimmed override and builds a stable key from unique item codes", () => {
		const identity = buildItemDetailsRequestIdentity({
			posProfileName: "POS-1",
			activePriceList: "Standard Selling",
			priceListOverride: "  Wholesale  ",
			items: [
				{ item_code: "B-ITEM" },
				{ item_code: "A-ITEM" },
				{ item_code: "B-ITEM" },
				{ item_code: "" },
				{ item_code: null },
				{},
			],
		});

		expect(identity).toEqual({
			effectivePriceList: "Wholesale",
			key: "POS-1:Wholesale:A-ITEM,B-ITEM",
		});
	});

	it("falls back to the active price list and an empty profile name", () => {
		const identity = buildItemDetailsRequestIdentity({
			posProfileName: null,
			activePriceList: "Standard Selling",
			priceListOverride: "   ",
			items: [{ item_code: 20 }, { item_code: "3" }],
		});

		expect(identity).toEqual({
			effectivePriceList: "Standard Selling",
			key: ":Standard Selling:20,3",
		});
	});
});
