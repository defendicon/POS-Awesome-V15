// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

type SeedEntry = {
	queue_id: number;
	entity_type: "invoice" | "customer" | "payment" | "cash_movement";
	payload: Record<string, any>;
	created_at: string;
	last_attempt_at: string | null;
	retry_count: number;
	status: "pending" | "syncing" | "failed" | "dead_letter" | "synced";
	idempotency_key: string;
	last_error: string | null;
};

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

async function loadWriteQueueModule(seedRows: SeedEntry[]) {
	const rows = seedRows.map((entry) => clone(entry));
	const memory = {
		offline_invoices: [] as any[],
		offline_customers: [] as any[],
		offline_payments: [] as any[],
		offline_cash_movements: [] as any[],
	};
	let txActive = false;
	const sortByTxStates: boolean[] = [];
	const firstTxStates: boolean[] = [];
	const addTxStates: boolean[] = [];
	const putTxStates: boolean[] = [];

	const writeQueueTable = {
		where: vi.fn((field: string) => ({
			equals: vi.fn((value: string) => ({
				sortBy: vi.fn(async (sortField: string) => {
					sortByTxStates.push(txActive);
					return rows
						.filter((row) => String((row as any)[field]) === value)
						.sort((left, right) =>
							String((left as any)[sortField]).localeCompare(
								String((right as any)[sortField]),
							),
						)
						.map((row) => clone(row));
				}),
				first: vi.fn(async () => {
					firstTxStates.push(txActive);
					return rows.find((row) => String((row as any)[field]) === value);
				}),
			})),
		})),
		put: vi.fn(async (entry: SeedEntry) => {
			putTxStates.push(txActive);
			const index = rows.findIndex((row) => row.queue_id === entry.queue_id);
			if (index >= 0) {
				rows[index] = clone(entry);
				return entry.queue_id;
			}
			rows.push(clone(entry));
			return entry.queue_id;
		}),
		get: vi.fn(async (queueId: number) =>
			clone(rows.find((row) => row.queue_id === queueId)),
		),
		add: vi.fn(async (entry: SeedEntry) => {
			addTxStates.push(txActive);
			const queueId =
				entry.queue_id ?? Math.max(0, ...rows.map((row) => row.queue_id || 0)) + 1;
			rows.push(clone({ ...entry, queue_id: queueId }));
			return queueId;
		}),
		delete: vi.fn(async (queueId: number) => {
			const index = rows.findIndex((row) => row.queue_id === queueId);
			if (index >= 0) {
				rows.splice(index, 1);
			}
		}),
		bulkDelete: vi.fn(async (queueIds: number[]) => {
			for (const queueId of queueIds) {
				const index = rows.findIndex((row) => row.queue_id === queueId);
				if (index >= 0) {
					rows.splice(index, 1);
				}
			}
		}),
	};

	const genericTable = {
		put: vi.fn(async () => undefined),
		get: vi.fn(async () => undefined),
		clear: vi.fn(async () => undefined),
		count: vi.fn(async () => 0),
	};

	vi.doMock("../src/offline/db", () => ({
		checkDbHealth: vi.fn().mockResolvedValue(true),
		initPromise: Promise.resolve(),
		memory,
		db: {
			isOpen: vi.fn(() => true),
			open: vi.fn().mockResolvedValue(undefined),
			table: vi.fn((name: string) => {
				if (name === "write_queue") {
					return writeQueueTable;
				}
				return genericTable;
			}),
			transaction: vi.fn(async (_mode: string, _table: unknown, callback: () => Promise<unknown>) => {
				txActive = true;
				try {
					return await callback();
				} finally {
					txActive = false;
				}
			}),
		},
	}));

	vi.doMock("../src/offline/idempotency", () => ({
		ensureOfflineInvoiceRequest: vi.fn(),
		ensurePaymentClientRequestId: vi.fn(),
	}));

	const module = await import("../src/offline/writeQueue");
	await module.ensureOfflineQueueReady();

	sortByTxStates.length = 0;
	putTxStates.length = 0;
	memory.offline_invoices = [];
	memory.offline_customers = [];
	memory.offline_payments = [];
	memory.offline_cash_movements = [];

	return {
		module,
		rows,
		memory,
		sortByTxStates,
		firstTxStates,
		addTxStates,
		putTxStates,
	};
}

describe("write queue transaction safety", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it("claims retryable queue entries with the initial ordered read inside the rw transaction", async () => {
		const staleTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
		const freshTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
		const { module, rows, memory, sortByTxStates, putTxStates } =
			await loadWriteQueueModule([
				{
					queue_id: 1,
					entity_type: "invoice",
					payload: { invoice: { name: "INV-001" } },
					created_at: "2026-04-18T10:00:00.000Z",
					last_attempt_at: null,
					retry_count: 0,
					status: "pending",
					idempotency_key: "invoice:1",
					last_error: null,
				},
				{
					queue_id: 2,
					entity_type: "invoice",
					payload: { invoice: { name: "INV-002" } },
					created_at: "2026-04-18T10:01:00.000Z",
					last_attempt_at: staleTimestamp,
					retry_count: 1,
					status: "syncing",
					idempotency_key: "invoice:2",
					last_error: null,
				},
				{
					queue_id: 3,
					entity_type: "invoice",
					payload: { invoice: { name: "INV-003" } },
					created_at: "2026-04-18T10:02:00.000Z",
					last_attempt_at: freshTimestamp,
					retry_count: 1,
					status: "syncing",
					idempotency_key: "invoice:3",
					last_error: "Still syncing",
				},
				{
					queue_id: 4,
					entity_type: "invoice",
					payload: { invoice: { name: "INV-004" } },
					created_at: "2026-04-18T10:03:00.000Z",
					last_attempt_at: "2026-04-18T09:59:00.000Z",
					retry_count: 2,
					status: "failed",
					idempotency_key: "invoice:4",
					last_error: "Retry me",
				},
				{
					queue_id: 5,
					entity_type: "invoice",
					payload: { invoice: { name: "INV-005" } },
					created_at: "2026-04-18T10:04:00.000Z",
					last_attempt_at: "2026-04-18T09:55:00.000Z",
					retry_count: 5,
					status: "dead_letter",
					idempotency_key: "invoice:5",
					last_error: "Exhausted",
				},
			]);

		const claimed = await module.claimRetryableQueueEntries("invoice");

		expect(sortByTxStates[0]).toBe(true);
		expect(putTxStates).toEqual([true, true, true]);
		expect(claimed.map((entry: SeedEntry) => entry.queue_id)).toEqual([1, 2, 4]);
		expect(claimed.every((entry: SeedEntry) => entry.status === "syncing")).toBe(true);
		expect(claimed[1]?.last_error).toBe("Recovered stale sync lease");
		expect(rows.find((entry) => entry.queue_id === 3)?.status).toBe("syncing");
		expect(memory.offline_invoices).toHaveLength(5);
	});

	it("checks idempotency and inserts inside one rw transaction before refreshing memory", async () => {
		const {
			module,
			rows,
			memory,
			sortByTxStates,
			firstTxStates,
			addTxStates,
		} = await loadWriteQueueModule([]);

		const created = await module.enqueueWriteQueueEntry("invoice", {
			invoice: {
				name: "INV-TX-001",
				posa_client_request_id: "inv-tx-001",
			},
		});

		expect(firstTxStates).toEqual([true]);
		expect(addTxStates).toEqual([true]);
		expect(sortByTxStates[0]).toBe(false);
		expect(created.idempotency_key).toBe("invoice:inv-tx-001");
		expect(rows).toHaveLength(1);
		expect(memory.offline_invoices).toHaveLength(1);
	});

	it("coalesces repeated customer updates by replacing the queued payload in place", async () => {
		const {
			module,
			rows,
			memory,
			firstTxStates,
			addTxStates,
			putTxStates,
		} = await loadWriteQueueModule([
			{
				queue_id: 21,
				entity_type: "customer",
				payload: { args: { customer_id: "CUST-001", note: "old" } },
				created_at: "2026-04-18T12:00:00.000Z",
				last_attempt_at: "2026-04-18T12:05:00.000Z",
				retry_count: 2,
				status: "failed",
				idempotency_key: "customer:update:CUST-001",
				last_error: "retry me",
			},
		]);

		const queued = await module.enqueueWriteQueueEntry("customer", {
			args: {
				customer_id: "CUST-001",
				note: "new",
			},
		});

		expect(firstTxStates).toEqual([true]);
		expect(addTxStates).toEqual([]);
		expect(putTxStates).toEqual([true]);
		expect(queued.queue_id).toBe(21);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.payload.args.note).toBe("new");
		expect(rows[0]?.status).toBe("pending");
		expect(rows[0]?.retry_count).toBe(0);
		expect(rows[0]?.last_attempt_at).toBeNull();
		expect(memory.offline_customers[0]?.args?.note).toBe("new");
	});

	it("does not overwrite a synced row when the claimed lease token is stale", async () => {
		const { module, rows } = await loadWriteQueueModule([
			{
				queue_id: 31,
				entity_type: "invoice",
				payload: { invoice: { name: "INV-031" } },
				created_at: "2026-04-18T13:00:00.000Z",
				last_attempt_at: "2026-04-18T13:10:00.000Z",
				retry_count: 1,
				status: "syncing",
				idempotency_key: "invoice:31",
				last_error: null,
			},
		]);

		const updated = await module.markWriteQueueEntrySynced(
			"invoice",
			31,
			"2026-04-18T13:09:00.000Z",
		);

		expect(updated).toBe(false);
		expect(rows[0]?.status).toBe("syncing");
		expect(rows[0]?.last_attempt_at).toBe("2026-04-18T13:10:00.000Z");
	});

	it("does not overwrite a failed row when the claimed lease token is stale", async () => {
		const { module, rows } = await loadWriteQueueModule([
			{
				queue_id: 41,
				entity_type: "payment",
				payload: { args: { payload: { client_request_id: "pay-041" } } },
				created_at: "2026-04-18T14:00:00.000Z",
				last_attempt_at: "2026-04-18T14:05:00.000Z",
				retry_count: 1,
				status: "syncing",
				idempotency_key: "payment:pay-041",
				last_error: null,
			},
		]);

		const updated = await module.markWriteQueueEntryFailed(
			"payment",
			41,
			new Error("stale attempt"),
			"2026-04-18T14:04:00.000Z",
		);

		expect(updated).toBe(false);
		expect(rows[0]?.status).toBe("syncing");
		expect(rows[0]?.retry_count).toBe(1);
	});

	it("updates queued payloads with the ordered entity read inside the rw transaction", async () => {
		const { module, rows, memory, sortByTxStates, putTxStates } =
			await loadWriteQueueModule([
				{
					queue_id: 10,
					entity_type: "customer",
					payload: { args: { customer_id: "CUST-001", note: "old-a" } },
					created_at: "2026-04-18T11:00:00.000Z",
					last_attempt_at: null,
					retry_count: 0,
					status: "pending",
					idempotency_key: "customer:10",
					last_error: null,
				},
				{
					queue_id: 11,
					entity_type: "customer",
					payload: { args: { customer_id: "CUST-002", note: "old-b" } },
					created_at: "2026-04-18T11:01:00.000Z",
					last_attempt_at: null,
					retry_count: 0,
					status: "synced",
					idempotency_key: "customer:11",
					last_error: null,
				},
				{
					queue_id: 12,
					entity_type: "customer",
					payload: { args: { customer_id: "CUST-003", note: "old-c" } },
					created_at: "2026-04-18T11:02:00.000Z",
					last_attempt_at: "2026-04-18T10:30:00.000Z",
					retry_count: 2,
					status: "failed",
					idempotency_key: "customer:12",
					last_error: "retry",
				},
			]);

		await module.updateQueuedPayloads("customer", (payload: Record<string, any>) => ({
			...payload,
			args: {
				...payload.args,
				note: `${payload.args.note}-updated`,
			},
		}));

		expect(sortByTxStates[0]).toBe(true);
		expect(putTxStates).toEqual([true, true]);
		expect(rows.find((entry) => entry.queue_id === 10)?.payload.args.note).toBe(
			"old-a-updated",
		);
		expect(rows.find((entry) => entry.queue_id === 11)?.payload.args.note).toBe(
			"old-b",
		);
		expect(rows.find((entry) => entry.queue_id === 12)?.payload.args.note).toBe(
			"old-c-updated",
		);
		expect(memory.offline_customers).toHaveLength(2);
	});

	it("returns defensive copies for queued payload snapshots", async () => {
		const { module, memory } = await loadWriteQueueModule([
			{
				queue_id: 51,
				entity_type: "invoice",
				payload: { invoice: { name: "INV-051" } },
				created_at: "2026-04-18T15:00:00.000Z",
				last_attempt_at: null,
				retry_count: 0,
				status: "pending",
				idempotency_key: "invoice:51",
				last_error: null,
			},
		]);

		await module.refreshQueueMemory("invoice");
		const snapshots = module.getQueuedPayloadSnapshots("invoice");
		snapshots[0].status = "mutated";
		snapshots[0].invoice.name = "INV-MUTATED";

		expect(memory.offline_invoices[0]?.status).toBe("pending");
		expect(memory.offline_invoices[0]?.invoice?.name).toBe("INV-051");
	});
});
