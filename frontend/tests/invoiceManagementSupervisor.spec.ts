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

	it("loads company-wide history for supervisors instead of current profile only", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({ message: [] });

		const context = {
			posProfile: { name: "Main POS", company: "Farooq Chemicals" },
			posOpeningShift: { name: "POSA-OS-26-0000007" },
			currentCashier: { is_supervisor: true },
			currentInvoiceDoctype: "Sales Invoice",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
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
					},
				}),
			}),
		);
	});

	it("passes supervisor company scope to drafts and search matches user/profile metadata", async () => {
		const callMock = (globalThis as any).frappe.call as ReturnType<typeof vi.fn>;
		callMock.mockResolvedValue({ message: [] });

		const context = {
			posProfile: { name: "Main POS", company: "Farooq Chemicals" },
			posOpeningShift: { name: "POSA-OS-26-0000007" },
			currentCashier: { is_supervisor: true },
			currentInvoiceDoctype: "Sales Invoice",
			isSupervisorScope: (InvoiceManagement as any).methods.isSupervisorScope,
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
					pos_profile: null,
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
});
