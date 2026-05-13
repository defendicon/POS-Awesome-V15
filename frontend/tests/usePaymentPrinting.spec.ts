// @vitest-environment jsdom

import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
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

vi.mock("../src/offline_print_template", () => ({
	default: vi.fn(async () => "<html></html>"),
}));

import { usePaymentPrinting } from "../src/posapp/composables/pos/payments/usePaymentPrinting";
import { watchPrintWindow } from "../src/posapp/plugins/print";

describe("usePaymentPrinting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("frappe", {
			urllib: {
				get_base_url: () => "https://example.test",
			},
		});
	});

	it("prefers the override document doctype when building the print URL", async () => {
		const openSpy = vi
			.spyOn(window, "open")
			.mockReturnValue({ closed: false } as any);

		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0001", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: false,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage({
			doc: {
				name: "ACC-PINV-0001",
				doctype: "POS Invoice",
			},
		});

		expect(openSpy).toHaveBeenCalledWith(
			expect.stringContaining("doctype=POS%20Invoice"),
			"Print",
		);
		expect(openSpy).toHaveBeenCalledWith(
			expect.stringContaining("&name=ACC-PINV-0001"),
			"Print",
		);
	});

	it("disables printview auto print and lets the print watcher trigger one prompt", async () => {
		const openSpy = vi
			.spyOn(window, "open")
			.mockReturnValue({ closed: false } as any);

		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0002", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: false,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage();

		expect(openSpy).toHaveBeenCalledWith(
			expect.stringContaining("trigger_print=0"),
			"Print",
		);
		expect(watchPrintWindow).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ triggerPrint: "1" }),
		);
	});

	it("opens print view in a new tab without auto printing when configured", async () => {
		const openSpy = vi
			.spyOn(window, "open")
			.mockReturnValue({ closed: false } as any);

		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0003", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: true,
				posa_silent_print: false,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage();

		expect(openSpy).toHaveBeenCalledWith(
			expect.stringContaining("trigger_print=0"),
			"_blank",
		);
		expect(watchPrintWindow).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ triggerPrint: "0", shouldPrint: false }),
		);
	});
});
