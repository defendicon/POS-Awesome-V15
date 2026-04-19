import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	LOADING_SCOPE_IDS,
	start,
	stop,
	setScopeMeta,
	clearScopeMeta,
	startBootstrapLoading,
	stopBootstrapLoading,
	withActionLoading,
	withRouteLoading,
	useLoading,
} from "../src/posapp/composables/core/useLoading";

describe("useLoading scoped orchestration", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		stop("bootstrap");
		stop("route");
		stop(LOADING_SCOPE_IDS.action);
	});

	it("shows the overlay only for blocking bootstrap loads", async () => {
		const { overlayVisible, getScopeState } = useLoading();

		start("bootstrap");
		setScopeMeta("bootstrap", {
			message: "Initializing application...",
			progress: 25,
		});
		await vi.runAllTimersAsync();

		expect(overlayVisible.value).toBe(true);
		expect(getScopeState("bootstrap").value.message).toBe(
			"Initializing application...",
		);
		expect(getScopeState("bootstrap").value.progress).toBe(25);

		stop("bootstrap");
		await vi.runAllTimersAsync();

		expect(overlayVisible.value).toBe(false);
	});

	it("keeps route loading non-blocking for the global overlay", async () => {
		const { overlayVisible, getScopeState } = useLoading();

		start("route");
		await vi.runAllTimersAsync();

		expect(overlayVisible.value).toBe(false);
		expect(getScopeState("route").value.count).toBe(1);
		expect(getScopeState("route").value.kind).toBe("route");

		stop("route");
	});

	it("provides scope helpers that target the intended loading channels", async () => {
		const { overlayVisible, getScopeState } = useLoading();

		startBootstrapLoading({
			message: "Bootstrapping register...",
			progress: 10,
		});
		await vi.runAllTimersAsync();

		expect(overlayVisible.value).toBe(true);
		expect(getScopeState("bootstrap").value.message).toBe(
			"Bootstrapping register...",
		);

		stopBootstrapLoading();
		await vi.runAllTimersAsync();

		expect(overlayVisible.value).toBe(false);

		const routePromise = withRouteLoading(() => Promise.resolve("ok"), {
			message: "Loading payments...",
		});

		expect(getScopeState("route").value.count).toBe(1);
		expect(getScopeState("route").value.message).toBe("Loading payments...");
		await routePromise;

		expect(getScopeState("route").value.count).toBe(0);
		expect(overlayVisible.value).toBe(false);
	});

	it("cleans up loading state after action failures", async () => {
		const { getScopeState } = useLoading();

		const failingPromise = withActionLoading(
			() =>
				new Promise((_, reject) => {
					queueMicrotask(() => reject(new Error("request failed")));
				}),
			{ message: "Saving invoice..." },
		);

		expect(getScopeState(LOADING_SCOPE_IDS.action).value.count).toBe(1);
		expect(getScopeState(LOADING_SCOPE_IDS.action).value.message).toBe(
			"Saving invoice...",
		);
		await expect(failingPromise).rejects.toThrow("request failed");
		expect(getScopeState(LOADING_SCOPE_IDS.action).value.count).toBe(0);
	});

	it("keeps the overlay visible when blocking loading restarts within minVisible", async () => {
		const { overlayVisible } = useLoading();

		start("bootstrap");
		await vi.advanceTimersByTimeAsync(150);

		expect(overlayVisible.value).toBe(true);

		stop("bootstrap");
		await vi.advanceTimersByTimeAsync(200);

		start("bootstrap");
		await vi.advanceTimersByTimeAsync(250);

		expect(overlayVisible.value).toBe(true);

		stop("bootstrap");
		await vi.runAllTimersAsync();
	});

	it("uses section defaults when the shared section scope id is started directly", async () => {
		const { getScopeState } = useLoading();

		start(LOADING_SCOPE_IDS.section);

		expect(getScopeState(LOADING_SCOPE_IDS.section).value.kind).toBe("section");
		expect(getScopeState(LOADING_SCOPE_IDS.section).value.message).toBe(
			"Loading section...",
		);
		expect(getScopeState(LOADING_SCOPE_IDS.section).value.blocking).toBe(false);

		stop(LOADING_SCOPE_IDS.section);
	});

	it("resets active scope meta back to defaults when clearing metadata", async () => {
		const { getScopeState } = useLoading();

		start("bootstrap", {
			message: "Custom bootstrap",
			blocking: false,
			progress: 55,
		});
		clearScopeMeta("bootstrap");

		expect(getScopeState("bootstrap").value.count).toBe(1);
		expect(getScopeState("bootstrap").value.kind).toBe("bootstrap");
		expect(getScopeState("bootstrap").value.blocking).toBe(true);
		expect(getScopeState("bootstrap").value.message).toBe("Loading app data...");
		expect(getScopeState("bootstrap").value.progress).toBeNull();

		stop("bootstrap");
	});
});
