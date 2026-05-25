import { describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	getCachedExchangeRate: vi.fn(() => null),
}));

import {
	paymentCurrencyToTransaction,
	syncPaymentBaseAmount,
	transactionToPaymentCurrency,
} from "../src/posapp/utils/paymentCurrency";

describe("payment currency conversion", () => {
	const profile = { currency: "USD", company: "Test Co", name: "POS-1" };

	it("displays an HTG transaction total in a USD payment account", () => {
		const doc = { currency: "HTG", conversion_rate: 1 / 135 };
		const payment = { amount: 5400, account_currency: "USD" };

		expect(transactionToPaymentCurrency(payment.amount, payment, doc, profile)).toBeCloseTo(40, 6);
	});

	it("displays a USD transaction total in an HTG payment account", () => {
		const doc = { currency: "USD", conversion_rate: 1 };
		const payment = { amount: 40, account_currency: "HTG" };
		const rates = { HTG: 1 / 135 };

		expect(transactionToPaymentCurrency(payment.amount, payment, doc, profile, rates)).toBeCloseTo(5400, 6);
	});

	it("converts payment account input back to ERPNext transaction amount", () => {
		const doc = { currency: "USD", conversion_rate: 1 };
		const payment = { account_currency: "HTG" };
		const rates = { HTG: 1 / 135 };

		expect(paymentCurrencyToTransaction(5400, payment, doc, profile, rates)).toBeCloseTo(40, 6);
	});

	it("keeps base amount as transaction amount times ERPNext conversion rate", () => {
		const doc = { currency: "HTG", conversion_rate: 1 / 135 };
		const payment = { amount: 5400, account_currency: "HTG", base_amount: 0 };

		syncPaymentBaseAmount(payment, doc, profile, 2);

		expect(payment.base_amount).toBe(40);
	});
});
