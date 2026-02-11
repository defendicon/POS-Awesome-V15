import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/services/api", () => ({
	default: {
		call: vi.fn(),
	},
}));

import cashMovementService from "../src/posapp/services/cashMovementService";
import { useCashMovementValidation } from "../src/posapp/composables/pos/cash/useCashMovementValidation";
import api from "../src/posapp/services/api";

describe("cash movement validation", () => {
	beforeEach(() => {
		globalThis.__ = ((text: string) => text) as any;
	});

	it("rejects disabled profile and invalid movement constraints", () => {
		const { validate } = useCashMovementValidation();
		const result = validate({
			movementType: "Expense",
			amount: 0,
			remarks: "",
			context: {
				enable_cash_movement: false,
				allow_pos_expense: false,
				require_cash_movement_remarks: true,
			},
			expenseAccount: "",
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Cash movement is disabled for this POS Profile.");
		expect(result.errors).toContain("POS Expense is disabled for this POS Profile.");
		expect(result.errors).toContain("Amount must be greater than zero.");
		expect(result.errors).toContain("Remarks are required.");
	});

	it("accepts valid deposit payload", () => {
		const { validate } = useCashMovementValidation();
		const result = validate({
			movementType: "Deposit",
			amount: 120,
			remarks: "handover",
			context: {
				enable_cash_movement: true,
				allow_cash_deposit: true,
				back_office_cash_account: "Back Office Cash - MC",
				require_cash_movement_remarks: true,
			},
			targetAccount: "",
		});

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});
});

describe("cash movement service methods", () => {
	it("calls backend method names correctly", async () => {
		const call = (api as any).call as ReturnType<typeof vi.fn>;
		call.mockResolvedValueOnce({ ok: 1 });
		call.mockResolvedValueOnce({ ok: 1 });
		call.mockResolvedValueOnce({ ok: 1 });

		await cashMovementService.createExpense({ amount: 50 });
		await cashMovementService.createDeposit({ amount: 75 });
		await cashMovementService.cancel("POS-CM-.26.-00001");

		expect(call).toHaveBeenNthCalledWith(
			1,
			"posawesome.posawesome.api.cash_movement.service.create_pos_expense",
			{ payload: { amount: 50 } },
		);
		expect(call).toHaveBeenNthCalledWith(
			2,
			"posawesome.posawesome.api.cash_movement.service.create_cash_deposit",
			{ payload: { amount: 75 } },
		);
		expect(call).toHaveBeenNthCalledWith(
			3,
			"posawesome.posawesome.api.cash_movement.service.cancel_cash_movement",
			{ name: "POS-CM-.26.-00001" },
		);
	});
});
