// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentSummary from "../src/posapp/components/pos/payments/PaymentSummary.vue";

const BoxStub = defineComponent({
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
		label: {
			type: String,
			default: "",
		},
	},
	setup(props) {
		return () =>
			h(
				"div",
				{ "data-label": props.label },
				String(props.modelValue ?? ""),
			);
	},
});

describe("PaymentSummary", () => {
	beforeEach(() => {
		(window as any).frappe = { _: (value: string) => value };
	});

	it("does not show the settlement state box when there is still a remaining balance", () => {
		const wrapper = mount(PaymentSummary, {
			props: {
				invoice_doc: {
					currency: "PKR",
					is_return: false,
				},
				total_payments_display: "700",
				diff_payment_display: "200",
				diff_label: "Remaining",
				diffPayment: 200,
				change_due: 0,
				paid_change: 0,
				credit_change: 0,
				paid_change_rules: [],
				currencySymbol: () => "Rs",
				formatCurrency: (value: number) => String(value),
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(
			wrapper.find('[data-test="payment-settlement-state"]').exists(),
		).toBe(false);
	});

	it("does not show the settlement state box when the invoice is fully covered", () => {
		const wrapper = mount(PaymentSummary, {
			props: {
				invoice_doc: {
					currency: "PKR",
					is_return: false,
				},
				total_payments_display: "900",
				diff_payment_display: "0",
				diff_label: "Remaining",
				diffPayment: 0,
				change_due: 0,
				paid_change: 0,
				credit_change: 0,
				paid_change_rules: [],
				currencySymbol: () => "Rs",
				formatCurrency: (value: number) => String(value),
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(
			wrapper.find('[data-test="payment-settlement-state"]').exists(),
		).toBe(false);
	});

	it("shows applied gift card details inside the payment summary", () => {
		const wrapper = mount(PaymentSummary, {
			props: {
				invoice_doc: {
					currency: "PKR",
					is_return: false,
				},
				total_payments_display: "900",
				diff_payment_display: "0",
				diff_label: "Remaining",
				diffPayment: -80,
				change_due: 0,
				paid_change: 0,
				credit_change: 0,
				paid_change_rules: [],
				currencySymbol: () => "Rs",
				formatCurrency: (value: number) => String(value),
				giftCardAppliedAmount: 300,
				giftCardCode: "GC-0001",
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Gift Card Applied");
		expect(wrapper.text()).toContain("GC-0001");
		expect(wrapper.text()).toContain("300");
		expect(wrapper.text()).toContain("Included in settlement");
		expect(
			wrapper.find('[data-test="payment-settlement-state"]').exists(),
		).toBe(false);
	});

	it("shows exact base change when invoice currency rounds the difference to zero", () => {
		const wrapper = mount(PaymentSummary, {
			props: {
				invoice_doc: { currency: "USD", is_return: false },
				total_payments_display: "0.42",
				diff_payment_display: "0.00",
				diff_label: "Change (USD)",
				diffPayment: 0,
				change_due: 0,
				baseSettlement: { difference: -0.05, change: 0.05 },
				baseCurrency: "PKR",
				paid_change: 0,
				credit_change: 0,
				paid_change_rules: [],
				currencySymbol: (currency: string) =>
					currency === "PKR" ? "Rs" : "$",
				formatCurrency: (value: number) => Number(value).toFixed(2),
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(
			wrapper.get('[data-test="payment-base-settlement"]').text(),
		).toContain("Base Change");
		expect(
			wrapper.get('[data-test="payment-base-settlement"]').text(),
		).toContain("Rs 0.05");
	});

	it("shows the exchange calculation and labels only the net amount as collected", () => {
		const wrapper = mount(PaymentSummary, {
			props: {
				invoice_doc: {
					currency: "PKR",
					is_return: false,
					rounded_total: 50,
				},
				total_payments_display: "0",
				diff_payment_display: "0",
				diff_label: "Remaining",
				diffPayment: 0,
				change_due: 0,
				paid_change: 0,
				credit_change: 0,
				paid_change_rules: [],
				currencySymbol: () => "Rs",
				formatCurrency: (value: number) => String(value),
				exchangeActive: true,
				exchangeCredit: 50,
				exchangeSettlementAmount: 0,
				exchangeSettlementLabel: "Even exchange",
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		const exchangeSummary = wrapper.get(
			'[data-test="exchange-payment-summary"]',
		);
		expect(exchangeSummary.text()).toContain("Replacement saleRs 50");
		expect(exchangeSummary.text()).toContain("Return creditRs 50");
		expect(exchangeSummary.text()).toContain("Even exchangeRs 0");
		expect(
			wrapper.find('[data-label="Collected from customer"]').exists(),
		).toBe(true);
	});
});
