// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createReportFormatters } from "../src/posapp/composables/useReportFormatters";

describe("createReportFormatters", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function buildFormatters(currency = "PKR") {
		return createReportFormatters({
			getCurrency: () => currency,
			translate: (value) => value,
		});
	}

	it("formats money with the active POS currency symbol", () => {
		vi.stubGlobal("get_currency_symbol", (currency: string) => `${currency}SYM`);

		const formatters = buildFormatters("PKR");

		expect(formatters.formatMoney(1234.5)).toBe("PKRSYM 1,234.50");
	});

	it("falls back to numeric money when no currency symbol is available", () => {
		vi.stubGlobal("get_currency_symbol", undefined);

		const formatters = buildFormatters("");

		expect(formatters.formatMoney(1234.5)).toBe("1,234.50");
	});

	it("formats quantities, signed quantities, percentages, days, and dates safely", () => {
		const formatters = buildFormatters();

		expect(formatters.formatQuantity(1234.567)).toBe("1,234.57");
		expect(formatters.formatSignedQuantity(12)).toBe("+12");
		expect(formatters.formatSignedQuantity(-3)).toBe("-3");
		expect(formatters.formatPercent(12.345, 2)).toBe("12.35%");
		expect(formatters.formatPercent(null)).toBe("N/A");
		expect(formatters.formatDays(2.4)).toBe("2 days");
		expect(formatters.formatDays(undefined)).toBe("N/A");
		expect(formatters.formatDate()).toBe("-");
		expect(formatters.formatDate("not-a-date")).toBe("not-a-date");
	});

	it("maps report categories and statuses to stable display labels and colors", () => {
		const formatters = buildFormatters();

		expect(formatters.formatMovementCategory("sale")).toBe("Sale");
		expect(formatters.formatMovementCategory("transfer")).toBe("Transfer");
		expect(formatters.formatMovementCategory("unknown")).toBe("Other");
		expect(formatters.urgencyLabel("critical")).toBe("Critical");
		expect(formatters.urgencyLabel("missing")).toBe("Unknown");
		expect(formatters.urgencyColor("high")).toBe("warning");
		expect(formatters.urgencyColor("low")).toBe("success");
		expect(formatters.stockChipColor(0)).toBe("error");
		expect(formatters.stockChipColor(2)).toBe("warning");
		expect(formatters.paymentCategoryColor("cash")).toBe("success");
		expect(formatters.paymentCategoryColor("card_online")).toBe("info");
		expect(formatters.paymentCategoryColor("other")).toBe("secondary");
	});

	it("keeps progress and growth helpers bounded and sign-aware", () => {
		const formatters = buildFormatters();

		expect(formatters.progressFromQuantity(50, 100)).toBe(50);
		expect(formatters.progressFromQuantity(200, 100)).toBe(100);
		expect(formatters.trendProgress(-25, 100)).toBe(25);
		expect(formatters.trendProgress(300, 100)).toBe(100);
		expect(formatters.formatTrendPct(12.34)).toBe("+12.3%");
		expect(formatters.formatTrendPct(-4)).toBe("-4.0%");
		expect(formatters.formatTrendPct(undefined)).toBe("N/A");
		expect(formatters.trendGrowthColor(1)).toBe("success");
		expect(formatters.trendGrowthColor(-1)).toBe("error");
		expect(formatters.trendGrowthColor(0)).toBe("warning");
		expect(formatters.trendGrowthColor(null)).toBe("secondary");
	});
});
