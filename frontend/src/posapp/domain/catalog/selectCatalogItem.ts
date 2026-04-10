import {
	findItemIndexByCode,
	getNextHighlightedIndex,
} from "../../utils/itemHighlight";
import type { PosCatalogItem } from "./posCatalogTypes";
import type { createPosCatalogStore } from "./posCatalogStore";

type CatalogStore = ReturnType<typeof createPosCatalogStore>;

type NavigateCatalogHighlightContext = {
	catalog: CatalogStore;
	displayedItems: PosCatalogItem[];
	direction: number;
};

type SelectCatalogHighlightedItemContext = {
	catalog: CatalogStore;
	displayedItems: PosCatalogItem[];
	onSelect: (item: PosCatalogItem) => Promise<void> | void;
};

export function navigateCatalogHighlight({
	catalog,
	displayedItems,
	direction,
}: NavigateCatalogHighlightContext) {
	if (!Array.isArray(displayedItems) || displayedItems.length === 0) {
		catalog.setHighlightedItemCode(null);
		return null;
	}

	const currentIndex = findItemIndexByCode(
		displayedItems,
		catalog.state.value.highlightedItemCode,
	);
	const nextIndex = getNextHighlightedIndex({
		currentIndex,
		itemsLength: displayedItems.length,
		direction,
	});
	const nextItem = displayedItems[nextIndex] || null;

	catalog.setHighlightedItemCode(nextItem?.item_code || null);
	return nextItem;
}

export async function selectCatalogHighlightedItem({
	catalog,
	displayedItems,
	onSelect,
}: SelectCatalogHighlightedItemContext) {
	if (typeof onSelect !== "function") {
		return null;
	}

	const selectedIndex = findItemIndexByCode(
		displayedItems,
		catalog.state.value.highlightedItemCode,
	);
	const selectedItem =
		selectedIndex >= 0 ? displayedItems[selectedIndex] : null;

	if (!selectedItem) {
		return null;
	}

	await onSelect(selectedItem);
	catalog.setSelectedItemCode(selectedItem.item_code || null);
	catalog.setHighlightedItemCode(null);

	return selectedItem;
}
