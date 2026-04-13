// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentMethods from "../src/features/payments/components/invoice/PaymentMethods.vue";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

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

describe("PaymentMethods", () => {
	beforeEach(() => {
		(window as any).__ = (value: string) => value;
		(window as any).frappe = {
			_: (value: string) => value,
		};
	});

	it("does not show exact and remaining quick tender actions under the payment method button", async () => {
		const wrapper = mount(PaymentMethods, {
			props: {
				payments: [
					{
						name: "PAY-1",
						mode_of_payment: "Cash",
						type: "Cash",
						amount: 0,
						default: 1,
					},
				],
				currency: "PKR",
				isReturn: false,
				requestPaymentField: false,
				currencySymbol: () => "Rs ",
				formatCurrency: (value: number) => String(value),
				isNumber: () => true,
				getVisibleDenominations: () => [500, 1000],
				isCashLikePayment: () => true,
				isMpesaC2bPayment: () => false,
				isGiftCardPayment: () => false,
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VBtn: VBtnStub,
					VTextField: BoxStub,
				},
			},
		});

		expect(wrapper.text()).toContain("500");
		expect(wrapper.text()).toContain("1000");

		expect(wrapper.find('[data-test="payment-method-exact-Cash"]').exists()).toBe(false);
		expect(wrapper.find('[data-test="payment-method-remaining-Cash"]').exists()).toBe(false);
	});
});
