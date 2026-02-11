import { beforeEach, describe, expect, it, vi } from "vitest";

const { persist, memory, isOffline } = vi.hoisted(() => ({
	persist: vi.fn(),
	memory: {
		offline_cash_movements: [] as any[],
	},
	isOffline: vi.fn(),
}));

vi.mock("../src/offline/db", () => ({
	memory,
	persist,
	isOffline,
}));

import {
	clearOfflineCashMovements,
	getPendingOfflineCashMovementCount,
	saveOfflineCashMovement,
	syncOfflineCashMovements,
} from "../src/offline/cash_movements";

describe("offline cash movements", () => {
	beforeEach(() => {
		memory.offline_cash_movements = [];
		persist.mockReset();
		isOffline.mockReset();
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("stores movement in offline queue", () => {
		saveOfflineCashMovement({
			method: "x",
			args: { payload: { amount: 10 } },
		});

		expect(getPendingOfflineCashMovementCount()).toBe(1);
		expect(persist).toHaveBeenCalledWith("offline_cash_movements");
	});

	it("syncs queued movements and clears queue when online", async () => {
		saveOfflineCashMovement({
			method: "posawesome.posawesome.api.cash_movement.service.create_pos_expense",
			args: { payload: { amount: 10 } },
		});
		isOffline.mockReturnValue(false);
		(globalThis as any).frappe.call.mockResolvedValue({ message: { ok: 1 } });

		const result = await syncOfflineCashMovements();

		expect(result).toEqual({ pending: 0, synced: 1 });
		expect((globalThis as any).frappe.call).toHaveBeenCalledTimes(1);
		expect(getPendingOfflineCashMovementCount()).toBe(0);
	});

	it("does not sync while offline", async () => {
		saveOfflineCashMovement({
			args: { payload: { movement_type: "Deposit", amount: 20 } },
		});
		isOffline.mockReturnValue(true);

		const result = await syncOfflineCashMovements();

		expect(result).toEqual({ pending: 1, synced: 0 });
		expect((globalThis as any).frappe.call).not.toHaveBeenCalled();
		expect(getPendingOfflineCashMovementCount()).toBe(1);
	});

	it("clear utility empties queue", () => {
		saveOfflineCashMovement({ args: { payload: { amount: 5 } } });
		clearOfflineCashMovements();
		expect(getPendingOfflineCashMovementCount()).toBe(0);
	});
});
