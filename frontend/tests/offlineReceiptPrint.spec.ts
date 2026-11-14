// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/offline/invoiceRecovery", () => ({
	getInvoiceRecoveryRows: vi.fn(),
}));
vi.mock("../src/offline_print_template", () => ({
	default: vi.fn(async () => "<html><body>Receipt</body></html>"),
	prepareOfflinePrintDocument: (invoice: any) =>
		JSON.parse(JSON.stringify(invoice)),
}));
vi.mock("../src/posapp/services/qzTray", () => ({ printHtmlViaQz: vi.fn() }));
vi.mock("../src/posapp/services/rawDocumentPrint", () => ({
	printRawDocumentViaQz: vi.fn(),
}));
vi.mock("../src/posapp/services/documentPrint", () => ({
	shouldUseConfiguredQzDocumentPrinting: (profile: any) =>
		Boolean(profile.posa_silent_print || profile.posa_raw_printing),
	shouldUseRawDocumentPrinting: (profile: any) =>
		Boolean(profile.posa_raw_printing),
	confirmDocumentPrintFallback: vi.fn(() => false),
}));
import { reprintOfflineReceipt } from "../src/posapp/services/offlineReceiptPrint";
import { getInvoiceRecoveryRows } from "../src/offline/invoiceRecovery";
import renderOfflineInvoiceHTML from "../src/offline_print_template";
import { printHtmlViaQz } from "../src/posapp/services/qzTray";
import { printRawDocumentViaQz } from "../src/posapp/services/rawDocumentPrint";
import { confirmDocumentPrintFallback } from "../src/posapp/services/documentPrint";

const profile = { name: "POS", company: "Co" };
const invoice = {
	doctype: "Sales Invoice",
	company: "Co",
	pos_profile: "POS",
	posa_client_request_id: "original-id",
	posting_date: "2026-11-10",
	posting_time: "10:20:30",
	grand_total: 100,
	paid_amount: 100,
	change_amount: 20,
	items: [
		{
			item_code: "A",
			qty: 2,
			uom: "Box",
			conversion_factor: 6,
			rate: 50,
			amount: 100,
		},
	],
	payments: [{ mode_of_payment: "Cash", amount: 120 }],
};
let popup: any;
describe("offline receipt reprint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		popup = {
			closed: false,
			document: { write: vi.fn(), close: vi.fn() },
			focus: vi.fn(),
			print: vi.fn(),
			close: vi.fn(),
		};
		vi.spyOn(window, "open").mockReturnValue(popup);
		vi.mocked(getInvoiceRecoveryRows).mockResolvedValue([
			{ request_id: "original-id", invoice, status: "pending" },
		]);
		vi.mocked(confirmDocumentPrintFallback).mockReturnValue(false);
		vi.mocked(printHtmlViaQz).mockResolvedValue(undefined);
		vi.mocked(printRawDocumentViaQz).mockResolvedValue(undefined);
	});
	afterEach(() => vi.restoreAllMocks());
	it("prints an immutable saved sale with its original time, request and amounts", async () => {
		const original = JSON.stringify(invoice);
		await reprintOfflineReceipt("original-id", profile);
		expect(popup.print).toHaveBeenCalledOnce();
		expect(renderOfflineInvoiceHTML).toHaveBeenCalledWith(
			expect.objectContaining({
				posting_time: "10:20:30",
				posa_client_request_id: "original-id",
				grand_total: 100,
				_posa_receipt_label: "OFFLINE COPY — PENDING SERVER SYNC",
			}),
		);
		expect(JSON.stringify(invoice)).toBe(original);
	});
	it("fails closed for another profile/company or a missing queue entry", async () => {
		await expect(
			reprintOfflineReceipt("original-id", {
				...profile,
				company: "Other",
			}),
		).rejects.toThrow("another POS Profile or company");
		vi.mocked(getInvoiceRecoveryRows).mockResolvedValue([]);
		await expect(
			reprintOfflineReceipt("original-id", profile),
		).rejects.toThrow("no longer pending");
		expect(popup.print).not.toHaveBeenCalled();
	});
	it("honors the draft print setting and marks a server draft explicitly", async () => {
		vi.mocked(getInvoiceRecoveryRows).mockResolvedValue([
			{
				request_id: "original-id",
				invoice,
				recovery_state: "draft",
				status: "pending",
			},
		]);
		await expect(
			reprintOfflineReceipt("original-id", profile),
		).rejects.toThrow("Draft printing is disabled");
		await reprintOfflineReceipt("original-id", {
			...profile,
			posa_allow_print_draft_invoices: 1,
		});
		expect(renderOfflineInvoiceHTML).toHaveBeenLastCalledWith(
			expect.objectContaining({
				_posa_receipt_label: "DRAFT COPY — NOT SUBMITTED",
			}),
		);
	});
	it("uses local-only raw QZ data and never also prints in the browser", async () => {
		await reprintOfflineReceipt("original-id", {
			...profile,
			posa_raw_printing: 1,
			posa_qz_printer_name: "Thermal",
		});
		expect(printRawDocumentViaQz).toHaveBeenCalledWith(
			expect.objectContaining({
				localOnly: true,
				printerName: "Thermal",
				doc: expect.objectContaining({
					posa_client_request_id: "original-id",
				}),
			}),
		);
		expect(popup.print).not.toHaveBeenCalled();
	});
	it("prints cached HTML through configured QZ and requires consent after an uncertain failure", async () => {
		vi.mocked(printHtmlViaQz).mockRejectedValue(
			new Error("Printer disconnected"),
		);
		await reprintOfflineReceipt("original-id", {
			...profile,
			posa_silent_print: 1,
		});
		expect(confirmDocumentPrintFallback).toHaveBeenCalledOnce();
		expect(popup.print).not.toHaveBeenCalled();
		vi.mocked(confirmDocumentPrintFallback).mockReturnValue(true);
		await reprintOfflineReceipt("original-id", {
			...profile,
			posa_silent_print: 1,
		});
		expect(popup.print).toHaveBeenCalledOnce();
	});
	it("honors preview-only settings and surfaces popup blocking", async () => {
		await reprintOfflineReceipt("original-id", {
			...profile,
			posa_open_print_in_new_tab: "1",
		});
		expect(popup.document.write).toHaveBeenCalledOnce();
		expect(popup.print).not.toHaveBeenCalled();
		vi.mocked(window.open).mockReturnValue(null);
		await expect(
			reprintOfflineReceipt("original-id", profile),
		).rejects.toThrow("popup was blocked");
	});
});
