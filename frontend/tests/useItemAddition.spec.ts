import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: vi.fn(),
	}),
}));

import { useItemAddition } from "../src/posapp/composables/pos/items/useItemAddition";

const createItem = () => ({
	item_code: "ITEM-001",
	item_name: "Test Item",
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
	qty: 1,
	rate: 10,
	price_list_rate: 10,
	base_rate: 10,
	base_price_list_rate: 10,
	actual_qty: 100,
	is_stock_item: 1,
	has_batch_no: 0,
	has_serial_no: 0,
	allow_negative_stock: 1,
	item_uoms: [{ uom: "Nos", conversion_factor: 1 }],
});

const createContext = (newLine = false) => ({
	new_line: newLine,
	items: [] as any[],
	packed_items: [] as any[],
	expanded: [] as any[],
	pos_profile: {
		warehouse: "Main Warehouse",
		currency: "USD",
		posa_auto_set_batch: 0,
		posa_allow_return_without_invoice: 0,
	},
	stock_settings: {
		allow_negative_stock: 1,
	},
	isReturnInvoice: false,
});

describe("useItemAddition new line behavior", () => {
	beforeEach(() => {
		(globalThis as any).__ = (text: string) => text;
		(globalThis as any).frappe = {
			datetime: {
				nowdate: () => "2026-03-05",
			},
		};
	});

	it("merges matching items when new_line is off", async () => {
		const api = useItemAddition();
		const context = createContext(false);

		const first = createItem();
		await api.prepareItemForCart(first, 1, context);
		await api.addItem(first, context);

		const second = createItem();
		await api.prepareItemForCart(second, 1, context);
		await api.addItem(second, context);

		expect(context.items).toHaveLength(1);
		expect(context.items[0].qty).toBe(2);
	});

	it("adds matching items as separate rows when new_line is on", async () => {
		const api = useItemAddition();
		const context = createContext(true);

		const first = createItem();
		await api.prepareItemForCart(first, 1, context);
		await api.addItem(first, context);

		const second = createItem();
		await api.prepareItemForCart(second, 1, context);
		await api.addItem(second, context);

		expect(context.items).toHaveLength(2);
		expect(context.items[0].qty).toBe(1);
		expect(context.items[1].qty).toBe(1);
	});

	it("resets return invoice type back to Invoice on clear", () => {
		const api = useItemAddition();
		const emit = vi.fn();

		const context = {
			items: [createItem()],
			packed_items: [],
			expanded: [1],
			posa_offers: [1],
			posa_coupons: [1],
			invoice_doc: { is_return: 1, name: "RET-0001" },
			return_doc: { name: "SINV-0001" },
			discount_amount: 10,
			additional_discount: 10,
			additional_discount_percentage: 5,
			base_delivery_charges_rate: 1,
			delivery_charges_rate: 1,
			selected_delivery_charge: "DEL-1",
			posting_date: "",
			customer: "CUST-OLD",
			invoiceType: "Return",
			invoiceTypes: ["Return"],
			itemSearch: "abc",
			available_stock_cache: { ITEM: 1 },
			pos_profile: {
				customer: "Walk in Customer",
				posa_default_sales_order: 1,
			},
			eventBus: {
				emit,
			},
			update_price_list: vi.fn(),
		} as any;

		api.clearInvoice(context);

		expect(context.invoiceType).toBe("Invoice");
		expect(context.invoiceTypes).toEqual(["Invoice", "Order", "Quotation"]);
		expect(context.customer).toBe("Walk in Customer");
		expect(context.return_doc).toBe("");
		expect(emit).toHaveBeenCalledWith("set_customer_readonly", false);
	});
});
