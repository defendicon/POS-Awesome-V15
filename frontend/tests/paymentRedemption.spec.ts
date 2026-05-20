// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentRedemption from "../src/posapp/components/pos/payments/PaymentRedemption.vue";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VTextFieldStub = defineComponent({
	props: {
		label: {
			type: String,
			default: "",
		},
		modelValue: {
			type: [String, Number],
			default: "",
		},
	},
	setup(props) {
		return () =>
			h("label", {}, [
				props.label,
				h("input", {
					value: props.modelValue,
				}),
			]);
	},
});

describe("PaymentRedemption", () => {
	beforeEach(() => {
		(window as any).frappe = { _: (value: string) => value };
	});

	it("shows loyalty point redemption during checkout when the customer has redeemable points", () => {
		const wrapper = mount(PaymentRedemption, {
			props: {
				invoiceDoc: {
					currency: "PKR",
					is_return: 0,
				},
				customerInfo: {
					loyalty_points: 50,
					conversion_factor: 2,
				},
				availablePointsAmount: 100,
				loyaltyAmount: 0,
				formatCurrency: (value: number) => String(value),
				formatFloat: (value: number) => String(value),
				currencySymbol: () => "Rs",
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Redeem Loyalty Points");
		expect(wrapper.text()).toContain("You can redeem up to (50 pts)");
		expect(wrapper.findAll("input")[1].element.value).toBe("100");
	});
});
