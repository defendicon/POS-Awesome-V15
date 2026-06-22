import api from "./api";
import { unwrapApiResult, type ApiEnvelope } from "./api";
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
	offset?: number;
	start_after?: string | null;
	modified_after?: string;
}

export interface GetItemsCountArgs {
	pos_profile: string;
	item_groups?: string[];
}

export interface BarcodeLookupArgs {
	selling_price_list: string;
	currency: string;
	barcode: string;
}

function buildItemDoc(itemData: Partial<Item>) {
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
	return doc;
}

const itemService = {
	getItemGroups(): Promise<ApiEnvelope<ItemGroup[]>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_groups",
		);
	},

	async getItemGroupsData(): Promise<ItemGroup[]> {
		return unwrapApiResult(await this.getItemGroups());
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

	async getItemsData(
		args: GetItemsArgs,
		signal?: AbortSignal,
	): Promise<Item[]> {
		return unwrapApiResult(await this.getItems(args, signal));
	},

	getItemsCount(
		args: GetItemsCountArgs,
	): Promise<ApiEnvelope<number>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_count",
			args,
		);
	},

	async getItemsCountData(args: GetItemsCountArgs): Promise<number> {
		return unwrapApiResult(await this.getItemsCount(args));
	},

	getItemsFromBarcode(
		args: BarcodeLookupArgs,
	): Promise<ApiEnvelope<Item | null>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_items_from_barcode",
			args,
		);
	},

	async getItemsFromBarcodeData(
		args: BarcodeLookupArgs,
	): Promise<Item | null> {
		return unwrapApiResult(await this.getItemsFromBarcode(args));
	},

	getItemBrand(itemCode: string): Promise<ApiEnvelope<string>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.items.get_item_brand",
			{ item_code: itemCode },
		);
	},

	async getItemBrandData(itemCode: string): Promise<string> {
		return unwrapApiResult(await this.getItemBrand(itemCode));
	},

	getUOMs(): Promise<ApiEnvelope<{ name: string }[]>> {
		return api.callEnvelope("frappe.client.get_list", {
			doctype: "UOM",
			fields: ["name"],
			limit_page_length: 0,
		});
	},

	async getUOMsData(): Promise<{ name: string }[]> {
		return unwrapApiResult(await this.getUOMs());
	},

	createItem(itemData: Partial<Item>): Promise<ApiEnvelope<Item>> {
		return api.callEnvelope("frappe.client.insert", {
			doc: buildItemDoc(itemData),
		});
	},

	async createItemData(itemData: Partial<Item>): Promise<Item> {
		return unwrapApiResult(await this.createItem(itemData));
	},
};

export default itemService;
