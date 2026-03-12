import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";

describe("invoiceStore invoice type state", () => {
	beforeEach(() => {
		(globalThis as any).frappe = {
			datetime: {
				nowdate: () => "2026-03-12",
			},
		};
		setActivePinia(createPinia());
	});

	it("defaults to invoice stock validation and defers only for order and quotation", () => {
		const store = useInvoiceStore();

		expect(store.invoiceType).toBe("Invoice");
		expect(store.deferStockValidationToPayment).toBe(false);

		store.setInvoiceType("Order");
		expect(store.invoiceType).toBe("Order");
		expect(store.deferStockValidationToPayment).toBe(true);

		store.setInvoiceType("Quotation");
		expect(store.invoiceType).toBe("Quotation");
		expect(store.deferStockValidationToPayment).toBe(true);

		store.setInvoiceType("Invoice");
		expect(store.deferStockValidationToPayment).toBe(false);
	});

	it("resets invoice type back to invoice", () => {
		const store = useInvoiceStore();

		store.setInvoiceType("Order");
		store.resetInvoiceType();

		expect(store.invoiceType).toBe("Invoice");
		expect(store.deferStockValidationToPayment).toBe(false);
	});
});
