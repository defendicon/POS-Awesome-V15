// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useOfflineSyncStore } from "../src/posapp/stores/offlineSyncStore";

describe("offline sync store", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("summarizes scheduled offline resources as one global sync signal", () => {
		const store = useOfflineSyncStore();
		store.setResourceStatesHydrated(true);

		store.setResourceStates([
			{
				resourceId: "bootstrap_config",
				status: "fresh",
				lastSyncedAt: "2026-07-11T10:00:00.000Z",
				watermark: "wm-1",
				lastSuccessHash: null,
				lastError: null,
				consecutiveFailures: 0,
				scopeSignature: "profile:main",
				schemaVersion: "v1",
			},
			{
				resourceId: "pricing_rules",
				status: "syncing",
				lastSyncedAt: null,
				watermark: null,
				lastSuccessHash: null,
				lastError: null,
				consecutiveFailures: 0,
				scopeSignature: "company:test",
				schemaVersion: null,
			},
			{
				resourceId: "stock",
				status: "error",
				lastSyncedAt: null,
				watermark: null,
				lastSuccessHash: null,
				lastError: "stock sync failed",
				consecutiveFailures: 1,
				scopeSignature: "profile:main",
				schemaVersion: null,
			},
		]);

		expect(store.globalSyncCoverage.total).toBe(10);
		expect(store.globalSyncCoverage.ready).toBe(1);
		expect(store.globalSyncCoverage.syncing).toBe(1);
		expect(store.globalSyncCoverage.attention).toBe(1);
		expect(store.globalSyncCoverage.tone).toBe("danger");
		expect(store.globalSyncLabel).toBe("Offline Data Refreshing");
		expect(store.globalSyncDetail).toBe("1/10 ready. Refreshing 1 offline resource.");
	});

	it("does not show a misleading zero count before sync state hydration", () => {
		const store = useOfflineSyncStore();

		expect(store.globalSyncCoverage.status).toBe("checking");
		expect(store.globalSyncCoverage.hydrated).toBe(false);
		expect(store.globalSyncLabel).toBe("Offline Data Checking");
		expect(store.globalSyncDetail).toBe("Checking saved offline sync status.");
	});

	it("labels failed or limited resources as needing refresh after hydration", () => {
		const store = useOfflineSyncStore();
		store.setResourceStatesHydrated(true);

		store.setResourceStates([
			{
				resourceId: "bootstrap_config",
				status: "limited",
				lastSyncedAt: null,
				watermark: null,
				lastSuccessHash: null,
				lastError: "Missing bootstrap data",
				consecutiveFailures: 1,
				scopeSignature: "profile:main",
				schemaVersion: null,
			},
			{
				resourceId: "pricing_rules",
				status: "error",
				lastSyncedAt: null,
				watermark: null,
				lastSuccessHash: null,
				lastError: "Server offline",
				consecutiveFailures: 1,
				scopeSignature: "company:test",
				schemaVersion: null,
			},
		]);

		expect(store.globalSyncCoverage.status).toBe("attention");
		expect(store.globalSyncCoverage.attention).toBe(2);
		expect(store.globalSyncLabel).toBe("Offline Data Needs Refresh");
		expect(store.globalSyncDetail).toBe("0/10 ready. 2 offline resources need attention.");
	});
});
