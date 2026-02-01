import api from "./api";
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
  getItemGroups(): Promise<ItemGroup[]> {
    return api.call("posawesome.posawesome.api.items.get_items_groups");
  },

  getItems(args: GetItemsArgs, signal?: AbortSignal): Promise<Item[]> {
    return api.call("posawesome.posawesome.api.items.get_items", args, { signal });
  },

  getItemsFromBarcode(args: { selling_price_list: string; currency: string; barcode: string }): Promise<Item | null> {
    return api.call("posawesome.posawesome.api.items.get_items_from_barcode", args);
  },

  getItemBrand(itemCode: string): Promise<string> {
    return api.call("posawesome.posawesome.api.items.get_item_brand", { item_code: itemCode });
  },

  getUOMs(): Promise<{ name: string }[]> {
    return api.call("frappe.client.get_list", {
      doctype: "UOM",
      fields: ["name"],
      limit_page_length: 0,
    });
  },

  createItem(itemData: Partial<Item>): Promise<Item> {
    return api.call("frappe.client.insert", {
      doc: {
        doctype: "Item",
        is_stock_item: 1,
        ...itemData,
      },
    });
  }
};

export default itemService;
