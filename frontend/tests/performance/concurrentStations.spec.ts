import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { SyncCoordinator } from "../../src/offline/sync/SyncCoordinator";
import type { SyncResourceDefinition, SyncTrigger } from "../../src/offline/sync/types";
import { measureAsync, assertUnderThreshold, BenchmarkCollector } from "./helpers/perfMeasure";
import { generateItems, generateItemCodes } from "./helpers/mockDataGenerators";
import { sleep } from "./helpers/mockApiFactory";
import { concurrentThreshold } from "./helpers/benchmark.config";

const collector = new BenchmarkCollector();

vi.mock("../../src/offline/sync/syncState", () => ({
	setSyncResourceState: vi.fn(async () => undefined),
}));

const makeResource = (
	id: SyncResourceDefinition["id"],
	priority: SyncResourceDefinition["priority"],
	triggers: SyncTrigger[],
): SyncResourceDefinition => ({
	id,
	scope: "profile" as const,
	mode: "delta" as const,
	priority,
	triggers,
	storageKey: `${id}_cache`,
	watermarkType: "timestamp" as const,
	fullResyncSupported: true,
});

const STATION_COUNTS = [10, 50, 100] as const;

describe("concurrent stations", () => {
	describe("SyncCoordinator throughput", () => {
		for (const stationCount of STATION_COUNTS) {
			it(`processes ${stationCount} station-wide resources without exceeding concurrency limit`, async () => {
				const thresholds = concurrentThreshold(stationCount);
				const resources = Array.from({ length: stationCount }, (_, i) =>
					makeResource(`station_${i}`, "warm", ["boot"]),
				);
				let activeRuns = 0;
				let maxActiveRuns = 0;

				const coordinator = new SyncCoordinator({
					concurrency: 5,
					resources,
					runResource: async () => {
						activeRuns += 1;
						maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
						await sleep(2);
						activeRuns -= 1;
					},
				});

				const result = await measureAsync(
					`SyncCoordinator ${stationCount} resources (concurrency=5)`,
					() => coordinator.runTrigger("boot"),
				);

				collector.add(result);
				expect(maxActiveRuns).toBeLessThanOrEqual(5);
				assertUnderThreshold(
					`sync ${stationCount} resources`,
					result.durationMs,
					thresholds.syncCoordinator,
				);
			});
		}
	});

	describe("parallel idempotent API calls", () => {
		const PAYLOAD_COUNT = 50;

		for (const stationCount of STATION_COUNTS) {
			it(`handles ${Math.min(stationCount, PAYLOAD_COUNT)} parallel submissions with dedup`, async () => {
				const thresholds = concurrentThreshold(stationCount);
				const seen = new Set<string>();
				const actualExecutions: string[] = [];

				const handler = async (key: string) => {
					await sleep(1);
					if (seen.has(key)) {
						throw new Error(`Duplicate submission detected for ${key}`);
					}
					seen.add(key);
					actualExecutions.push(key);
					return { success: true };
				};

				const stationCountCapped = Math.min(stationCount, PAYLOAD_COUNT);
				const uniqueKeys = generateItemCodes(stationCountCapped, 1);
				const keys = [...uniqueKeys, ...uniqueKeys.slice(0, Math.min(5, stationCountCapped))];

				const result = await measureAsync(
					`${stationCountCapped} parallel submissions with idempotency check`,
					async () => {
						seen.clear();
						actualExecutions.length = 0;
						await Promise.all(
							keys.map((key) =>
								handler(key).catch((e) => ({ error: e.message, key })),
							),
						);
					},
				);

				collector.add(result);
				expect(actualExecutions.length).toBe(stationCountCapped);
				expect(actualExecutions).toEqual(uniqueKeys);
				assertUnderThreshold(
					`${stationCountCapped} parallel submissions`,
					result.durationMs,
					thresholds.parallelSubmissions,
				);
			});
		}
	});

	describe("concurrent search throughput", () => {
		const ITEM_COUNT = 10_000;
		let items: ReturnType<typeof generateItems>;
		let itemsMap: Map<string, (typeof items)[number]>;

		beforeAll(() => {
			items = generateItems(ITEM_COUNT);
			itemsMap = new Map(items.map((i) => [i.item_code, i]));
		});

		for (const stationCount of STATION_COUNTS) {
			it(`executes ${stationCount} parallel searches on ${(ITEM_COUNT / 1000).toFixed(0)}K catalog`, async () => {
				const thresholds = concurrentThreshold(stationCount);
				const targetCodes = items.slice(0, Math.min(stationCount, ITEM_COUNT)).map((i) => i.item_code);

				const result = await measureAsync(
					`${stationCount} concurrent map lookups`,
					async () => {
						await Promise.all(
							targetCodes.map((code) => {
								const found = itemsMap.get(code);
								if (!found) throw new Error(`not found: ${code}`);
							}),
						);
					},
				);

				collector.add(result);
				assertUnderThreshold(
					`${stationCount} concurrent lookups`,
					result.durationMs,
					thresholds.concurrentSearch,
				);
			});
		}
	});

	afterAll(() => {
		if (collector.results.length > 0) {
			console.log("\n[concurrent benchmark results]\n" + collector.summary);
		}
	});
});
