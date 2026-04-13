// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/composables/core/useTheme", () => ({
	useTheme: () => ({
		isDark: { value: false },
	}),
}));

vi.mock("../src/posapp/composables/core/useResponsive", () => ({
	useResponsive: () => ({
		windowWidth: { value: 1400 },
	}),
}));

vi.mock("../src/offline/index", () => ({
	isOffline: () => false,
}));

vi.mock("../src/posapp/plugins/print", () => ({
	appendDebugPrintParam: (url: string) => url,
	isDebugPrintEnabled: () => false,
	silentPrint: vi.fn(),
	watchPrintWindow: vi.fn(),
}));

vi.mock("../src/posapp/services/qzTray", () => ({
	printDocumentViaQz: vi.fn(),
}));

import InvoiceManagement from "../src/features/orders/components/InvoiceManagement.vue";

describe("InvoiceManagement repair change allocation", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).frappe = {
			call: vi.fn(),
			msgprint: vi.fn(),
		};
	});

	it("identifies invoices that can use targeted change-allocation repair", () => {
		const candidate = {
			name: "ACC-SINV-2026-08532",
			is_return: 0,
			outstanding_amount: -2160,
			change_amount: 2160,
		};

		const nonCandidate = {
			name: "ACC-SINV-2026-08533",
			is_return: 0,
			outstanding_amount: 0,
			change_amount: 2160,
		};

		expect((InvoiceManagement as any).methods.isRepairCandidate(candidate)).toBe(true);
		expect((InvoiceManagement as any).methods.isRepairCandidate(nonCandidate)).toBe(false);
	});

	it("marks already repaired invoices as non-actionable", () => {
		const repaired = {
			name: "ACC-SINV-2026-08532",
			is_return: 0,
			outstanding_amount: -2160,
			change_amount: 2160,
		};

		const context = {
			repairedChangeAllocationInvoiceNames: ["ACC-SINV-2026-08532"],
			repairCandidateScopeReady: true,
			matchesRepairCandidatePattern: (InvoiceManagement as any).methods.matchesRepairCandidatePattern,
			changeAllocationRepairState: (InvoiceManagement as any).methods.changeAllocationRepairState,
		};

		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, repaired)).toBe("repaired");
		expect((InvoiceManagement as any).methods.isRepairCandidate.call(context, repaired)).toBe(false);
	});

	it("previews and then applies repair for the selected invoice only", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock
			.mockResolvedValueOnce({
				message: {
					matched: [
						{
							invoice: "ACC-SINV-2026-08532",
							payment_entry: "ACC-PAY-2026-00780",
							allocated_amount: 2160,
						},
					],
					skipped: [],
				},
			})
			.mockResolvedValueOnce({
				message: {
					repaired: [
						{
							invoice: "ACC-SINV-2026-08532",
							payment_entry: "ACC-PAY-2026-00780",
							allocated_amount: 2160,
						},
					],
					skipped: [],
				},
			});

		const context = {
			selectedInvoiceDetail: {
				name: "ACC-SINV-2026-08532",
				customer: "zzz",
				doctype: "Sales Invoice",
				is_return: 0,
				outstanding_amount: -2160,
				change_amount: 2160,
			},
			matchesRepairCandidatePattern: (InvoiceManagement as any).methods.matchesRepairCandidatePattern,
			changeAllocationRepairState: (InvoiceManagement as any).methods.changeAllocationRepairState,
			isRepairCandidate: (InvoiceManagement as any).methods.isRepairCandidate,
			runRepairChangeAllocation: (InvoiceManagement as any).methods.runRepairChangeAllocation,
			posProfile: {
				company: "Farooq Chemicals",
			},
			toastStore: {
				show: vi.fn(),
			},
			viewInvoice: vi.fn().mockResolvedValue(undefined),
			refreshAll: vi.fn().mockResolvedValue(undefined),
		};

		await (InvoiceManagement as any).methods.repairChangeAllocation.call(
			context,
			context.selectedInvoiceDetail,
		);

		expect(callMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
				args: {
					doctype: "Sales Invoice",
					invoice_names: ["ACC-SINV-2026-08532"],
					company: "Farooq Chemicals",
					dry_run: 1,
				},
			}),
		);
		expect(callMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
				args: {
					doctype: "Sales Invoice",
					invoice_names: ["ACC-SINV-2026-08532"],
					company: "Farooq Chemicals",
					dry_run: 0,
				},
			}),
		);
		expect(context.viewInvoice).toHaveBeenCalledWith(context.selectedInvoiceDetail);
		expect(context.refreshAll).toHaveBeenCalledTimes(1);
		expect(context.toastStore.show).toHaveBeenCalledWith({
			title: "Change allocation repaired",
			color: "success",
		});
	});
});
