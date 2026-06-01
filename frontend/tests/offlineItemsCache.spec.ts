import { beforeEach, describe, expect, it, vi } from "vitest";

const { bulkPut, put, toArray, anyOf } = vi.hoisted(() => {
	const bulkPut = vi.fn();
	const put = vi.fn();
	const toArray = vi.fn();
	const anyOf = vi.fn(() => ({ toArray }));
	return { bulkPut, put, toArray, anyOf };
});

vi.mock("../src/offline/db", () => {
	const itemsTable = {
		where: vi.fn(() => ({
			anyOf,
		})),
		bulkPut,
		put,
	};

	return {
		memory: {},
		persist: vi.fn(),
		checkDbHealth: vi.fn().mockResolvedValue(true),
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

import { saveItems, searchStoredItems } from "../src/offline/cache";

describe("offline cache item persistence", () => {
	beforeEach(() => {
		bulkPut.mockReset();
		put.mockReset();
		toArray.mockReset();
		anyOf.mockClear();
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
	});

	it("falls back to row-by-row writes when bulkPut throws DataCloneError", async () => {
		toArray.mockResolvedValue([]);
		const cloneError = new Error("Could not be cloned");
		cloneError.name = "DataCloneError";
		bulkPut.mockRejectedValueOnce(cloneError);

		await saveItems([
			{
				item_code: "ITEM-3",
				item_name: "Fallback Item",
				item_barcode: [{ barcode: "11111" }],
			},
		]);

		expect(bulkPut).toHaveBeenCalledTimes(1);
		expect(put).toHaveBeenCalledTimes(1);
		expect(put).toHaveBeenCalledWith(
			expect.objectContaining({
				item_code: "ITEM-3",
				name_keywords: ["fallback", "item"],
			}),
		);
	});

	it("uses the item worker for stored item search when available", async () => {
		const originalWorker = (globalThis as any).Worker;
		class MockWorker {
			onmessage: ((_event: any) => void) | null = null;
			onerror: (() => void) | null = null;

			postMessage(message: any) {
				setTimeout(() => {
					this.onmessage?.({
						data: {
							type: "search_stored_items_result",
							id: message.id,
							items: [
								{
									item_code: "ITEM-WORKER",
									item_name: "Worker Item",
								},
							],
						},
					});
				}, 0);
			}

			terminate() {}
		}
		(globalThis as any).Worker = MockWorker;

		try {
			const result = await searchStoredItems({
				search: "worker",
				limit: 10,
				scope: "POS-A_WH-A",
			});

			expect(result).toEqual([
				expect.objectContaining({ item_code: "ITEM-WORKER" }),
			]);
			expect(anyOf).not.toHaveBeenCalled();
		} finally {
			(globalThis as any).Worker = originalWorker;
		}
	});
});
