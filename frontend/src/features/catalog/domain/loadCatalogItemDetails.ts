import { createPosCatalogBlocker } from "./catalogDiagnostics";
import type { PosCatalogItem } from "./posCatalogTypes";
import type { createPosCatalogStore } from "./posCatalogStore";

type CatalogStore = ReturnType<typeof createPosCatalogStore>;

type LoadCatalogItemDetailsContext = {
	catalog: CatalogStore;
	items: PosCatalogItem[];
	updateItemsDetails: (items: PosCatalogItem[]) => Promise<void> | void;
};

export async function loadCatalogItemDetails({
	catalog,
	items,
	updateItemsDetails,
}: LoadCatalogItemDetailsContext) {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}

	try {
		await updateItemsDetails(items);
		return items;
	} catch (error) {
		console.warn("Catalog item details failed", error);
		catalog.markDegraded(
			createPosCatalogBlocker(
				"catalog_item_details_failed",
				"Catalog item details did not finish loading.",
			),
		);
		return items;
	}
}
