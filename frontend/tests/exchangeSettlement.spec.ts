import { describe, expect, it } from "vitest";

import { getExchangeSettlement } from "../src/posapp/utils/exchangeSettlement";

describe("exchange settlement", () => {
	it("returns only the positive difference as customer payment", () => {
		expect(getExchangeSettlement(1600, 1500, 3)).toEqual({
			saleTotal: 1600,
			returnTotal: 1500,
			difference: 100,
			amount: 100,
			type: "payment",
		});
	});

	it("keeps excess return value as customer credit", () => {
		expect(getExchangeSettlement(1200, 1500, 2)).toMatchObject({
			difference: -300,
			amount: 300,
			type: "credit",
		});
	});

	it("treats a currency-rounded zero difference as an even exchange", () => {
		expect(getExchangeSettlement(10.004, 10, 2)).toMatchObject({
			difference: 0,
			amount: 0,
			type: "even",
		});
	});

	it("normalizes invalid and signed totals", () => {
		expect(getExchangeSettlement(-50, Number.NaN, 2)).toMatchObject({
			saleTotal: 50,
			returnTotal: 0,
			difference: 50,
			type: "payment",
		});
	});
});
