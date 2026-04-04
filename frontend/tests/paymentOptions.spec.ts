// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentOptions from "../src/posapp/components/pos/payments/PaymentOptions.vue";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VSwitchStub = defineComponent({
	name: "VSwitchStub",
	props: {
		label: {
			type: String,
			default: "",
		},
		modelValue: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["update:modelValue"],
	setup(props, { emit }) {
		return () =>
			h("label", {}, [
				h("input", {
					type: "checkbox",
					checked: props.modelValue,
					onChange: (event: Event) =>
						emit("update:modelValue", (event.target as HTMLInputElement).checked),
				}),
				props.label,
			]);
	},
});

const VueDatePickerStub = defineComponent({
	setup() {
		return () => h("div");
	},
});

const VTextFieldStub = defineComponent({
	setup() {
		return () => h("input");
	},
});

describe("PaymentOptions", () => {
	beforeEach(() => {
		(window as any).frappe = { _: (value: string) => value };
		(globalThis as any).frappe = { _: (value: string) => value };
	});

	it("surfaces customer credit summary details when credit redemption is enabled", () => {
		const wrapper = mount(PaymentOptions, {
			props: {
				invoiceDoc: {
					is_return: 0,
				},
				posProfile: {
					use_customer_credit: 1,
				},
				redeemCustomerCredit: true,
				availableCustomerCredit: 850,
				redeemedCustomerCredit: 300,
				customerCreditSources: 2,
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VSwitch: VSwitchStub,
					VTextField: VTextFieldStub,
					VChip: BoxStub,
					VueDatePicker: VueDatePickerStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Use Customer Credit");
		expect(wrapper.text()).toContain("Customer Credit Ready");
		expect(wrapper.text()).toContain("Available balance");
		expect(wrapper.text()).toContain("Applied now");
		expect(wrapper.text()).toContain("2 source(s)");
	});
});
