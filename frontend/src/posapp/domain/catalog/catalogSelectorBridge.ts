import { loadCatalogItems } from "./loadCatalogItems";
import { searchCatalogItems } from "./searchCatalogItems";
import type { PosCatalogItem, PosCatalogViewMode } from "./posCatalogTypes";
import type { createPosCatalogStore } from "./posCatalogStore";

type CatalogStore = ReturnType<typeof createPosCatalogStore>;

type InitializeCatalogSelectorContext = {
	catalog: CatalogStore;
	profileName: string | null;
	warehouse: string | null;
	loadItems: () => Promise<PosCatalogItem[] | undefined>;
	appendCachedItemsPage?: () => Promise<PosCatalogItem[] | undefined>;
};

type SyncCatalogSelectorDisplayContext = {
	catalog: CatalogStore;
	items: PosCatalogItem[];
	searchTerm: string;
	activeGroup: string;
	filterAndPaginate: (items: PosCatalogItem[]) => PosCatalogItem[];
};

type ResolveAdaptiveCatalogViewContext = {
	preferredView: PosCatalogViewMode;
	isPhone: boolean;
	windowWidth?: number;
};

function isReadyForScope(
	catalog: CatalogStore,
	profileName: string | null,
	warehouse: string | null,
) {
	return (
		catalog.state.value.status === "ready" &&
		catalog.state.value.profileName === profileName &&
		catalog.state.value.warehouse === warehouse
	);
}

export async function initializeCatalogSelector({
	catalog,
	profileName,
	warehouse,
	loadItems,
	appendCachedItemsPage,
}: InitializeCatalogSelectorContext) {
	if (isReadyForScope(catalog, profileName, warehouse)) {
		return catalog.state.value.displayedItems;
	}

	catalog.setProfileScope(profileName, warehouse);
	return await loadCatalogItems({
		catalog,
		loadItems,
		appendCachedItemsPage,
	});
}

export function syncCatalogSelectorDisplay({
	catalog,
	items,
	searchTerm,
	activeGroup,
	filterAndPaginate,
}: SyncCatalogSelectorDisplayContext) {
	const searchedItems = searchCatalogItems({
		catalog,
		items,
		searchTerm,
		activeGroup,
	});
	const displayedItems = filterAndPaginate(searchedItems);
	catalog.setDisplayedItems(displayedItems);
	return displayedItems;
}

export function resolveAdaptiveCatalogView({
	preferredView,
	isPhone,
	windowWidth = Number.MAX_SAFE_INTEGER,
}: ResolveAdaptiveCatalogViewContext): PosCatalogViewMode {
	if (isPhone || windowWidth < 1024) {
		return "cards";
	}

	return preferredView;
}
