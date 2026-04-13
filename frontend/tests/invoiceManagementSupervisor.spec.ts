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

vi.mock("../src/platform/printing/print", () => ({
	appendDebugPrintParam: (url: string) => url,
	isDebugPrintEnabled: () => false,
	silentPrint: vi.fn(),
	watchPrintWindow: vi.fn(),
}));

vi.mock("../src/platform/printing/qzTray", () => ({
	printDocumentViaQz: vi.fn(),
}));

import InvoiceManagement from "../src/features/orders/components/InvoiceManagement.vue";

describe("InvoiceManagement supervisor scope", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).frappe = {
			call: vi.fn(),
			datetime: {
				get_today: () => "2026-04-04",
			},
		};
	});

	it("loads the current profile by default for supervisors until all profiles is selected", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({ message: [] });

		const context = {
			posProfile: { name: "Main POS", company: "Farooq Chemicals" },
			posOpeningShift: { name: "POSA-OS-26-0000007" },
			currentCashier: { is_supervisor: true },
			selectedSupervisorPosProfile: null,
			currentInvoiceDoctype: "Sales Invoice",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
			resolveSupervisorProfileScope: (InvoiceManagement as any).methods.resolveSupervisorProfileScope,
			buildInvoiceFilters: (InvoiceManagement as any).methods.buildInvoiceFilters,
			getInvoiceListFields: (InvoiceManagement as any).methods.getInvoiceListFields,
			historyInvoices: [],
			loading: false,
			toastStore: { show: vi.fn() },
		};

		await (InvoiceManagement as any).methods.loadHistory.call(context);

		expect(callMock).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "frappe.client.get_list",
				args: expect.objectContaining({
					filters: {
						company: "Farooq Chemicals",
						docstatus: 1,
						pos_profile: "Main POS",
					},
				}),
			}),
		);
	});

	it("loads cashier history by current profile without restricting to the active opening shift", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({ message: [] });

		const context = {
			posProfile: { name: "Majid Ali", company: "Farooq Chemicals" },
			posOpeningShift: { name: "POSA-OS-26-0000007" },
			currentCashier: { is_supervisor: false },
			currentInvoiceDoctype: "Sales Invoice",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
			resolveSupervisorProfileScope: (InvoiceManagement as any).methods.resolveSupervisorProfileScope,
			buildInvoiceFilters: (InvoiceManagement as any).methods.buildInvoiceFilters,
			getInvoiceListFields: (InvoiceManagement as any).methods.getInvoiceListFields,
			historyInvoices: [],
			loading: false,
			toastStore: { show: vi.fn() },
		};

		await (InvoiceManagement as any).methods.loadHistory.call(context);

		expect(callMock).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "frappe.client.get_list",
				args: expect.objectContaining({
					filters: {
						docstatus: 1,
						pos_profile: "Majid Ali",
					},
				}),
			}),
		);
	});

	it("loads historical sales invoices alongside POS invoices when the current profile uses POS Invoice mode", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock
			.mockResolvedValueOnce({ message: [{ name: "ACC-PINV-0001", posting_date: "2026-04-05" }] })
			.mockResolvedValueOnce({ message: [{ name: "ACC-SINV-2026-07711", posting_date: "2026-03-27", change_amount: 690, outstanding_amount: -690 }] });

		const context = {
			posProfile: { name: "Majid Ali", company: "Farooq Chemicals", create_pos_invoice_instead_of_sales_invoice: 1 },
			posOpeningShift: { name: "POSA-OS-26-0000007" },
			currentCashier: { is_supervisor: false },
			currentInvoiceDoctype: "POS Invoice",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
			resolveSupervisorProfileScope: (InvoiceManagement as any).methods.resolveSupervisorProfileScope,
			buildInvoiceFilters: (InvoiceManagement as any).methods.buildInvoiceFilters,
			getInvoiceListFields: (InvoiceManagement as any).methods.getInvoiceListFields,
			historyInvoices: [],
			loading: false,
			toastStore: { show: vi.fn() },
			refreshRepairCandidates: vi.fn().mockResolvedValue(undefined),
		};

		await (InvoiceManagement as any).methods.loadHistory.call(context);

		expect(callMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				method: "frappe.client.get_list",
				args: expect.objectContaining({
					doctype: "POS Invoice",
				}),
			}),
		);
		expect(callMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				method: "frappe.client.get_list",
				args: expect.objectContaining({
					doctype: "Sales Invoice",
				}),
			}),
		);
		expect(context.historyInvoices).toEqual([
			expect.objectContaining({ name: "ACC-PINV-0001", doctype: "POS Invoice" }),
			expect.objectContaining({ name: "ACC-SINV-2026-07711", doctype: "Sales Invoice" }),
		]);
	});

	it("defaults supervisor filtering to the current profile and supports all profiles", () => {
		const context = {
			posProfile: { name: "Main POS", company: "Farooq Chemicals" },
			currentCashier: { is_supervisor: true },
			selectedSupervisorPosProfile: "Main POS",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
			resolveSupervisorProfileScope: (InvoiceManagement as any).methods.resolveSupervisorProfileScope,
			buildInvoiceFilters: (InvoiceManagement as any).methods.buildInvoiceFilters,
		};

		expect((InvoiceManagement as any).computed.supervisorProfileScope.call(context)).toBe("Main POS");
		expect((InvoiceManagement as any).methods.buildInvoiceFilters.call(context)).toEqual({
			company: "Farooq Chemicals",
			docstatus: 1,
			pos_profile: "Main POS",
		});

		context.selectedSupervisorPosProfile = "All";

		expect((InvoiceManagement as any).computed.supervisorProfileScope.call(context)).toBe(null);
		expect((InvoiceManagement as any).methods.buildInvoiceFilters.call(context)).toEqual({
			company: "Farooq Chemicals",
			docstatus: 1,
		});
	});

	it("passes supervisor company scope to drafts and search matches user/profile metadata", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({ message: [] });

		const context = {
			posProfile: { name: "Main POS", company: "Farooq Chemicals" },
			posOpeningShift: { name: "POSA-OS-26-0000007" },
			currentCashier: { is_supervisor: true },
			selectedSupervisorPosProfile: "Main POS",
			currentInvoiceDoctype: "Sales Invoice",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
			resolveSupervisorProfileScope: (InvoiceManagement as any).methods.resolveSupervisorProfileScope,
			buildInvoiceFilters: (InvoiceManagement as any).methods.buildInvoiceFilters,
			getInvoiceListFields: (InvoiceManagement as any).methods.getInvoiceListFields,
			draftInvoices: [],
			loading: false,
			toastStore: { show: vi.fn() },
			inRange: (InvoiceManagement as any).methods.inRange,
			normalizeDate: (InvoiceManagement as any).methods.normalizeDate,
		};

		await (InvoiceManagement as any).methods.loadDrafts.call(context);

		expect(callMock).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "posawesome.posawesome.api.invoices.get_draft_invoices",
				args: {
					pos_opening_shift: "POSA-OS-26-0000007",
					doctype: "Sales Invoice",
					limit_page_length: 0,
					company: "Farooq Chemicals",
					pos_profile: "Main POS",
					cashier: null,
					is_supervisor: 1,
				},
			}),
		);

		const rows = [
			{
				name: "ACC-SINV-0001",
				customer_name: "Walk-In",
				pos_profile: "Backup POS",
				owner: "cashier@example.com",
				custom_created_by_name: "Abdul Manan",
				status: "Paid",
				posting_date: "2026-04-04",
			},
		];

		const matchedByProfile = (InvoiceManagement as any).methods.filterCollection.call(
			context,
			rows,
			"backup pos",
			"All",
			"",
			"",
		);
		const matchedByCashier = (InvoiceManagement as any).methods.filterCollection.call(
			context,
			rows,
			"abdul manan",
			"All",
			"",
			"",
		);

		expect(matchedByProfile).toHaveLength(1);
		expect(matchedByCashier).toHaveLength(1);
	});

	it("refreshes invoice management when the active POS profile changes while open", async () => {
		const context = {
			invoiceManagementDialog: true,
			posProfile: { name: "Main POS", company: "Farooq Chemicals" },
			currentCashier: { is_supervisor: true },
			selectedSupervisorPosProfile: "Main POS",
			initializeSupervisorProfileScope: vi.fn(),
			loadSupervisorPosProfiles: vi.fn().mockResolvedValue(undefined),
			refreshAll: vi.fn().mockResolvedValue(undefined),
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
		};

		await (InvoiceManagement as any).watch.posProfile.handler.call(
			context,
			{ name: "Backup POS", company: "Farooq Chemicals", create_pos_invoice_instead_of_sales_invoice: 0 },
			{ name: "Main POS", company: "Farooq Chemicals", create_pos_invoice_instead_of_sales_invoice: 0 },
		);

		expect(context.initializeSupervisorProfileScope).toHaveBeenCalledTimes(1);
		expect(context.loadSupervisorPosProfiles).toHaveBeenCalledTimes(1);
		expect(context.refreshAll).toHaveBeenCalledTimes(1);
	});
});
