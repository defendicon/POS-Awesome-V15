// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import ItemCard from "../src/posapp/components/pos/items/ItemCard.vue";

describe("item selector secondary currency rate", () => {
	it("derives the secondary selected-currency rate from the original price-list rate", () => {
		const wrapper = mount(ItemCard, {
			props: {
				item: {
					item_code: "ITEM-1",
					item_name: "Test Item",
					original_rate: 40,
					original_currency: "USD",
					price_list_currency: "USD",
					rate: 40,
					currency: "USD",
					actual_qty: 10,
					stock_uom: "Nos",
				},
				posProfile: {
					currency: "USD",
					posa_allow_multi_currency: 1,
				},
				selectedCurrency: "HTG",
				selectedExchangeRate: 135,
				getItemRateInfo: () => ({}),
				currencySymbol: (currency: string) => (currency === "HTG" ? "G " : "$"),
				formatCurrency: (value: number) => String(value),
				formatNumber: (value: number) => String(value),
				ratePrecision: () => 2,
			},
			global: {
				stubs: {
					VImg: true,
					VIcon: true,
					ItemRateInfoMenu: true,
				},
			},
		});

		expect(wrapper.text()).toContain("$40");
		expect(wrapper.text()).toContain("G 5400");
	});

	it("uses the item's stamped exchange rate when the parent prop is stale", () => {
		const wrapper = mount(ItemCard, {
			props: {
				item: {
					item_code: "ITEM-1",
					item_name: "Test Item",
					original_rate: 27.5,
					original_currency: "PKR",
					price_list_currency: "PKR",
					rate: 27.5,
					currency: "USD",
					selected_currency: "USD",
					selected_exchange_rate: 0.003508772,
					actual_qty: 10,
				},
				posProfile: {
					currency: "PKR",
					posa_allow_multi_currency: 1,
				},
				selectedCurrency: "USD",
				selectedExchangeRate: 1,
				getItemRateInfo: () => ({}),
				currencySymbol: (currency: string) => (currency === "USD" ? "$ " : "Rs "),
				formatCurrency: (value: number) => Number(value).toFixed(6),
				formatNumber: (value: number) => String(value),
				ratePrecision: () => 6,
			},
			global: {
				stubs: {
					VImg: true,
					VIcon: true,
					ItemRateInfoMenu: true,
				},
			},
		});

		expect(wrapper.text()).toContain("Rs 27.500000");
		expect(wrapper.text()).toContain("$ 0.096491");
	});
});
