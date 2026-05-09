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

		expect(store.flowToLoad).toEqual(flow.prepared_doc);
		expect(store.flowContext).toEqual(flow.flow_context);

		store.clear();

		expect(store.flowToLoad).toBeNull();
		expect(store.flowContext).toBeNull();
	});

	it("updates one cart row through explicit quantity mutation without changing row identity", () => {
		const store = useInvoiceStore();

		store.setItems([
			{
				posa_row_id: "row-a",
				item_code: "ITEM-A",
				qty: 1,
				rate: 10,
				discount_amount: 1,
			},
			{
				posa_row_id: "row-b",
				item_code: "ITEM-B",
				qty: 2,
				rate: 20,
				discount_amount: 0,
			},
		] as any[]);
		store.clearCartInvalidation();

		const rowA = store.getItemByRowId("row-a");
		const rowB = store.getItemByRowId("row-b");

		store.updateItemQuantity("row-a", 3);

		expect(store.itemOrder).toEqual(["row-a", "row-b"]);
		expect(store.getItemByRowId("row-a")).toBe(rowA);
		expect(store.getItemByRowId("row-b")).toBe(rowB);
		expect(rowB?.qty).toBe(2);
		expect(store.totalQty).toBe(5);
		expect(store.grossTotal).toBe(70);
		expect(store.discountTotal).toBe(3);
		expect(store.cartInvalidation.quantityRows).toEqual(["row-a"]);
		expect(store.cartInvalidation.stockRows).toEqual(["row-a"]);
		expect(store.cartInvalidation.pricingRows).toEqual(["row-a"]);
		expect(store.cartInvalidation.discountRows).toEqual([]);
	});

	it("tracks manual discount edits separately from pricing-rule invalidation", () => {
		const store = useInvoiceStore();

		store.setItems([
			{
				posa_row_id: "row-a",
				item_code: "ITEM-A",
				qty: 2,
				rate: 10,
				discount_amount: 1,
				discount_percentage: 10,
			},
		] as any[]);
		store.clearCartInvalidation();

		const item = store.updateItemDiscountAmount("row-a", 3, {
			manual: true,
		});

		expect(item?._manual_discount_set).toBe(true);
		expect(store.totalQty).toBe(2);
		expect(store.grossTotal).toBe(20);
		expect(store.discountTotal).toBe(6);
		expect(store.cartInvalidation.discountRows).toEqual(["row-a"]);
		expect(store.cartInvalidation.pricingRows).toEqual([]);
	});

	it("keeps display-only row updates out of pricing and totals invalidation", () => {
		const store = useInvoiceStore();

		store.setItems([
			{
				posa_row_id: "row-a",
				item_code: "ITEM-A",
				item_name: "Original",
				qty: 2,
				rate: 10,
				discount_amount: 1,
			},
		] as any[]);
		store.clearCartInvalidation();

		store.updateItemFields(
			"row-a",
			{ item_name: "Renamed" } as any,
			{ kind: "display" },
		);

		expect(store.totalQty).toBe(2);
		expect(store.grossTotal).toBe(20);
		expect(store.discountTotal).toBe(2);
		expect(store.cartInvalidation.displayRows).toEqual(["row-a"]);
		expect(store.cartInvalidation.pricingRows).toEqual([]);
		expect(store.cartInvalidation.quantityRows).toEqual([]);
		expect(store.cartInvalidation.rateRows).toEqual([]);
		expect(store.cartInvalidation.discountRows).toEqual([]);
	});
});
