// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	BUILD_RECONCILIATION_KEYS,
	detectBuildChange,
	preservePendingOfflineQueues,
	reconcileBuildChangeOnStartup,
} from "../src/posapp/utils/buildCacheReconciler";

describe("build cache reconciler", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		vi.restoreAllMocks();
	});

	it("detects a build change from persisted runtime metadata", () => {
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			"build-1",
		);
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			"build-1",
		);

		expect(
			detectBuildChange({
				runtimeBuildVersion: "build-2",
				storage: window.localStorage,
				bootstrapSnapshotBuildVersion: "build-1",
				memoryState: {},
			}),
		).toMatchObject({
			buildChanged: true,
			shouldReconcile: true,
			reasons: expect.arrayContaining(["runtime_build_changed"]),
		});
	});

	it("preserves pending offline queues when reconciling", () => {
		expect(
			preservePendingOfflineQueues({
				offline_invoices: [{ name: "INV-1" }],
				offline_customers: [{ name: "CUST-1" }],
				offline_payments: [{ name: "PAY-1" }],
				offline_cash_movements: [{ name: "CM-1" }],
			}),
		).toEqual({
			offline_invoices: 1,
			offline_customers: 1,
			offline_payments: 1,
			offline_cash_movements: 1,
		});
	});

	it("reconciles immediately when a new build starts online", async () => {
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			"build-1",
		);
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			"build-1",
		);

		const purgeDerivedOfflineCaches = vi.fn().mockResolvedValue(undefined);
		const setBootstrapLimitedMode = vi.fn();

		await expect(
			reconcileBuildChangeOnStartup({
				runtimeBuildVersion: "build-2",
				storage: window.localStorage,
				isOnline: true,
				readBootstrapSnapshot: () => ({ build_version: "build-1" }),
				readMemoryState: () => ({
					cache_ready: true,
					stock_cache_ready: true,
					offline_invoices: [{ name: "INV-1" }],
				}),
				purgeDerivedOfflineCaches,
				setBootstrapLimitedMode,
			}),
		).resolves.toMatchObject({
			status: "reconciled_online",
			buildChanged: true,
			preservedQueues: {
				offline_invoices: 1,
				offline_customers: 0,
				offline_payments: 0,
				offline_cash_movements: 0,
			},
		});

		expect(purgeDerivedOfflineCaches).toHaveBeenCalledTimes(1);
		expect(setBootstrapLimitedMode).not.toHaveBeenCalledWith(true);
		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			),
		).toBe("build-2");
		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			),
		).toBe("build-2");
		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.pendingRefreshRequired,
			),
		).toBe("0");
	});

	it("enters limited mode and defers completion when the new build starts offline", async () => {
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			"build-1",
		);
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			"build-1",
		);

		const purgeDerivedOfflineCaches = vi.fn().mockResolvedValue(undefined);
		const setBootstrapLimitedMode = vi.fn();

		await expect(
			reconcileBuildChangeOnStartup({
				runtimeBuildVersion: "build-2",
				storage: window.localStorage,
				isOnline: false,
				readBootstrapSnapshot: () => ({ build_version: "build-1" }),
				readMemoryState: () => ({
					cache_ready: true,
					stock_cache_ready: true,
					offline_invoices: [{ name: "INV-1" }],
				}),
				purgeDerivedOfflineCaches,
				setBootstrapLimitedMode,
			}),
		).resolves.toMatchObject({
			status: "pending_online_reconcile",
			buildChanged: true,
		});

		expect(purgeDerivedOfflineCaches).toHaveBeenCalledTimes(1);
		expect(setBootstrapLimitedMode).toHaveBeenCalledWith(true);
		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			),
		).toBe("build-2");
		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			),
		).toBe("build-1");
		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.pendingRefreshRequired,
			),
		).toBe("1");
	});

	it("does not reconcile again once the same build is already reconciled", async () => {
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			"build-2",
		);
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.lastReconciledBuildVersion,
			"build-2",
		);
		window.localStorage.setItem(
			BUILD_RECONCILIATION_KEYS.pendingRefreshRequired,
			"0",
		);

		const purgeDerivedOfflineCaches = vi.fn().mockResolvedValue(undefined);

		await expect(
			reconcileBuildChangeOnStartup({
				runtimeBuildVersion: "build-2",
				storage: window.localStorage,
				isOnline: true,
				readBootstrapSnapshot: () => ({ build_version: "build-2" }),
				readMemoryState: () => ({
					cache_ready: false,
					stock_cache_ready: false,
				}),
				purgeDerivedOfflineCaches,
			}),
		).resolves.toMatchObject({
			status: "noop",
			buildChanged: false,
		});

		expect(purgeDerivedOfflineCaches).not.toHaveBeenCalled();
	});

	it("defers a new baseline until full memory hydration can inspect legacy caches", async () => {
		const purgeDerivedOfflineCaches = vi.fn().mockResolvedValue(undefined);

		await expect(
			reconcileBuildChangeOnStartup({
				runtimeBuildVersion: "build-2",
				storage: window.localStorage,
				isOnline: true,
				readMemoryState: () => ({}),
				deferInitialBaseline: true,
				purgeDerivedOfflineCaches,
			}),
		).resolves.toMatchObject({
			status: "noop",
			reasons: ["initial_baseline_deferred"],
		});

		expect(
			window.localStorage.getItem(
				BUILD_RECONCILIATION_KEYS.currentRuntimeBuildVersion,
			),
		).toBeNull();

		await expect(
			reconcileBuildChangeOnStartup({
				runtimeBuildVersion: "build-2",
				storage: window.localStorage,
				isOnline: true,
				readMemoryState: () => ({
					item_details_cache: { "ITEM-1": { rate: 10 } },
				}),
				purgeDerivedOfflineCaches,
			}),
		).resolves.toMatchObject({
			status: "reconciled_online",
			reasons: expect.arrayContaining(["legacy_build_metadata_missing"]),
		});
		expect(purgeDerivedOfflineCaches).toHaveBeenCalledTimes(1);
	});
});
