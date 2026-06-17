import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { generateItems, type CatalogSize, CATALOG_SIZES } from "./helpers/mockDataGenerators";
import { createMockFrappeCall } from "./helpers/mockApiFactory";
import { measureAsync, assertUnderThreshold, BenchmarkCollector } from "./helpers/perfMeasure";
import { catalogThreshold } from "./helpers/benchmark.config";

const collector = new BenchmarkCollector();

const TEST_TIMEOUTS: Record<CatalogSize, number> = {
	10_000: 10000,
	50_000: 20000,
	100_000: 30000,
};

describe("catalog load performance", () => {
	for (const size of CATALOG_SIZES) {
		describe(`${(size / 1000).toFixed(0)}K items`, () => {
			let items: ReturnType<typeof generateItems>;
			let itemsMap: Map<string, (typeof items)[number]>;
			let barcodeIndex: Map<string, string>;

			beforeAll(() => {
				setActivePinia(createPinia());
				items = generateItems(size);
				itemsMap = new Map(items.map((i) => [i.item_code, i]));
				barcodeIndex = new Map(
					items.filter((i) => i.barcode).map((i) => [i.barcode!, i.item_code]),
				);
			});

			it(`loads ${(size / 1000).toFixed(0)}K items from paginated API within time budget`, async () => {
				const thresholds = catalogThreshold(size);
				const pageSize = 200;
				const frappeCall = createMockFrappeCall(items, { latencyMs: 20, jitterMs: 5, pageSize });
				(globalThis as any).frappe = { call: frappeCall };

				const totalPages = Math.ceil(items.length / pageSize);
				const loaded: Array<Record<string, any>> = [];

				const result = await measureAsync(`load ${size} items`, async () => {
					loaded.length = 0;
					for (let page = 0; page < totalPages; page++) {
						const resp = await frappeCall({
							method: "get_items",
							args: { offset: page * pageSize, limit: pageSize },
						});
						loaded.push(...resp.message);
					}
				}, { warmup: false });

				collector.add(result);
				expect(loaded.length).toBe(items.length);
				assertUnderThreshold(`load ${size} items`, result.durationMs, thresholds.load);
				if (result.memoryMB !== undefined) {
					expect(
						result.memoryMB,
						`load ${size} items delta memory ${result.memoryMB.toFixed(1)}MB > 200MB`,
					).toBeLessThan(200);
				}
			}, TEST_TIMEOUTS[size]);

			it(`searches item_code from ${(size / 1000).toFixed(0)}K catalog within time budget`, async () => {
				const thresholds = catalogThreshold(size);
				const midIndex = Math.floor(items.length / 2);
				const targetCode = items[midIndex].item_code;

				const result = await measureAsync(`search in ${size} items`, async () => {
					const found = itemsMap.get(targetCode);
					if (!found) throw new Error("not found");
				}, { iterations: 50 });

				collector.add(result);
				assertUnderThreshold(`search in ${size} items`, result.durationMs, thresholds.search);
			}, TEST_TIMEOUTS[size]);

			it(`looks up barcode from ${(size / 1000).toFixed(0)}K catalog within time budget`, async () => {
				const thresholds = catalogThreshold(size);
				const midIndex = Math.floor(items.length / 2);
				const targetBarcode = items[midIndex].barcode!;

				const result = await measureAsync(`barcode lookup in ${size} items`, async () => {
					const code = barcodeIndex.get(targetBarcode);
					if (!code) throw new Error("not found");
				}, { iterations: 50 });

				collector.add(result);
				assertUnderThreshold(`barcode lookup in ${size} items`, result.durationMs, thresholds.barcode);
			}, TEST_TIMEOUTS[size]);
		});
	}

	afterAll(() => {
		delete (globalThis as any).frappe;
		if (collector.results.length > 0) {
			console.log("\n[catalog benchmark results]\n" + collector.summary);
		}
	});
});
