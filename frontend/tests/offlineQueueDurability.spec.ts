// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	db,
	getOfflineCashMovements,
	getOfflineInvoices,
	getOfflinePayments,
	initPromise,
	memory,
	saveOfflineCashMovement,
	saveOfflineInvoice,
	saveOfflinePayment,
	syncOfflineCashMovements,
} from "../src/offline/index";
import { migrateLegacyOfflineQueues } from "../src/offline/writeQueue";

describe("offline write queue durability", () => {
	beforeEach(async () => {
		await initPromise;
		await db.table("write_queue").clear();
		await db.table("queue").clear();
		await db.table("keyval").clear();
		localStorage.clear();
		memory.offline_invoices = [];
		memory.offline_customers = [];
		memory.offline_payments = [];
		memory.offline_cash_movements = [];
		vi.spyOn(console, "error").mockImplementation(() => {});
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("durably persists invoice queue entries with lifecycle metadata", async () => {
		await saveOfflineInvoice({
			invoice: {
				name: "OFFLINE-SINV-1001",
				customer: "CUST-001",
				items: [{ item_code: "ITEM-1", item_name: "Item 1", qty: 1 }],
			},
			data: {},
		});

		const queued = getOfflineInvoices();
		const dbRows = await db.table("write_queue").toArray();

		expect(queued).toHaveLength(1);
		expect(dbRows).toHaveLength(1);
		expect(dbRows[0]).toEqual(
			expect.objectContaining({
				entity_type: "invoice",
				status: "pending",
				retry_count: 0,
				last_attempt_at: null,
				last_error: null,
				idempotency_key: expect.any(String),
				created_at: expect.any(String),
				payload: expect.objectContaining({
					invoice: expect.objectContaining({ name: "OFFLINE-SINV-1001" }),
				}),
			}),
		);
	});

	it("prevents duplicate queue entries for the same idempotent cash movement", async () => {
		const entry = {
			method: "posawesome.posawesome.api.cash_movement.service.create_pos_expense",
			args: {
				payload: {
					amount: 25,
					movement_type: "Expense",
					client_request_id: "cm-fixed-001",
				},
			},
		};

		await saveOfflineCashMovement(entry);
		await saveOfflineCashMovement(entry);

		const queued = getOfflineCashMovements();
		const dbRows = await db.table("write_queue").toArray();

		expect(queued).toHaveLength(1);
		expect(dbRows).toHaveLength(1);
		expect(dbRows[0]?.idempotency_key).toContain("cm-fixed-001");
	});

	it("prevents duplicate queue entries for the same idempotent invoice", async () => {
		const entry = {
			invoice: {
				name: "OFFLINE-SINV-DEDUP-1",
				customer: "CUST-DEDUP",
				posa_client_request_id: "inv-fixed-queue-001",
				items: [{ item_code: "ITEM-1", item_name: "Item 1", qty: 1 }],
			},
			data: {
				idempotency_key: "inv-fixed-queue-001",
			},
		};

		await saveOfflineInvoice(entry);
		await saveOfflineInvoice(entry);

		const queued = getOfflineInvoices();
		const dbRows = await db.table("write_queue").toArray();

		expect(queued).toHaveLength(1);
		expect(dbRows).toHaveLength(1);
		expect(dbRows[0]?.idempotency_key).toBe("invoice:inv-fixed-queue-001");
	});

	it("prevents duplicate queue entries for the same idempotent payment", async () => {
		const entry = {
			args: {
				payload: {
					customer: "CUST-001",
					company: "Test Company",
					currency: "USD",
					client_request_id: "pay-fixed-queue-001",
					payment_methods: [{ mode_of_payment: "Cash", amount: 25 }],
				},
			},
		};

		await saveOfflinePayment(entry);
		await saveOfflinePayment(entry);

		const queued = getOfflinePayments();
		const dbRows = await db.table("write_queue").toArray();

		expect(queued).toHaveLength(1);
		expect(dbRows).toHaveLength(1);
		expect(dbRows[0]?.idempotency_key).toBe("payment:pay-fixed-queue-001");
	});

	it("tracks retry metadata and moves exhausted entries to dead letter", async () => {
		await saveOfflineCashMovement({
			method: "posawesome.posawesome.api.cash_movement.service.create_pos_expense",
			args: {
				payload: {
					amount: 15,
					movement_type: "Expense",
					client_request_id: "cm-retry-001",
				},
			},
		});

		(globalThis as any).frappe.call.mockRejectedValue(new Error("server unavailable"));

		let result = await syncOfflineCashMovements();
		expect(result).toEqual({ pending: 1, synced: 0 });

		let [row] = await db.table("write_queue").toArray();
		expect(row).toEqual(
			expect.objectContaining({
				status: "failed",
				retry_count: 1,
				last_attempt_at: expect.any(String),
				last_error: expect.stringContaining("server unavailable"),
			}),
		);

		for (let attempt = 0; attempt < 4; attempt += 1) {
			result = await syncOfflineCashMovements();
		}

		[row] = await db.table("write_queue").toArray();
		expect(row).toEqual(
			expect.objectContaining({
				status: "dead_letter",
				retry_count: 5,
				last_error: expect.stringContaining("server unavailable"),
			}),
		);
		expect(getOfflineCashMovements()).toHaveLength(1);
		expect(result).toEqual({ pending: 1, synced: 0 });
	});

	it("migrates legacy array-based queue entries into the indexed queue", async () => {
		const legacyEntries = [
			{
				invoice: {
					name: "LEGACY-SINV-0001",
					customer: "CUST-LEGACY",
					items: [{ item_code: "ITEM-LEGACY", item_name: "Legacy", qty: 1 }],
				},
				data: {},
			},
		];

		await db.table("queue").put({
			key: "offline_invoices",
			value: legacyEntries,
		});
		memory.offline_invoices = legacyEntries as any[];

		await migrateLegacyOfflineQueues();

		const queued = getOfflineInvoices();
		const dbRows = await db.table("write_queue").toArray();
		const legacyRow = await db.table("queue").get("offline_invoices");

		expect(queued).toHaveLength(1);
		expect(queued[0]?.invoice?.name).toBe("LEGACY-SINV-0001");
		expect(dbRows).toHaveLength(1);
		expect(dbRows[0]?.entity_type).toBe("invoice");
		expect(legacyRow?.value || []).toEqual([]);
	});
});
