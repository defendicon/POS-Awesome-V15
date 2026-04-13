import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRedemptionLogic } from "../src/features/payments/composables/invoice/useRedemptionLogic";

describe("useRedemptionLogic", () => {
	beforeEach(() => {
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("caps customer credit allocations to the remaining invoice amount after loyalty", async () => {
		const invoiceDoc = ref<any>({
			customer: "CUST-0001",
			rounded_total: 500,
			grand_total: 500,
			currency: "PKR",
			conversion_rate: 1,
		});

		const { customer_credit_dict, redeemed_customer_credit, loyalty_amount } =
			useRedemptionLogic({
				invoiceDoc,
				posProfile: ref({ company: "Test Co", currency: "PKR" }),
				customerInfo: ref({}),
				currencyPrecision: ref(2),
				formatFloat: (value: any) => Number(value || 0),
			});

		loyalty_amount.value = 100;
		customer_credit_dict.value = [
			{ total_credit: 300, credit_to_redeem: 300 },
			{ total_credit: 300, credit_to_redeem: 200 },
		];

		await nextTick();
		await nextTick();

		expect(customer_credit_dict.value[0].credit_to_redeem).toBe(300);
		expect(customer_credit_dict.value[1].credit_to_redeem).toBe(100);
		expect(redeemed_customer_credit.value).toBe(400);
	});

	it("normalizes per-source amounts so they stay within each source balance", async () => {
		const invoiceDoc = ref<any>({
			customer: "CUST-0001",
			rounded_total: 500,
			grand_total: 500,
			currency: "PKR",
			conversion_rate: 1,
		});

		const { customer_credit_dict, redeemed_customer_credit } = useRedemptionLogic({
			invoiceDoc,
			posProfile: ref({ company: "Test Co", currency: "PKR" }),
			customerInfo: ref({}),
			currencyPrecision: ref(2),
			formatFloat: (value: any) => Number(value || 0),
		});

		customer_credit_dict.value = [
			{ total_credit: 150, credit_to_redeem: 250 },
			{ total_credit: 90, credit_to_redeem: -10 },
		];

		await nextTick();
		await nextTick();

		expect(customer_credit_dict.value[0].credit_to_redeem).toBe(150);
		expect(customer_credit_dict.value[1].credit_to_redeem).toBe(0);
		expect(redeemed_customer_credit.value).toBe(150);
	});
});
