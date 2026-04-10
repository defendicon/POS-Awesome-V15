import type { PosCatalogItem } from "./posCatalogTypes";
import type { createPosCatalogStore } from "./posCatalogStore";

type CatalogStore = ReturnType<typeof createPosCatalogStore>;

type AddCatalogItemToCartContext = {
	catalog: CatalogStore;
	item: PosCatalogItem;
	requestedQty: number;
	itemContext: any;
	prepareItemForCart: (
		item: PosCatalogItem,
		requestedQty: number,
		context: any,
	) => Promise<void> | void;
	addItem: (item: PosCatalogItem, context: any) => Promise<void> | void;
};

export async function addCatalogItemToCart({
	catalog,
	item,
	requestedQty,
	itemContext,
	prepareItemForCart,
	addItem,
}: AddCatalogItemToCartContext) {
	catalog.setStage("adding-item", catalog.state.value.status);
	await prepareItemForCart(item, requestedQty, itemContext);
	await addItem(item, itemContext);
	catalog.setSelectedItemCode(item.item_code || null);
	return item;
}
