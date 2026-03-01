import { beforeEach, describe, expect, it, vi } from "vitest";

const { bulkPut, toArray, anyOf, sendItemWorkerRequest, hasItemWorker } =
	vi.hoisted(() => {
		const bulkPut = vi.fn();
		const toArray = vi.fn();
		const anyOf = vi.fn(() => ({ toArray }));
		const sendItemWorkerRequest = vi.fn();
		const hasItemWorker = vi.fn(() => true);
		return {
			bulkPut,
			toArray,
			anyOf,
			sendItemWorkerRequest,
			hasItemWorker,
		};
	});

vi.mock("../src/offline/db", () => {
	const itemsTable = {
		where: vi.fn(() => ({
			anyOf,
		})),
		bulkPut,
	};

	return {
		memory: {},
		persist: vi.fn(),
		checkDbHealth: vi.fn().mockResolvedValue(true),
		sendItemWorkerRequest,
		hasItemWorker,
		db: {
			isOpen: vi.fn(() => true),
			open: vi.fn().mockResolvedValue(undefined),
			table: vi.fn((name: string) => {
				if (name === "items") {
					return itemsTable;
				}
				return {
					get: vi.fn(),
					put: vi.fn(),
					count: vi.fn().mockResolvedValue(0),
					clear: vi.fn(),
					filter: vi.fn(() => ({
						delete: vi.fn(),
						count: vi.fn().mockResolvedValue(0),
						toArray: vi.fn().mockResolvedValue([]),
					})),
				};
			}),
		},
	};
});

import {
	saveItems,
	searchStoredItems,
	getStoredItemsCountByScope,
} from "../src/offline/cache";

describe("offline cache item persistence", () => {
	beforeEach(() => {
		bulkPut.mockReset();
		toArray.mockReset();
		anyOf.mockClear();
		sendItemWorkerRequest.mockReset();
		hasItemWorker.mockReset();
		hasItemWorker.mockReturnValue(true);
	});

	it("merges partial detail updates with existing scoped item rows", async () => {
		toArray.mockResolvedValue([
			{
				item_code: "ITEM-1",
				item_name: "Test Item",
				item_group: "Products",
				profile_scope: "POS-A_WH-A",
				item_barcode: [{ barcode: "12345" }],
			},
		]);

		await saveItems([{ item_code: "ITEM-1", actual_qty: 7 }]);

		expect(bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				item_code: "ITEM-1",
				item_name: "Test Item",
				actual_qty: 7,
				profile_scope: "POS-A_WH-A",
				barcodes: ["12345"],
				name_keywords: ["test", "item"],
			}),
		]);
		expect(sendItemWorkerRequest).toHaveBeenCalledWith(
			"INVALIDATE_QUERY_CACHE",
			{},
			5000,
		);
	});

	it("applies the explicit scope to newly saved rows", async () => {
		toArray.mockResolvedValue([]);

		await saveItems(
			[
				{
					item_code: "ITEM-2",
					item_name: "Barcode Item",
					item_barcode: [{ barcode: "98765" }],
				},
			],
			"POS-B_WH-B",
		);

		expect(bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				item_code: "ITEM-2",
				profile_scope: "POS-B_WH-B",
				barcodes: ["98765"],
				name_keywords: ["barcode", "item"],
			}),
		]);
		expect(sendItemWorkerRequest).toHaveBeenCalledWith(
			"INVALIDATE_QUERY_CACHE",
			{},
			5000,
		);
	});

	it("delegates stored item search to the item worker when available", async () => {
		sendItemWorkerRequest.mockResolvedValue([
			{ item_code: "ITEM-SEARCH-1" },
		]);

		const result = await searchStoredItems({
			search: "milk",
			itemGroup: "Dairy",
			limit: 25,
			offset: 10,
			scope: "POS-A_WH-A",
		});

		expect(result).toEqual([{ item_code: "ITEM-SEARCH-1" }]);
		expect(sendItemWorkerRequest).toHaveBeenCalledWith(
			"SEARCH_STORED_ITEMS",
			{
				search: "milk",
				itemGroup: "Dairy",
				limit: 25,
				offset: 10,
				scope: "POS-A_WH-A",
			},
			15000,
		);
	});

	it("delegates scoped item counts to the item worker when available", async () => {
		sendItemWorkerRequest.mockResolvedValue(42);

		const result = await getStoredItemsCountByScope("POS-A_WH-A");

		expect(result).toBe(42);
		expect(sendItemWorkerRequest).toHaveBeenCalledWith(
			"COUNT_STORED_ITEMS",
			{ scope: "POS-A_WH-A" },
			10000,
		);
	});
});
