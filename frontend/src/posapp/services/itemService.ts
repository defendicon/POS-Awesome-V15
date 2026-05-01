import api from "./api";
import type { ApiEnvelope } from "./api";
import type { Item } from "../types/models";

export interface ItemGroup {
	name: string;
}

export interface GetItemsArgs {
	pos_profile: string;
	price_list: string;
	item_group?: string;
	search_value?: string;
	customer?: string | null;
	include_image?: number;
	item_groups?: string[];
	limit?: number;
	modified_after?: string;
}

const itemService = {
	getItemGroupsEnvelope(): Promise<ApiEnvelope<ItemGroup[]>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_groups",
		);
	},

	getItemGroups(): Promise<ApiEnvelope<ItemGroup[]>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_groups",
		);
	},

	getItemsEnvelope(
		args: GetItemsArgs,
		signal?: AbortSignal,
	): Promise<ApiEnvelope<Item[]>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items",
			args,
			{ signal },
		);
	},

	getItems(
		args: GetItemsArgs,
		signal?: AbortSignal,
	): Promise<ApiEnvelope<Item[]>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items",
			args,
			{
				signal,
			},
		);
	},

	getItemsData(args: GetItemsArgs, signal?: AbortSignal): Promise<Item[]> {
		return api.call("posawesome.posawesome.api.items.get_items", args, {
			signal,
		});
	},

	getItemsFromBarcodeEnvelope(args: {
		selling_price_list: string;
		currency: string;
		barcode: string;
	}): Promise<ApiEnvelope<Item | null>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_from_barcode",
			args,
		);
	},

	getItemsFromBarcode(args: {
		selling_price_list: string;
		currency: string;
		barcode: string;
	}): Promise<ApiEnvelope<Item | null>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_from_barcode",
			args,
		);
	},

	getItemBrandEnvelope(itemCode: string): Promise<ApiEnvelope<string>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_item_brand",
			{ item_code: itemCode },
		);
	},

	getItemBrand(itemCode: string): Promise<ApiEnvelope<string>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_item_brand",
			{ item_code: itemCode },
		);
	},

	getUOMsEnvelope(): Promise<ApiEnvelope<{ name: string }[]>> {
		return api.callEnvelope("frappe.client.get_list", {
			doctype: "UOM",
			fields: ["name"],
			limit_page_length: 0,
		});
	},

	getUOMs(): Promise<ApiEnvelope<{ name: string }[]>> {
		return api.callEnvelope("frappe.client.get_list", {
			doctype: "UOM",
			fields: ["name"],
			limit_page_length: 0,
		});
	},

	createItemEnvelope(itemData: Partial<Item>): Promise<ApiEnvelope<Item>> {
		const doc: Record<string, unknown> = {
			doctype: "Item",
			is_stock_item: 1,
			...itemData,
		};
		const normalizedBarcode =
			typeof doc.barcode === "string" ? doc.barcode.trim() : "";

		if (normalizedBarcode) {
			doc.barcodes = [{ barcode: normalizedBarcode }];
		}

		delete doc.barcode;

		return api.callEnvelope("frappe.client.insert", {
			doc,
		});
	},

	createItem(itemData: Partial<Item>): Promise<ApiEnvelope<Item>> {
		const doc: Record<string, unknown> = {
			doctype: "Item",
			is_stock_item: 1,
			...itemData,
		};
		const normalizedBarcode =
			typeof doc.barcode === "string" ? doc.barcode.trim() : "";

		if (normalizedBarcode) {
			doc.barcodes = [{ barcode: normalizedBarcode }];
		}

		delete doc.barcode;

		return api.callEnvelope("frappe.client.insert", {
			doc,
		});
	},
};

export default itemService;
