import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";
import type {
	InvoiceDocRef,
	PartialInvoiceDoc,
} from "../src/posapp/types/models";

describe("invoiceStore invoice type state", () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		vi.stubGlobal("window", {
			sessionStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
				removeItem: (key: string) => values.delete(key),
			},
		});
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

	it("updates cart totals incrementally for rapid row mutations", () => {
		const store = useInvoiceStore();
		const first = store.addItem({
			posa_row_id: "row-1",
			item_code: "ITEM-1",
			qty: 2,
			rate: 10,
			discount_amount: 1,
		});

		expect(first?.qty).toBe(2);
		expect(store.totalQty).toBe(2);
		expect(store.grossTotal).toBe(20);
		expect(store.discountTotal).toBe(2);

		store.updateItemWithTotals("row-1", (item) => {
			item.qty += 3;
		});

		expect(store.totalQty).toBe(5);
		expect(store.grossTotal).toBe(50);
		expect(store.discountTotal).toBe(5);

		store.addItems([
			{
				posa_row_id: "row-2",
				item_code: "ITEM-2",
				qty: 4,
				rate: 7,
				discount_amount: 0.5,
			},
			{
				posa_row_id: "row-3",
				item_code: "ITEM-3",
				qty: 1,
				rate: 12,
			},
		]);

		expect(store.totalQty).toBe(10);
		expect(store.grossTotal).toBe(90);
		expect(store.discountTotal).toBe(7);

		store.removeItemByRowId("row-1");

		expect(store.totalQty).toBe(5);
		expect(store.grossTotal).toBe(40);
		expect(store.discountTotal).toBe(2);
	});

	it("uses rounded line amount for gross totals when available", () => {
		const store = useInvoiceStore();
		store.addItem({
			posa_row_id: "row-rounded",
			item_code: "ITEM-ROUND",
			qty: 3,
			rate: 33.3333,
			amount: 100,
			discount_amount: 0,
		});

		expect(store.grossTotal).toBe(100);

		store.recalculateTotals();

		expect(store.grossTotal).toBe(100);
	});

	it("moves a row to the top without changing its identity or cart totals", () => {
		const store = useInvoiceStore();
		store.addItem({
			posa_row_id: "row-1",
			item_code: "ITEM-1",
			qty: 2,
			rate: 10,
		});
		store.addItem({
			posa_row_id: "row-2",
			item_code: "ITEM-2",
			qty: 1,
			rate: 5,
		});
		const storedRow = store.itemsData.get("row-2");
		const version = store.metadata.changeVersion;

		store.moveRowToTop("row-2");

		expect(store.itemOrder).toEqual(["row-2", "row-1"]);
		expect(store.itemsData.get("row-2")).toBe(storedRow);
		expect(store.totalQty).toBe(3);
		expect(store.grossTotal).toBe(25);
		expect(store.metadata.changeVersion).toBeGreaterThan(version);
	});

	it("persists and restores an in-progress exchange in the same cashier scope", () => {
		let store = useInvoiceStore();
		store.startExchange({
			clientRequestId: "exchange-request-1",
			originalInvoice: { name: "SINV-OLD" },
			returnDraft: { is_return: 1, customer: "CUST-0001" },
			posProfile: "Main POS",
			company: "Example Co",
			openingShift: "SHIFT-0001",
			user: "cashier@example.com",
		});
		store.setExchangeReturnDraft({
			is_return: 1,
			customer: "CUST-0001",
			items: [{ item_code: "OLD", qty: -1 }],
		});
		store.setExchangeReturn({
			is_return: 1,
			customer: "CUST-0001",
			rounded_total: -50,
		});
		store.setExchangeSaleDraft({
			customer: "CUST-0001",
			items: [{ item_code: "NEW", qty: 1 }],
		});

		setActivePinia(createPinia());
		store = useInvoiceStore();
		const restored = store.restoreExchange({
			posProfile: "Main POS",
			company: "Example Co",
			openingShift: "SHIFT-0001",
			user: "cashier@example.com",
		});

		expect(restored).toMatchObject({
			stage: "sale",
			clientRequestId: "exchange-request-1",
			returnTotal: 50,
		});
		expect(store.exchangeSession.saleDraft.items[0].item_code).toBe("NEW");
		expect(store.exchangeSession.returnDraft.items[0].item_code).toBe(
			"OLD",
		);

		store.clearExchange();
		setActivePinia(createPinia());
		expect(
			useInvoiceStore().restoreExchange({
				posProfile: "Main POS",
				user: "cashier@example.com",
			}),
		).toBeNull();
	});

	it("rejects persisted exchange state from another cashier", () => {
		let store = useInvoiceStore();
		store.startExchange({
			clientRequestId: "exchange-request-2",
			posProfile: "Main POS",
			company: "Example Co",
			openingShift: "SHIFT-0001",
			user: "cashier@example.com",
		});

		setActivePinia(createPinia());
		store = useInvoiceStore();
		expect(
			store.restoreExchange({
				posProfile: "Main POS",
				company: "Example Co",
				openingShift: "SHIFT-0001",
				user: "another@example.com",
			}),
		).toBeNull();
	});
});
