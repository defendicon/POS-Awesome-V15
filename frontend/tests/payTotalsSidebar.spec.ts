// @vitest-environment jsdom

import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import PayTotalsSidebar from "../src/features/payments/components/workspace/PayTotalsSidebar.vue";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VSwitchStub = defineComponent({
	name: "VSwitchStub",
	props: {
		modelValue: {
			type: Boolean,
			default: undefined,
		},
		label: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue"],
	setup(props, { attrs, emit }) {
		return () =>
			h("label", {}, [
				h("input", {
					type: "checkbox",
					checked: props.modelValue ?? true,
					"data-test": attrs["data-test"],
					"aria-label": props.label,
					onInput: (event: Event) =>
						emit("update:modelValue", (event.target as HTMLInputElement).checked),
				}),
				props.label,
			]);
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
	setup(props, { attrs, emit }) {
		return () =>
			h("input", {
				value: props.modelValue,
				"data-test": attrs["data-test"],
				"aria-label": props.label,
				readonly: attrs.readonly,
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			});
	},
});

const VueDatePickerStub = defineComponent({
	name: "VueDatePickerStub",
	props: {
		modelValue: {
			type: String,
			default: "",
		},
		placeholder: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue"],
	setup(props, { attrs, emit }) {
		return () =>
			h("input", {
				value: props.modelValue,
				"data-test": attrs["data-test"],
				"aria-label": props.placeholder || attrs["aria-label"] || "",
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			});
	},
});

const mountSidebar = (props: Record<string, unknown> = {}) =>
	mount(PayTotalsSidebar, {
		props: {
			posProfile: {
				posa_allow_make_new_payments: 1,
			},
			totalSelectedInvoices: 0,
			selectedInvoicesCount: 0,
			totalSelectedPayments: 0,
			totalSelectedMpesa: 0,
			paymentMethods: [],
			filteredPaymentMethods: [],
			invoiceTotalCurrency: "USD",
			paymentTotalCurrency: "USD",
			mpesaTotalCurrency: "USD",
			companyCurrency: "USD",
			exchangeRate: 1,
			exchangeRateLoading: false,
			exchangeRateError: "",
			requiresExchangeRate: false,
			totalOfDiff: 0,
			referenceNo: "",
			referenceDate: "",
			currencySymbol: () => "$",
			formatCurrency: (value: number) => String(value),
			getPaymentMethodCurrency: () => "USD",
			...props,
		},
		global: {
			components: {
				VRow: BoxStub,
				VCol: BoxStub,
				VDivider: BoxStub,
				VTextField: VTextFieldStub,
				VBtn: BoxStub,
				VIcon: BoxStub,
				VSwitch: VSwitchStub,
			},
			stubs: {
				VueDatePicker: VueDatePickerStub,
			},
			config: {
				globalProperties: {
					__: (value: string) => value,
				},
			},
		},
	});

describe("PayTotalsSidebar", () => {
	it("shows the auto allocate toggle enabled by default with english helper text", () => {
		const wrapper = mountSidebar();

		const toggle = wrapper.get('input[data-test="auto-allocate-payment-toggle"]');
		expect((toggle.element as HTMLInputElement).checked).toBe(true);
		expect(wrapper.text()).toContain("Auto Allocate Payment Amount");
		expect(wrapper.text()).toContain(
			"Unselected payments stay unallocated first, then auto reconcile after submit.",
		);
	});

	it("normalizes a typed reference date to backend format", () => {
		const wrapper = mountSidebar();

		wrapper.get('[data-test="reference-date-input"]');
		const normalized = (
			wrapper.vm as unknown as { updateReferenceDate: (_value: string) => void }
		).updateReferenceDate("03-04-2026");

		expect(normalized).toBe("2026-04-03");
	});
});
