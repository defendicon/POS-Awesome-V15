import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCachedItemDetails, saveItemDetailsCache, updateLocalStockCache } =
	vi.hoisted(() => ({
		getCachedItemDetails: vi.fn(),
		saveItemDetailsCache: vi.fn(),
		updateLocalStockCache: vi.fn(),
	}));

vi.mock("../src/offline/index", () => ({
	getCachedItemDetails,
	saveItemDetailsCache,
	saveItemsBulk: vi.fn(async () => {}),
	updateLocalStockCache,
	saveItemUOMs: vi.fn(),
	getItemUOMs: vi.fn(() => []),
	getLocalStock: vi.fn(() => null),
	getLocalStockCache: vi.fn(() => ({})),
	isStockCacheReady: vi.fn(() => false),
	initializeStockCache: vi.fn(async () => {}),
	isOffline: vi.fn(() => false),
}));

vi.mock("../src/posapp/utils/perf.js", () => ({
	scheduleFrame: vi.fn(async () => {}),
}));

import { useItemDetailFetcher } from "../src/posapp/composables/pos/items/useItemDetailFetcher";

describe("useItemDetailFetcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getCachedItemDetails.mockResolvedValue({
			cached: [],
			missing: ["ITEM-1"],
		});
		(globalThis as any).frappe = {
			call: vi.fn(async () => ({
				message: [
					{
						item_code: "ITEM-1",
						actual_qty: 0,
						has_batch_no: 1,
						has_serial_no: 1,
						batch_no_data: [],
						serial_no_data: [],
					},
				],
			})),
		};
	});

	it("replaces stale batch and serial lists when server returns empty arrays", async () => {
		const fetcher = useItemDetailFetcher();
		fetcher.registerContext({
			pos_profile: { name: "POS-TEST" },
			active_price_list: "Standard Selling",
			itemAvailability: null,
			applyCurrencyConversionToItem: vi.fn(),
			items: [],
			displayedItems: [],
			usesLimitSearch: false,
			storageAvailable: false,
		});

		const item: any = {
			item_code: "ITEM-1",
			has_batch_no: 1,
			has_serial_no: 1,
			batch_no_data: [{ batch_no: "B-EXPIRED", batch_qty: 7, is_expired: true }],
			serial_no_data: [{ serial_no: "SER-OLD" }],
		};

		await fetcher.update_items_details([item], { forceRefresh: true });

		expect(item.batch_no_data).toEqual([]);
		expect(item.serial_no_data).toEqual([]);
		expect(item.actual_qty).toBe(0);
		expect(updateLocalStockCache).toHaveBeenCalledTimes(1);
		expect(saveItemDetailsCache).toHaveBeenCalledTimes(1);
	});

	it("resolves context getters dynamically for POS profile", async () => {
		const fetcher = useItemDetailFetcher();
		let currentProfile: any = null;

		fetcher.registerContext({
			get pos_profile() {
				return currentProfile;
			},
			active_price_list: "Standard Selling",
			itemAvailability: null,
			applyCurrencyConversionToItem: vi.fn(),
			items: [],
			displayedItems: [],
			usesLimitSearch: false,
			storageAvailable: false,
		});

		currentProfile = { name: "POS-TEST" };

		const details = await fetcher.fetchItemDetails([{ item_code: "ITEM-1" }]);

		expect((globalThis as any).frappe.call).toHaveBeenCalledTimes(1);
		expect(details).toHaveLength(1);
	});

	it("does not force zero customer price list rates when the force flag is disabled as a string", async () => {
		getCachedItemDetails.mockResolvedValueOnce({
			cached: [
				{
					item_code: "ITEM-1",
					actual_qty: 4,
					rate: "0",
					price_list_rate: "0",
				},
			],
			missing: [],
		});

		const fetcher = useItemDetailFetcher();
		fetcher.registerContext({
			pos_profile: {
				name: "POS-TEST",
				posa_force_price_from_customer_price_list: "0",
			},
			active_price_list: "Customer Price List",
			itemAvailability: null,
			applyCurrencyConversionToItem: vi.fn(),
			items: [],
			displayedItems: [],
			usesLimitSearch: false,
			storageAvailable: false,
		});

		const item: any = {
			item_code: "ITEM-1",
			rate: 25,
			price_list_rate: 25,
			original_rate: 25,
		};

		await fetcher.update_items_details([item]);

		expect(item.rate).toBe(25);
		expect(item.price_list_rate).toBe(25);
		expect(item.original_rate).toBe(25);
		expect(item.actual_qty).toBe(4);
	});

	it("does not force zero fetched rates when the force flag is disabled as a string", async () => {
		(globalThis as any).frappe.call = vi.fn(async () => ({
			message: [
				{
					item_code: "ITEM-1",
					actual_qty: 4,
					rate: "0",
					price_list_rate: "0",
					has_batch_no: 0,
					has_serial_no: 0,
				},
			],
		}));

		const fetcher = useItemDetailFetcher();
		fetcher.registerContext({
			pos_profile: {
				name: "POS-TEST",
				posa_force_price_from_customer_price_list: "0",
			},
			active_price_list: "Customer Price List",
			itemAvailability: null,
			applyCurrencyConversionToItem: vi.fn(),
			items: [],
			displayedItems: [],
			usesLimitSearch: false,
			storageAvailable: false,
		});

		const item: any = {
			item_code: "ITEM-1",
			rate: 25,
			price_list_rate: 25,
			original_rate: 25,
		};

		await fetcher.update_items_details([item], { forceRefresh: true });

		expect(item.rate).toBe(25);
		expect(item.price_list_rate).toBe(25);
		expect(item.original_rate).toBe(25);
		expect(item.actual_qty).toBe(4);
	});
});

