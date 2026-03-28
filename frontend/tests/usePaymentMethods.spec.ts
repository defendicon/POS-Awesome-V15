import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { usePaymentMethods } from "../src/posapp/composables/pos/payments/usePaymentMethods";

const getSmartTenderSuggestionsMock = vi.fn();

vi.mock("../src/utils/smartTender", () => ({
	getSmartTenderSuggestions: (...args: any[]) =>
		getSmartTenderSuggestionsMock(...args),
}));

describe("usePaymentMethods", () => {
	it("sets the selected payment method to the post-credit outstanding amount", () => {
		const invoiceDoc = ref<any>({
			rounded_total: 500,
			grand_total: 500,
			conversion_rate: 1,
			payments: [
				{
					mode_of_payment: "Cash",
					type: "Cash",
					amount: 250,
					base_amount: 250,
					default: 1,
				},
				{
					mode_of_payment: "Card",
					type: "Bank",
					amount: 0,
					base_amount: 0,
				},
			],
		});

		const { set_full_amount } = usePaymentMethods({
			invoiceDoc,
			posProfile: ref({}),
			diffPayment: computed(() => 0),
			getNetInvoiceAmount: () => 250,
			stores: {
				toastStore: { show: () => undefined },
				uiStore: { freeze: () => undefined, unfreeze: () => undefined },
			},
		});

		set_full_amount(invoiceDoc.value.payments[1]);

		expect(invoiceDoc.value.payments[0].amount).toBe(0);
		expect(invoiceDoc.value.payments[1].amount).toBe(250);
		expect(invoiceDoc.value.payments[1].base_amount).toBe(250);
	});

	it("fills only the remaining outstanding amount after redeemed credit and other payments", () => {
		const invoiceDoc = ref<any>({
			rounded_total: 500,
			grand_total: 500,
			conversion_rate: 1,
			payments: [
				{
					mode_of_payment: "Cash",
					type: "Cash",
					amount: 100,
					base_amount: 100,
					default: 1,
				},
				{
					mode_of_payment: "Card",
					type: "Bank",
					amount: 0,
					base_amount: 0,
				},
			],
		});

		const { set_rest_amount } = usePaymentMethods({
			invoiceDoc,
			posProfile: ref({}),
			diffPayment: computed(() => 150),
			getNetInvoiceAmount: () => 250,
			stores: {
				toastStore: { show: () => undefined },
				uiStore: { freeze: () => undefined, unfreeze: () => undefined },
			},
		});

		set_rest_amount(invoiceDoc.value.payments[1]);

		expect(invoiceDoc.value.payments[1].amount).toBe(150);
		expect(invoiceDoc.value.payments[1].base_amount).toBe(150);
	});

	it("auto-balances against the net settlement amount instead of gross totals", () => {
		const invoiceDoc = ref<any>({
			rounded_total: 500,
			grand_total: 500,
			conversion_rate: 1,
			payments: [
				{
					mode_of_payment: "Cash",
					type: "Cash",
					amount: 150,
					base_amount: 150,
					default: 1,
				},
				{
					mode_of_payment: "Card",
					type: "Bank",
					amount: 200,
					base_amount: 200,
				},
			],
		});

		const { autoBalancePayments } = usePaymentMethods({
			invoiceDoc,
			posProfile: ref({}),
			diffPayment: computed(() => 0),
			getNetInvoiceAmount: () => 250,
			stores: {
				toastStore: { show: () => undefined },
				uiStore: { freeze: () => undefined, unfreeze: () => undefined },
			},
		});

		autoBalancePayments(invoiceDoc.value.payments[0]);

		expect(invoiceDoc.value.payments[1].amount).toBe(100);
		expect(invoiceDoc.value.payments[1].base_amount).toBe(100);
	});

	it("builds cash denomination suggestions from the net settlement amount", () => {
		getSmartTenderSuggestionsMock.mockReturnValue([200, 500]);

		const invoiceDoc = ref<any>({
			rounded_total: 500,
			grand_total: 500,
			currency: "PKR",
			payments: [
				{
					mode_of_payment: "Cash",
					type: "Cash",
					amount: 100,
					default: 1,
				},
				{
					mode_of_payment: "Card",
					type: "Bank",
					amount: 0,
				},
			],
		});

		const { getVisibleDenominations } = usePaymentMethods({
			invoiceDoc,
			posProfile: ref({}),
			diffPayment: computed(() => 0),
			getNetInvoiceAmount: () => 250,
			stores: {
				toastStore: { show: () => undefined },
				uiStore: { freeze: () => undefined, unfreeze: () => undefined },
			},
		});

		const suggestions = getVisibleDenominations(invoiceDoc.value.payments[1]);

		expect(suggestions).toEqual([200, 500]);
		expect(getSmartTenderSuggestionsMock).toHaveBeenCalledWith(150, "PKR");
	});

	it("caps M-Pesa credit redemption against the net settlement amount", () => {
		const customerCreditDict = ref<any[]>([]);
		const redeemCustomerCredit = ref(false);

		const invoiceDoc = ref<any>({
			rounded_total: 500,
			grand_total: 500,
			payments: [],
		});

		const { set_mpesa_payment } = usePaymentMethods({
			invoiceDoc,
			posProfile: ref({}),
			diffPayment: computed(() => 0),
			getNetInvoiceAmount: () => 250,
			stores: {
				toastStore: { show: () => undefined },
				uiStore: { freeze: () => undefined, unfreeze: () => undefined },
			},
			setRedeemCustomerCredit: (value) => {
				redeemCustomerCredit.value = value;
			},
			customerCreditDict,
		});

		set_mpesa_payment({
			name: "ACC-PAY-0001",
			unallocated_amount: 400,
		});

		expect(redeemCustomerCredit.value).toBe(true);
		expect(customerCreditDict.value).toEqual([
			expect.objectContaining({
				credit_origin: "ACC-PAY-0001",
				total_credit: 400,
				credit_to_redeem: 250,
			}),
		]);
	});
});
