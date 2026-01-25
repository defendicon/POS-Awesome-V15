import api from "./api";

export default {
	getItemGroups() {
		return api.call("posawesome.posawesome.api.items.get_items_groups");
	},

	getItems(args, signal) {
		return api.call("posawesome.posawesome.api.items.get_items", args, { signal });
	},

	getItemsFromBarcode(args) {
		return api.call("posawesome.posawesome.api.items.get_items_from_barcode", args);
	},

	getItemBrand(itemCode) {
		return api.call("posawesome.posawesome.api.items.get_item_brand", { item_code: itemCode });
	}
};
