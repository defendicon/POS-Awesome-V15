// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const persist = vi.fn();

const customersTable = {
	get: vi.fn(),
	bulkGet: vi.fn(),
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
		customersTable.bulkGet.mockReset();
		customersTable.bulkGet.mockResolvedValue([]);
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
		expect(
			window.localStorage.getItem("posa_customers_last_sync"),
		).toBeNull();
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
				loyalty_program: "Retail Loyalty",
				loyalty_points: 2,
				conversion_factor: 5,
				stored_value_balance: 10,
			},
		]);

		expect(customersTable.bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				name: "CUST-1",
				customer_name: "Customer 1",
				loyalty_program: "Retail Loyalty",
				loyalty_points: 2,
				conversion_factor: 5,
				stored_value_balance: 10,
			}),
		]);
		expect(persist).not.toHaveBeenCalledWith("customer_storage");

		memory.customer_storage = [];
		customersTable.get.mockResolvedValueOnce({
			name: "CUST-1",
			customer_name: "Customer 1",
			loyalty_points: 2,
			conversion_factor: 5,
			stored_value_balance: 10,
		});

		expect(await getStoredCustomer("CUST-1")).toEqual(
			expect.objectContaining({
				name: "CUST-1",
				loyalty_points: 2,
				conversion_factor: 5,
				stored_value_balance: 10,
			}),
		);
	});

	it("preserves cached active-customer loyalty details during summary sync", async () => {
		const { setCustomerStorage } = await import("../src/offline/customers");
		const { memory } = await import("../src/offline/db");

		memory.customer_storage = [
			{
				name: "CUST-1",
				customer_name: "Customer 1",
				loyalty_program: "Retail Loyalty",
				loyalty_points: 12,
				conversion_factor: 5,
			},
		];

		await setCustomerStorage([
			{
				name: "CUST-1",
				customer_name: "Customer 1",
				loyalty_program: "Retail Loyalty",
			},
		]);

		expect(customersTable.bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				name: "CUST-1",
				loyalty_program: "Retail Loyalty",
				loyalty_points: 12,
				conversion_factor: 5,
			}),
		]);
		expect(memory.customer_storage[0]).toEqual(
			expect.objectContaining({
				name: "CUST-1",
				loyalty_points: 12,
				conversion_factor: 5,
			}),
		);
	});

	it("keeps only a bounded hot customer cache in memory", async () => {
		const { setCustomerStorage } = await import("../src/offline/customers");
		const { memory } = await import("../src/offline/db");
		const customers = Array.from({ length: 300 }, (_, index) => ({
			name: `CUST-${String(index).padStart(3, "0")}`,
			customer_name: `Customer ${index}`,
		}));

		memory.customer_storage = [];
		await setCustomerStorage(customers);

		expect(memory.customer_storage).toHaveLength(250);
		expect(memory.customer_storage[0].name).toBe("CUST-050");
		expect(memory.customer_storage.at(-1)?.name).toBe("CUST-299");
		expect(customersTable.bulkPut).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					name: "CUST-299",
					_search_text: expect.stringContaining("customer 299"),
				}),
			]),
		);
	});

	it("skips customer cache rows without a resolvable name", async () => {
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);
		const { setCustomerStorage } = await import("../src/offline/customers");

		await setCustomerStorage([
			{
				customer_name: "Missing Identifier",
			},
			{
				customer: "CUST-2",
				customer_name: "Customer 2",
			},
		]);

		expect(customersTable.bulkPut).toHaveBeenCalledWith([
			expect.objectContaining({
				name: "CUST-2",
				customer_name: "Customer 2",
			}),
		]);
		expect(warnSpy).toHaveBeenCalledWith(
			"Skipping customer cache row without a name",
			{ customerIdentifier: "row:0" },
		);
		warnSpy.mockRestore();
	});
});
