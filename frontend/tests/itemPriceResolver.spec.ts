import { describe, expect, it } from "vitest";

import { resolveItemPrice } from "../src/posapp/services/itemPriceResolver";

const baseRecord = {
	name: "IP-BASE",
	price_list: "Retail Selling",
	item_code: "ITEM-1",
	uom: "Nos",
	currency: "PKR",
	customer: null,
	price_list_rate: 10,
	valid_from: null,
	valid_upto: null,
	modified: "2026-06-01 10:00:00",
};

function resolve(overrides: Record<string, unknown> = {}) {
	return resolveItemPrice({
		records: [baseRecord],
		selectedUom: "Box",
		stockUom: "Nos",
		conversionFactor: 12,
		customer: null,
		currency: "PKR",
		postingDate: "2026-06-10",
		fallbackStockUnitRate: 8,
		...overrides,
	});
}

describe("resolveItemPrice", () => {
	it("uses an exact alternate-UOM price without multiplying it again", () => {
		const result = resolve({
			records: [
				baseRecord,
				{
					...baseRecord,
					name: "IP-BOX",
					uom: "Box",
					price_list_rate: 95,
				},
			],
		});

		expect(result).toMatchObject({
			rate: 95,
			source: "exact_uom",
			recordName: "IP-BOX",
		});
	});

	it("prefers a customer-specific exact-UOM price over a generic price", () => {
		const result = resolve({
			customer: "CUST-1",
			records: [
				baseRecord,
				{
					...baseRecord,
					name: "IP-BOX-GENERIC",
					uom: "Box",
					price_list_rate: 95,
				},
				{
					...baseRecord,
					name: "IP-BOX-CUSTOMER",
					uom: "Box",
					customer: "CUST-1",
					price_list_rate: 88,
				},
			],
		});

		expect(result).toMatchObject({
			rate: 88,
			source: "exact_uom",
			recordName: "IP-BOX-CUSTOMER",
		});
	});

	it("uses stock-UOM price multiplied by the selected conversion factor", () => {
		const result = resolve();

		expect(result).toMatchObject({
			rate: 120,
			source: "stock_uom_conversion",
			recordName: "IP-BASE",
		});
	});

	it("ignores expired, future, wrong-customer, and wrong-currency records", () => {
		const result = resolve({
			customer: "CUST-1",
			records: [
				baseRecord,
				{
					...baseRecord,
					name: "IP-EXPIRED",
					uom: "Box",
					customer: "CUST-1",
					price_list_rate: 1,
					valid_upto: "2026-06-09",
				},
				{
					...baseRecord,
					name: "IP-FUTURE",
					uom: "Box",
					customer: "CUST-1",
					price_list_rate: 2,
					valid_from: "2026-06-11",
				},
				{
					...baseRecord,
					name: "IP-OTHER-CUSTOMER",
					uom: "Box",
					customer: "CUST-2",
					price_list_rate: 3,
				},
				{
					...baseRecord,
					name: "IP-USD",
					uom: "Box",
					customer: "CUST-1",
					currency: "USD",
					price_list_rate: 4,
				},
			],
		});

		expect(result).toMatchObject({
			rate: 120,
			source: "stock_uom_conversion",
			recordName: "IP-BASE",
		});
	});

	it("uses deterministic recency ordering for equally specific records", () => {
		const result = resolve({
			records: [
				{
					...baseRecord,
					name: "IP-A",
					uom: "Box",
					price_list_rate: 80,
					valid_from: "2026-05-01",
					modified: "2026-06-09 10:00:00",
				},
				{
					...baseRecord,
					name: "IP-B",
					uom: "Box",
					price_list_rate: 90,
					valid_from: "2026-06-01",
					modified: "2026-06-01 10:00:00",
				},
			],
		});

		expect(result).toMatchObject({
			rate: 90,
			recordName: "IP-B",
		});
	});

	it("uses the stable stock-unit baseline when no Item Price applies", () => {
		const result = resolve({
			records: [],
			fallbackStockUnitRate: 8,
		});

		expect(result).toEqual({
			rate: 96,
			source: "baseline_conversion",
			recordName: null,
		});
	});
});
