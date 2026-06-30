import { describe, expect, it, vi } from "vitest";

import {
	getQuickCashTenderSuggestions,
	isCashLikePaymentLine,
	normalizeProfilePaymentLines,
} from "../src/posapp/utils/cashTender";

const getSmartTenderSuggestionsMock = vi.fn();

vi.mock("../src/utils/smartTender", () => ({
	getSmartTenderSuggestions: (...args: any[]) =>
		getSmartTenderSuggestionsMock(...args),
}));

describe("cash tender helpers", () => {
	it("recognizes the POS Profile configured cash mode", () => {
		expect(
			isCashLikePaymentLine(
				{ mode_of_payment: "Counter Cash", type: "Bank" },
				{ posa_cash_mode_of_payment: "Counter Cash" },
			),
		).toBe(true);
	});

	it("normalizes the first POS Profile payment as default when none is marked", () => {
		expect(
			normalizeProfilePaymentLines([
				{ mode_of_payment: "Cash", type: "Cash" },
				{ mode_of_payment: "Card", type: "Bank" },
			]),
		).toEqual([
			expect.objectContaining({ mode_of_payment: "Cash", default: 1 }),
			expect.objectContaining({ mode_of_payment: "Card", default: 0 }),
		]);
	});

	it("preserves an explicit POS Profile default payment", () => {
		expect(
			normalizeProfilePaymentLines([
				{ mode_of_payment: "Card", type: "Bank" },
				{ mode_of_payment: "Cash", type: "Cash", default: 1 },
			]),
		).toEqual([
			expect.objectContaining({ mode_of_payment: "Card", default: 0 }),
			expect.objectContaining({ mode_of_payment: "Cash", default: 1 }),
		]);
	});

	it("returns smart tender suggestions only when the preferred payment is cash-like", () => {
		getSmartTenderSuggestionsMock.mockReturnValue([200, 500]);

		const suggestions = getQuickCashTenderSuggestions({
			amount: 175,
			currency: "PKR",
			posProfile: {
				currency: "PKR",
				payments: [
					{ mode_of_payment: "Cash", type: "Cash", default: 1 },
					{ mode_of_payment: "Card", type: "Bank" },
				],
			},
		});

		expect(suggestions).toEqual([200, 500]);
		expect(getSmartTenderSuggestionsMock).toHaveBeenCalledWith(175, "PKR");
	});

	it("does not show cash tender suggestions when the preferred payment is not cash", () => {
		getSmartTenderSuggestionsMock.mockClear();

		const suggestions = getQuickCashTenderSuggestions({
			amount: 175,
			currency: "PKR",
			posProfile: {
				currency: "PKR",
				payments: [
					{ mode_of_payment: "Card", type: "Bank", default: 1 },
					{ mode_of_payment: "Cash", type: "Cash" },
				],
			},
		});

		expect(suggestions).toEqual([]);
		expect(getSmartTenderSuggestionsMock).not.toHaveBeenCalled();
	});
});
