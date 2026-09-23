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

vi.mock("../src/posapp/services/documentPrint", () => ({
	confirmDocumentPrintFallback: vi.fn(() => false),
	printDocumentViaConfiguredQz: vi.fn(),
	shouldUseRawDocumentPrinting: (profile: Record<string, any> | null | undefined) =>
		profile?.posa_raw_printing === 1 || profile?.posa_raw_printing === true,
	shouldUseConfiguredQzDocumentPrinting: (profile: Record<string, any> | null | undefined) =>
		profile?.posa_silent_print === true ||
		profile?.posa_silent_print === 1 ||
		profile?.posa_raw_printing === true ||
		profile?.posa_raw_printing === 1,
}));

vi.mock("../src/posapp/services/exchangeReceiptPrint", () => ({
	isExchangeReceiptDocument: (doc: Record<string, any> | null | undefined) =>
		Boolean(doc?.exchange_reference && doc?.return_invoice_doc),
	printExchangeReceipt: vi.fn(),
}));

vi.mock("../src/offline_print_template", () => ({
	default: vi.fn(async () => "<html></html>"),
}));

import { usePaymentPrinting } from "../src/posapp/composables/pos/payments/usePaymentPrinting";
import { silentPrint, watchPrintWindow } from "../src/posapp/plugins/print";
import {
	confirmDocumentPrintFallback,
	printDocumentViaConfiguredQz,
} from "../src/posapp/services/documentPrint";
import { isOffline } from "../src/offline/index";
import { printExchangeReceipt } from "../src/posapp/services/exchangeReceiptPrint";

describe("usePaymentPrinting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(isOffline as any).mockReturnValue(false);
		vi.stubGlobal("frappe", {
			urllib: {
				get_base_url: () => "https://example.test",
			},
		});
	});

	it("prefers the override document doctype when building the print URL", async () => {
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

		expect(silentPrint).toHaveBeenCalledWith(
			expect.stringContaining("doctype=POS%20Invoice"),
			expect.any(Object),
		);
		expect(silentPrint).toHaveBeenCalledWith(
			expect.stringContaining("&name=ACC-PINV-0001"),
			expect.any(Object),
		);
	});

	it("routes a completed exchange to the combined receipt printer", async () => {
		const profile = {
			print_format: "Standard",
			posa_silent_print: false,
		};
		const exchange = {
			name: "SINV-NEW",
			exchange_reference: "POS-EXCH-00001",
			replacement_invoice: "SINV-NEW",
			return_invoice_doc: { name: "SINV-RETURN" },
			exchange_summary: { difference_amount: 25 },
		};
		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref(exchange),
			posProfile: ref(profile),
			invoiceType: ref("Invoice"),
		});

		await loadPrintPage({ doc: exchange });

		expect(printExchangeReceipt).toHaveBeenCalledWith(exchange, profile);
		expect(silentPrint).not.toHaveBeenCalled();
		expect(printDocumentViaConfiguredQz).not.toHaveBeenCalled();
	});

	it("uses the submitted name override instead of an unsaved document name", async () => {
		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ doctype: "Sales Order" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: false,
				posa_allow_sales_order: 1,
			}),
			invoiceType: ref("Order"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage({
			doc: {
				doctype: "Sales Order",
			},
			name: "SAL-ORD-0001",
		});

		expect(silentPrint).toHaveBeenCalledWith(
			expect.stringContaining("doctype=Sales%20Order"),
			expect.any(Object),
		);
		expect(silentPrint).toHaveBeenCalledWith(
			expect.stringContaining("&name=SAL-ORD-0001"),
			expect.any(Object),
		);
	});

	it("rejects print requests without a submitted document name", async () => {
		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ doctype: "Sales Order" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: false,
				posa_allow_sales_order: 1,
			}),
			invoiceType: ref("Order"),
			printFormat: ref("Standard"),
		});

		await expect(
			loadPrintPage({
				doc: {
					name: undefined,
					doctype: "Sales Order",
				},
			}),
		).rejects.toThrow("Cannot print document without a submitted document name");

		expect(silentPrint).not.toHaveBeenCalled();
	});

	it("allows offline preview printing without a submitted document name", async () => {
		(isOffline as any).mockReturnValue(true);
		const openSpy = vi.spyOn(window, "open").mockReturnValue({
			document: {
				write: vi.fn(),
				close: vi.fn(),
			},
			focus: vi.fn(),
			location: { href: "about:blank" },
		} as any);

		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ doctype: "Sales Order", items: [] }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: true,
				posa_silent_print: false,
				posa_allow_sales_order: 1,
			}),
			invoiceType: ref("Order"),
			printFormat: ref("Standard"),
		});

		await expect(
			loadPrintPage({
				doc: {
					doctype: "Sales Order",
					items: [],
				},
			}),
		).resolves.toBeUndefined();

		expect(openSpy).toHaveBeenCalledWith("", "_blank");
		expect(silentPrint).not.toHaveBeenCalled();
	});

	it("prints in-page when opening print in a new tab is disabled", async () => {
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

		expect(openSpy).not.toHaveBeenCalled();
		expect(silentPrint).toHaveBeenCalledWith(
			expect.stringContaining("trigger_print=0"),
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

	it("routes silent printing through configured QZ document printing", async () => {
		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0004", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: true,
				posa_raw_printing: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage();

		expect(printDocumentViaConfiguredQz).toHaveBeenCalledWith(
			expect.objectContaining({
				doctype: "Sales Invoice",
				name: "ACC-SINV-0004",
				profile: expect.objectContaining({ posa_raw_printing: 1 }),
			}),
		);
		expect(silentPrint).not.toHaveBeenCalled();
	});

	it("uses raw QZ printing without opening a print dialog when silent print is disabled", async () => {
		const openSpy = vi
			.spyOn(window, "open")
			.mockReturnValue({ closed: false } as any);
		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0005", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: true,
				posa_silent_print: false,
				posa_raw_printing: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage();

		expect(printDocumentViaConfiguredQz).toHaveBeenCalledWith(
			expect.objectContaining({
				doctype: "Sales Invoice",
				name: "ACC-SINV-0005",
				profile: expect.objectContaining({ posa_raw_printing: 1 }),
			}),
		);
		expect(openSpy).not.toHaveBeenCalled();
		expect(silentPrint).not.toHaveBeenCalled();
	});

	it("does not fall back to browser print when raw QZ printing fails", async () => {
		const openSpy = vi
			.spyOn(window, "open")
			.mockReturnValue({ closed: false } as any);
		vi.mocked(printDocumentViaConfiguredQz).mockRejectedValueOnce(
			new Error("QZ Tray is not available."),
		);

		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0006", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: true,
				posa_raw_printing: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage();

		expect(printDocumentViaConfiguredQz).toHaveBeenCalled();
		expect(confirmDocumentPrintFallback).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ raw: true }),
		);
		expect(openSpy).not.toHaveBeenCalled();
		expect(silentPrint).not.toHaveBeenCalled();
	});

	it("falls back to browser print after raw QZ failure only when confirmed", async () => {
		vi.mocked(printDocumentViaConfiguredQz).mockRejectedValueOnce(
			new Error("QZ Tray is not available."),
		);
		vi.mocked(confirmDocumentPrintFallback).mockReturnValueOnce(true);

		const { loadPrintPage } = usePaymentPrinting({
			invoiceDoc: ref({ name: "ACC-SINV-0007", doctype: "Sales Invoice" }),
			posProfile: ref({
				print_format_for_online: "Standard",
				print_format: "Standard",
				letter_head: 0,
				posa_open_print_in_new_tab: false,
				posa_silent_print: true,
				posa_raw_printing: 1,
				create_pos_invoice_instead_of_sales_invoice: 0,
			}),
			invoiceType: ref("Invoice"),
			printFormat: ref("Standard"),
		});

		await loadPrintPage();

		expect(confirmDocumentPrintFallback).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ raw: true }),
		);
		expect(silentPrint).toHaveBeenCalledWith(
			expect.stringContaining("trigger_print=0"),
			expect.objectContaining({ triggerPrint: "1" }),
		);
	});
});
