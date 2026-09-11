import { describe, expect, it } from "vitest";

import {
	formatLocalDate,
	presetRange,
} from "../src/posapp/components/pos/shared/DateRangeFilter.vue";

describe("DateRangeFilter presets", () => {
	it("formats dates without shifting the local calendar day", () => {
		expect(formatLocalDate(new Date(2026, 8, 11))).toBe("2026-09-11");
	});

	it("builds inclusive quick ranges across month boundaries", () => {
		expect(presetRange(7, new Date(2026, 8, 3))).toEqual([
			"2026-08-28",
			"2026-09-03",
		]);
		expect(presetRange(1, new Date(2026, 8, 3))).toEqual([
			"2026-09-03",
			"2026-09-03",
		]);
	});
});
