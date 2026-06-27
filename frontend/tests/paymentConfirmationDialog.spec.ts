// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentConfirmationDialog from "../src/posapp/components/pos/payments/PaymentConfirmationDialog.vue";

const BoxStub = defineComponent({
	props: {
		modelValue: {
			type: Boolean,
			default: true,
		},
	},
	setup(props, { slots }) {
		return () =>
			props.modelValue ? h("div", {}, slots.default?.()) : h("div", {});
	},
});

const VTextFieldStub = defineComponent({
	props: {
		modelValue: {
			type: [String, Number],
			default: "",
		},
	},
	emits: ["update:modelValue", "focus", "keydown"],
	setup(props, { emit }) {
		return () =>
			h("input", {
				"data-test": "payment-confirmation-amount-input",
				value: props.modelValue,
				onInput: (event: Event) =>
					emit(
						"update:modelValue",
						(event.target as HTMLInputElement).value,
					),
				onFocus: (event: FocusEvent) => emit("focus", event),
				onKeydown: (event: KeyboardEvent) => emit("keydown", event),
			});
	},
});

const VBtnStub = defineComponent({
	emits: ["click"],
	setup(_, { slots, emit, attrs }) {
		return () =>
			h(
				"button",
				{
					type: "button",
					"data-test": attrs["data-test"],
					onClick: (event: MouseEvent) => {
						emit("click", event);
						const attrClick = attrs.onClick as
							| ((_event: MouseEvent) => void)
							| undefined;
						attrClick?.(event);
					},
				},
				slots.default?.(),
			);
	},
});

const mountDialog = (props = {}) =>
	mount(PaymentConfirmationDialog, {
		props: {
			modelValue: true,
			amount: 125,
			currencySymbol: "Rs ",
			...props,
		},
		global: {
			components: {
				VDialog: BoxStub,
				VCard: BoxStub,
				VCardTitle: BoxStub,
				VCardText: BoxStub,
				VCardActions: BoxStub,
				VSpacer: BoxStub,
				VTextField: VTextFieldStub,
				VBtn: VBtnStub,
			},
		},
	});

describe("PaymentConfirmationDialog", () => {
	it("lets the cashier choose a tender cash suggestion", async () => {
		const wrapper = mountDialog({
			tenderSuggestions: [130, 150],
		});

		await wrapper
			.get('[data-test="payment-confirmation-tender-150"]')
			.trigger("click");

		expect(
			(
				wrapper.get('[data-test="payment-confirmation-amount-input"]')
					.element as HTMLInputElement
			).value,
		).toBe("150");
	});

	it("hides the tender cash section when there are no suggestions", () => {
		const wrapper = mountDialog({ tenderSuggestions: [] });

		expect(
			wrapper.find('[data-test="payment-confirmation-tender"]').exists(),
		).toBe(false);
	});
});
