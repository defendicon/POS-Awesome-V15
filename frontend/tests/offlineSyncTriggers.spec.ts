import { describe, expect, it, vi } from "vitest";

import { createOfflineSyncRuntime } from "../src/offline/sync/runtime";

describe("offline sync runtime triggers", () => {
	it("schedules boot warm sync after the next frame instead of immediately", async () => {
		let scheduledFrame: (() => void | Promise<void>) | null = null;
		const runTrigger = vi.fn(async () => undefined);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
			scheduleFrame: (callback) => {
				scheduledFrame = callback;
				return 1;
			},
		});

		const pending = runtime.scheduleBootWarmSync();

		expect(runTrigger).not.toHaveBeenCalled();

		await scheduledFrame?.();
		await pending;

		expect(runTrigger).toHaveBeenCalledTimes(1);
		expect(runTrigger).toHaveBeenCalledWith("boot");
	});

	it("dedupes repeated boot scheduling before the frame runs", async () => {
		let scheduledFrame: (() => void | Promise<void>) | null = null;
		const runTrigger = vi.fn(async () => undefined);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
			scheduleFrame: (callback) => {
				scheduledFrame = callback;
				return 1;
			},
		});

		const first = runtime.scheduleBootWarmSync();
		const second = runtime.scheduleBootWarmSync();

		expect(first).toBe(second);
		expect(runTrigger).not.toHaveBeenCalled();

		await scheduledFrame?.();
		await Promise.all([first, second]);

		expect(runTrigger).toHaveBeenCalledTimes(1);
	});

	it("dedupes online resume re-entry while a sync is already in flight", async () => {
		let resolveRun: (() => void) | null = null;
		const runTrigger = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRun = resolve;
				}),
		);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
		});

		const first = runtime.triggerOnlineResumeSync();
		const second = runtime.triggerOnlineResumeSync();

		expect(first).toBe(second);
		expect(runTrigger).toHaveBeenCalledTimes(1);
		expect(runTrigger).toHaveBeenCalledWith("online_resume");

		resolveRun?.();
		await Promise.all([first, second]);
	});

	it("dedupes user action re-entry while an operator refresh is already in flight", async () => {
		let resolveRun: (() => void) | null = null;
		const runTrigger = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRun = resolve;
				}),
		);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
		});

		const first = runtime.triggerUserActionSync();
		const second = runtime.triggerUserActionSync();

		expect(first).toBe(second);
		expect(runTrigger).toHaveBeenCalledTimes(1);
		expect(runTrigger).toHaveBeenCalledWith("user_action");

		resolveRun?.();
		await Promise.all([first, second]);
	});

	it("runs boot before user_action during an operator rebuild refresh", async () => {
		let scheduledFrame: (() => void | Promise<void>) | null = null;
		const runTrigger = vi.fn(async () => undefined);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
			scheduleFrame: (callback) => {
				scheduledFrame = callback;
				return 1;
			},
		});

		const pending = runtime.triggerOperatorRefreshSync({
			includeBootSync: true,
		});

		expect(runTrigger).not.toHaveBeenCalled();

		await scheduledFrame?.();
		await pending;

		expect(runTrigger.mock.calls.map(([trigger]) => trigger)).toEqual([
			"boot",
			"user_action",
		]);
	});

	it("starts adaptive timer sync with the foreground cadence and stops it cleanly", async () => {
		let scheduledCallback: (() => void | Promise<void>) | null = null;
		let scheduledDelay: number | null = null;
		let visibilityListener: (() => void) | null = null;
		let clearedHandle: number | null = null;
		const runTrigger = vi.fn(async () => undefined);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
			foregroundTimerIntervalMs: 15_000,
			backgroundTimerIntervalMs: 60_000,
			scheduleTimeout: (callback, delayMs) => {
				scheduledCallback = callback;
				scheduledDelay = delayMs;
				return 77;
			},
			clearScheduledTimeout: (handle) => {
				clearedHandle = Number(handle);
			},
			addVisibilityListener: (listener) => {
				visibilityListener = listener;
				return () => {
					visibilityListener = null;
				};
			},
			isDocumentHidden: () => false,
		});

		const handle = runtime.startTimerSync();
		expect(handle).toBe(77);
		expect(scheduledDelay).toBe(15_000);
		expect(visibilityListener).toBeTypeOf("function");

		await scheduledCallback?.();
		expect(runTrigger).toHaveBeenCalledWith("timer");

		runtime.stopTimerSync();
		expect(clearedHandle).toBe(77);
		expect(visibilityListener).toBeNull();
	});

	it("dedupes timer sync re-entry while a timer-triggered pass is in flight", async () => {
		let resolveRun: (() => void) | null = null;
		const runTrigger = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRun = resolve;
				}),
		);
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger,
		});

		const first = runtime.triggerTimerSync();
		const second = runtime.triggerTimerSync();

		expect(first).toBe(second);
		expect(runTrigger).toHaveBeenCalledTimes(1);
		expect(runTrigger).toHaveBeenCalledWith("timer");

		resolveRun?.();
		await Promise.all([first, second]);
	});

	it("slows timer cadence when the tab is hidden", () => {
		let scheduledDelay: number | null = null;
		let visibilityListener: (() => void) | null = null;
		let hidden = false;
		const runtime = createOfflineSyncRuntime({
			canSync: () => true,
			runTrigger: vi.fn(async () => undefined),
			foregroundTimerIntervalMs: 20_000,
			backgroundTimerIntervalMs: 90_000,
			scheduleTimeout: (_callback, delayMs) => {
				scheduledDelay = delayMs;
				return 5;
			},
			clearScheduledTimeout: vi.fn(),
			addVisibilityListener: (listener) => {
				visibilityListener = listener;
				return () => {
					visibilityListener = null;
				};
			},
			isDocumentHidden: () => hidden,
		});

		runtime.startTimerSync();
		expect(scheduledDelay).toBe(20_000);

		hidden = true;
		visibilityListener?.();
		expect(scheduledDelay).toBe(90_000);
	});

	it("uses the ineligible cadence instead of running when sync is not currently allowed", async () => {
		let scheduledCallback: (() => void | Promise<void>) | null = null;
		let scheduledDelay: number | null = null;
		const runTrigger = vi.fn(async () => undefined);
		const runtime = createOfflineSyncRuntime({
			canSync: () => false,
			runTrigger,
			foregroundTimerIntervalMs: 20_000,
			backgroundTimerIntervalMs: 90_000,
			ineligibleTimerIntervalMs: 45_000,
			scheduleTimeout: (callback, delayMs) => {
				scheduledCallback = callback;
				scheduledDelay = delayMs;
				return 8;
			},
			clearScheduledTimeout: vi.fn(),
			addVisibilityListener: () => () => undefined,
			isDocumentHidden: () => false,
		});

		runtime.startTimerSync();
		expect(scheduledDelay).toBe(45_000);

		await scheduledCallback?.();
		expect(runTrigger).not.toHaveBeenCalled();
		expect(scheduledDelay).toBe(45_000);
	});
});
