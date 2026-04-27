import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";
import type {
	InvoiceDocRef,
	PartialInvoiceDoc,
} from "../src/posapp/types/models";

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

	it("clears delivery charge stickies when the invoice is cleared", () => {
		const store = useInvoiceStore();

		store.setDeliveryCharges([{ name: "Home Delivery", rate: 250 } as any]);
		store.setDeliveryChargesRate(250);
		store.setSelectedDeliveryCharge("Home Delivery");

		store.clear();

		expect(store.deliveryCharges).toEqual([]);
		expect(store.deliveryChargesRate).toBe(0);
		expect(store.selectedDeliveryCharge).toBe("");
	});

	it("resets invoice type when clearing without preserved stickies", () => {
		const store = useInvoiceStore();

		store.setInvoiceType("Order");

		store.clear();

		expect(store.invoiceType).toBe("Invoice");
		expect(store.deferStockValidationToPayment).toBe(false);
	});

	it("preserves invoice type when clearing with preserved stickies", () => {
		const store = useInvoiceStore();

		store.setInvoiceType("Quotation");

		store.clear({ preserveStickies: true });

		expect(store.invoiceType).toBe("Quotation");
		expect(store.deferStockValidationToPayment).toBe(true);
	});

	it("normalizes a string invoice name into a minimal invoice reference", () => {
		const store = useInvoiceStore();
		const invoiceRef: InvoiceDocRef = {
			name: "ACC-PSINV-2026-0001",
			doctype: "POS Invoice",
		};
		const partialInvoice: PartialInvoiceDoc = {
			name: "ACC-PSINV-2026-0002",
			customer: "CUST-001",
		};

		store.setInvoiceDoc("ACC-PSINV-2026-0001");
		expect(store.invoiceDoc).toEqual(invoiceRef);

		store.setInvoiceDoc(partialInvoice);
		expect(store.invoiceDoc).toMatchObject(partialInvoice);
		expectTypeOf(store.invoiceDoc).toEqualTypeOf<PartialInvoiceDoc | null>();
	});

	it("stores flow context when loading a prepared commercial-flow document", () => {
		const store = useInvoiceStore();
		const flow = {
			prepared_doc: { doctype: "Sales Invoice", customer: "Test Customer" },
			flow_context: {
				source_doctype: "Sales Order",
				source_name: "SO-0001",
				prepared_action: "order_to_invoice",
				target_doctype: "Sales Invoice",
				update_stock: 1,
			},
		};

		store.triggerLoadFlow(flow);

		expect(store.flowToLoad).toEqual(flow);
		expect(store.flowContext).toEqual(flow.flow_context);

		store.clear();

		expect(store.flowToLoad).toBeNull();
		expect(store.flowContext).toBeNull();
	});
});
