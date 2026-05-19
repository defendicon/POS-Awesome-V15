import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getItemsLastSync, setItemsLastSync, isOffline } = vi.hoisted(() => ({
	getItemsLastSync: vi.fn(),
	setItemsLastSync: vi.fn(),
	isOffline: vi.fn(() => false),
}));

vi.mock("../src/offline/index", () => ({
	getItemsLastSync,
	setItemsLastSync,
	isOffline,
}));

import { useItemSync } from "../src/posapp/composables/pos/items/useItemSync";

describe("useItemSync", () => {
	let syncCursor: string | null = null;

	beforeEach(() => {
		vi.clearAllMocks();
		syncCursor = null;
		getItemsLastSync.mockImplementation(() => syncCursor);
		setItemsLastSync.mockImplementation((timestamp: string) => {
			syncCursor = timestamp;
		});
		isOffline.mockReturnValue(false);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("uses latest context values from getters when running background sync", async () => {
		const sync = useItemSync();
		let currentProfile: any = null;
		const changedItem = { item_code: "ITEM-1" } as any;
		syncCursor = "2026-03-06 15:27:28.166399";
		const nextDeltaCursor = "2026-03-06 15:30:00.000000";
		const refreshModifiedItems = vi.fn(async () => {
			setItemsLastSync(nextDeltaCursor);
			return { items: [changedItem] };
		});
		const updateItemsDetails = vi.fn(async () => {});

		sync.registerContext({
			get pos_profile() {
				return currentProfile;
			},
			get enable_background_sync() {
				return true;
			},
			get background_sync_interval() {
				return 30;
			},
			getBackgroundSyncPriceList: () => "STANDARD-PL",
			refreshModifiedItems,
			itemDetailFetcher: {
				update_items_details: updateItemsDetails,
			},
			getItems: () => [{ item_code: "ITEM-1" }],
			getDisplayedItems: () => [{ item_code: "ITEM-1" }],
		});

		currentProfile = { name: "POS-TEST" };

		await sync.performBackgroundSync({ source: "test" });

		expect(refreshModifiedItems).toHaveBeenCalledWith("STANDARD-PL");
		expect(updateItemsDetails).toHaveBeenCalledWith(
			[changedItem],
			{
				forceRefresh: true,
				priceListOverride: "STANDARD-PL",
			},
		);
		expect(setItemsLastSync).toHaveBeenCalledTimes(1);
		expect(setItemsLastSync).toHaveBeenCalledWith(nextDeltaCursor);
		expect(sync.last_background_sync_time.value).toBeTruthy();
		expect(sync.last_background_sync_time.value).not.toBe(
			"2026-03-06 15:27:28.166399",
		);
	});

	it("persists a new delta cursor when refresh does not advance local sync", async () => {
		const sync = useItemSync();
		let currentProfile: any = { name: "POS-TEST" };
		syncCursor = "2026-03-06 15:27:28.166399";

		const refreshModifiedItems = vi.fn(async () => ({ items: [] }));
		const fetchServerItemsTimestamp = vi.fn(
			async () => "2026-03-07 09:10:11.000000",
		);

		sync.registerContext({
			get pos_profile() {
				return currentProfile;
			},
			get enable_background_sync() {
				return true;
			},
			get background_sync_interval() {
				return 30;
			},
			refreshModifiedItems,
			fetchServerItemsTimestamp,
			getItems: () => [],
			getDisplayedItems: () => [],
		});

		await sync.performBackgroundSync({ source: "test" });

		expect(refreshModifiedItems).toHaveBeenCalled();
		expect(fetchServerItemsTimestamp).toHaveBeenCalled();
		expect(setItemsLastSync).toHaveBeenCalledWith(
			"2026-03-07 09:10:11.000000",
		);
		expect(syncCursor).toBe("2026-03-07 09:10:11.000000");
		expect(sync.last_background_sync_time.value).toBeTruthy();
	});

	it("limits forced detail refresh to changed items visible on the current page", async () => {
		const sync = useItemSync();
		syncCursor = "2026-03-06 15:27:28.166399";
		const updatedItems = Array.from({ length: 150 }, (_, index) => ({
			item_code: `ITEM-${index + 1}`,
		}));
		const refreshModifiedItems = vi.fn(async () => ({
			items: updatedItems,
		}));
		const updateItemsDetails = vi.fn(async () => {});

		sync.registerContext({
			pos_profile: { name: "POS-TEST" },
			enable_background_sync: true,
			background_sync_interval: 30,
			itemsPageLimit: 50,
			refreshModifiedItems,
			itemDetailFetcher: {
				update_items_details: updateItemsDetails,
			},
			getItems: () => updatedItems,
			getDisplayedItems: () => [
				{ item_code: "ITEM-2" },
				{ item_code: "ITEM-75" },
				{ item_code: "ITEM-150" },
				{ item_code: "UNCHANGED" },
			],
		});

		await sync.performBackgroundSync({ source: "test" });

		expect(updateItemsDetails).toHaveBeenCalledTimes(1);
		expect(updateItemsDetails).toHaveBeenCalledWith(
			[
				{ item_code: "ITEM-2" },
				{ item_code: "ITEM-75" },
				{ item_code: "ITEM-150" },
			],
			{
				forceRefresh: true,
				priceListOverride: null,
			},
		);
	});

	it("skips forced detail refresh when no changed item is currently visible", async () => {
		const sync = useItemSync();
		syncCursor = "2026-03-06 15:27:28.166399";
		const refreshModifiedItems = vi.fn(async () => ({
			items: [{ item_code: "ITEM-1" }],
		}));
		const updateItemsDetails = vi.fn(async () => {});

		sync.registerContext({
			pos_profile: { name: "POS-TEST" },
			enable_background_sync: true,
			background_sync_interval: 30,
			refreshModifiedItems,
			itemDetailFetcher: {
				update_items_details: updateItemsDetails,
			},
			getItems: () => [{ item_code: "ITEM-1" }],
			getDisplayedItems: () => [{ item_code: "ITEM-2" }],
		});

		await sync.performBackgroundSync({ source: "test" });

		expect(updateItemsDetails).not.toHaveBeenCalled();
	});

	it("shares one document visibility listener across sync instances", () => {
		vi.useFakeTimers();
		const listeners = new Map<string, EventListener>();
		const addEventListener = vi.fn((event: string, listener: EventListener) => {
			listeners.set(event, listener);
		});
		const removeEventListener = vi.fn((event: string, listener: EventListener) => {
			if (listeners.get(event) === listener) {
				listeners.delete(event);
			}
		});
		vi.stubGlobal("document", {
			hidden: false,
			addEventListener,
			removeEventListener,
		});

		const first = useItemSync();
		const second = useItemSync();
		first.registerContext({
			pos_profile: { name: "POS-TEST" },
			enable_background_sync: true,
			background_sync_interval: 30,
		});
		second.registerContext({
			pos_profile: { name: "POS-TEST" },
			enable_background_sync: true,
			background_sync_interval: 30,
		});

		first.startBackgroundSyncScheduler();
		second.startBackgroundSyncScheduler();

		expect(addEventListener).toHaveBeenCalledTimes(1);
		expect(addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

		first.stopBackgroundSyncScheduler();
		expect(removeEventListener).not.toHaveBeenCalled();

		second.stopBackgroundSyncScheduler();
		expect(removeEventListener).toHaveBeenCalledTimes(1);
	});
});
