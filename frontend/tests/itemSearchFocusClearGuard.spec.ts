import { describe, expect, it, vi } from "vitest";

import { createItemSearchFocusClearGuard } from "../src/posapp/utils/itemSearchFocusClearGuard";

describe("createItemSearchFocusClearGuard", () => {
	it("skips the next focus clear after programmatic search injection", () => {
		const scheduleReset = vi.fn((_cb: () => void) => 1);
		const clearScheduledReset = vi.fn();
		const guard = createItemSearchFocusClearGuard({
			scheduleReset,
			clearScheduledReset,
		});

		guard.armPreserveNextFocusClear();

		expect(guard.shouldClearSearchOnFocus()).toBe(false);
		expect(guard.shouldClearSearchOnFocus()).toBe(true);
		expect(clearScheduledReset).toHaveBeenCalledWith(1);
	});

	it("falls back to clearing once the preserve window expires", () => {
		let resetCallback: (() => void) | null = null;
		const guard = createItemSearchFocusClearGuard({
			scheduleReset: (cb) => {
				resetCallback = cb;
				return 7;
			},
			clearScheduledReset: vi.fn(),
		});

		guard.armPreserveNextFocusClear();
		resetCallback?.();

		expect(guard.shouldClearSearchOnFocus()).toBe(true);
	});
});
