import { describe, expect, it } from "vitest";

import {
	resolvePosDocumentDoctype,
} from "../src/posapp/utils/posDocumentMode";

describe("resolvePosDocumentDoctype", () => {
	it("resolves Quotation mode to Quotation", () => {
		expect(
			resolvePosDocumentDoctype({
				invoiceType: "Quotation",
				posProfile: {
					create_pos_invoice_instead_of_sales_invoice: 1,
				},
			}),
		).toBe("Quotation");
	});

	it("resolves Order mode to Sales Order when sales orders are allowed", () => {
		expect(
			resolvePosDocumentDoctype({
				invoiceType: "Order",
				posProfile: {
					posa_allow_sales_order: 1,
					posa_create_only_sales_order: 0,
				},
			}),
		).toBe("Sales Order");
	});

	it("keeps the legacy Create Only Sales Order flag as an Order fallback", () => {
		expect(
			resolvePosDocumentDoctype({
				invoiceType: "Order",
				posProfile: {
					posa_allow_sales_order: 0,
					posa_create_only_sales_order: 1,
				},
			}),
		).toBe("Sales Order");
	});

	it("resolves Invoice mode to POS Invoice when configured", () => {
		expect(
			resolvePosDocumentDoctype({
				invoiceType: "Invoice",
				posProfile: {
					create_pos_invoice_instead_of_sales_invoice: 1,
				},
			}),
		).toBe("POS Invoice");
	});

	it("resolves Invoice mode to Sales Invoice by default", () => {
		expect(
			resolvePosDocumentDoctype({
				invoiceType: "Invoice",
				posProfile: {},
			}),
		).toBe("Sales Invoice");
	});
});
