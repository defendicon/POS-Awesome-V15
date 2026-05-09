import { describe, expect, it } from "vitest";
import { isReactive } from "vue";
import { useItemsSearch } from "../src/posapp/composables/pos/items/store/useItemsSearch";

describe("item store normalized indexes", () => {
	it("keeps large item indexes non-reactive and exposes domain lookup maps", () => {
		const indexes = useItemsSearch();
		const item = {
			item_code: "ITEM-001",
			item_name: "Blue Widget",
			item_group: "Products",
			barcode: "1234567890123",
			item_barcode: [{ barcode: "ALT-001", uom: "Box" }],
			price_list_rate: 25,
			rate: 25,
			actual_qty: 7,
			warehouse: "Main WH",
			item_uoms: [
				{ uom: "Nos", conversion_factor: 1 },
				{ uom: "Box", conversion_factor: 12 },
			],
		} as any;

		indexes.updateIndexes([item], {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
		} as any);

		expect(isReactive(indexes.itemByCode.value)).toBe(false);
		expect(isReactive(indexes.barcodeToItem.value)).toBe(false);
		expect(indexes.itemByCode.value.get("ITEM-001")).toBe(item);
		expect(indexes.barcodeToItem.value.get("ALT-001")).toBe(item);
		expect(indexes.priceByItemAndPriceList.value.get("Retail::ITEM-001")).toMatchObject({
			rate: 25,
			price_list_rate: 25,
		});
		expect(indexes.stockByItemAndWarehouse.value.get("Main WH::ITEM-001")).toMatchObject({
			actual_qty: 7,
		});
		expect(indexes.uomConversionByItem.value.get("ITEM-001::Box")).toBe(12);
	});

	it("uses the token index to avoid scanning unrelated rows for multi-word search", () => {
		const indexes = useItemsSearch();
		const matching = {
			item_code: "BLUE-001",
			item_name: "Blue Widget",
			item_group: "Products",
		} as any;
		const other = {
			item_code: "RED-001",
			item_name: "Red Widget",
			item_group: "Products",
		} as any;

		indexes.updateIndexes([matching, other], null);

		expect(indexes.performLocalSearch("blue widget", [matching, other], "ALL")).toEqual([
			matching,
		]);
	});
});
