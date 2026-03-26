import { describe, expect, it } from "vitest";
import { evaluateBootFinalizeState } from "../src/posapp/utils/bootReadiness";

describe("evaluateBootFinalizeState", () => {
	it("finalizes when item and customer stages are complete even if store booleans lag", () => {
		const result = evaluateBootFinalizeState({
			profileStage: 100,
			itemsLoaded: false,
			itemsProgress: 40,
			itemsStage: 100,
			customersLoaded: false,
			customersProgress: 55,
			customersStage: 100,
			manualOffline: false,
			navigatorOnline: true,
			offlineMode: false,
		});

		expect(result.profileReady).toBe(true);
		expect(result.itemsReady).toBe(true);
		expect(result.customersReady).toBe(true);
		expect(result.shouldFinalize).toBe(true);
	});

	it("does not finalize before the profile stage is complete", () => {
		const result = evaluateBootFinalizeState({
			profileStage: 70,
			itemsLoaded: true,
			itemsProgress: 100,
			itemsStage: 100,
			customersLoaded: true,
			customersProgress: 100,
			customersStage: 100,
			manualOffline: false,
			navigatorOnline: true,
			offlineMode: false,
		});

		expect(result.profileReady).toBe(false);
		expect(result.shouldFinalize).toBe(false);
	});
});
