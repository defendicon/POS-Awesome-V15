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

vi.mock("../src/posapp/services/itemService", () => ({
	default: {
		getItemGroupsData: vi.fn(async () => []),
	},
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
	});

	it("tracks progress from remaining catalog instead of already loaded bootstrap items", async () => {
		const sync = useItemsSync();
		const setItems = vi.fn();
		const frappeCall = vi
			.fn()
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-2", item_name: "Item 2" },
					{ item_code: "ITEM-3", item_name: "Item 3" },
				],
			})
			.mockImplementationOnce(async () => {
				expect(sync.loadProgress.value).toBe(67);
				expect((sync as any).syncedItemsCount?.value).toBe(2);
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

		expect(sync.loadProgress.value).toBe(100);
		expect((sync as any).syncedItemsCount?.value).toBe(2);
		expect(setItems).toHaveBeenCalledWith(
			[
				{ item_code: "ITEM-2", item_name: "Item 2" },
				{ item_code: "ITEM-3", item_name: "Item 3" },
			],
			{ append: true },
		);
	});

	it("marks stock cache ready after background item sync stores stock quantities", async () => {
		const sync = useItemsSync();
		const frappeCall = vi
			.fn()
			.mockResolvedValueOnce({
				message: [
					{
						item_code: "ITEM-2",
						item_name: "Item 2",
						actual_qty: 7,
					},
				],
			})
			.mockResolvedValueOnce({ message: [] });
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

	it("requests larger background batches by default", async () => {
		const sync = useItemsSync();
		const resolvePageSize = vi.fn((pageSize?: number) => pageSize || 0);
		const frappeCall = vi.fn().mockResolvedValueOnce({ message: [] });
		(globalThis as any).frappe = { call: frappeCall };

		await sync.backgroundSyncItems(
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

		expect(resolvePageSize).toHaveBeenCalledWith(1000);
		expect(frappeCall).toHaveBeenCalledWith(
			expect.objectContaining({
				args: expect.objectContaining({
					limit: 1000,
				}),
			}),
		);
	});

	it("throttles cached pagination refresh while background batches continue", async () => {
		const sync = useItemsSync();
		const updateCachedPaginationFromStorage = vi.fn(async () => {});
		const setItems = vi.fn();
		const frappeCall = vi
			.fn()
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-1", item_name: "Item 1" },
					{ item_code: "ITEM-2", item_name: "Item 2" },
				],
			})
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-3", item_name: "Item 3" },
					{ item_code: "ITEM-4", item_name: "Item 4" },
				],
			})
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-5", item_name: "Item 5" },
					{ item_code: "ITEM-6", item_name: "Item 6" },
				],
			})
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-7", item_name: "Item 7" },
					{ item_code: "ITEM-8", item_name: "Item 8" },
				],
			})
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-9", item_name: "Item 9" },
					{ item_code: "ITEM-10", item_name: "Item 10" },
				],
			})
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-11", item_name: "Item 11" },
					{ item_code: "ITEM-12", item_name: "Item 12" },
				],
			})
			.mockResolvedValueOnce({ message: [] });
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

		expect(setItems).toHaveBeenCalledTimes(6);
		expect(updateCachedPaginationFromStorage).toHaveBeenCalledTimes(2);
	});

	it("persists large background batches without appending beyond the memory cap", async () => {
		const sync = useItemsSync();
		const setItems = vi.fn((batch: any[]) => {
			itemsRef.value = [...itemsRef.value, ...batch];
		});
		const itemsRef = {
			value: [
				{ item_code: "ITEM-1", item_name: "Item 1" },
				{ item_code: "ITEM-2", item_name: "Item 2" },
			],
		};
		const frappeCall = vi
			.fn()
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-3", item_name: "Item 3" },
					{ item_code: "ITEM-4", item_name: "Item 4" },
				],
			})
			.mockResolvedValueOnce({
				message: [
					{ item_code: "ITEM-5", item_name: "Item 5" },
					{ item_code: "ITEM-6", item_name: "Item 6" },
				],
			})
			.mockResolvedValueOnce({ message: [] });
		(globalThis as any).frappe = { call: frappeCall };

		await sync.backgroundSyncItems(
			{
				initialBatch: itemsRef.value,
			},
			{ name: "POS-1", warehouse: "WH-1" } as any,
			"Retail",
			"POS-1_WH-1",
			true,
			() => 2,
			setItems,
			vi.fn(async () => {}),
			{ value: 6 },
			{ value: false },
			itemsRef,
			2,
		);

		expect(offlineMocks.saveItemsBulk).toHaveBeenCalledWith(
			[
				{ item_code: "ITEM-3", item_name: "Item 3" },
				{ item_code: "ITEM-4", item_name: "Item 4" },
			],
			"POS-1_WH-1",
		);
		expect(offlineMocks.saveItemsBulk).toHaveBeenCalledWith(
			[
				{ item_code: "ITEM-5", item_name: "Item 5" },
				{ item_code: "ITEM-6", item_name: "Item 6" },
			],
			"POS-1_WH-1",
		);
		expect(setItems).not.toHaveBeenCalled();
		expect(itemsRef.value).toHaveLength(2);
	});
});
