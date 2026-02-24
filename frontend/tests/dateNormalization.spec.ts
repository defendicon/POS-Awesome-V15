import { describe, expect, it } from "vitest";

import formatMixin, { normalizeDateForBackend } from "../src/posapp/format";

describe("normalizeDateForBackend", () => {
	it("normalizes supported date string formats to YYYY-MM-DD", () => {
		expect(normalizeDateForBackend("2026-02-24")).toBe("2026-02-24");
		expect(normalizeDateForBackend("24-02-2026")).toBe("2026-02-24");
		expect(normalizeDateForBackend("24/02/2026")).toBe("2026-02-24");
	});

	it("returns null for invalid or sentinel values", () => {
		expect(normalizeDateForBackend("Invalid date")).toBeNull();
		expect(normalizeDateForBackend("31-02-2026")).toBeNull();
		expect(normalizeDateForBackend("")).toBeNull();
		expect(normalizeDateForBackend(null)).toBeNull();
	});

	it("supports Date objects", () => {
		const value = new Date(2026, 1, 24); // 2026-02-24
		expect(normalizeDateForBackend(value)).toBe("2026-02-24");
	});
});

describe("format mixin formatDateForBackend", () => {
	it("uses normalized output and never passes invalid literals through", () => {
		const method = (formatMixin as any).methods.formatDateForBackend;
		expect(method.call({}, "24-02-2026")).toBe("2026-02-24");
		expect(method.call({}, "Invalid date")).toBeNull();
	});
});
