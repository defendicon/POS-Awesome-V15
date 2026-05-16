import { describe, expect, it } from "vitest";
import { ref } from "vue";

import { usePaymentCalculations } from "../src/posapp/composables/pos/payments/usePaymentCalculations";

describe("usePaymentCalculations", () => {
	it("keeps split overpayments as change instead of capping total paid to the invoice total", () => {
		const invoiceDoc = ref<any>({
			currency: "PKR",
			rounded_total: 100,
			grand_total: 100,
			payments: [
				{ mode_of_payment: "Cash", type: "Cash", amount: 80 },
				{ mode_of_payment: "Card", type: "Bank", amount: 50 },
			],
		});

		const calculations = usePaymentCalculations({
			invoiceDoc,
			posProfile: ref({ currency: "PKR", posa_allow_multi_currency: 0 }),
			currencyPrecision: ref(2),
			loyaltyAmount: ref(0),
			redeemedCustomerCredit: ref(0),
			customerCreditDict: ref([]),
			customerInfo: ref({}),
			giftCardRedemptions: ref([]),
			formatCurrency: (value) => String(value),
		});

		expect(calculations.total_payments.value).toBe(130);
		expect(calculations.diff_payment.value).toBe(-30);
		expect(calculations.change_due.value).toBe(30);
	});
});
