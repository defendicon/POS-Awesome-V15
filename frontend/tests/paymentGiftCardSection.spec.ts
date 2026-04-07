// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentGiftCardSection from "../src/posapp/components/pos/payments/PaymentGiftCardSection.vue";

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

const VTextFieldStub = defineComponent({
	name: "VTextFieldStub",
	props: {
		modelValue: {
			type: [String, Number],
			default: "",
		},
		label: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue"],
	setup(props, { emit, attrs }) {
		return () =>
			h("input", {
				value: props.modelValue,
				"aria-label": props.label,
				"data-test": attrs["data-test"],
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			});
	},
});

describe("PaymentGiftCardSection", () => {
	beforeEach(() => {
		(window as any).frappe = { _: (value: string) => value };
		(window as any).__ = (value: string) => value;
	});

	it("shows a dedicated gift card action when gift cards are enabled", () => {
		const wrapper = mount(PaymentGiftCardSection, {
			props: {
				enabled: true,
				expanded: false,
				appliedAmount: 0,
				cardCode: "",
				redeemAmount: 0,
				balance: 0,
				status: "",
				loading: false,
				errorMessage: "",
				formatCurrency: (value: number) => String(value),
			},
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Gift Card");
		expect(wrapper.text()).toContain("Apply Gift Card");
		expect(wrapper.find('[data-test="gift-card-code-input"]').exists()).toBe(false);
	});

	it("surfaces the applied gift card amount and code after redemption", () => {
		const wrapper = mount(PaymentGiftCardSection, {
			props: {
				enabled: true,
				expanded: false,
				appliedAmount: 300,
				cardCode: "GC-0001",
				redeemAmount: 300,
				balance: 500,
				status: "Active",
				loading: false,
				errorMessage: "",
				formatCurrency: (value: number) => String(value),
			},
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Applied");
		expect(wrapper.text()).toContain("GC-0001");
		expect(wrapper.text()).toContain("300");
		expect(wrapper.text()).toContain("Edit Gift Application");
	});

	it("expands inline and emits field actions for gift card redemption", async () => {
		const state = {
			cardCode: "",
			redeemAmount: "",
			checkBalanceCount: 0,
			applyCount: 0,
		};
		const wrapper = mount(PaymentGiftCardSection, {
			props: {
				enabled: true,
				expanded: true,
				appliedAmount: 0,
				cardCode: "",
				redeemAmount: 0,
				balance: 500,
				status: "Active",
				loading: false,
				errorMessage: "",
				formatCurrency: (value: number) => String(value),
				"onUpdate:cardCode": (value: string) => {
					state.cardCode = value;
				},
				"onUpdate:redeemAmount": (value: string) => {
					state.redeemAmount = value;
				},
				onCheckBalance: () => {
					state.checkBalanceCount += 1;
				},
				onApply: () => {
					state.applyCount += 1;
				},
			},
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.find('[data-test="gift-card-code-input"]').exists()).toBe(true);
		expect(wrapper.text()).toContain("Check Balance");
		expect(wrapper.text()).toContain("Apply Gift Card");

		const fields = wrapper.findAllComponents(VTextFieldStub);
		fields[0].vm.$emit("update:modelValue", "GC-0020");
		fields[1].vm.$emit("update:modelValue", "150");

		const buttons = wrapper.findAllComponents(VBtnStub);
		buttons[1].vm.$emit("click");
		buttons[2].vm.$emit("click");
		await wrapper.vm.$nextTick();

		expect(state.cardCode).toBe("GC-0020");
		expect(state.redeemAmount).toBe("150");
		expect(state.checkBalanceCount).toBe(1);
		expect(state.applyCount).toBe(1);
	});

	it("emits toggle and clear actions from the section controls", async () => {
		const state = {
			toggleCount: 0,
			clearCount: 0,
		};
		const wrapper = mount(PaymentGiftCardSection, {
			props: {
				enabled: true,
				expanded: true,
				appliedAmount: 300,
				cardCode: "GC-0001",
				redeemAmount: 300,
				balance: 500,
				status: "Active",
				loading: false,
				errorMessage: "",
				formatCurrency: (value: number) => String(value),
				onToggle: () => {
					state.toggleCount += 1;
				},
				onClear: () => {
					state.clearCount += 1;
				},
			},
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		const buttons = wrapper.findAllComponents(VBtnStub);
		buttons[0].vm.$emit("click");
		buttons[3].vm.$emit("click");
		await wrapper.vm.$nextTick();

		expect(state.toggleCount).toBe(1);
		expect(state.clearCount).toBe(1);
	});
});
