import { createPosCatalogBlocker } from "./catalogDiagnostics";
import type { PosCatalogItem } from "./posCatalogTypes";
import type { createPosCatalogStore } from "./posCatalogStore";

type CatalogStore = ReturnType<typeof createPosCatalogStore>;

type LoadCatalogItemsContext = {
	catalog: CatalogStore;
	loadItems: () => Promise<PosCatalogItem[] | undefined>;
	appendCachedItemsPage?: () => Promise<PosCatalogItem[] | undefined>;
};

export async function loadCatalogItems({
	catalog,
	loadItems,
	appendCachedItemsPage,
}: LoadCatalogItemsContext) {
	catalog.markStarting();
	catalog.markStage("loading-items");

	try {
		const loadedItems = await loadItems();
		catalog.setDisplayedItems(Array.isArray(loadedItems) ? loadedItems : []);
		catalog.markReady();
	} catch (error) {
		console.warn("Catalog load failed", error);
		catalog.blockCatalog(
			createPosCatalogBlocker(
				"catalog_load_failed",
				"Catalog items did not finish loading.",
			),
		);
		return [];
	}

	if (typeof appendCachedItemsPage !== "function") {
		return catalog.state.value.displayedItems;
	}

	try {
		const appendedItems = await appendCachedItemsPage();
		if (Array.isArray(appendedItems) && appendedItems.length) {
			catalog.setDisplayedItems([
				...catalog.state.value.displayedItems,
				...appendedItems,
			]);
		}
	} catch (error) {
		console.warn("Catalog append failed", error);
		catalog.markDegraded(
			createPosCatalogBlocker(
				"catalog_append_failed",
				"Catalog cached items could not be appended.",
			),
		);
	}

	return catalog.state.value.displayedItems;
}
