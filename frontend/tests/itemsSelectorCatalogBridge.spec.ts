import { describe, expect, it, vi } from "vitest";

import {
	initializeCatalogSelector,
	syncCatalogSelectorDisplay,
} from "../src/posapp/domain/catalog/catalogSelectorBridge";
import { createPosCatalogStore } from "../src/posapp/domain/catalog/posCatalogStore";

describe("catalogSelectorBridge", () => {
	it("skips catalog boot when the current profile scope is already ready", async () => {
		const catalog = createPosCatalogStore();
		catalog.markStarting();
		catalog.markStage("loading-items");
		catalog.setProfileScope("Main POS", "Stores - TC");
		catalog.markReady();

		const loadItems = vi.fn(async () => []);

		await initializeCatalogSelector({
			catalog,
			profileName: "Main POS",
			warehouse: "Stores - TC",
			loadItems,
			appendCachedItemsPage: vi.fn(async () => []),
		});

		expect(loadItems).not.toHaveBeenCalled();
	});

	it("syncs searched and paginated items into catalog display state", () => {
		const catalog = createPosCatalogStore();
		const items = [
			{ item_code: "ITEM-001", item_name: "Apple", item_group: "Fruits" },
			{ item_code: "ITEM-002", item_name: "Banana", item_group: "Fruits" },
			{ item_code: "ITEM-003", item_name: "Soap", item_group: "Household" },
		];

		syncCatalogSelectorDisplay({
			catalog,
			items,
			searchTerm: "a",
			activeGroup: "Fruits",
			filterAndPaginate: (sourceItems) => sourceItems.slice(0, 1),
		});

		expect(catalog.state.value.searchTerm).toBe("a");
		expect(catalog.state.value.activeGroup).toBe("Fruits");
		expect(catalog.state.value.displayedItems.map((item) => item.item_code)).toEqual([
			"ITEM-001",
		]);
	});
});
