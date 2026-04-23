import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
	getBootstrapSnapshot: vi.fn(() => ({
		build_version: "build-1",
		profile_name: "POS-1",
		profile_modified: "2026-04-09T09:00:00",
		prerequisites: {},
	})),
	setBootstrapSnapshot: vi.fn(),
	saveItemsBulk: vi.fn().mockResolvedValue(undefined),
	clearStoredItems: vi.fn().mockResolvedValue(undefined),
	deleteStoredItemsByCodes: vi.fn().mockResolvedValue(undefined),
	getStoredItemsCountByScope: vi.fn().mockResolvedValue(7),
	saveItemDetailsCache: vi.fn(),
	clearItemDetailsCache: vi.fn(),
	removeItemDetailsCacheEntries: vi.fn(),
	clearPriceListCache: vi.fn(),
	mergeCachedPriceListItems: vi.fn(),
	removeCachedPriceListItems: vi.fn(),
	setItemsLastSync: vi.fn(),
	clearCustomerStorage: vi.fn().mockResolvedValue(undefined),
	getCustomerStorageCount: vi.fn().mockResolvedValue(5),
	setCustomersLastSync: vi.fn(),
}));

const customerMocks = vi.hoisted(() => ({
	setCustomerStorage: vi.fn().mockResolvedValue(undefined),
	deleteCustomerStorageByNames: vi.fn().mockResolvedValue(undefined),
}));

const stockMocks = vi.hoisted(() => ({
	clearLocalStockCache: vi.fn(),
	updateLocalStockCache: vi.fn(),
	removeLocalStockEntries: vi.fn(),
	setStockCacheReady: vi.fn(),
}));

const bootstrapSnapshotMocks = vi.hoisted(() => ({
	refreshBootstrapSnapshotFromCaches: vi.fn(
		({ currentSnapshot, registerData, cacheState }) => ({
			...(currentSnapshot || {}),
			build_version: currentSnapshot?.build_version || "build-1",
			profile_name:
				registerData?.pos_profile?.name ||
				currentSnapshot?.profile_name ||
				null,
			profile_modified:
				registerData?.pos_profile?.modified ||
				currentSnapshot?.profile_modified ||
				null,
			prerequisites: {
				...(currentSnapshot?.prerequisites || {}),
				items_cache_ready:
					typeof cacheState?.itemsCount === "number" ? "ready" : "missing",
				customers_cache_ready:
					typeof cacheState?.customersCount === "number"
						? "ready"
						: "missing",
				stock_cache_ready: cacheState?.stockCacheReady ? "ready" : "missing",
			},
		}),
	),
}));

const syncStateMocks = vi.hoisted(() => ({
	getSyncResourceState: vi.fn().mockResolvedValue(null),
	setSyncResourceState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/offline/cache", () => cacheMocks);
vi.mock("../src/offline/customers", () => customerMocks);
vi.mock("../src/offline/stock", () => stockMocks);
vi.mock("../src/offline/bootstrapSnapshot", () => bootstrapSnapshotMocks);
vi.mock("../src/offline/sync/syncState", () => syncStateMocks);

import { syncCustomersResource } from "../src/offline/sync/adapters/customers";
import { syncItemsResource } from "../src/offline/sync/adapters/items";
import { syncStockResource } from "../src/offline/sync/adapters/stock";

describe("operational offline sync adapters", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cacheMocks.getBootstrapSnapshot.mockReturnValue({
			build_version: "build-1",
			profile_name: "POS-1",
			profile_modified: "2026-04-09T09:00:00",
			prerequisites: {},
		});
		syncStateMocks.getSyncResourceState.mockResolvedValue(null);
		cacheMocks.getStoredItemsCountByScope.mockResolvedValue(7);
		cacheMocks.getCustomerStorageCount.mockResolvedValue(5);
	});

	it("clears stale item scope before applying delta writes and deletes", async () => {
		syncStateMocks.getSyncResourceState.mockImplementation(async (resourceId) => {
			if (resourceId === "items") {
				return {
					resourceId,
					status: "fresh",
					lastSyncedAt: "2026-04-09T09:00:00",
					watermark: "2026-04-09T09:00:00",
					lastSuccessHash: null,
					lastError: null,
					consecutiveFailures: 0,
					scopeSignature: JSON.stringify({
						profile: "OLD-POS",
						company: "Test Co",
						warehouse: "OLD-WH",
					}),
					schemaVersion: "2026-04-09",
				};
			}
			return null;
		});

		const fetcher = vi.fn(async ({ watermark }) => {
			expect(watermark).toBeNull();
			return {
				schema_version: "2026-04-09",
				next_watermark: "2026-04-09T10:05:00",
				has_more: false,
				changes: [
					{
						key: "item::ITEM-001",
						modified: "2026-04-09T10:05:00",
						data: {
							item_code: "ITEM-001",
							item_name: "Green Tea",
							modified: "2026-04-09T10:05:00",
							actual_qty: 8,
							price_list_rate: 120,
						},
					},
				],
				deleted: [{ key: "item::ITEM-002" }],
			};
		});

		const result = await syncItemsResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				warehouse: "Main WH",
				modified: "2026-04-09T10:05:00",
			},
			priceList: "Retail",
			watermark: "2026-04-09T09:59:00",
			fetcher,
		});

		expect(cacheMocks.clearStoredItems).toHaveBeenCalledWith("POS-1_Main WH");
		expect(cacheMocks.clearPriceListCache).toHaveBeenCalledOnce();
		expect(cacheMocks.clearItemDetailsCache).toHaveBeenCalledOnce();
		expect(cacheMocks.saveItemsBulk).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					item_code: "ITEM-001",
				}),
			],
			"POS-1_Main WH",
		);
		expect(cacheMocks.saveItemDetailsCache).toHaveBeenCalledWith(
			"POS-1",
			"Retail",
			[
				expect.objectContaining({
					item_code: "ITEM-001",
				}),
			],
		);
		expect(cacheMocks.mergeCachedPriceListItems).toHaveBeenCalledWith(
			"Retail",
			[
				expect.objectContaining({
					item_code: "ITEM-001",
				}),
			],
		);
		expect(cacheMocks.deleteStoredItemsByCodes).toHaveBeenCalledWith(
			["ITEM-002"],
			"POS-1_Main WH",
		);
		expect(cacheMocks.removeItemDetailsCacheEntries).toHaveBeenCalledWith(
			"POS-1",
			["ITEM-002"],
			"Retail",
		);
		expect(cacheMocks.removeCachedPriceListItems).toHaveBeenCalledWith(
			["ITEM-002"],
			"Retail",
		);
		expect(cacheMocks.getStoredItemsCountByScope).toHaveBeenCalledWith(
			"POS-1_Main WH",
		);
		expect(cacheMocks.setItemsLastSync).toHaveBeenCalledWith(
			"2026-04-09T10:05:00",
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "items",
				status: "fresh",
				scopeSignature: JSON.stringify({
					profile: "POS-1",
					company: "Test Co",
					warehouse: "Main WH",
				}),
			}),
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "item_prices",
				status: "fresh",
			}),
		);
		expect(result.status).toBe("fresh");
	});

	it("exhausts paginated item full syncs and records verified counts", async () => {
		cacheMocks.getStoredItemsCountByScope.mockResolvedValue(4);

		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				schema_version: "2026-04-09",
				next_cursor: "ITEM-002",
				next_watermark: "2026-04-09T10:02:00",
				total_count: 4,
				has_more: true,
				changes: [
					{
						key: "item::ITEM-001",
						modified: "2026-04-09T10:01:00",
						data: {
							item_code: "ITEM-001",
							item_name: "Alpha",
							modified: "2026-04-09T10:01:00",
						},
					},
					{
						key: "item::ITEM-002",
						modified: "2026-04-09T10:02:00",
						data: {
							item_code: "ITEM-002",
							item_name: "Beta",
							modified: "2026-04-09T10:02:00",
						},
					},
				],
				deleted: [],
			})
			.mockResolvedValueOnce({
				schema_version: "2026-04-09",
				next_cursor: null,
				next_watermark: "2026-04-09T10:04:00",
				total_count: 4,
				has_more: false,
				changes: [
					{
						key: "item::ITEM-003",
						modified: "2026-04-09T10:03:00",
						data: {
							item_code: "ITEM-003",
							item_name: "Gamma",
							modified: "2026-04-09T10:03:00",
						},
					},
					{
						key: "item::ITEM-004",
						modified: "2026-04-09T10:04:00",
						data: {
							item_code: "ITEM-004",
							item_name: "Delta",
							modified: "2026-04-09T10:04:00",
						},
					},
				],
				deleted: [],
			});

		const result = await syncItemsResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				warehouse: "Main WH",
				modified: "2026-04-09T10:05:00",
			},
			priceList: "Retail",
			watermark: null,
			fetcher,
		});

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				cursor: null,
				watermark: null,
			}),
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				cursor: "ITEM-002",
				watermark: null,
			}),
		);
		expect(cacheMocks.saveItemsBulk).toHaveBeenCalledTimes(2);
		expect(cacheMocks.setItemsLastSync).toHaveBeenCalledWith(
			"2026-04-09T10:04:00",
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenLastCalledWith(
			expect.objectContaining({
				resourceId: "item_prices",
				status: "fresh",
				diagnostics: expect.objectContaining({
					completeness: "complete",
					localCount: 4,
					serverCount: 4,
					missingCount: 0,
					nextCursor: null,
				}),
			}),
		);
		expect(result.status).toBe("fresh");
		expect(result.diagnostics).toEqual(
			expect.objectContaining({
				completeness: "complete",
				localCount: 4,
				serverCount: 4,
				missingCount: 0,
			}),
		);
	});

	it("clears stale customer scope before applying delta writes and deletes", async () => {
		syncStateMocks.getSyncResourceState.mockResolvedValue({
			resourceId: "customers",
			status: "fresh",
			lastSyncedAt: "2026-04-09T09:00:00",
			watermark: "2026-04-09T09:00:00",
			lastSuccessHash: null,
			lastError: null,
			consecutiveFailures: 0,
			scopeSignature: JSON.stringify({
				profile: "OLD-POS",
				company: "Test Co",
			}),
			schemaVersion: "2026-04-09",
		});

		const fetcher = vi.fn(async ({ watermark }) => {
			expect(watermark).toBeNull();
			return {
				schema_version: "2026-04-09",
				next_watermark: "2026-04-09T11:00:00",
				has_more: false,
				changes: [
					{
						key: "customer::CUST-001",
						modified: "2026-04-09T11:00:00",
						data: {
							name: "CUST-001",
							customer_name: "Customer One",
						},
					},
				],
				deleted: [{ key: "customer::CUST-002" }],
			};
		});

		const result = await syncCustomersResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T11:00:00",
			},
			watermark: "2026-04-09T10:00:00",
			fetcher,
		});

		expect(cacheMocks.clearCustomerStorage).toHaveBeenCalledOnce();
		expect(customerMocks.setCustomerStorage).toHaveBeenCalledWith([
			{
				name: "CUST-001",
				customer_name: "Customer One",
			},
		]);
		expect(customerMocks.deleteCustomerStorageByNames).toHaveBeenCalledWith([
			"CUST-002",
		]);
		expect(cacheMocks.getCustomerStorageCount).toHaveBeenCalledOnce();
		expect(cacheMocks.setCustomersLastSync).toHaveBeenCalledWith(
			"2026-04-09T11:00:00",
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "customers",
				status: "fresh",
				scopeSignature: JSON.stringify({
					profile: "POS-1",
					company: "Test Co",
					warehouse: null,
				}),
			}),
		);
		expect(result.status).toBe("fresh");
	});

	it("falls back to a full customer repair when delta batches are limited", async () => {
		cacheMocks.getCustomerStorageCount.mockResolvedValue(3);
		syncStateMocks.getSyncResourceState.mockResolvedValue({
			resourceId: "customers",
			status: "fresh",
			lastSyncedAt: "2026-04-09T10:59:00",
			watermark: "2026-04-09T11:00:00",
			lastSuccessHash: null,
			lastError: null,
			consecutiveFailures: 0,
			scopeSignature: JSON.stringify({
				profile: "POS-1",
				company: "Test Co",
				warehouse: null,
			}),
			schemaVersion: "2026-04-09",
			diagnostics: {
				completeness: "complete",
				localCount: 3,
				serverCount: 3,
				missingCount: 0,
			},
		});

		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				schema_version: "2026-04-09",
				next_watermark: "2026-04-09T11:02:00",
				has_more: true,
				changes: [
					{
						key: "customer::CUST-001",
						modified: "2026-04-09T11:01:00",
						data: {
							name: "CUST-001",
							customer_name: "Customer One",
						},
					},
				],
				deleted: [],
			})
			.mockResolvedValueOnce({
				schema_version: "2026-04-09",
				next_cursor: "CUST-002",
				next_watermark: "2026-04-09T11:02:00",
				total_count: 3,
				has_more: true,
				changes: [
					{
						key: "customer::CUST-001",
						modified: "2026-04-09T11:01:00",
						data: {
							name: "CUST-001",
							customer_name: "Customer One",
						},
					},
					{
						key: "customer::CUST-002",
						modified: "2026-04-09T11:02:00",
						data: {
							name: "CUST-002",
							customer_name: "Customer Two",
						},
					},
				],
				deleted: [],
			})
			.mockResolvedValueOnce({
				schema_version: "2026-04-09",
				next_cursor: null,
				next_watermark: "2026-04-09T11:03:00",
				total_count: 3,
				has_more: false,
				changes: [
					{
						key: "customer::CUST-003",
						modified: "2026-04-09T11:03:00",
						data: {
							name: "CUST-003",
							customer_name: "Customer Three",
						},
					},
				],
				deleted: [],
			});

		const result = await syncCustomersResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T11:03:00",
			},
			watermark: "2026-04-09T11:00:00",
			fetcher,
		});

		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				watermark: "2026-04-09T11:00:00",
				cursor: null,
			}),
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				watermark: null,
				cursor: null,
			}),
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				watermark: null,
				cursor: "CUST-002",
			}),
		);
		expect(cacheMocks.clearCustomerStorage).toHaveBeenCalledOnce();
		expect(syncStateMocks.setSyncResourceState).toHaveBeenLastCalledWith(
			expect.objectContaining({
				resourceId: "customers",
				status: "fresh",
				diagnostics: expect.objectContaining({
					completeness: "complete",
					localCount: 3,
					serverCount: 3,
					missingCount: 0,
					repairRecommended: false,
				}),
			}),
		);
		expect(result.status).toBe("fresh");
	});

	it("clears stale stock scope before applying stock delta writes and deletes", async () => {
		syncStateMocks.getSyncResourceState.mockResolvedValue({
			resourceId: "stock",
			status: "fresh",
			lastSyncedAt: "2026-04-09T09:00:00",
			watermark: "2026-04-09T09:00:00",
			lastSuccessHash: null,
			lastError: null,
			consecutiveFailures: 0,
			scopeSignature: JSON.stringify({
				profile: "POS-1",
				company: "Test Co",
				warehouse: "OLD-WH",
			}),
			schemaVersion: "2026-04-09",
		});

		const fetcher = vi.fn(async ({ watermark }) => {
			expect(watermark).toBeNull();
			return {
				schema_version: "2026-04-09",
				next_watermark: "2026-04-09T12:00:00",
				has_more: false,
				changes: [
					{
						key: "stock::ITEM-001",
						modified: "2026-04-09T12:00:00",
						data: {
							item_code: "ITEM-001",
							actual_qty: 11,
							warehouse: "Main WH",
						},
					},
				],
				deleted: [{ key: "stock::ITEM-002" }],
			};
		});

		const result = await syncStockResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				warehouse: "Main WH",
				modified: "2026-04-09T12:00:00",
			},
			watermark: "2026-04-09T11:00:00",
			fetcher,
		});

		expect(stockMocks.clearLocalStockCache).toHaveBeenCalledOnce();
		expect(stockMocks.updateLocalStockCache).toHaveBeenCalledWith([
			{
				item_code: "ITEM-001",
				actual_qty: 11,
				warehouse: "Main WH",
			},
		]);
		expect(stockMocks.removeLocalStockEntries).toHaveBeenCalledWith([
			"ITEM-002",
		]);
		expect(stockMocks.setStockCacheReady).toHaveBeenCalledWith(true);
		expect(
			bootstrapSnapshotMocks.refreshBootstrapSnapshotFromCaches,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				cacheState: expect.objectContaining({
					stockCacheReady: true,
				}),
			}),
		);
		expect(cacheMocks.setBootstrapSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				prerequisites: expect.objectContaining({
					stock_cache_ready: "ready",
				}),
			}),
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "stock",
				status: "fresh",
				scopeSignature: JSON.stringify({
					profile: "POS-1",
					company: "Test Co",
					warehouse: "Main WH",
				}),
			}),
		);
		expect(result.status).toBe("fresh");
	});
});
