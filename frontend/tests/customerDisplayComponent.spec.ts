// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import CustomerDisplay from "../src/posapp/components/customer_display/CustomerDisplay.vue";
import {
	createCustomerDisplayTransport,
	type CustomerDisplaySnapshot,
} from "../src/posapp/utils/customerDisplay";

vi.mock("vue-router", () => ({
	useRoute: () => ({ query: { channel: "cd_summary" } }),
}));

const summarySnapshot: CustomerDisplaySnapshot = {
	channel_id: "cd_summary",
	currency: "USD",
	customer_name: "Walk-in",
	items: [
		{
			id: "1",
			item_code: "ITEM-1",
			item_name: "Item 1",
			qty: 2,
			rate: 50,
			amount: 100,
			uom: "Nos",
		},
	],
	total_qty: 2,
	total_amount: 105,
	totals_summary: {
		item_total: 100,
		item_discount_total: 10,
		additional_discount: 5,
		delivery_charges: 2,
		tax_total: 8,
		grand_total: 105,
		rounded_total: null,
	},
	updated_at: "2026-02-16T10:00:00.000Z",
};

describe("CustomerDisplay", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
		delete (globalThis as any).__;
		vi.restoreAllMocks();
	});

	it("shows discounts, delivery charges, taxes, and grand total in the totals summary", () => {
		const transport = createCustomerDisplayTransport("cd_summary");
		transport.publish(summarySnapshot);

		const wrapper = mount(CustomerDisplay, {
			global: {
				mocks: {
					__: (value: string) => value,
				},
			},
		});

		expect(wrapper.text()).toContain("Totals Summary");
		expect(wrapper.text()).toContain("Items Total");
		expect(wrapper.text()).toContain("Item / Rate Discounts");
		expect(wrapper.text()).toContain("Additional Discount");
		expect(wrapper.text()).toContain("Delivery Charges");
		expect(wrapper.text()).toContain("Taxes");
		expect(wrapper.text()).toContain("Grand Total");
		expect(wrapper.find(".display-summary-row--grand").text()).toContain("$105.00");

		wrapper.unmount();
		transport.close();
	});
});
