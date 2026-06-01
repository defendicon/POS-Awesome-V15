// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import ItemCard from "../src/posapp/components/pos/items/ItemCard.vue";

describe("ItemCard multi-currency display", () => {
	it("updates secondary price from selected currency rates without relying on stale item.rate", () => {
		vi.stubGlobal("get_currency_symbol", (currency: string) => currency);

		const wrapper = mount(ItemCard, {
			props: {
				item: {
					item_code: "ITEM-USD",
					item_name: "USD Item",
					original_rate: 100,
					original_currency: "USD",
					rate: 999,
					actual_qty: 5,
					stock_uom: "Nos",
				},
				posProfile: {
					currency: "PKR",
					posa_allow_multi_currency: 1,
				},
				selectedCurrency: "PKR",
				selectedExchangeRate: 280,
				selectedConversionRate: 1,
				showRateInfo: false,
				getItemRateInfo: () => null,
				currencySymbol: (currency: string) => currency,
				formatCurrency: (value: number) => String(value),
				formatNumber: (value: number) => String(value),
				ratePrecision: () => 2,
				isNegative: () => false,
			},
			global: {
				stubs: {
					"v-img": { template: "<div><slot /><slot name='placeholder' /></div>" },
					"v-icon": true,
					ItemRateInfoMenu: true,
				},
			},
		});

		expect(wrapper.text()).toContain("USD100");
		expect(wrapper.text()).toContain("PKR28000");
		expect(wrapper.text()).not.toContain("PKR 999");
	});

	it("rounds secondary price with POS Profile currency precision", () => {
		vi.stubGlobal("get_currency_symbol", (currency: string) => currency);

		const wrapper = mount(ItemCard, {
			props: {
				item: {
					item_code: "ITEM-PKR",
					item_name: "PKR Item",
					original_rate: 10,
					original_currency: "PKR",
					rate: 10,
					actual_qty: 5,
					stock_uom: "Nos",
				},
				posProfile: {
					currency: "PKR",
					posa_allow_multi_currency: 1,
					posa_decimal_precision: "2",
				},
				selectedCurrency: "USD",
				selectedExchangeRate: 0.0035714285714285713,
				selectedConversionRate: 280,
				showRateInfo: false,
				getItemRateInfo: () => null,
				currencySymbol: (currency: string) => currency,
				formatCurrency: (value: number, _currency: string, precision: number) =>
					Number(value).toFixed(precision),
				formatNumber: (value: number) => String(value),
				ratePrecision: () => 2,
				isNegative: () => false,
			},
			global: {
				stubs: {
					"v-img": { template: "<div><slot /><slot name='placeholder' /></div>" },
					"v-icon": true,
					ItemRateInfoMenu: true,
				},
			},
		});

		expect(wrapper.text()).toContain("USD0.04");
		expect(wrapper.text()).not.toContain("0.035714");
	});
});
