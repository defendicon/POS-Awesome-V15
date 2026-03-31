import { describe, expect, it } from "vitest";

import {
	resolvePaymentPrintDoctype,
	resolvePaymentPrintFormatDoctypes,
} from "../src/posapp/utils/paymentPrintDoctype";

describe("resolvePaymentPrintDoctype", () => {
	it("uses POS Invoice when the profile is configured to create POS invoices", () => {
		const result = resolvePaymentPrintDoctype({
			profile: {
				create_pos_invoice_instead_of_sales_invoice: 1,
			},
			invoiceType: "Invoice",
		});

		expect(result).toBe("POS Invoice");
	});

	it("uses Sales Invoice by default for regular invoice payments", () => {
		const result = resolvePaymentPrintDoctype({
			profile: {
				create_pos_invoice_instead_of_sales_invoice: 0,
			},
			invoiceType: "Invoice",
		});

		expect(result).toBe("Sales Invoice");
	});

	it("uses Sales Order when the invoice type is Order and profile creates sales orders only", () => {
		const result = resolvePaymentPrintDoctype({
			profile: {
				posa_create_only_sales_order: 1,
			},
			invoiceType: "Order",
		});

		expect(result).toBe("Sales Order");
	});

	it("prefers an explicit doctype override when provided", () => {
		const result = resolvePaymentPrintDoctype({
			profile: {
				create_pos_invoice_instead_of_sales_invoice: 1,
			},
			invoiceType: "Invoice",
			explicitDoctype: "POS Invoice",
		});

		expect(result).toBe("POS Invoice");
	});

	it("offers both invoice doctypes for payment print-format selection on invoice screens", () => {
		const result = resolvePaymentPrintFormatDoctypes({
			profile: {
				create_pos_invoice_instead_of_sales_invoice: 1,
			},
			invoiceType: "Invoice",
		});

		expect(result).toEqual(["Sales Invoice", "POS Invoice"]);
	});

	it("falls back to the resolved single doctype for non-invoice payment screens", () => {
		const result = resolvePaymentPrintFormatDoctypes({
			profile: {
				posa_create_only_sales_order: 1,
			},
			invoiceType: "Order",
		});

		expect(result).toEqual(["Sales Order"]);
	});
});
