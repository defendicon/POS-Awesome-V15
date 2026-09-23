// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import ExchangeStatusPanel from "../src/posapp/components/pos/exchange/ExchangeStatusPanel.vue";

const BoxStub = defineComponent({
	setup(_, { attrs, slots }) {
		return () => h("button", attrs, slots.default?.());
	},
});

describe("ExchangeStatusPanel", () => {
	beforeEach(() => {
		(window as any).__ = (value: string) => value;
		(globalThis as any).__ = (value: string) => value;
	});

	it("shows the replacement, return credit, and net customer payment", () => {
		const wrapper = mount(ExchangeStatusPanel, {
			props: {
				stage: "sale",
				returnTotal: 1500,
				saleTotal: 1600,
				currencySymbol: "Rs ",
				formatAmount: (value: number) => value.toFixed(3),
			},
			global: {
				components: { VIcon: BoxStub, VBtn: BoxStub },
			},
		});

		const ledger = wrapper.get(
			'[data-testid="exchange-settlement-ledger"]',
		);
		expect(ledger.text()).toContain("Replacement saleRs 1600.000");
		expect(ledger.text()).toContain("Return creditRs 1500.000");
		expect(ledger.text()).toContain("Customer paysRs 100.000");
		expect(wrapper.text()).toContain("Step 2 of 2");
	});

	it("shows an even exchange instead of a zero customer payment", () => {
		const wrapper = mount(ExchangeStatusPanel, {
			props: {
				stage: "sale",
				returnTotal: 50,
				saleTotal: 50,
				currencySymbol: "Rs ",
				formatAmount: (value: number) => value.toFixed(2),
			},
			global: {
				components: { VIcon: BoxStub, VBtn: BoxStub },
			},
		});

		expect(wrapper.text()).toContain("Even exchangeRs 0.00");
		expect(wrapper.classes()).toContain("exchange-panel--even");
	});
});
