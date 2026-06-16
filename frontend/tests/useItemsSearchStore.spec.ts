import { describe, expect, it } from "vitest";

import { useItemsSearch } from "../src/posapp/composables/pos/items/store/useItemsSearch";

describe("useItemsSearch fuzzy local matching", () => {
	it("matches a near item-name typo without requiring a server miss fallback", () => {
		const search = useItemsSearch();
		const items = [
			{
				item_code: "CHOCO-BISCUIT",
				item_name: "Chocolate Biscuit",
				item_group: "Snacks",
			},
			{
				item_code: "VANILLA-CAKE",
				item_name: "Vanilla Cake",
				item_group: "Bakery",
			},
		] as any[];

		search.updateIndexes(items, null);

		const result = search.performLocalSearch(
			"choclate",
			items,
			"ALL",
		);

		expect(result.map((item) => item.item_code)).toEqual([
			"CHOCO-BISCUIT",
		]);
	});

	it("keeps item group filtering active for fuzzy matches", () => {
		const search = useItemsSearch();
		const items = [
			{
				item_code: "CHOCO-BISCUIT",
				item_name: "Chocolate Biscuit",
				item_group: "Snacks",
			},
			{
				item_code: "CHOCO-CAKE",
				item_name: "Chocolate Cake",
				item_group: "Bakery",
			},
		] as any[];

		search.updateIndexes(items, null);

		const result = search.performLocalSearch(
			"choclate",
			items,
			"Bakery",
		);

		expect(result.map((item) => item.item_code)).toEqual(["CHOCO-CAKE"]);
	});
});
