// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/composables/core/useTheme", () => ({
	useTheme: () => ({ isDark: { value: false } }),
}));

vi.mock("../src/posapp/composables/core/useResponsive", () => ({
	useResponsive: () => ({ windowWidth: { value: 1400 } }),
}));

vi.mock("../src/offline/index", () => ({ isOffline: () => false }));

vi.mock("../src/posapp/plugins/print", () => ({
	appendDebugPrintParam: (url: string) => url,
	isDebugPrintEnabled: () => false,
	silentPrint: vi.fn(),
	watchPrintWindow: vi.fn(),
}));

vi.mock("../src/posapp/services/qzTray", () => ({ printDocumentViaQz: vi.fn() }));

import InvoiceManagement from "../src/posapp/components/pos/flows/InvoiceManagement.vue";

describe("InvoiceManagement tab loading", () => {
	it("loads only the active tab and shares history data with returns", async () => {
		const context = {
			invoiceManagementDialog: true,
			activeTab: "history",
			loadingTab: null,
			loadedTabs: {
				history: true,
				partial: true,
				drafts: true,
				returns: true,
			},
			resetPagination: vi.fn(),
			resetLoadedTabs: (InvoiceManagement as any).methods.resetLoadedTabs,
			refreshActiveTab: (InvoiceManagement as any).methods.refreshActiveTab,
			loadHistory: vi.fn().mockResolvedValue(undefined),
			loadUnpaidInvoices: vi.fn().mockResolvedValue(undefined),
			loadDrafts: vi.fn().mockResolvedValue(undefined),
			$nextTick: vi.fn(),
		};

		await (InvoiceManagement as any).methods.refreshAll.call(context);

		expect(context.loadHistory).toHaveBeenCalledTimes(1);
		expect(context.loadUnpaidInvoices).not.toHaveBeenCalled();
		expect(context.loadDrafts).not.toHaveBeenCalled();
		expect(context.loadedTabs.history).toBe(true);
		expect(context.loadedTabs.returns).toBe(true);
		expect(context.loadedTabs.partial).toBe(false);
		expect(context.loadedTabs.drafts).toBe(false);
	});
});
