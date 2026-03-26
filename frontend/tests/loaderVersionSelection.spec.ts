// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import * as loaderUtils from "../src/loader-utils";

describe("loader build version selection", () => {
	it("prefers the fetched build version when it differs from the embedded one", async () => {
		const pickPreferredBundleVersion = (loaderUtils as any)
			.pickPreferredBundleVersion;

		expect(typeof pickPreferredBundleVersion).toBe("function");
		await expect(
			pickPreferredBundleVersion("old-build", async () => "new-build"),
		).resolves.toBe("new-build");
	});

	it("falls back to the embedded build version when no newer version is available", async () => {
		const pickPreferredBundleVersion = (loaderUtils as any)
			.pickPreferredBundleVersion;

		expect(typeof pickPreferredBundleVersion).toBe("function");
		await expect(
			pickPreferredBundleVersion("current-build", async () => null),
		).resolves.toBe("current-build");
	});

	it("marks a version mismatch as requiring targeted asset refresh", async () => {
		const resolvePreferredBundleTarget = (loaderUtils as any)
			.resolvePreferredBundleTarget;

		expect(typeof resolvePreferredBundleTarget).toBe("function");
		await expect(
			resolvePreferredBundleTarget("old-build", async () => "new-build"),
		).resolves.toEqual({
			version: "new-build",
			shouldRefreshAssets: true,
		});
	});

	it("clears targeted POS asset caches and update keys during asset refresh", async () => {
		const clearPosAssetRecoveryTargets = (loaderUtils as any)
			.clearPosAssetRecoveryTargets;

		expect(typeof clearPosAssetRecoveryTargets).toBe("function");

		const deletedCacheKeys: string[] = [];
		const unregisteredScopes: string[] = [];
		const localRemovals: string[] = [];
		const sessionRemovals: string[] = [];

		await clearPosAssetRecoveryTargets({
			cacheStorage: {
				keys: async () => [
					"posawesome-cache-1",
					"workbox-precache",
					"posawesome-cache-2",
				],
				delete: async (key: string) => {
					deletedCacheKeys.push(key);
					return true;
				},
			},
			navigatorLike: {
				serviceWorker: {
					getRegistrations: async () => [
						{
							scope: "/",
							active: { scriptURL: "https://erp.test/sw.js" },
							unregister: async () => {
								unregisteredScopes.push("/");
								return true;
							},
						},
						{
							scope: "/other/",
							active: { scriptURL: "https://erp.test/other-sw.js" },
							unregister: async () => {
								unregisteredScopes.push("/other/");
								return true;
							},
						},
					],
				},
			},
			localStorageLike: {
				removeItem: (key: string) => {
					localRemovals.push(key);
				},
			},
			sessionStorageLike: {
				removeItem: (key: string) => {
					sessionRemovals.push(key);
				},
			},
		});

		expect(deletedCacheKeys).toEqual([
			"posawesome-cache-1",
			"posawesome-cache-2",
		]);
		expect(unregisteredScopes).toEqual(["/"]);
		expect(localRemovals).toEqual([
			"posawesome_version",
			"posawesome_update_dismissed",
			"posawesome_update_last_check",
		]);
		expect(sessionRemovals).toEqual(["posawesome_update_snooze_until"]);
	});

	it("renders and updates a classic boot overlay without importing app modules", () => {
		document.body.innerHTML = "";
		const ensureClassicBootOverlay = (loaderUtils as any)
			.ensureClassicBootOverlay;

		expect(typeof ensureClassicBootOverlay).toBe("function");

		const overlay = ensureClassicBootOverlay();
		overlay.update({
			title: "Refreshing outdated assets",
			detail: "Removing stale files before startup",
			progress: 42,
		});

		const root = document.querySelector("[data-posa-classic-boot-overlay]");
		expect(root).not.toBeNull();
		expect(root?.textContent).toContain("Refreshing outdated assets");
		expect(root?.textContent).toContain("Removing stale files before startup");
		expect(root?.textContent).toContain("42%");
	});
});
