import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { customerMatchesSearchTerm } from "../src/posapp/stores/customers/customerSearch";
import { PERFORMANCE_THRESHOLDS_MS, percentile } from "../src/posapp/utils/performanceThresholds";
import {
	db,
	hydrateOperationalIndexFromSnapshot,
	lookupBarcodeExact,
	resetInventoryEngine,
	saveOperationalItemsFromRaw,
	searchItemsLocal,
} from "../src/offline";

function timed(samples: number, fn: () => void) {
	const durations: number[] = [];
	for (let index = 0; index < samples; index += 1) {
		const startedAt = performance.now();
		fn();
		durations.push(performance.now() - startedAt);
	}
	return percentile(durations, 95) || 0;
}

function syntheticItems(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		item_code: `PERF-ITEM-${index}`,
		item_name: `Performance Item ${index}`,
		item_group: `Group ${index % 10}`,
		brand: `Brand ${index % 5}`,
		barcode: `9900${index}`,
		rate: 10 + (index % 50),
		_search_index: `perf-item-${index} performance item ${index} brand ${index % 5}`,
	}));
}

function syntheticCustomers(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		name: `PERF-CUST-${index}`,
		customer_name: `Performance Customer ${index}`,
		mobile_no: `555${String(index).padStart(7, "0")}`,
		email_id: `perf.customer.${index}@example.test`,
	}));
}

describe("POS performance regression baselines", () => {
	beforeEach(async () => {
		await db.open();
		await db.table("items").clear();
		await db.table("operational_items").clear();
		resetInventoryEngine();
	}, 30000);

	it("tracks local item autocomplete against the engineering target", async () => {
		const items = syntheticItems(25000);
		const scope = "PERF_PROFILE_MAIN";
		await saveOperationalItemsFromRaw(items, scope);
		await hydrateOperationalIndexFromSnapshot(scope);
		const p95 = timed(15, () => {
			searchItemsLocal("performance item 249", {
				scope,
				limit: 50,
			});
		});

		expect(p95).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS_MS.localItemAutocomplete);
	}, 30000);

	it("tracks barcode exact lookup against the engineering target", async () => {
		const items = syntheticItems(25000);
		const scope = "PERF_PROFILE_MAIN";
		await saveOperationalItemsFromRaw(items, scope);
		await hydrateOperationalIndexFromSnapshot(scope);
		const p95 = timed(30, () => {
			lookupBarcodeExact("990024999", scope);
		});

		expect(p95).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS_MS.barcodeExactLookup);
	});

	it("tracks local customer autocomplete against the engineering target", () => {
		const customers = syntheticCustomers(25000);
		const p95 = timed(10, () => {
			customers
				.filter((customer) => customerMatchesSearchTerm(customer, "customer 249"))
				.slice(0, 50);
		});

		expect(p95).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS_MS.localCustomerAutocomplete);
	});
});
