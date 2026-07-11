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
		expect(store.globalSyncLabel).toBe("Offline Data 1/10");
		expect(store.globalSyncDetail).toBe("Refreshing 1 offline resource.");
	});
});
