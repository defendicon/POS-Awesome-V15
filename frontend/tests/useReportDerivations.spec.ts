import { describe, expect, it } from "vitest";

import {
	latestRows,
	limitRows,
	positiveCombinedMax,
	positiveMax,
	reportRangeLabel,
	salesTrendRangeLabel,
	sortByMagnitudeDesc,
	sortByNumberDesc,
	sortByStringAsc,
} from "../src/posapp/composables/useReportDerivations";

describe("report derivation helpers", () => {
	const formatDate = (value?: string) => `date:${value || "-"}`;
	const translate = (value: string) => `t:${value}`;

	it("formats standard and sales-trend range labels with safe fallbacks", () => {
		expect(
			reportRangeLabel(
				{ from: "2026-05-01", to: "2026-05-19" },
				{ month_start: "ignored", today: "ignored" },
				formatDate,
				translate,
			),
		).toBe("date:2026-05-01 - date:2026-05-19");
		expect(reportRangeLabel({}, { month_start: "2026-05-01", today: "2026-05-19" }, formatDate, translate)).toBe(
			"date:2026-05-01 - date:2026-05-19",
		);
		expect(reportRangeLabel({}, {}, formatDate, translate)).toBe("t:Current Month");

		expect(
			salesTrendRangeLabel({ day_from: "2026-05-01", day_to: "2026-05-19" }, formatDate, translate),
		).toBe("date:2026-05-01 - date:2026-05-19");
		expect(salesTrendRangeLabel({}, formatDate, translate)).toBe("t:Current Month");
	});

	it("returns positive max values with a minimum fallback of one", () => {
		expect(positiveMax([{ value: -3 }, { value: 7 }], (row) => row.value)).toBe(7);
		expect(positiveMax([{ value: 0 }], (row) => row.value)).toBe(1);
		expect(positiveCombinedMax([{ a: 2, b: -5 }], (row) => Math.abs(row.a) + Math.abs(row.b))).toBe(7);
	});

	it("sorts and limits report rows without mutating the source array", () => {
		const rows = [
			{ name: "b", amount: -10, count: 2 },
			{ name: "a", amount: 5, count: 4 },
			{ name: "c", amount: 20, count: 1 },
		];

		expect(sortByMagnitudeDesc(rows, (row) => row.amount).map((row) => row.name)).toEqual(["c", "b", "a"]);
		expect(sortByNumberDesc(rows, (row) => row.count).map((row) => row.name)).toEqual(["a", "b", "c"]);
		expect(sortByStringAsc(rows, (row) => row.name).map((row) => row.name)).toEqual(["a", "b", "c"]);
		expect(limitRows(rows, 2).map((row) => row.name)).toEqual(["b", "a"]);
		expect(latestRows(rows, 2).map((row) => row.name)).toEqual(["a", "c"]);
		expect(latestRows(rows, 0)).toEqual([]);
		expect(rows.map((row) => row.name)).toEqual(["b", "a", "c"]);
	});
});
