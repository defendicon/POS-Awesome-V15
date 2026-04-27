import { describe, expect, it } from "vitest";

import {
	resolveBootstrapWarningUiState,
	shouldLiftBootstrapWarningStartupGate,
} from "../src/posapp/utils/bootstrapWarningVisibility";

describe("bootstrap warning startup deferral", () => {
	it("keeps warnings hidden during startup even when validation already found a warning", () => {
		const state = resolveBootstrapWarningUiState({
			startupWarningsReady: false,
			warningActive: true,
			warningTooltip: "Sell Offline\nOffline selling is unavailable.",
			capabilitySummaries: [
				{
					id: "sell_offline",
					label: "Sell Offline",
					status: "unavailable",
					severity: "error",
					message: "Offline selling is unavailable until caches are refreshed.",
					action: "Reconnect and refresh offline sell prerequisites.",
					warningCodes: ["items_cache_ready"],
					prerequisites: ["items_cache_ready"],
					policy: null,
				},
			],
		});

		expect(state.active).toBe(false);
		expect(state.tooltip).toBe("");
		expect(state.capabilitySummaries).toEqual([]);
	});

	it("shows warnings after startup completes when they are still valid", () => {
		const shouldLift = shouldLiftBootstrapWarningStartupGate({
			loadingActive: false,
			initialBootstrapSettled: true,
			startupGateLifted: false,
		});

		const state = resolveBootstrapWarningUiState({
			startupWarningsReady: shouldLift,
			warningActive: true,
			warningTooltip: "Stock Confidence Offline",
			capabilitySummaries: [],
		});

		expect(shouldLift).toBe(true);
		expect(state.active).toBe(true);
		expect(state.tooltip).toBe("Stock Confidence Offline");
	});

	it("keeps startup warnings hidden until item background sync settles", () => {
		const shouldLift = shouldLiftBootstrapWarningStartupGate({
			loadingActive: false,
			initialBootstrapSettled: true,
			itemsStartupSyncSettled: false,
			startupGateLifted: false,
		});

		const state = resolveBootstrapWarningUiState({
			startupWarningsReady: shouldLift,
			warningActive: true,
			warningTooltip: "Stock Confidence Offline",
			capabilitySummaries: [],
		});

		expect(shouldLift).toBe(false);
		expect(state.active).toBe(false);
		expect(state.tooltip).toBe("");
	});

	it("never surfaces a startup warning if the data becomes healthy before the gate lifts", () => {
		const state = resolveBootstrapWarningUiState({
			startupWarningsReady: true,
			warningActive: false,
			warningTooltip: "Sell Offline",
			capabilitySummaries: [],
		});

		expect(state.active).toBe(false);
		expect(state.tooltip).toBe("");
	});

	it("keeps post-startup warnings enabled even if later activity toggles loading again", () => {
		const shouldLift = shouldLiftBootstrapWarningStartupGate({
			loadingActive: true,
			initialBootstrapSettled: false,
			startupGateLifted: true,
		});

		const state = resolveBootstrapWarningUiState({
			startupWarningsReady: shouldLift,
			warningActive: true,
			warningTooltip: "Sell Offline",
			capabilitySummaries: [],
		});

		expect(shouldLift).toBe(true);
		expect(state.active).toBe(true);
		expect(state.tooltip).toBe("Sell Offline");
	});
});
