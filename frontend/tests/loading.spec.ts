import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	(globalThis as any).__ = (value: string) => value;
	(globalThis as any).requestAnimationFrame = (
		callback: FrameRequestCallback,
	) => {
		callback(Number.MAX_SAFE_INTEGER);
		return 1;
	};
});

import {
	clearSourceRelease,
	getLoadingStatus,
	initLoadingSources,
	markSourceLoaded,
	resetLoadingState,
	scheduleSourceRelease,
} from "../src/posapp/utils/loading";

describe("startup loading source release", () => {
	afterEach(() => {
		resetLoadingState();
		vi.useRealTimers();
	});

	it("releases a slow non-critical source after its grace period", async () => {
		vi.useFakeTimers();
		const onRelease = vi.fn();
		initLoadingSources(["items", "customers"]);
		scheduleSourceRelease("items", 20_000, onRelease);

		await vi.advanceTimersByTimeAsync(20_000);

		expect(onRelease).toHaveBeenCalledOnce();
		expect(getLoadingStatus().sources.items).toBe(0);
		expect(getLoadingStatus().releasedSources.items).toBe(true);
		expect(getLoadingStatus().sources.customers).toBe(0);
	});

	it("cancels the grace timer when the source loads normally", async () => {
		vi.useFakeTimers();
		const onRelease = vi.fn();
		initLoadingSources(["items", "customers"]);
		scheduleSourceRelease("items", 20_000, onRelease);
		markSourceLoaded("items");

		await vi.advanceTimersByTimeAsync(20_000);

		expect(onRelease).not.toHaveBeenCalled();
		expect(getLoadingStatus().sources.items).toBe(100);
	});

	it("allows an explicit release cancellation", async () => {
		vi.useFakeTimers();
		const onRelease = vi.fn();
		initLoadingSources(["items"]);
		scheduleSourceRelease("items", 20_000, onRelease);
		clearSourceRelease("items");

		await vi.advanceTimersByTimeAsync(20_000);

		expect(onRelease).not.toHaveBeenCalled();
		expect(getLoadingStatus().sources.items).toBe(0);
	});

	it("unblocks startup when the customer database is the only pending source", async () => {
		vi.useFakeTimers();
		initLoadingSources(["init", "items", "customers"]);
		markSourceLoaded("init");
		markSourceLoaded("items");
		scheduleSourceRelease("customers", 20_000);

		await vi.advanceTimersByTimeAsync(300);
		expect(getLoadingStatus().progress).toBe(67);
		await vi.advanceTimersByTimeAsync(21_000);
		expect(getLoadingStatus().active).toBe(false);
		markSourceLoaded("customers");
		expect(getLoadingStatus().releasedSources.customers).toBe(true);
	});
});
