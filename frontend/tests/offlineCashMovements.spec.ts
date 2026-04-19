// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	db,
	getPendingOfflineCashMovementCount,
	initPromise,
	memory,
	clearOfflineCashMovements,
	saveOfflineCashMovement,
	syncOfflineCashMovements,
} from "../src/offline/index";

describe("offline cash movements", () => {
	beforeEach(async () => {
		await initPromise;
		await db.table("write_queue").clear();
		await db.table("queue").clear();
		await db.table("keyval").clear();
		memory.offline_cash_movements = [];
		localStorage.clear();
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("stores movement in the durable write queue", async () => {
		await saveOfflineCashMovement({
			method: "x",
			args: { payload: { amount: 10, client_request_id: "cm-1" } },
		});

		expect(getPendingOfflineCashMovementCount()).toBe(1);
		const rows = await db.table("write_queue").toArray();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual(
			expect.objectContaining({
				entity_type: "cash_movement",
				status: "pending",
				retry_count: 0,
			}),
		);
	});

	it("syncs queued movements and clears the active queue when online", async () => {
		await saveOfflineCashMovement({
			method: "posawesome.posawesome.api.cash_movement.service.create_pos_expense",
			args: { payload: { amount: 10, client_request_id: "cm-2" } },
		});
		(globalThis as any).frappe.call.mockResolvedValue({ message: { ok: 1 } });

		const result = await syncOfflineCashMovements();

		expect(result).toEqual({ pending: 0, synced: 1 });
		expect((globalThis as any).frappe.call).toHaveBeenCalledTimes(1);
		expect(getPendingOfflineCashMovementCount()).toBe(0);
	});

	it("does not sync while offline", async () => {
		memory.manual_offline = true;
		await saveOfflineCashMovement({
			args: {
				payload: {
					movement_type: "Deposit",
					amount: 20,
					client_request_id: "cm-3",
				},
			},
		});

		const result = await syncOfflineCashMovements();

		expect(result).toEqual({ pending: 1, synced: 0 });
		expect((globalThis as any).frappe.call).not.toHaveBeenCalled();
		expect(getPendingOfflineCashMovementCount()).toBe(1);
		memory.manual_offline = false;
	});

	it("clear utility empties the queue", async () => {
		await saveOfflineCashMovement({
			args: { payload: { amount: 5, client_request_id: "cm-4" } },
		});
		await clearOfflineCashMovements();
		expect(getPendingOfflineCashMovementCount()).toBe(0);
	});
});
