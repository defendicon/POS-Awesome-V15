// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/services/qzTray", () => ({
	prepareQzPrinter: vi.fn(async (printerName?: string) => printerName),
	sendRawToQz: vi.fn(),
}));

import {
	buildEscPosDocument,
	printRawDocumentViaQz,
	shouldUseRawDocumentPrinting,
} from "../src/posapp/services/rawDocumentPrint";
import { prepareQzPrinter, sendRawToQz } from "../src/posapp/services/qzTray";

describe("rawDocumentPrint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete (globalThis as any).__;
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("builds an ESC/POS receipt from final invoice values", () => {
		const raw = buildEscPosDocument(
			{
				doctype: "Sales Invoice",
				name: "SINV-0001",
				company: "Demo Company",
				customer_name: "Walk In Customer",
				currency: "USD",
				items: [
					{
						item_name: "Coffee Beans",
						qty: 2,
						uom: "Nos",
						rate: 12.5,
						amount: 25,
					},
				],
				total_taxes_and_charges: 2.5,
				grand_total: 27.5,
				paid_amount: 27.5,
			},
			{
				doctype: "Sales Invoice",
				name: "SINV-0001",
				profile: { posa_raw_print_width: 42 },
			},
		);

		expect(raw.startsWith("\x1B@")).toBe(true);
		expect(raw).toContain("Demo Company");
		expect(raw).toContain("SALES INVOICE");
		expect(raw).toContain("Coffee Beans");
		expect(raw).toContain("Grand Total");
		expect(raw).toContain("USD 27.50");
		expect(raw.endsWith("\x1DV\x00")).toBe(true);
	});

	it("hard-wraps long item names without dropping characters", () => {
		const longName = "Supercalifragilisticexpialidocious";
		const raw = buildEscPosDocument(
			{
				doctype: "Sales Invoice",
				name: "SINV-0003",
				company: "Demo Company",
				currency: "USD",
				items: [
					{
						item_name: longName,
						qty: 1,
						uom: "Nos",
						rate: 1,
						amount: 1,
					},
				],
				grand_total: 1,
			},
			{
				doctype: "Sales Invoice",
				name: "SINV-0003",
				profile: { posa_raw_print_width: 32 },
			},
		);

		expect(raw).toContain(longName.slice(0, 32));
		expect(raw).toContain(longName.slice(32));
	});

	it("prints original tender and settlement currencies for Payment Entry", () => {
		const raw = buildEscPosDocument(
			{
				doctype: "Payment Entry",
				name: "ACC-PAY-0001",
				company: "Demo Company",
				payment_type: "Receive",
				mode_of_payment: "Cash",
				posa_payment_currency: "PKR",
				posa_original_amount: 29.93,
				posa_invoice_currency: "USD",
				paid_amount: 0.105,
				paid_from_account_currency: "USD",
				received_amount: 29.93,
				paid_to_account_currency: "PKR",
			},
			{
				doctype: "Payment Entry",
				name: "ACC-PAY-0001",
				profile: { posa_raw_print_width: 42 },
			},
		);

		expect(raw).toContain("Tender");
		expect(raw).toContain("PKR 29.93");
		expect(raw).toContain("Settlement");
		expect(raw).toContain("USD 0.10");
	});

	it("preserves localized receipt text and translates raw receipt labels", () => {
		(globalThis as any).__ = vi.fn((text: string) => {
			if (text === "Grand Total") return "Total général";
			if (text === "Thank you") return "Merci";
			return text;
		});

		const raw = buildEscPosDocument(
			{
				doctype: "Sales Invoice",
				name: "SINV-0002",
				company: "Café Démo",
				customer_name: "عميل",
				currency: "€",
				items: [
					{
						item_name: "Crème brûlée",
						qty: 1,
						uom: "Nos",
						rate: 8,
						amount: 8,
					},
				],
				grand_total: 8,
				paid_amount: 8,
			},
			{
				doctype: "Sales Invoice",
				name: "SINV-0002",
				profile: { posa_raw_print_width: 42 },
			},
		);

		expect(raw).toContain("Café Démo");
		expect(raw).toContain("عميل");
		expect(raw).toContain("Crème brûlée");
		expect(raw).toContain("€ 8.00");
		expect(raw).toContain("Total général");
		expect(raw).toContain("Merci");
	});

	it("uses POS Profile raw printing toggle only when enabled", () => {
		expect(shouldUseRawDocumentPrinting({ posa_raw_printing: 1 })).toBe(true);
		expect(shouldUseRawDocumentPrinting({ posa_raw_printing: "0" })).toBe(false);
		expect(shouldUseRawDocumentPrinting({})).toBe(false);
	});

	it("fetches the saved document before sending raw data to QZ", async () => {
		(globalThis as any).frappe.call.mockResolvedValue({
			message: {
				doctype: "Sales Order",
				name: "SO-0001",
				company: "Demo Company",
				customer: "Customer A",
				currency: "USD",
				items: [],
				grand_total: 10,
			},
		});

		await printRawDocumentViaQz({
			doctype: "Sales Order",
			name: "SO-0001",
			profile: { posa_raw_printing: 1 },
		});

		expect((globalThis as any).frappe.call).toHaveBeenCalledWith({
			method: "frappe.client.get",
			args: {
				doctype: "Sales Order",
				name: "SO-0001",
			},
		});
		expect(sendRawToQz).toHaveBeenCalledWith(
			expect.stringContaining("SALES ORDER"),
			undefined,
		);
	});

	it("checks QZ before fetching the saved document", async () => {
		vi.mocked(prepareQzPrinter).mockRejectedValueOnce(
			new Error("QZ Tray is not available."),
		);

		await expect(
			printRawDocumentViaQz({
				doctype: "Sales Invoice",
				name: "SINV-FAST-FALLBACK",
				profile: { posa_raw_printing: 1 },
			}),
		).rejects.toThrow("QZ Tray is not available");

		expect((globalThis as any).frappe.call).not.toHaveBeenCalled();
		expect(sendRawToQz).not.toHaveBeenCalled();
	});

	it("forwards the POS Profile raw printer name to QZ", async () => {
		(globalThis as any).frappe.call.mockResolvedValue({
			message: {
				doctype: "Sales Invoice",
				name: "SINV-0004",
				company: "Demo Company",
				currency: "USD",
				items: [],
				grand_total: 10,
			},
		});

		await printRawDocumentViaQz({
			doctype: "Sales Invoice",
			name: "SINV-0004",
			profile: {
				posa_raw_printing: 1,
				posa_qz_printer_name: "Counter Printer",
			},
		});

		expect(sendRawToQz).toHaveBeenCalledWith(
			expect.stringContaining("SALES INVOICE"),
			"Counter Printer",
		);
	});

	it("rejects when the saved document cannot be fetched and no fallback doc is provided", async () => {
		(globalThis as any).frappe.call.mockRejectedValue(new Error("Network down"));

		await expect(
			printRawDocumentViaQz({
				doctype: "Sales Invoice",
				name: "SINV-0005",
				profile: { posa_raw_printing: 1 },
			}),
		).rejects.toThrow("Network down");
		expect(sendRawToQz).not.toHaveBeenCalled();
	});

	it("rejects when the saved document response is empty", async () => {
		(globalThis as any).frappe.call.mockResolvedValue({});

		await expect(
			printRawDocumentViaQz({
				doctype: "Sales Invoice",
				name: "SINV-0006",
				profile: { posa_raw_printing: 1 },
			}),
		).rejects.toThrow("Unable to load document for raw printing.");
		expect(sendRawToQz).not.toHaveBeenCalled();
	});
});
