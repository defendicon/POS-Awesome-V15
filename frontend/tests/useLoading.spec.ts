import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	start,
	stop,
	setScopeMeta,
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
		stop("api");
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

		expect(getScopeState("api").value.count).toBe(1);
		expect(getScopeState("api").value.message).toBe("Saving invoice...");
		await expect(failingPromise).rejects.toThrow("request failed");
		expect(getScopeState("api").value.count).toBe(0);
	});
});
