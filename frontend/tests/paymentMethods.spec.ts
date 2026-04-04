// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentMethods from "../src/posapp/components/pos/payments/PaymentMethods.vue";

const VRowStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VColStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VTextFieldStub = defineComponent({
	name: "VTextFieldStub",
	props: {
		modelValue: {
			type: [String, Number],
			default: "",
		},
	},
	emits: ["change", "focus"],
	setup(props, { emit }) {
		return () =>
			h("input", {
				value: props.modelValue,
				onChange: (event: Event) => emit("change", event),
				onFocus: () => emit("focus"),
			});
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
	setup(props, { attrs, slots, emit }) {
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

const mountMethods = () =>
	mount(PaymentMethods, {
		props: {
			payments: [
				{
					name: "cash-1",
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
			getVisibleDenominations: () => [],
			isCashLikePayment: () => true,
			isMpesaC2bPayment: () => false,
		},
		global: {
			components: {
				VRow: VRowStub,
				VCol: VColStub,
				VTextField: VTextFieldStub,
				VBtn: VBtnStub,
			},
		},
	});

describe("PaymentMethods", () => {
	beforeEach(() => {
		(globalThis as any).frappe = { _: (value: string) => value };
		(globalThis as any).__ = (value: string) => value;
		(window as any).frappe = { _: (value: string) => value };
		(window as any).__ = (value: string) => value;
	});

	it("renders cashier quick actions for full due and remaining amount", () => {
		const wrapper = mountMethods();

		expect(wrapper.text()).toContain("Full Due");
		expect(wrapper.text()).toContain("Remaining");
		expect(wrapper.get('[data-test="payment-full-due-Cash"]').exists()).toBe(true);
		expect(wrapper.get('[data-test="payment-remaining-Cash"]').exists()).toBe(true);
	});
});
