// @vitest-environment jsdom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
	clearPendingBundleActivation,
	finalizePendingBundleActivation,
	recordPendingBundleActivation,
} from "../src/posapp/utils/bundleVersionActivation";

const originalServiceWorkerDescriptor = Object.getOwnPropertyDescriptor(
	window.navigator,
	"serviceWorker",
);

describe("bundle version activation", () => {
	beforeAll(() => {
		Object.defineProperty(window.navigator, "serviceWorker", {
			configurable: true,
			value: undefined,
		});
	});

	beforeEach(() => {
		window.sessionStorage.clear();
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		if (originalServiceWorkerDescriptor) {
			Object.defineProperty(
				window.navigator,
				"serviceWorker",
				originalServiceWorkerDescriptor,
			);
			return;
		}

		delete (window.navigator as any).serviceWorker;
	});

	it("records the pending version until stable activation finalizes", () => {
		recordPendingBundleActivation("build-2000");

		expect(
			window.sessionStorage.getItem("posa_pending_bundle_activation"),
		).toBe("build-2000");

		clearPendingBundleActivation();

		expect(
			window.sessionStorage.getItem("posa_pending_bundle_activation"),
		).toBeNull();
	});

	it("refreshes service worker caches and clears the pending version after activation", async () => {
		recordPendingBundleActivation("build-2000");

		const postMessage = vi.fn((_message, ports: MessagePort[]) => {
			ports[0].postMessage({
				type: "SW_VERSION_INFO",
				version: "build-2000",
				timestamp: 2000,
			});
		});

		Object.defineProperty(window.navigator, "serviceWorker", {
			configurable: true,
			value: {
				controller: {
					postMessage,
				},
			},
		});

		await expect(finalizePendingBundleActivation()).resolves.toBe(true);
		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(
			window.sessionStorage.getItem("posa_pending_bundle_activation"),
		).toBeNull();
	});

	it("keeps the pending version when service worker refresh does not confirm activation", async () => {
		recordPendingBundleActivation("build-2000");

		const postMessage = vi.fn();

		Object.defineProperty(window.navigator, "serviceWorker", {
			configurable: true,
			value: {
				controller: {
					postMessage,
				},
			},
		});

		await expect(finalizePendingBundleActivation(10)).resolves.toBe(false);
		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(
			window.sessionStorage.getItem("posa_pending_bundle_activation"),
		).toBe("build-2000");
	});

	it("ignores storage write failures when recording the pending version", () => {
		const setItemSpy = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new DOMException("Blocked", "SecurityError");
			});

		expect(() => recordPendingBundleActivation("build-2000")).not.toThrow();
		expect(setItemSpy).toHaveBeenCalled();
	});

	it("tolerates inaccessible sessionStorage during activation checks", async () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(
			window,
			"sessionStorage",
		);

		Object.defineProperty(window, "sessionStorage", {
			configurable: true,
			get() {
				throw new DOMException("Blocked", "SecurityError");
			},
		});

		try {
			expect(() => recordPendingBundleActivation("build-2000")).not.toThrow();
			await expect(finalizePendingBundleActivation()).resolves.toBe(false);
			expect(() => clearPendingBundleActivation()).not.toThrow();
		} finally {
			if (originalDescriptor) {
				Object.defineProperty(window, "sessionStorage", originalDescriptor);
			}
		}
	});
});
