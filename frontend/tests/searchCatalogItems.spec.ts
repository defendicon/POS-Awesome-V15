import { describe, expect, it } from "vitest";

import { createPosCatalogStore } from "../src/posapp/domain/catalog/posCatalogStore";
import { searchCatalogItems } from "../src/posapp/domain/catalog/searchCatalogItems";

const ITEMS = [
	{ item_code: "ITEM-001", item_name: "Apple", item_group: "Fruits" },
	{ item_code: "ITEM-002", item_name: "Banana", item_group: "Fruits" },
	{ item_code: "ITEM-003", item_name: "Soap", item_group: "Household" },
];

describe("searchCatalogItems", () => {
	it("updates search term, group, and displayed items from one pipeline", async () => {
		const catalog = createPosCatalogStore();

		const displayedItems = await searchCatalogItems({
			catalog,
			items: ITEMS,
			searchTerm: "ban",
			activeGroup: "Fruits",
		});

		expect(displayedItems.map((item) => item.item_code)).toEqual(["ITEM-002"]);
		expect(catalog.state.value.searchTerm).toBe("ban");
		expect(catalog.state.value.activeGroup).toBe("Fruits");
		expect(catalog.state.value.displayedItems.map((item) => item.item_code)).toEqual([
			"ITEM-002",
		]);
		expect(catalog.state.value.stage).toBe("searching");
	});

	it("returns all group-matching items when search term is empty", async () => {
		const catalog = createPosCatalogStore();

		const displayedItems = await searchCatalogItems({
			catalog,
			items: ITEMS,
			searchTerm: "",
			activeGroup: "Fruits",
		});

		expect(displayedItems.map((item) => item.item_code)).toEqual([
			"ITEM-001",
			"ITEM-002",
		]);
	});
});
