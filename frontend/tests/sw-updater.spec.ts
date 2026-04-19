// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveActiveVersionTransition } from "../src/sw-updater";

describe("sw updater version transitions", () => {
	it("keeps routine controller changes passive when the runtime bundle is still older", () => {
		expect(
			resolveActiveVersionTransition({
				version: "build-2000",
				runtimeVersion: "build-1000",
				lastKnownActiveVersion: "build-1000",
				reloadScheduled: false,
			}),
		).toEqual({
			nextLastKnownActiveVersion: "build-2000",
			syncCurrentVersion: false,
			syncAvailableVersion: true,
			markUpdateApplied: false,
			reloadWindow: false,
			clearReloadState: false,
		});
	});

	it("still hard-reloads when an explicit apply happens after a passive controller switch", () => {
		expect(
			resolveActiveVersionTransition({
				version: "build-2000",
				runtimeVersion: "build-1000",
				lastKnownActiveVersion: "build-2000",
				reloadScheduled: true,
			}),
		).toEqual({
			nextLastKnownActiveVersion: "build-2000",
			syncCurrentVersion: false,
			syncAvailableVersion: false,
			markUpdateApplied: true,
			reloadWindow: true,
			clearReloadState: false,
		});
	});

	it("clears reload state instead of looping when the controller version matches the runtime", () => {
		expect(
			resolveActiveVersionTransition({
				version: "build-2000",
				runtimeVersion: "build-2000",
				lastKnownActiveVersion: "build-2000",
				reloadScheduled: true,
			}),
		).toEqual({
			nextLastKnownActiveVersion: "build-2000",
			syncCurrentVersion: true,
			syncAvailableVersion: false,
			markUpdateApplied: false,
			reloadWindow: false,
			clearReloadState: true,
		});
	});
});

describe("sw updater runtime safety", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.doUnmock("pinia");
		vi.doUnmock("../src/posapp/stores/index.js");
	});

	async function loadUpdaterHarness({
		registrationOverrides = {},
		controllerResponses = [],
	}: {
		registrationOverrides?: Record<string, any>;
		controllerResponses?: any[];
	} = {}) {
		const updateStore: any = {
			currentVersion: "build-1000",
			availableVersion: "build-2000",
			reloading: false,
			reloadAction: null,
			initializeFromStorage: vi.fn(),
			setReloadAction(action: () => Promise<void>) {
				this.reloadAction = action;
			},
			resetSnooze: vi.fn(),
			setCurrentVersion: vi.fn(function (version: string) {
				this.currentVersion = version;
			}),
			setAvailableVersion: vi.fn(function (version: string) {
				this.availableVersion = version;
			}),
			markUpdateApplied: vi.fn(function (version: string) {
				this.currentVersion = version;
				this.availableVersion = version;
				this.reloading = false;
			}),
		};

		vi.doMock("pinia", () => ({
			setActivePinia: vi.fn(),
		}));

		vi.doMock("../src/posapp/stores/index.js", () => ({
			pinia: {},
			useUpdateStore: () => updateStore,
		}));

		const registration: any = {
			waiting: null,
			installing: null,
			update: vi.fn().mockResolvedValue(undefined),
			addEventListener: vi.fn(),
			...registrationOverrides,
		};

		let responseIndex = 0;
		const controller = {
			postMessage: vi.fn((_message: any, ports?: MessagePort[]) => {
				const nextResponse = controllerResponses[responseIndex++];
				if (typeof nextResponse === "undefined") {
					return;
				}
				queueMicrotask(() => {
					ports?.[0]?.postMessage(nextResponse);
				});
			}),
		};

		const serviceWorker = new EventTarget() as EventTarget & {
			controller: typeof controller;
			ready: Promise<any>;
			getRegistration: ReturnType<typeof vi.fn>;
		};
		serviceWorker.controller = controller;
		serviceWorker.ready = Promise.resolve(registration);
		serviceWorker.getRegistration = vi.fn().mockResolvedValue(registration);

		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: serviceWorker,
		});

		vi.spyOn(console, "warn").mockImplementation(() => {});

		await import("../src/sw-updater");
		await Promise.resolve();
		await Promise.resolve();

		return {
			updateStore,
			registration,
			serviceWorker,
		};
	}

	it("clears reload flags when controllerchange gets malformed version info", async () => {
		const waitingWorker = {
			postMessage: vi.fn(),
		};
		const { updateStore, serviceWorker } = await loadUpdaterHarness({
			registrationOverrides: {
				waiting: waitingWorker,
			},
			controllerResponses: [{ type: "BAD_VERSION_INFO" }],
		});

		await updateStore.reloadAction();
		expect(updateStore.reloading).toBe(true);

		serviceWorker.dispatchEvent(new Event("controllerchange"));
		await vi.advanceTimersByTimeAsync(4000);

		expect(updateStore.reloading).toBe(false);
	});

	it("clears reload flags when explicit update validation falls back after malformed payloads", async () => {
		const { updateStore } = await loadUpdaterHarness({
			controllerResponses: [
				{ type: "BAD_REFRESH_RESPONSE" },
				{ type: "BAD_CURRENT_RESPONSE" },
			],
		});

		const reloadPromise = updateStore.reloadAction();
		await vi.advanceTimersByTimeAsync(8000);
		await reloadPromise;

		expect(updateStore.reloading).toBe(false);
	});

	it("continues startup update checks when ensureActiveVersion gets malformed data", async () => {
		const { registration } = await loadUpdaterHarness({
			controllerResponses: [{ type: "BAD_VERSION_INFO" }],
		});

		await vi.runAllTimersAsync();

		expect(registration.update).toHaveBeenCalledTimes(1);
	});

	it("ignores malformed unsolicited service worker version messages", async () => {
		const { updateStore, serviceWorker } = await loadUpdaterHarness();

		serviceWorker.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "SW_VERSION_INFO", version: "" },
			}),
		);
		await Promise.resolve();

		expect(updateStore.setCurrentVersion).not.toHaveBeenCalledWith("", expect.anything());
		expect(updateStore.currentVersion).toBe("build-1000");
	});
});
