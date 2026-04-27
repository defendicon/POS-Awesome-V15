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
		getItemGroups: vi.fn(async () => []),
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
});
