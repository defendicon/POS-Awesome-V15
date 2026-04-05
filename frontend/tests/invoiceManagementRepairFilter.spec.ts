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

import InvoiceManagement from "../src/posapp/components/pos/flows/InvoiceManagement.vue";

describe("InvoiceManagement repair candidate filter", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).frappe = {
			call: vi.fn(),
			datetime: {
				get_today: () => "2026-04-05",
			},
		};
	});

	it("filters history rows to change-allocation issue invoices when the toggle is enabled", () => {
		const context = {
			historyInvoices: [
				{
					name: "ACC-SINV-0001",
					customer_name: "Walk-In",
					status: "Paid",
					posting_date: "2026-04-04",
					posting_time: "10:00:00",
					grand_total: 240,
					paid_amount: 2400,
					change_amount: 2160,
					outstanding_amount: -2160,
					is_return: 0,
				},
				{
					name: "ACC-SINV-0002",
					customer_name: "Regular",
					status: "Paid",
					posting_date: "2026-04-04",
					posting_time: "11:00:00",
					grand_total: 240,
					paid_amount: 240,
					change_amount: 0,
					outstanding_amount: 0,
					is_return: 0,
				},
				{
					name: "ACC-SINV-0003",
					customer_name: "Repaired",
					status: "Paid",
					posting_date: "2026-04-04",
					posting_time: "12:00:00",
					grand_total: 240,
					paid_amount: 2400,
					change_amount: 2160,
					outstanding_amount: -2160,
					is_return: 0,
				},
			],
			historySearch: "",
			historyStatus: "All",
			historyDateFrom: "",
			historyDateTo: "",
			historyShowRepairCandidatesOnly: true,
			repairCandidateInvoiceNames: ["ACC-SINV-0001"],
			repairedChangeAllocationInvoiceNames: ["ACC-SINV-0003"],
			repairCandidateScopeReady: true,
			filterCollection: (InvoiceManagement as any).methods.filterCollection,
			sortInvoicesByLatest: (InvoiceManagement as any).methods.sortInvoicesByLatest,
			invoiceSortValue: (InvoiceManagement as any).methods.invoiceSortValue,
			normalizeDate: (InvoiceManagement as any).methods.normalizeDate,
			normalizePostingTime: (InvoiceManagement as any).methods.normalizePostingTime,
			toPostingTimestamp: (InvoiceManagement as any).methods.toPostingTimestamp,
			inRange: (InvoiceManagement as any).methods.inRange,
			matchesRepairCandidatePattern: (InvoiceManagement as any).methods.matchesRepairCandidatePattern,
			changeAllocationRepairState: (InvoiceManagement as any).methods.changeAllocationRepairState,
			isRepairCandidate: (InvoiceManagement as any).methods.isRepairCandidate,
		};

		const filtered = (InvoiceManagement as any).computed.filteredHistoryInvoices.call(context);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((invoice: any) => invoice.name)).toEqual(["ACC-SINV-0003", "ACC-SINV-0001"]);
		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, filtered[0])).toBe("repaired");
		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, filtered[1])).toBe("candidate");
	});

	it("recomputes history totals from the repair-candidate subset", () => {
		const context = {
			filteredHistoryInvoices: [
				{
					grand_total: 240,
					paid_amount: 2400,
					change_amount: 2160,
					outstanding_amount: -2160,
				},
			],
		};

		const totals = (InvoiceManagement as any).computed.historyTotals.call(context);

		expect(totals).toEqual({
			gross: 240,
			paid: 2400,
			change_return: 2160,
			outstanding: -2160,
		});
	});

	it("marks backend-proven repaired invoices without hiding other candidates", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({
			message: {
				matched: [],
				skipped: [
					{
						invoice: "ACC-SINV-0001",
						payment_entry: "ACC-PAY-0002",
						reason: "already_allocated",
					},
				],
			},
		});

		const historyInvoices = [
			{
				name: "ACC-SINV-0001",
				change_amount: 2160,
				outstanding_amount: -2160,
				is_return: 0,
			},
			{
				name: "ACC-SINV-0002",
				change_amount: 2160,
				outstanding_amount: -2160,
				is_return: 0,
			},
		];

		const context = {
			currentInvoiceDoctype: "Sales Invoice",
			posProfile: { company: "Farooq Chemicals" },
			historyInvoices,
			repairCandidateInvoiceNames: [],
			repairedChangeAllocationInvoiceNames: [],
			repairCandidateScopeReady: false,
			toastStore: { show: vi.fn() },
			matchesRepairCandidatePattern: (InvoiceManagement as any).methods.matchesRepairCandidatePattern,
			changeAllocationRepairState: (InvoiceManagement as any).methods.changeAllocationRepairState,
		};

		await (InvoiceManagement as any).methods.refreshRepairCandidates.call(context, historyInvoices);

		expect(context.repairCandidateScopeReady).toBe(true);
		expect(context.repairCandidateInvoiceNames).toEqual([]);
		expect(context.repairedChangeAllocationInvoiceNames).toEqual(["ACC-SINV-0001"]);
		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, historyInvoices[0])).toBe("repaired");
		expect((InvoiceManagement as any).methods.isRepairCandidate.call(context, historyInvoices[0])).toBe(false);
		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, historyInvoices[1])).toBe("candidate");
		expect((InvoiceManagement as any).methods.isRepairCandidate.call(context, historyInvoices[1])).toBe(true);
	});

	it("keeps POS Invoice repair candidates visible when backend preview matches them", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({
			message: {
				matched: [{ invoice: "ACC-PINV-0001" }],
				skipped: [],
			},
		});

		const historyInvoices = [
			{
				name: "ACC-PINV-0001",
				change_amount: 800,
				outstanding_amount: -800,
				is_return: 0,
			},
		];

		const context = {
			currentInvoiceDoctype: "POS Invoice",
			posProfile: { company: "Farooq Chemicals" },
			historyInvoices,
			repairCandidateInvoiceNames: [],
			repairedChangeAllocationInvoiceNames: [],
			repairCandidateScopeReady: false,
			toastStore: { show: vi.fn() },
			matchesRepairCandidatePattern: (InvoiceManagement as any).methods.matchesRepairCandidatePattern,
			changeAllocationRepairState: (InvoiceManagement as any).methods.changeAllocationRepairState,
		};

		await (InvoiceManagement as any).methods.refreshRepairCandidates.call(context, historyInvoices);

		expect(callMock).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
				args: expect.objectContaining({
					doctype: "POS Invoice",
					invoice_names: ["ACC-PINV-0001"],
				}),
			}),
		);
		expect(context.repairCandidateInvoiceNames).toEqual(["ACC-PINV-0001"]);
		expect((InvoiceManagement as any).methods.isRepairCandidate.call(context, historyInvoices[0])).toBe(true);
	});

	it("checks repaired states per invoice doctype when history mixes POS and Sales invoices", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock
			.mockResolvedValueOnce({
				message: {
					matched: [{ invoice: "ACC-PINV-0001" }],
					skipped: [],
				},
			})
			.mockResolvedValueOnce({
				message: {
					matched: [],
					skipped: [
						{
							invoice: "ACC-SINV-0002",
							payment_entry: "ACC-PAY-0002",
							reason: "already_allocated",
						},
					],
				},
			});

		const historyInvoices = [
			{
				name: "ACC-PINV-0001",
				doctype: "POS Invoice",
				change_amount: 800,
				outstanding_amount: -800,
				is_return: 0,
			},
			{
				name: "ACC-SINV-0002",
				doctype: "Sales Invoice",
				change_amount: 690,
				outstanding_amount: -690,
				is_return: 0,
			},
		];

		const context = {
			currentInvoiceDoctype: "POS Invoice",
			posProfile: { company: "Farooq Chemicals" },
			historyInvoices,
			repairCandidateInvoiceNames: [],
			repairedChangeAllocationInvoiceNames: [],
			repairCandidateScopeReady: false,
			toastStore: { show: vi.fn() },
			matchesRepairCandidatePattern: (InvoiceManagement as any).methods.matchesRepairCandidatePattern,
			changeAllocationRepairState: (InvoiceManagement as any).methods.changeAllocationRepairState,
		};

		await (InvoiceManagement as any).methods.refreshRepairCandidates.call(context, historyInvoices);

		expect(callMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				args: expect.objectContaining({
					doctype: "POS Invoice",
					invoice_names: ["ACC-PINV-0001"],
				}),
			}),
		);
		expect(callMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				args: expect.objectContaining({
					doctype: "Sales Invoice",
					invoice_names: ["ACC-SINV-0002"],
				}),
			}),
		);
		expect(context.repairCandidateInvoiceNames).toEqual(["ACC-PINV-0001"]);
		expect(context.repairedChangeAllocationInvoiceNames).toEqual(["ACC-SINV-0002"]);
		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, historyInvoices[0])).toBe("candidate");
		expect((InvoiceManagement as any).methods.changeAllocationRepairState.call(context, historyInvoices[1])).toBe("repaired");
	});
});
