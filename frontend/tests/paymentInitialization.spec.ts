import { describe, expect, it } from "vitest";

import {
	initializePaymentLinesForDialog,
	resolvePreferredPaymentLine,
} from "../src/posapp/utils/paymentInitialization";

describe("paymentInitialization", () => {
	const isCashLikePayment = (payment: any) =>
		String(payment?.type || "").toLowerCase() === "cash" ||
		String(payment?.mode_of_payment || "")
			.toLowerCase()
			.includes("cash");

	it("falls back to a cash-like payment when no default flag exists", () => {
		const doc: any = {
			rounded_total: 125,
			conversion_rate: 1,
			payments: [
				{ mode_of_payment: "Card", type: "Bank", amount: 0, base_amount: 0 },
				{ mode_of_payment: "Cash", type: "Cash", amount: 0, base_amount: 0 },
			],
		};

		const payment = initializePaymentLinesForDialog(doc, 2, isCashLikePayment);

		expect(resolvePreferredPaymentLine(doc, isCashLikePayment)).toBe(doc.payments[1]);
		expect(payment).toBe(doc.payments[1]);
		expect(doc.payments[1].amount).toBe(125);
		expect(doc.payments[1].base_amount).toBe(125);
		expect(doc.payments[0].amount).toBe(0);
	});

	it("preserves existing entered amounts instead of overwriting them", () => {
		const doc: any = {
			rounded_total: 200,
			conversion_rate: 1,
			payments: [
				{ mode_of_payment: "Cash", type: "Cash", amount: 50, base_amount: 50, default: 1 },
				{ mode_of_payment: "Card", type: "Bank", amount: 150, base_amount: 150 },
			],
		};

		initializePaymentLinesForDialog(doc, 2, isCashLikePayment);

		expect(doc.payments[0].amount).toBe(50);
		expect(doc.payments[1].amount).toBe(150);
	});

	it("initializes return payments as negative values", () => {
		const doc: any = {
			rounded_total: -80,
			conversion_rate: 1,
			is_return: 1,
			payments: [{ mode_of_payment: "Cash", type: "Cash", amount: 0, base_amount: 0 }],
		};

		initializePaymentLinesForDialog(doc, 2, isCashLikePayment);

		expect(doc.payments[0].amount).toBe(-80);
		expect(doc.payments[0].base_amount).toBe(-80);
	});
});
