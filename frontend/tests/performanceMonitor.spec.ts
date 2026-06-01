import { describe, expect, it, beforeEach } from "vitest";
import {
	configurePerfMonitor,
	getPerfEvents,
	getPerfSummaries,
	measureSync,
	resetPerfEvents,
	startPerfMeasure,
} from "../src/posapp/utils/perf";
import { PERFORMANCE_THRESHOLDS_MS, percentile } from "../src/posapp/utils/performanceThresholds";

describe("POS performance monitor", () => {
	beforeEach(() => {
		configurePerfMonitor({ enabled: true, debug: false, sampleRate: 1, bufferSize: 5 });
		resetPerfEvents();
	});

	it("records bounded percentile-ready events without sensitive tags", () => {
		for (let index = 0; index < 30; index += 1) {
			const metric = startPerfMeasure("pos.items.local_search", {
				source: "local",
				item_result_count: "21-100",
			});
			metric.finish("success");
		}

		const events = getPerfEvents();
		expect(events).toHaveLength(25);
		expect(events[0]).toMatchObject({
			name: "pos.items.local_search",
			status: "success",
		});
		expect(events[0].tags).not.toHaveProperty("customer");
		expect(events[0].tags).not.toHaveProperty("invoice");
		expect(getPerfSummaries()[0]).toMatchObject({
			name: "pos.items.local_search",
			count: 25,
			failures: 0,
		});
	});

	it("records failures and preserves thrown errors", () => {
		expect(() =>
			measureSync("pos.payment.submit", { source: "local" }, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");

		expect(getPerfEvents()[0]).toMatchObject({
			name: "pos.payment.submit",
			status: "failure",
			errorCode: "Error",
		});
	});

	it("keeps regression thresholds in one central config", () => {
		expect(PERFORMANCE_THRESHOLDS_MS.cachedSellReadyBoot).toBe(500);
		expect(PERFORMANCE_THRESHOLDS_MS.barcodeExactLookup).toBe(20);
		expect(PERFORMANCE_THRESHOLDS_MS.localItemAutocomplete).toBe(50);
		expect(PERFORMANCE_THRESHOLDS_MS.localCustomerAutocomplete).toBe(75);
		expect(PERFORMANCE_THRESHOLDS_MS.addItemToCart).toBe(50);
		expect(PERFORMANCE_THRESHOLDS_MS.cartRecalculate20Lines).toBe(40);
		expect(PERFORMANCE_THRESHOLDS_MS.cartRecalculate200Lines).toBe(150);
		expect(PERFORMANCE_THRESHOLDS_MS.offlineOutboxEnqueue).toBe(20);
		expect(PERFORMANCE_THRESHOLDS_MS.paymentDialogOpen).toBe(100);
		expect(percentile([1, 2, 3, 4, 5], 95)).toBe(5);
	});
});
