// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, initPromise } from "../src/offline/db";
import * as offlineDb from "../src/offline/db";
import { useSyncCoordinator } from "../src/offline/sync/useSyncCoordinator";
import {
	prepareSafeRefresh,
	flushCartForRefresh,
	requestSafeRefresh,
	SAFE_REFRESH_PREPARE,
	SAFE_REFRESH_REQUEST,
} from "../src/posapp/services/safeRefresh";

describe("safe refresh persistence gate", () => {
	beforeEach(async () => {
		await initPromise;
		for (const name of [
			"write_queue",
			"invoice_outbox",
			"sync_state",
			"queue",
		])
			await db.table(name).clear();
		localStorage.clear();
	});
	afterEach(() => vi.restoreAllMocks());
	it("requires the ERP listener instead of falling back to an unguarded reload", () => {
		expect(requestSafeRefresh()).toBe(false);
		const listener = (event: Event) => event.preventDefault();
		window.addEventListener(SAFE_REFRESH_REQUEST, listener);
		expect(requestSafeRefresh()).toBe(true);
		window.removeEventListener(SAFE_REFRESH_REQUEST, listener);
	});
	it("honors a synchronous failed cart save", async () => {
		const listener = (event: Event) => {
			(event as CustomEvent).detail.reasons.push("Storage full");
			event.preventDefault();
		};
		window.addEventListener(SAFE_REFRESH_PREPARE, listener);
		try {
			expect(() => flushCartForRefresh()).toThrow("Storage full");
			await expect(prepareSafeRefresh(() => false)).rejects.toThrow(
				"Storage full",
			);
		} finally {
			window.removeEventListener(SAFE_REFRESH_PREPARE, listener);
		}
	});
	it("reports pending invoices and non-invoice writes without changing them", async () => {
		await db
			.table("invoice_outbox")
			.add({
				client_request_id: "pending-1",
				status: "pending",
				invoice: {},
				created_at: new Date().toISOString(),
			});
		await db
			.table("write_queue")
			.add({
				entity_type: "payment",
				idempotency_key: "payment-1",
				payload: {},
				status: "dead_letter",
			});
		const before = await db.table("invoice_outbox").toArray();
		expect(await prepareSafeRefresh(() => false)).toMatchObject({
			hasCart: false,
			pendingInvoices: 1,
			pendingOtherWrites: 1,
		});
		expect(await db.table("invoice_outbox").toArray()).toEqual(before);
	});
	it.each(["write_queue", "invoice_outbox", "sync_state"])(
		"blocks an active delivery in %s",
		async (table) => {
			await db
				.table(table)
				.add({
					key: "active",
					client_request_id: "active",
					entity_type: "invoice",
					idempotency_key: "invoice:active",
					payload: { invoice: { posa_client_request_id: "active" } },
					status: "syncing",
					invoice: {},
				});
			await expect(prepareSafeRefresh(() => false)).rejects.toThrow(
				"sync is running",
			);
		},
	);
	it("blocks UI operations before touching persisted work", async () => {
		await expect(prepareSafeRefresh(() => true)).rejects.toThrow(
			"Finish the current operation",
		);
	});
	it("blocks real in-memory sync execution even without a fresh persisted row", async () => {
		vi.spyOn(useSyncCoordinator(), "hasActiveRuns").mockReturnValue(true);
		await expect(prepareSafeRefresh(() => false)).rejects.toThrow(
			"sync is running",
		);
	});
	it("propagates persistence failure rather than reporting a safe reload", async () => {
		vi.spyOn(offlineDb, "flushPersistQueue").mockRejectedValue(
			new Error("IndexedDB write failed"),
		);
		await expect(prepareSafeRefresh(() => false)).rejects.toThrow(
			"IndexedDB write failed",
		);
	});
	it("retains an expired sync claim without permanently blocking an offline reload", async () => {
		const old = new Date(Date.now() - 6 * 60_000).toISOString();
		await db
			.table("invoice_outbox")
			.add({
				client_request_id: "expired",
				status: "syncing",
				updated_at: old,
				created_at: old,
				invoice: {},
			});
		expect(await prepareSafeRefresh(() => false)).toMatchObject({
			pendingInvoices: 1,
		});
		expect((await db.table("invoice_outbox").toArray())[0].status).toBe(
			"syncing",
		);
	});
});
