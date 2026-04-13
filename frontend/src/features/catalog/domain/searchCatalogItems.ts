import type { PosCatalogItem } from "./posCatalogTypes";
import type { createPosCatalogStore } from "./posCatalogStore";

type CatalogStore = ReturnType<typeof createPosCatalogStore>;

type SearchCatalogItemsContext = {
	catalog: CatalogStore;
	items: PosCatalogItem[];
	searchTerm: string;
	activeGroup?: string;
};

function matchesGroup(item: PosCatalogItem, activeGroup: string) {
	if (!activeGroup || activeGroup === "ALL") {
		return true;
	}

	return String(item.item_group || "").toLowerCase() === activeGroup.toLowerCase();
}

function matchesSearch(item: PosCatalogItem, searchTerm: string) {
	const normalizedTerm = String(searchTerm || "").trim().toLowerCase();
	if (!normalizedTerm) {
		return true;
	}

	return [item.item_code, item.item_name, item.item_group]
		.map((value) => String(value || "").toLowerCase())
		.some((value) => value.includes(normalizedTerm));
}

export function searchCatalogItems({
	catalog,
	items,
	searchTerm,
	activeGroup = "ALL",
}: SearchCatalogItemsContext) {
	const safeItems = Array.isArray(items) ? items : [];
	const filteredItems = safeItems.filter((item) => {
		return matchesGroup(item, activeGroup) && matchesSearch(item, searchTerm);
	});

	catalog.setSearchTerm(searchTerm);
	catalog.setActiveGroup(activeGroup);
	catalog.setDisplayedItems(filteredItems);
	if (String(searchTerm || "").trim() || activeGroup !== "ALL") {
		catalog.setStage(
			"searching",
			catalog.state.value.status === "idle"
				? "ready"
				: catalog.state.value.status,
		);
	}

	return filteredItems;
}
