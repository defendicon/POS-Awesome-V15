import { watch } from "vue";
import { describe, expect, it, vi, beforeEach } from "vitest";

const offlineMocks = vi.hoisted(() => ({
	saveItemsBulk: vi.fn(async () => {}),
	clearStoredItems: vi.fn(async () => {}),
	setItemsLastSync: vi.fn(),
	getItemsLastSync: vi.fn(() => null),
	saveItemDetailsCache: vi.fn(),
	saveItemUOMs: vi.fn(),
	saveItemGroups: vi.fn(),
	getCachedItemGroups: vi.fn(() => []),
	refreshBootstrapSnapshotFromCacheState: vi.fn(),
	updateLocalStockCache: vi.fn(),
	setStockCacheReady: vi.fn(),
}));

const itemServiceMocks = vi.hoisted(() => ({
	getItemGroupsData: vi.fn(async () => []),
	getItemsCountData: vi.fn(async () => 0),
}));

vi.mock("../src/posapp/services/itemService", () => ({
	default: itemServiceMocks,
}));

vi.mock("../src/offline/index", () => ({
	saveItemsBulk: offlineMocks.saveItemsBulk,
	clearStoredItems: offlineMocks.clearStoredItems,
	setItemsLastSync: offlineMocks.setItemsLastSync,
	getItemsLastSync: offlineMocks.getItemsLastSync,
	saveItemDetailsCache: offlineMocks.saveItemDetailsCache,
	saveItemUOMs: offlineMocks.saveItemUOMs,
	saveItemGroups: offlineMocks.saveItemGroups,
	getCachedItemGroups: offlineMocks.getCachedItemGroups,
	refreshBootstrapSnapshotFromCacheState:
		offlineMocks.refreshBootstrapSnapshotFromCacheState,
	updateLocalStockCache: offlineMocks.updateLocalStockCache,
	setStockCacheReady: offlineMocks.setStockCacheReady,
}));

import { useItemsSync } from "../src/posapp/composables/pos/items/store/useItemsSync";

describe("store useItemsSync background progress", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		itemServiceMocks.getItemsCountData.mockResolvedValue(0);
	});

	it("tracks progress from remaining catalog instead of already loaded bootstrap items", async () => {
		const sync = useItemsSync();
		const setItems = vi.fn();
		const observedProgress: number[] = [];
		const stopWatching = watch(
			sync.loadProgress,
			(value) => observedProgress.push(value),
			{ flush: "sync" },
		);
		itemServiceMocks.getItemsCountData.mockResolvedValue(4);
		const frappeCall = vi.fn(async ({ args }) => {
			if (args.offset === 1) {
				return {
				message: [
					{ item_code: "ITEM-2", item_name: "Item 2" },
					{ item_code: "ITEM-3", item_name: "Item 3" },
				],
				};
			}
			return { message: [] };
		});
		(globalThis as any).frappe = { call: frappeCall };

		await sync.backgroundSyncItems(
			{
				initialBatch: [{ item_code: "ITEM-1", item_name: "Item 1" }],
			},
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			() => 2,
			setItems,
			vi.fn(async () => {}),
			{ value: 4 },
			{ value: false },
			{
				value: [{ item_code: "ITEM-1", item_name: "Item 1" }],
			},
		);
		stopWatching();

		expect(sync.loadProgress.value).toBe(100);
		expect(observedProgress).toContain(33);
		expect(observedProgress).toContain(67);
		expect(sync.syncedItemsCount.value).toBe(2);
		expect(setItems).toHaveBeenCalledWith(
			[
				{ item_code: "ITEM-2", item_name: "Item 2" },
				{ item_code: "ITEM-3", item_name: "Item 3" },
			],
			{ append: true },
		);
	});

	it("publishes the synced item count one item at a time", async () => {
		const sync = useItemsSync();
		const observedCounts: number[] = [];
		const stopWatching = watch(
			sync.syncedItemsCount,
			(value) => observedCounts.push(value),
			{ flush: "sync" },
		);
		const frappeCall = vi.fn(async ({ args }) => {
			if (args.offset === 0) {
				return {
				message: [
					{ item_code: "ITEM-1", item_name: "Item 1" },
					{ item_code: "ITEM-2", item_name: "Item 2" },
					{ item_code: "ITEM-3", item_name: "Item 3" },
				],
				};
			}
			return { message: [] };
		});
		(globalThis as any).frappe = { call: frappeCall };

		await sync.backgroundSyncItems(
			{},
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			() => 3,
			vi.fn(),
			vi.fn(async () => {}),
			{ value: 3 },
			{ value: false },
			{ value: [] },
		);
		stopWatching();

		expect(observedCounts).toEqual([1, 2, 3]);
		expect(sync.syncedItemsCount.value).toBe(3);
	});

	it("marks stock cache ready after background item sync stores stock quantities", async () => {
		const sync = useItemsSync();
		const frappeCall = vi.fn(async ({ args }) => {
			if (args.offset === 1) {
				return {
				message: [
					{
						item_code: "ITEM-2",
						item_name: "Item 2",
						actual_qty: 7,
					},
				],
				};
			}
			return { message: [] };
		});
		(globalThis as any).frappe = { call: frappeCall };

		await sync.backgroundSyncItems(
			{
				initialBatch: [
					{
						item_code: "ITEM-1",
						item_name: "Item 1",
						actual_qty: 3,
					},
				],
			},
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			() => 2,
			vi.fn(),
			vi.fn(async () => {}),
			{ value: 2 },
			{ value: false },
			{
				value: [
					{
						item_code: "ITEM-1",
						item_name: "Item 1",
						actual_qty: 3,
					},
				],
			},
		);

		expect(
			offlineMocks.refreshBootstrapSnapshotFromCacheState,
		).toHaveBeenLastCalledWith({
			itemsCount: 2,
			stockCacheReady: true,
		});
	});

	it("requests five 200-item background pages in parallel", async () => {
		const sync = useItemsSync();
		const resolvePageSize = vi.fn((pageSize?: number) => pageSize || 0);
		const resolvers: Array<(_value: { message: never[] }) => void> = [];
		const frappeCall = vi.fn(
			() =>
				new Promise<{ message: never[] }>((resolve) => {
					resolvers.push(resolve);
				}),
		);
		(globalThis as any).frappe = { call: frappeCall };

		const syncPromise = sync.backgroundSyncItems(
			{},
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			resolvePageSize,
			vi.fn(),
			vi.fn(async () => {}),
			{ value: 0 },
			{ value: false },
			{ value: [] },
		);

		await vi.waitFor(() => {
			expect(frappeCall).toHaveBeenCalledTimes(5);
		});
		expect(resolvePageSize).toHaveBeenCalledWith(200);
		expect(
			frappeCall.mock.calls.map(([request]) => request.args.offset),
		).toEqual([0, 200, 400, 600, 800]);
		expect(
			frappeCall.mock.calls.map(([request]) => request.args.limit),
		).toEqual([200, 200, 200, 200, 200]);

		resolvers.forEach((resolve) => resolve({ message: [] }));
		await syncPromise;
		expect(frappeCall).toHaveBeenCalledTimes(5);
		expect(frappeCall).toHaveBeenCalledWith(
			expect.objectContaining({ freeze: false }),
		);
	});

	it("continues syncing when the local cached count is stale", async () => {
		const sync = useItemsSync();
		const initialBatch = [{ item_code: "ITEM-1", item_name: "Item 1" }];
		const catalog = Array.from({ length: 13 }, (_, index) => ({
			item_code: `ITEM-${index + 1}`,
			item_name: `Item ${index + 1}`,
		}));
		itemServiceMocks.getItemsCountData.mockResolvedValue(catalog.length);
		const frappeCall = vi.fn(async ({ args }) => ({
			message: catalog.slice(args.offset, args.offset + args.limit),
		}));
		const setItems = vi.fn();
		const requestsAtFirstProgress: number[] = [];
		const stopWatching = watch(
			sync.syncedItemsCount,
			(value) => {
				if (value === 1) {
					requestsAtFirstProgress.push(frappeCall.mock.calls.length);
				}
			},
			{ flush: "sync" },
		);
		(globalThis as any).frappe = { call: frappeCall };

		const appended = await sync.backgroundSyncItems(
			{ initialBatch },
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			() => 2,
			setItems,
			vi.fn(async () => {}),
			{ value: 3 },
			{ value: false },
			{ value: initialBatch },
		);
		stopWatching();

		expect(appended).toHaveLength(12);
		expect(setItems).toHaveBeenCalledTimes(2);
		expect(
			frappeCall.mock.calls.map(([request]) => request.args.offset),
		).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
		expect(requestsAtFirstProgress).toEqual([10]);
		expect(sync.syncedItemsCount.value).toBe(12);
		expect(sync.loadProgress.value).toBe(100);
	});

	it("throttles cached pagination refresh while background batches continue", async () => {
		const sync = useItemsSync();
		const updateCachedPaginationFromStorage = vi.fn(async () => {});
		const setItems = vi.fn();
		const frappeCall = vi.fn(async ({ args }) => {
			const start = args.offset + 1;
			if (start > 12) {
				return { message: [] };
			}
			return {
				message: [
					{
						item_code: `ITEM-${start}`,
						item_name: `Item ${start}`,
					},
					{
						item_code: `ITEM-${start + 1}`,
						item_name: `Item ${start + 1}`,
					},
				],
			};
		});
		(globalThis as any).frappe = { call: frappeCall };

		await sync.backgroundSyncItems(
			{},
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			() => 2,
			setItems,
			updateCachedPaginationFromStorage,
			{ value: 12 },
			{ value: false },
			{ value: [] },
		);

		expect(setItems).toHaveBeenCalledTimes(2);
		expect(updateCachedPaginationFromStorage).toHaveBeenCalledTimes(2);
	});
});
