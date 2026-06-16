import { describe, expect, it } from "vitest";

import { useItemSearch } from "../src/posapp/composables/pos/items/useItemSearch";

describe("useItemSearch display filtering", () => {
	it("does not re-run text search when the source is already search-scoped", () => {
		const { filterAndPaginate } = useItemSearch();
		const alreadyScopedResults = [
			{
				item_code: "ITEM-001",
				item_name: "Server Matched Item",
				rate: 10,
			},
			{
				item_code: "ITEM-002",
				item_name: "Another Indexed Hit",
				rate: 12,
			},
		];

		const result = filterAndPaginate(alreadyScopedResults, {
			searchTerm: "alpha",
			searchAlreadyApplied: true,
			limit: 50,
		});

		expect(result.map((item) => item.item_code)).toEqual([
			"ITEM-001",
			"ITEM-002",
		]);
	});

	it("still applies display-only filters after search has already been applied", () => {
		const { filterAndPaginate } = useItemSearch();
		const alreadyScopedResults = [
			{
				item_code: "ITEM-001",
				item_name: "Server Matched Item",
				rate: 0,
			},
			{
				item_code: "ITEM-002",
				item_name: "Another Indexed Hit",
				rate: 12,
				variant_of: "ITEM-TEMPLATE",
			},
			{
				item_code: "ITEM-003",
				item_name: "Barcode Hit",
				rate: 15,
				item_barcode: [{ barcode: "ABC-003" }],
			},
		];

		const result = filterAndPaginate(alreadyScopedResults, {
			searchTerm: "alpha",
			searchAlreadyApplied: true,
			hideZeroRate: true,
			hideVariants: true,
			onlyBarcode: true,
			limit: 50,
		});

		expect(result.map((item) => item.item_code)).toEqual(["ITEM-003"]);
	});
});
