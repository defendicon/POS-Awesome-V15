// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	db,
	checkDbHealth,
	flushPersistQueue,
	initPromise,
	memory,
	pruneOfflineStorage,
	purgeOldQueueEntries,
	queueHealthCheck,
	quickDbHealthCheck,
	repairDbAfterFailedHealthCheck,
	safeBulkPut,
} from "../src/offline/index";

describe("offline IndexedDB maintenance", () => {
	beforeEach(async () => {
		await initPromise;
		for (const table of [
			"invoice_outbox",
			"sync_state",
			"keyval",
			"queue",
			"write_queue",
		]) {
			await db.table(table).clear();
		}
		memory.offline_invoices = [];
		memory.offline_customers = [];
		memory.offline_payments = [];
		memory.offline_cash_movements = [];
		vi.useRealTimers();
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("writes large batches through one bulkPut call", async () => {
		const rows = Array.from({ length: 1500 }, (_, index) => ({
			key: `telemetry:${index}`,
			value: { created_at: new Date(2026, 0, 1).toISOString(), index },
		}));
		const bulkSpy = vi.spyOn(db.table("keyval"), "bulkPut");

		await safeBulkPut("keyval", rows);

		expect(bulkSpy).toHaveBeenCalledTimes(1);
		expect(await db.table("keyval").count()).toBe(1500);
	});

	it("prunes terminal outbox rows and stale metadata while retaining active rows", async () => {
		const oldIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
		const freshIso = new Date().toISOString();
		await db.table("invoice_outbox").bulkPut([
			{
				client_request_id: "old-ack",
				status: "acknowledged",
				invoice: {},
				data: {},
				created_at: oldIso,
				updated_at: oldIso,
				next_retry_at: null,
				retry_count: 0,
				last_error: null,
				invoice_name: "ACC-SINV-1",
				acknowledged_at: oldIso,
			},
			{
				client_request_id: "pending",
				status: "pending",
				invoice: {},
				data: {},
				created_at: oldIso,
				updated_at: oldIso,
				next_retry_at: null,
				retry_count: 0,
				last_error: null,
				invoice_name: null,
				acknowledged_at: null,
			},
			{
				client_request_id: "fresh-ack",
				status: "acknowledged",
				invoice: {},
				data: {},
				created_at: freshIso,
				updated_at: freshIso,
				next_retry_at: null,
				retry_count: 0,
				last_error: null,
				invoice_name: "ACC-SINV-2",
				acknowledged_at: freshIso,
			},
		]);
		await db.table("sync_state").bulkPut([
			{
				key: "posa_sync_state::old",
				resourceId: "old",
				status: "fresh",
				nextRetryAt: null,
				value: { resourceId: "old", lastSyncedAt: oldIso },
				updated_at: oldIso,
			},
			{
				key: "posa_sync_state::fresh",
				resourceId: "fresh",
				status: "fresh",
				nextRetryAt: null,
				value: { resourceId: "fresh", lastSyncedAt: freshIso },
				updated_at: freshIso,
			},
		]);
		await db.table("write_queue").bulkPut([
			{
				entity_type: "invoice",
				resource: "invoice",
				payload: {},
				created_at: oldIso,
				last_attempt_at: oldIso,
				next_attempt_at: null,
				retry_count: 0,
				status: "synced",
				idempotency_key: "synced-old",
				last_error: null,
			},
			{
				entity_type: "invoice",
				resource: "invoice",
				payload: {},
				created_at: oldIso,
				last_attempt_at: oldIso,
				next_attempt_at: null,
				retry_count: 0,
				status: "pending",
				idempotency_key: "pending-old",
				last_error: null,
			},
		]);
		await db.table("keyval").bulkPut([
			{ key: "tombstone:old", value: { created_at: oldIso } },
			{ key: "tombstone:fresh", value: { created_at: freshIso } },
			{ key: "local_telemetry:old", value: { created_at: oldIso } },
			{ key: "local_telemetry:fresh", value: { created_at: freshIso } },
		]);

		const toArraySpies = [
			"invoice_outbox",
			"write_queue",
			"sync_state",
			"keyval",
		].map((tableName) => vi.spyOn(db.table(tableName), "toArray"));

		const result = await pruneOfflineStorage({ now: Date.now(), maxAgeDays: 30 });

		expect(result.invoiceOutbox).toBe(1);
		expect(result.writeQueue).toBe(1);
		expect(result.syncState).toBe(1);
		expect(result.tombstones).toBe(1);
		expect(result.localTelemetry).toBe(1);
		for (const spy of toArraySpies) {
			expect(spy).not.toHaveBeenCalled();
			spy.mockRestore();
		}
		expect(await db.table("invoice_outbox").toArray()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ client_request_id: "pending" }),
				expect.objectContaining({ client_request_id: "fresh-ack" }),
			]),
		);
		expect(await db.table("write_queue").toArray()).toEqual([
			expect.objectContaining({ idempotency_key: "pending-old" }),
		]);
		expect(await db.table("sync_state").toArray()).toEqual([
			expect.objectContaining({ key: "posa_sync_state::fresh" }),
		]);
		const keyvalKeys = (await db.table("keyval").toArray())
			.map((row) => row.key)
			.sort();
		expect(keyvalKeys).toEqual(["local_telemetry:fresh", "tombstone:fresh"]);
	});

	it("does not trim unsynced legacy queue entries by count", () => {
		const oldIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
		memory.offline_invoices = Array.from({ length: 1505 }, (_, index) => ({
			status: "pending",
			created_at: oldIso,
			invoice: { name: `PENDING-${index}` },
		}));

		expect(queueHealthCheck()).toBe(false);
		expect(purgeOldQueueEntries({ now: Date.now(), maxAgeDays: 30 })).toBe(0);
		expect(memory.offline_invoices).toHaveLength(1505);
		expect(memory.offline_invoices[0]?.invoice?.name).toBe("PENDING-0");
	});

	it("prunes only old terminal legacy queue entries by age", async () => {
		const now = Date.now();
		const oldIso = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();
		const freshIso = new Date(now).toISOString();
		memory.offline_invoices = [
			{ status: "synced", last_attempt_at: oldIso, invoice: { name: "old-synced" } },
			{
				status: "acknowledged",
				acknowledged_at: oldIso,
				invoice: { name: "old-acknowledged" },
			},
			{ status: "pending", created_at: oldIso, invoice: { name: "old-pending" } },
			{
				status: "dead_letter",
				last_attempt_at: oldIso,
				invoice: { name: "old-dead-letter" },
			},
			{ status: "synced", last_attempt_at: freshIso, invoice: { name: "fresh-synced" } },
			{ invoice: { name: "legacy-no-status" } },
		];

		expect(queueHealthCheck()).toBe(true);
		expect(purgeOldQueueEntries({ now, maxAgeDays: 30 })).toBe(2);

		const retainedNames = memory.offline_invoices.map((entry) => entry.invoice?.name);
		expect(retainedNames).toEqual([
			"old-pending",
			"old-dead-letter",
			"fresh-synced",
			"legacy-no-status",
		]);

		await flushPersistQueue();
		const persisted = await db.table("queue").get("offline_invoices");
		expect((persisted?.value || []).map((entry: any) => entry.invoice?.name)).toEqual(
			retainedNames,
		);
	});

	it("keeps failed quick health checks non-destructive", async () => {
		const isOpenSpy = vi.spyOn(db, "isOpen").mockReturnValue(false);
		const openSpy = vi.spyOn(db, "open").mockRejectedValue(new Error("open failed"));

		await expect(quickDbHealthCheck()).resolves.toBe(false);

		expect(openSpy).toHaveBeenCalledTimes(1);
		isOpenSpy.mockRestore();
		openSpy.mockRestore();
	});

	it("uses the controlled repair path after a failed IndexedDB health check", async () => {
		const isOpenSpy = vi.spyOn(db, "isOpen").mockReturnValue(false);
		const openSpy = vi
			.spyOn(db, "open")
			.mockRejectedValueOnce(new Error("open failed"))
			.mockResolvedValueOnce(db);

		await expect(checkDbHealth()).resolves.toBe(true);

		expect(openSpy).toHaveBeenCalledTimes(2);
		isOpenSpy.mockRestore();
		openSpy.mockRestore();
	});

	it("allows callers to enter degraded mode when controlled repair cannot open the DB", async () => {
		const isOpenSpy = vi.spyOn(db, "isOpen").mockReturnValue(false);
		const openSpy = vi.spyOn(db, "open").mockRejectedValue(new Error("blocked"));

		await expect(repairDbAfterFailedHealthCheck()).resolves.toBe(false);

		expect(openSpy).toHaveBeenCalledTimes(1);
		isOpenSpy.mockRestore();
		openSpy.mockRestore();
	});
});
