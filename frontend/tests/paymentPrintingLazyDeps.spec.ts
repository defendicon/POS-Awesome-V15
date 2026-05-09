// @vitest-environment jsdom

import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const imports = vi.hoisted(() => ({
	qz: 0,
	offlineRenderer: 0,
}));

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
}));

vi.mock("../src/posapp/plugins/print", () => ({
	appendDebugPrintParam: (url: string) => url,
	isDebugPrintEnabled: () => false,
	silentPrint: vi.fn(),
	watchPrintWindow: vi.fn(),
}));

vi.mock("../src/posapp/services/qzTray", () => {
	imports.qz += 1;
	return {
		printDocumentViaQz: vi.fn(),
	};
});

vi.mock("../src/offline_print_template", () => {
	imports.offlineRenderer += 1;
	return {
		default: vi.fn(async () => "<html></html>"),
	};
});

describe("usePaymentPrinting lazy dependencies", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		imports.qz = 0;
		imports.offlineRenderer = 0;
		vi.stubGlobal("frappe", {
			urllib: {
				get_base_url: () => "https://example.test",
			},
		});
	});

	it("does not import QZ Tray or offline print renderer for normal browser print setup", async () => {
		const { usePaymentPrinting } = await import(
			"../src/posapp/composables/pos/payments/usePaymentPrinting"
		);

		usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-PINV-0001", doctype: "POS Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: false,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		expect(imports.qz).toBe(0);
		expect(imports.offlineRenderer).toBe(0);
	});
});
