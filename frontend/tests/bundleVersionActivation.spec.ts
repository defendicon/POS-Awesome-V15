// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	clearPendingBundleActivation,
	finalizePendingBundleActivation,
	recordPendingBundleActivation,
} from "../src/posapp/utils/bundleVersionActivation";

describe("bundle version activation", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.localStorage.clear();
		vi.restoreAllMocks();
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
});
