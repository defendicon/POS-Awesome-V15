import { describe, expect, it } from "vitest";

import { useItemRateInfo } from "../src/posapp/composables/pos/items/useItemRateInfo";

describe("useItemRateInfo", () => {
	it("shows only last invoice rate for cashiers", () => {
		const rateInfo = useItemRateInfo({
			context: () => "pos",
			pos_profile: () => ({
				currency: "PKR",
				company_currency: "PKR",
			}),
			is_pos_supervisor: () => false,
			getLastInvoiceRate: () => ({
				rate: 120,
				currency: "PKR",
				uom: "Nos",
				invoice: "SINV-001",
				posting_date: "2026-04-17",
			}),
			getLastBuyingRate: () => ({
				rate: 80,
				currency: "PKR",
				uom: "Nos",
				invoice: "PINV-001",
				posting_date: "2026-04-16",
				supplier: "Supp-1",
			}),
		});

		const payload = rateInfo.getItemRateInfo({
			item_code: "ITEM-001",
			stock_uom: "Nos",
			manufacturing_cost: 75,
			manufacturing_cost_source: "bom",
			manufacturing_bom: "BOM-ITEM-001",
		});

		expect(payload.entries.map((entry) => entry.key)).toEqual(["sale"]);
		expect(payload.lastSale.visible).toBe(true);
		expect(payload.lastPurchase.visible).toBe(false);
		expect(payload.cost.visible).toBe(false);
	});

	it("shows sale, purchase, and manufacturing cost for supervisors", () => {
		const rateInfo = useItemRateInfo({
			context: () => "pos",
			pos_profile: () => ({
				currency: "PKR",
				company_currency: "PKR",
			}),
			is_pos_supervisor: () => true,
			getLastInvoiceRate: () => ({
				rate: 120,
				currency: "PKR",
				uom: "Nos",
				invoice: "SINV-001",
				posting_date: "2026-04-17",
			}),
			getLastBuyingRate: () => null,
		});

		const payload = rateInfo.getItemRateInfo({
			item_code: "ITEM-001",
			stock_uom: "Nos",
			manufacturing_cost: 75,
			manufacturing_cost_source: "bom",
			manufacturing_bom: "BOM-ITEM-001",
		});

		expect(payload.entries.map((entry) => entry.key)).toEqual([
			"sale",
			"purchase",
			"cost",
		]);
		expect(payload.lastSale.available).toBe(true);
		expect(payload.lastSale.rate).toBe(120);
		expect(payload.lastSale.source).toBe("SINV-001");
		expect(payload.lastPurchase.available).toBe(false);
		expect(payload.lastPurchase.rowLabel).toBe("Last Purchase Rate");
		expect(payload.cost.available).toBe(true);
		expect(payload.cost.rate).toBe(75);
		expect(payload.cost.rowLabel).toBe("Manufacturing Cost");
		expect(payload.cost.sourceKey).toBe("bom");
		expect(payload.cost.source).toBe("BOM-ITEM-001");
	});

	it("falls back to standard rate before valuation rate when bom cost is unavailable", () => {
		const rateInfo = useItemRateInfo({
			context: () => "purchase",
			pos_profile: () => ({
				currency: "PKR",
				company_currency: "PKR",
			}),
			is_pos_supervisor: () => true,
			getLastInvoiceRate: () => null,
			getLastBuyingRate: () => ({
				rate: 98,
				currency: "PKR",
				uom: "Kg",
				source: "price_list",
				posting_date: "2026-04-10",
				supplier: "Supp-1",
			}),
		});

		const payload = rateInfo.getItemRateInfo({
			item_code: "ITEM-002",
			purchase_uom: "Kg",
			standard_rate: 64,
			valuation_rate: 64,
		});

		expect(payload.lastSale.available).toBe(false);
		expect(payload.lastPurchase.available).toBe(true);
		expect(payload.lastPurchase.source).toBe("Supplier Price List");
		expect(payload.cost.available).toBe(true);
		expect(payload.cost.rate).toBe(64);
		expect(payload.cost.rowLabel).toBe("Cost");
		expect(payload.cost.sourceKey).toBe("standard_rate");
		expect(payload.cost.source).toBe("Standard Rate");
	});

	it("falls back to valuation rate when bom and standard rate are unavailable", () => {
		const rateInfo = useItemRateInfo({
			context: () => "purchase",
			pos_profile: () => ({
				currency: "PKR",
				company_currency: "PKR",
			}),
			is_pos_supervisor: () => true,
			getLastInvoiceRate: () => null,
			getLastBuyingRate: () => null,
		});

		const payload = rateInfo.getItemRateInfo({
			item_code: "ITEM-003",
			stock_uom: "Kg",
			valuation_rate: 52,
		});

		expect(payload.cost.available).toBe(true);
		expect(payload.cost.rowLabel).toBe("Cost");
		expect(payload.cost.sourceKey).toBe("valuation_rate");
		expect(payload.cost.source).toBe("Valuation Rate");
	});
});
