import { describe, expect, it, vi } from "vitest";

import { loadCatalogItemDetails } from "../src/features/catalog/domain/loadCatalogItemDetails";
import { createPosCatalogStore } from "../src/features/catalog/domain/posCatalogStore";

describe("loadCatalogItemDetails", () => {
	it("records detail hydration failure without blocking a ready selector", async () => {
		const catalog = createPosCatalogStore();
		catalog.markStarting();
		catalog.markStage("loading-items");
		catalog.markReady();
		const updateItemsDetails = vi.fn(async () => {
			throw new Error("detail fetch failed");
		});

		await loadCatalogItemDetails({
			catalog,
			items: [{ item_code: "ITEM-001" }],
			updateItemsDetails,
		});

		expect(catalog.state.value.status).toBe("degraded");
		expect(catalog.state.value.stage).toBe("ready");
		expect(catalog.state.value.blocker).toEqual({
			code: "catalog_item_details_failed",
			summary: "Catalog item details did not finish loading.",
		});
	});
});
