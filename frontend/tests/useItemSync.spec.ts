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
		const refreshModifiedItems = vi.fn(async () => ({ items: [] }));
		const updateItemsDetails = vi.fn(async () => {});
		const refreshAllItemDetailsInBatches = vi.fn(async () => {});

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
			itemDetailFetcher: {
				update_items_details: updateItemsDetails,
				refreshAllItemDetailsInBatches,
			},
			getItems: () => [{ item_code: "ITEM-1" }],
			getDisplayedItems: () => [{ item_code: "ITEM-1" }],
		});

		currentProfile = { name: "POS-TEST" };

		await sync.performBackgroundSync({ source: "test" });

		expect(refreshModifiedItems).toHaveBeenCalledTimes(1);
		expect(refreshAllItemDetailsInBatches).toHaveBeenCalledTimes(1);
		expect(updateItemsDetails).toHaveBeenCalledTimes(1);
		expect(setItemsLastSync).toHaveBeenCalledTimes(1);
		expect(sync.last_background_sync_time.value).toBeTruthy();
	});
});
