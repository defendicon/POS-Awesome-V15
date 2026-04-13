import { describe, expect, it, vi } from "vitest";

import { addCatalogItemToCart } from "../src/features/catalog/domain/addCatalogItemToCart";
import { createPosCatalogStore } from "../src/features/catalog/domain/posCatalogStore";

describe("addCatalogItemToCart", () => {
	it("routes item preparation and add through one catalog action", async () => {
		const catalog = createPosCatalogStore();
		const prepareItemForCart = vi.fn(async () => {});
		const addItem = vi.fn(async () => {});
		const item = { item_code: "ITEM-001", item_name: "Apple" };
		const itemContext = { invoice_doc: { name: "INV-001" } };

		await addCatalogItemToCart({
			catalog,
			item,
			requestedQty: 2,
			itemContext,
			prepareItemForCart,
			addItem,
		});

		expect(prepareItemForCart).toHaveBeenCalledWith(item, 2, itemContext);
		expect(addItem).toHaveBeenCalledWith(item, itemContext);
		expect(catalog.state.value.stage).toBe("adding-item");
		expect(catalog.state.value.selectedItemCode).toBe("ITEM-001");
	});
});
