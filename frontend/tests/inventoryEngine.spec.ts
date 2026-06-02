import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	applyInventoryDeltas,
	db,
	getInventoryDiagnostics,
	getItemRate,
	hydrateOperationalIndexFromSnapshot,
	lookupBarcodeExact,
	lookupItemCodeExact,
	resetInventoryEngine,
	saveOperationalItemsFromRaw,
	searchItemsLocal,
} from "../src/offline";

const scope = "POS_PROFILE_MAIN_WAREHOUSE";

const items = [
	{
		item_code: "MILK-001",
		item_name: "Fresh Milk One Liter",
		item_group: "Dairy",
		barcode: "100000000001",
		item_barcode: [{ barcode: "200000000001", uom: "Box" }],
		stock_uom: "Nos",
		item_uoms: [
			{ uom: "Nos", conversion_factor: 1 },
			{ uom: "Box", conversion_factor: 12 },
		],
		rate: 10,
		price_list_rate: 10,
		actual_qty: 50,
		is_stock_item: 1,
	},
	{
		item_code: "BREAD-001",
		item_name: "Brown Bread",
		item_group: "Bakery",
		barcode: "100000000002",
		stock_uom: "Nos",
		rate: 4,
		price_list_rate: 4,
		actual_qty: 20,
		is_stock_item: 1,
	},
	{
		item_code: "DISABLED-001",
		item_name: "Disabled Item",
		item_group: "Dairy",
		barcode: "100000000003",
		disabled: 1,
		rate: 1,
	},
];

describe("local inventory engine", () => {
	beforeEach(async () => {
		await db.open();
		await db.table("items").clear();
		await db.table("operational_items").clear();
		resetInventoryEngine();
		await saveOperationalItemsFromRaw(items, scope);
		await hydrateOperationalIndexFromSnapshot(scope);
	});

	it("hydrates a persisted operational index and exposes readiness diagnostics", () => {
		const diagnostics = getInventoryDiagnostics();
		expect(diagnostics.ready).toBe(true);
		expect(diagnostics.scope).toBe(scope);
		expect(diagnostics.indexedItemCount).toBe(2);
		expect(diagnostics.barcodeCount).toBeGreaterThanOrEqual(3);
	});

	it("resolves exact item codes and barcodes without full search", () => {
		expect(lookupItemCodeExact("MILK-001", scope)?.item_name).toBe("Fresh Milk One Liter");
		expect(lookupBarcodeExact("200000000001", scope)?.item_code).toBe("MILK-001");
		expect(lookupBarcodeExact("100000000003", scope)).toBeNull();
	});

	it("returns limited ranked autocomplete results", () => {
		const results = searchItemsLocal("fresh milk", {
			scope,
			limit: 5,
		});
		expect(results.map((item) => item.item_code)).toEqual(["MILK-001"]);
	});

	it("uses local rate and UOM context for operational rate lookup", () => {
		expect(getItemRate("MILK-001", { scope })).toBe(10);
		expect(getItemRate("MILK-001", { scope, uom: "Box" })).toBe(120);
	});

	it("applies item deltas and tombstones without a full reload", async () => {
		await applyInventoryDeltas({
			scope,
			source: "test",
			changed: [
				{
					item_code: "MILK-001",
					item_name: "Fresh Milk Updated",
					item_group: "Dairy",
					barcode: "100000000001",
					stock_uom: "Nos",
					rate: 11,
					price_list_rate: 11,
				},
			],
			deletedItemCodes: ["BREAD-001"],
		});

		expect(lookupItemCodeExact("MILK-001", scope)?.item_name).toBe("Fresh Milk Updated");
		expect(getItemRate("MILK-001", { scope })).toBe(11);
		expect(lookupItemCodeExact("BREAD-001", scope)).toBeNull();
		expect(getInventoryDiagnostics().fullReloadAvoidedCount).toBeGreaterThan(0);
	});
});
