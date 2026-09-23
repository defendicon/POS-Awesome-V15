// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/services/qzTray", () => ({
	printHtmlViaQz: vi.fn(),
	sendRawToQz: vi.fn(),
}));

vi.mock("../src/posapp/services/documentPrint", () => ({
	confirmDocumentPrintFallback: vi.fn(() => false),
	shouldUseRawDocumentPrinting: (
		profile: Record<string, any> | null | undefined,
	) => profile?.posa_raw_printing === 1,
	shouldUseConfiguredQzDocumentPrinting: (
		profile: Record<string, any> | null | undefined,
	) => profile?.posa_raw_printing === 1 || profile?.posa_silent_print === 1,
}));

import {
	buildEscPosExchangeReceipt,
	buildExchangeReceiptModel,
	isExchangeReceiptDocument,
	printExchangeReceipt,
	renderExchangeReceiptHtml,
} from "../src/posapp/services/exchangeReceiptPrint";
import { printHtmlViaQz, sendRawToQz } from "../src/posapp/services/qzTray";

const exchangeDocument = {
	doctype: "Sales Invoice",
	name: "SINV-NEW",
	exchange_reference: "POS-EXCH-00001",
	exchange_status: "Completed",
	return_invoice: "SINV-RETURN",
	replacement_invoice: "SINV-NEW",
	company: "Example Co",
	customer: "CUST-001",
	customer_name: "Customer One",
	posting_date: "2026-09-22",
	posting_time: "12:30:00",
	pos_profile: "Main POS",
	currency: "PKR",
	items: [
		{
			item_code: "NEW",
			item_name: "Replacement Item",
			qty: 2,
			uom: "Nos",
			rate: 75,
			amount: 150,
		},
	],
	payments: [{ mode_of_payment: "Cash", amount: 50 }],
	grand_total: 150,
	return_invoice_doc: {
		name: "SINV-RETURN",
		return_against: "SINV-ORIGINAL",
		currency: "PKR",
		items: [
			{
				item_code: "OLD",
				item_name: "Returned Item",
				qty: -1,
				uom: "Nos",
				rate: 100,
				amount: -100,
			},
		],
		grand_total: -100,
	},
	exchange_summary: {
		return_total: 100,
		sale_total: 150,
		difference_amount: 50,
		allocated_amount: 100,
		settlement_type: "Customer Payment",
	},
};

describe("exchangeReceiptPrint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete (globalThis as any).__;
	});

	it("recognizes only a complete combined exchange payload", () => {
		expect(isExchangeReceiptDocument(exchangeDocument)).toBe(true);
		expect(
			isExchangeReceiptDocument({
				...exchangeDocument,
				return_invoice_doc: null,
			}),
		).toBe(false);
	});

	it("uses submitted exchange summary values and absolute return quantities", () => {
		const model = buildExchangeReceiptModel(exchangeDocument);

		expect(model.returnTotal).toBe(100);
		expect(model.saleTotal).toBe(150);
		expect(model.differenceAmount).toBe(50);
		expect(model.allocatedAmount).toBe(100);
		expect(model.payments).toEqual([
			{ mode_of_payment: "Cash", amount: 50 },
		]);
	});

	it("renders both document references, item sections, payment, and net outcome", () => {
		const html = renderExchangeReceiptHtml(exchangeDocument);

		expect(html).toContain("POS-EXCH-00001");
		expect(html).toContain("SINV-RETURN");
		expect(html).toContain("SINV-NEW");
		expect(html).toContain("Returned Item");
		expect(html).toContain("Replacement Item");
		expect(html).toContain("Customer pays");
		expect(html).toContain("PKR 50.00");
		expect(html).toContain("Cash");
	});

	it("uses the submitted document currency precision", () => {
		const preciseDocument = {
			...exchangeDocument,
			items: [
				{
					item_code: "NEW",
					item_name: "Replacement Item",
					qty: 1,
					uom: "Nos",
					rate: 1.234,
					amount: 1.234,
				},
			],
			exchange_summary: {
				...exchangeDocument.exchange_summary,
				currency_precision: 3,
				difference_amount: 0.125,
			},
		};

		const html = renderExchangeReceiptHtml(preciseDocument);
		const raw = buildEscPosExchangeReceipt(preciseDocument);

		expect(html).toContain("PKR 0.125");
		expect(html).toContain("PKR 1.234");
		expect(raw).toContain("PKR 0.125");
		expect(raw).toContain("1.234");
	});

	it("uses the POS Profile display precision when configured", () => {
		const html = renderExchangeReceiptHtml(exchangeDocument, {
			posa_decimal_precision: 3,
		});

		expect(html).toContain("PKR 50.000");
	});

	it("builds a single raw receipt with both sides of the exchange", () => {
		const raw = buildEscPosExchangeReceipt(exchangeDocument, {
			posa_raw_print_width: 42,
		});

		expect(raw.startsWith("\x1B@")).toBe(true);
		expect(raw).toContain("ITEM EXCHANGE RECEIPT");
		expect(raw).toContain("RETURNED ITEMS");
		expect(raw).toContain("REPLACEMENT ITEMS");
		expect(raw).toContain("Customer pays");
		expect(raw).toContain("PKR 50.00");
		expect(raw.endsWith("\x1DV\x00")).toBe(true);
	});

	it("routes silent exchange receipts to QZ HTML", async () => {
		await printExchangeReceipt(exchangeDocument, {
			posa_silent_print: 1,
			posa_qz_printer_name: "Counter Printer",
		});

		expect(printHtmlViaQz).toHaveBeenCalledWith(
			expect.stringContaining("Item Exchange Receipt"),
			{ printerName: "Counter Printer" },
		);
		expect(sendRawToQz).not.toHaveBeenCalled();
	});

	it("routes raw exchange receipts to the selected QZ printer", async () => {
		await printExchangeReceipt(exchangeDocument, {
			posa_raw_printing: 1,
			posa_qz_printer_name: "Raw Printer",
		});

		expect(sendRawToQz).toHaveBeenCalledWith(
			expect.stringContaining("ITEM EXCHANGE RECEIPT"),
			"Raw Printer",
		);
		expect(printHtmlViaQz).not.toHaveBeenCalled();
	});
});
