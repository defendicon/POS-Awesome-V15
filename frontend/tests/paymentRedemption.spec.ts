// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import PaymentRedemption from "../src/posapp/components/pos/payments/PaymentRedemption.vue";
import paymentsSource from "../src/posapp/components/pos/Payments.vue?raw";

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

	it("keeps loyalty redemption visible when points exist before the amount is calculated", () => {
		const wrapper = mount(PaymentRedemption, {
			props: {
				invoiceDoc: {
					currency: "PKR",
					is_return: 0,
				},
				customerInfo: {
					loyalty_points: 2,
					conversion_factor: 0,
				},
				availablePointsAmount: 0,
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
		expect(wrapper.text()).toContain("You can redeem up to (2 pts)");
	});

	it("hydrates payment customer info from offline cache before checking network state", () => {
		const refreshBlock = paymentsSource.slice(
			paymentsSource.indexOf("const refreshPaymentCustomerInfo"),
			paymentsSource.indexOf("const showDiffPayment"),
		);

		expect(paymentsSource).toContain("getStoredCustomer");
		expect(refreshBlock).toContain("const cachedCustomer = await getStoredCustomer(customer);");
		expect(refreshBlock).toContain("applyPaymentCustomerInfo(cachedCustomer, customer);");
		expect(refreshBlock.indexOf("getStoredCustomer(customer)")).toBeLessThan(
			refreshBlock.indexOf("if (isOffline())"),
		);
	});

	it("does not mark zero loyalty amount as a redemption on the invoice", () => {
		const loyaltyBlock = paymentsSource.slice(
			paymentsSource.indexOf("watch(loyalty_amount"),
			paymentsSource.indexOf("watch(redeemed_customer_credit"),
		);

		expect(loyaltyBlock).toContain("if (amount <= 0)");
		expect(loyaltyBlock.indexOf("if (amount <= 0)")).toBeLessThan(
			loyaltyBlock.indexOf("invoice_doc.value.redeem_loyalty_points = 1"),
		);
	});
});
