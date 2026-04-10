import { describe, expect, it, vi } from "vitest";

import { createPosCatalogStore } from "../src/posapp/domain/catalog/posCatalogStore";
import {
	navigateCatalogHighlight,
	selectCatalogHighlightedItem,
} from "../src/posapp/domain/catalog/selectCatalogItem";

const ITEMS = [
	{ item_code: "ITEM-001", item_name: "Apple" },
	{ item_code: "ITEM-002", item_name: "Banana" },
];

describe("selectCatalogItem", () => {
	it("shares one highlight model across cards and table", () => {
		const catalog = createPosCatalogStore();
		catalog.setDisplayedItems(ITEMS);

		navigateCatalogHighlight({
			catalog,
			displayedItems: ITEMS,
			direction: 1,
		});
		navigateCatalogHighlight({
			catalog,
			displayedItems: ITEMS,
			direction: 1,
		});

		expect(catalog.state.value.highlightedItemCode).toBe("ITEM-002");
	});

	it("routes highlighted item selection through one add callback", async () => {
		const catalog = createPosCatalogStore();
		const onSelect = vi.fn(async () => {});
		catalog.setDisplayedItems(ITEMS);
		catalog.setHighlightedItemCode("ITEM-001");

		await selectCatalogHighlightedItem({
			catalog,
			displayedItems: ITEMS,
			onSelect,
		});

		expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
		expect(catalog.state.value.highlightedItemCode).toBeNull();
		expect(catalog.state.value.selectedItemCode).toBe("ITEM-001");
	});
});
