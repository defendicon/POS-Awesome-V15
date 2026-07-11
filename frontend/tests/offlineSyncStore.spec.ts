// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import type { OfflineCapabilitySummary } from "../src/posapp/stores/offlineSyncStore";
import { useOfflineSyncStore } from "../src/posapp/stores/offlineSyncStore";

function capability(
	patch: Partial<OfflineCapabilitySummary>,
): OfflineCapabilitySummary {
	return {
		id: "sell_offline",
		label: "Sell Offline",
		status: "ready",
		severity: "info",
		message: "Ready",
		action: "",
		warningCodes: [],
		prerequisites: [],
		policy: null,
		...patch,
	} as OfflineCapabilitySummary;
}

describe("offline sync store", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("uses persisted bootstrap capabilities as the stable global readiness signal", () => {
		const store = useOfflineSyncStore();
		store.setResourceStatesHydrated(true);
		store.setCapabilitySummaries([
			capability({ id: "sell_offline", label: "Sell Offline" }),
			capability({ id: "pricing_offline", label: "Pricing Offline" }),
			capability({ id: "stock_confidence_offline", label: "Stock Confidence Offline" }),
		]);

		store.setResourceStates([
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
		]);

		expect(store.globalSyncCoverage.status).toBe("ready");
		expect(store.globalSyncCoverage.ready).toBe(3);
		expect(store.globalSyncCoverage.syncing).toBe(1);
		expect(store.globalSyncLabel).toBe("Offline Data Ready");
		expect(store.globalSyncDetail).toBe(
			"Offline prerequisites are ready. Refreshing 1 background resource.",
		);
	});

	it("does not show a misleading zero count before prerequisite state hydration", () => {
		const store = useOfflineSyncStore();

		expect(store.globalSyncCoverage.status).toBe("checking");
		expect(store.globalSyncCoverage.hydrated).toBe(false);
		expect(store.globalSyncLabel).toBe("Offline Data Checking");
		expect(store.globalSyncDetail).toBe("Loading saved offline prerequisites.");
	});

	it("labels actionable bootstrap capability gaps as needing refresh", () => {
		const store = useOfflineSyncStore();
		store.setResourceStatesHydrated(true);
		store.setCapabilitySummaries([
			capability({ id: "sell_offline", label: "Sell Offline" }),
			capability({
				id: "pricing_offline",
				label: "Pricing Offline",
				status: "degraded",
				severity: "warning",
				message: "Offline pricing is unverified.",
				action: "Refresh pricing data.",
				warningCodes: ["pricing_rules_snapshot"],
				prerequisites: ["pricing_rules_snapshot"],
				policy: "allow_with_warning",
			}),
			capability({
				id: "stock_confidence_offline",
				label: "Stock Confidence Offline",
				status: "override_required",
				severity: "warning",
				message: "Stock confidence is low.",
				action: "Refresh stock data.",
				warningCodes: ["stock_cache_ready"],
				prerequisites: ["stock_cache_ready"],
				policy: "require_manager_override",
			}),
		]);

		expect(store.globalSyncCoverage.status).toBe("needs_refresh");
		expect(store.globalSyncCoverage.attention).toBe(2);
		expect(store.globalSyncLabel).toBe("Offline Data Needs Refresh");
		expect(store.globalSyncDetail).toBe(
			"1/3 prerequisites ready. 2 prerequisites need refresh.",
		);
	});
});
