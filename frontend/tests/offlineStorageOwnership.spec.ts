// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const persist = vi.fn();

const customersTable = {
	get: vi.fn(),
	bulkPut: vi.fn(),
	bulkDelete: vi.fn(),
	clear: vi.fn(),
	count: vi.fn(),
};

vi.mock("../src/offline/db", () => ({
	memory: {
		customer_storage: [],
		items_last_sync: null,
		customers_last_sync: null,
	},
	initPromise: Promise.resolve(),
	persist,
	checkDbHealth: vi.fn().mockResolvedValue(true),
	db: {
		isOpen: vi.fn(() => true),
		open: vi.fn().mockResolvedValue(undefined),
		table: vi.fn((name: string) => {
			if (name === "customers") {
				return customersTable;
			}
			return {
				get: vi.fn(),
				put: vi.fn(),
				clear: vi.fn(),
				count: vi.fn().mockResolvedValue(0),
			};
		}),
	},
}));

vi.mock("../src/offline/writeQueue", () => ({
	claimRetryableQueueEntries: vi.fn(),
	clearWriteQueueEntries: vi.fn(),
	deleteWriteQueueEntryByIndex: vi.fn(),
	enqueueWriteQueueEntry: vi.fn(),
	getQueuedPayloadCount: vi.fn(() => 0),
	getQueuedPayloadSnapshots: vi.fn(() => []),
	markWriteQueueEntryFailed: vi.fn(),
	markWriteQueueEntrySynced: vi.fn(),
	refreshQueueMemory: vi.fn(),
	updateQueuedPayloads: vi.fn(),
}));

describe("offline storage ownership", () => {
	beforeEach(() => {
		persist.mockReset();
		customersTable.get.mockReset();
		customersTable.bulkPut.mockReset();
		customersTable.bulkDelete.mockReset();
		customersTable.clear.mockReset();
		customersTable.count.mockReset();
		window.localStorage.clear();
	});

	it("routes sync watermarks through memory plus persist instead of direct localStorage", async () => {
		const {
			getCustomersLastSync,
			getItemsLastSync,
			setCustomersLastSync,
			setItemsLastSync,
		} = await import("../src/offline/cache");
		const { memory } = await import("../src/offline/db");

		setItemsLastSync("2026-04-18T00:00:00.000Z");
		setCustomersLastSync("2026-04-18T01:00:00.000Z");

		expect(memory.items_last_sync).toBe("2026-04-18T00:00:00.000Z");
		expect(memory.customers_last_sync).toBe("2026-04-18T01:00:00.000Z");
		expect(getItemsLastSync()).toBe("2026-04-18T00:00:00.000Z");
		expect(getCustomersLastSync()).toBe("2026-04-18T01:00:00.000Z");
		expect(persist).toHaveBeenCalledWith("items_last_sync");
		expect(persist).toHaveBeenCalledWith("customers_last_sync");
		expect(window.localStorage.getItem("posa_items_last_sync")).toBeNull();
		expect(window.localStorage.getItem("posa_customers_last_sync")).toBeNull();
	});

	it("treats customer_storage as runtime cache while customers table stays durable", async () => {
		const { getStoredCustomer, setCustomerStorage } = await import(
			"../src/offline/customers"
		);
		const { memory } = await import("../src/offline/db");

		await setCustomerStorage([
			{
				name: "CUST-1",
				customer_name: "Customer 1",
				stored_value_balance: 10,
			},
		]);

		expect(customersTable.bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				name: "CUST-1",
				customer_name: "Customer 1",
				stored_value_balance: 10,
			}),
		]);
		expect(persist).not.toHaveBeenCalledWith("customer_storage");

		memory.customer_storage = [];
		customersTable.get.mockResolvedValueOnce({
			name: "CUST-1",
			customer_name: "Customer 1",
			stored_value_balance: 10,
		});

		expect(await getStoredCustomer("CUST-1")).toEqual(
			expect.objectContaining({
				name: "CUST-1",
				stored_value_balance: 10,
			}),
		);
	});
});
