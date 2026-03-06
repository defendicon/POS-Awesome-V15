import { beforeEach, describe, expect, it, vi } from "vitest";

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
	beforeEach(() => {
		vi.clearAllMocks();
		getItemsLastSync.mockReturnValue(null);
		isOffline.mockReturnValue(false);
	});

	it("uses latest context values from getters when running background sync", async () => {
		const sync = useItemSync();
		let currentProfile: any = null;
		const changedItem = { item_code: "ITEM-1" } as any;
		getItemsLastSync.mockReturnValue("2026-03-06 15:27:28.166399");
		const refreshModifiedItems = vi.fn(async () => ({
			items: [changedItem],
		}));
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
		expect(setItemsLastSync).not.toHaveBeenCalled();
		expect(sync.last_background_sync_time.value).toBeTruthy();
		expect(sync.last_background_sync_time.value).not.toBe(
			"2026-03-06 15:27:28.166399",
		);
	});
});
