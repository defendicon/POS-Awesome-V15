// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import ParkedOrdersRail from "../src/posapp/components/pos/invoice/ParkedOrdersRail.vue";

const VBtnStub = defineComponent({
	name: "VBtnStub",
	props: {
		disabled: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["click"],
	setup(props, { slots, emit, attrs }) {
		return () =>
			h(
				"button",
				{
					type: "button",
					disabled: props.disabled,
					"data-test": attrs["data-test"],
					onClick: () => emit("click"),
				},
				slots.default?.(),
			);
	},
});

const mountRail = (props: Record<string, unknown> = {}) =>
	mount(ParkedOrdersRail, {
		props: {
			parkedOrders: [
				{
					name: "ACC-SINV-0001",
					customer_name: "Walk-in Customer",
					posting_date: "2026-04-04",
					posting_time: "10:15:00.000000",
					grand_total: 450,
					currency: "PKR",
				},
				{
					name: "ACC-SINV-0002",
					customer_name: "Ali Traders",
					posting_date: "2026-04-04",
					posting_time: "10:45:00.000000",
					grand_total: 820,
					currency: "PKR",
				},
			],
			formatCurrency: (value: number) => String(value),
			currencySymbol: () => "Rs ",
			...props,
		},
		global: {
			components: {
				VBtn: VBtnStub,
			},
		},
	});

describe("ParkedOrdersRail", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(window as any).__ = (value: string) => value;
	});

	it("renders parked orders with a count and quick resume action", () => {
		const wrapper = mountRail();

		expect(wrapper.text()).toContain("Parked Orders");
		expect(wrapper.text()).toContain("2");
		expect(wrapper.text()).toContain("Walk-in Customer");
		expect(wrapper.get('[data-test="parked-order-card-ACC-SINV-0001"]').exists()).toBe(true);
	});

	it("exposes a view all action for the existing drafts dialog", () => {
		const wrapper = mountRail();

		expect(wrapper.get('[data-test="parked-orders-view-all"]').exists()).toBe(true);
	});
});
