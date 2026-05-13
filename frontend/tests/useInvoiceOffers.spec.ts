// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";
import { useInvoiceOffers } from "../src/posapp/composables/pos/invoice/useInvoiceOffers";

const createCartItem = () => ({
	item_code: "dis-water",
	item_name: "DIS WATER",
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
	qty: 25,
	rate: 20,
	price_list_rate: 20,
	base_rate: 20,
	base_price_list_rate: 20,
	discount_amount: 0,
	base_discount_amount: 0,
	discount_percentage: 0,
	posa_row_id: "row-dis-water",
	posa_offers: "[]",
});

describe("useInvoiceOffers", () => {
	beforeEach(() => {
		(window as any).__ = (text: string) => text;
		(window as any).frappe = {
			datetime: {
				nowdate: () => "2026-05-13",
			},
		};
		(globalThis as any).frappe = (window as any).frappe;
		setActivePinia(createPinia());
	});

	it("refreshes active sale totals when an item price offer changes the item rate", async () => {
		const invoiceStore = useInvoiceStore();
		const offers = useInvoiceOffers();
		invoiceStore.addItem(createCartItem());

		expect(invoiceStore.grossTotal).toBe(500);

		await offers.handleUpdateInvoiceOffers([
			{
				name: "DIS-WATER-QTY-25",
				row_id: "offer-dis-water",
				offer: "Item Price",
				apply_on: "Item Code",
				items: JSON.stringify(["row-dis-water"]),
				discount_type: "Rate",
				rate: 12,
				offer_applied: true,
			},
		]);

		expect(invoiceStore.items[0].rate).toBe(12);
		expect(invoiceStore.items[0].amount).toBe(300);
		expect(invoiceStore.grossTotal).toBe(300);
	});
});
