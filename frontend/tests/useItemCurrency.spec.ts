import { describe, expect, it } from "vitest";

import { useItemCurrency } from "../src/posapp/composables/pos/items/useItemCurrency";

describe("useItemCurrency", () => {
	const context = {
		pos_profile: { currency: "USD" },
		price_list_currency: "USD",
		selected_currency: "HTG",
		exchange_rate: 135,
		conversion_rate: 1 / 135,
		currency_precision: 2,
		flt: (value: unknown, precision = 2) => Number(Number(value || 0).toFixed(precision)),
	};

	it("converts item selector secondary rate from price-list currency to selected currency", () => {
		const item = {
			item_code: "ITEM-1",
			price_list_rate: 40,
			rate: 40,
			price_list_currency: "USD",
			currency: "USD",
		};

		useItemCurrency().applyCurrencyConversionToItem(item, context);

		expect(item.original_rate).toBe(40);
		expect(item.original_currency).toBe("USD");
		expect(item.rate).toBe(5400);
		expect(item.currency).toBe("HTG");
		expect(item.base_rate).toBeCloseTo(40, 6);
	});

	it("does not reuse an already converted selected-currency rate as the original rate", () => {
		const item = {
			item_code: "ITEM-1",
			rate: 5400,
			currency: "HTG",
			price_list_currency: "USD",
			base_price_list_rate: 40,
		};

		useItemCurrency().applyCurrencyConversionToItem(item, context);

		expect(item.original_rate).toBe(40);
		expect(item.original_currency).toBe("USD");
		expect(item.rate).toBe(5400);
	});
});
