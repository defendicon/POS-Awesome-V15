// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentMethods from "../src/features/payments/components/invoice/PaymentMethods.vue";
import GiftCardDialog from "../src/posapp/components/pos/wallet/GiftCardDialog.vue";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VBtnStub = defineComponent({
	name: "VBtnStub",
	emits: ["click"],
	setup(_, { slots, emit }) {
		return () =>
			h(
				"button",
				{
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
	setup(props, { emit }) {
		return () =>
			h("input", {
				value: props.modelValue,
				"aria-label": props.label,
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			});
	},
});

describe("gift card payment UX", () => {
	beforeEach(() => {
		(window as any).frappe = { _: (value: string) => value };
		(window as any).__ = (value: string) => value;
	});

	it("renders a dedicated redeem action for gift card payment rows", async () => {
		const wrapper = mount(PaymentMethods, {
			props: {
				payments: [
					{
						name: "ROW-1",
						mode_of_payment: "Gift Card",
						type: "Bank",
						amount: 0,
						default: 0,
					},
				],
				currency: "PKR",
				isReturn: false,
				requestPaymentField: false,
				currencySymbol: () => "Rs",
				formatCurrency: (value: number) => String(value),
				isNumber: () => true,
				getVisibleDenominations: () => [],
				isCashLikePayment: () => false,
				isMpesaC2bPayment: () => false,
				isGiftCardPayment: (payment: any) =>
					String(payment?.mode_of_payment || "").toLowerCase().includes("gift"),
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VBtn: VBtnStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Redeem / Scan");
		expect((wrapper.get('input[aria-label="Amount"]').element as HTMLInputElement).hasAttribute("readonly")).toBe(true);
	});

	it("shows supervisor issue and top up actions in the gift card dialog", async () => {
		const wrapper = mount(GiftCardDialog, {
			props: {
				modelValue: true,
				cardCode: "GC-0001",
				redeemAmount: 150,
				balance: 500,
				status: "Active",
				isSupervisor: true,
				loading: false,
				mode: "redeem",
			},
			global: {
				components: {
					VDialog: BoxStub,
					VCard: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Issue New Card");
		expect(wrapper.text()).toContain("Top Up Card");
		expect(wrapper.text()).toContain("Check Balance");
		expect(wrapper.text()).toContain("Apply Redemption");
	});
});
