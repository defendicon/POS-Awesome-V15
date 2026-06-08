// @vitest-environment jsdom

import "fake-indexeddb/auto";

import Dexie from "dexie/dist/dexie.mjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	db,
	checkDbHealth,
	initPromise,
	pruneOfflineStorage,
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
		await db.table("keyval").bulkPut([
			{ key: "local_telemetry:old", value: { created_at: oldIso } },
			{ key: "local_telemetry:fresh", value: { created_at: freshIso } },
		]);

		const result = await pruneOfflineStorage({ now: Date.now(), maxAgeDays: 30 });

		expect(result.invoiceOutbox).toBe(1);
		expect(result.syncState).toBe(1);
		expect(result.localTelemetry).toBe(1);
		expect(await db.table("invoice_outbox").toArray()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ client_request_id: "pending" }),
				expect.objectContaining({ client_request_id: "fresh-ack" }),
			]),
		);
		expect(await db.table("sync_state").toArray()).toEqual([
			expect.objectContaining({ key: "posa_sync_state::fresh" }),
		]);
		expect(await db.table("keyval").toArray()).toEqual([
			expect.objectContaining({ key: "local_telemetry:fresh" }),
		]);
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

	it("coalesces concurrent health checks instead of racing database repair", async () => {
		const isOpenSpy = vi.spyOn(db, "isOpen").mockReturnValue(false);
		let resolveOpen: ((_value: typeof db) => void) | null = null;
		const openSpy = vi.spyOn(db, "open").mockImplementation(
			() =>
				new Promise((_resolve) => {
					resolveOpen = _resolve;
				}),
		);

		const first = checkDbHealth();
		const second = checkDbHealth();

		expect(first).toBe(second);
		expect(openSpy).toHaveBeenCalledTimes(1);

		resolveOpen?.(db);
		await expect(first).resolves.toBe(true);

		isOpenSpy.mockRestore();
		openSpy.mockRestore();
	});

	it("never deletes IndexedDB during automatic health repair", async () => {
		const isOpenSpy = vi.spyOn(db, "isOpen").mockReturnValue(false);
		const transientError = Object.assign(new Error("connection closing"), {
			name: "InvalidStateError",
		});
		const openSpy = vi.spyOn(db, "open").mockRejectedValue(transientError);
		const deleteSpy = vi.spyOn(Dexie, "delete");

		await expect(
			repairDbAfterFailedHealthCheck(transientError),
		).resolves.toBe(false);

		expect(deleteSpy).not.toHaveBeenCalled();
		isOpenSpy.mockRestore();
		openSpy.mockRestore();
		deleteSpy.mockRestore();
	});
});
