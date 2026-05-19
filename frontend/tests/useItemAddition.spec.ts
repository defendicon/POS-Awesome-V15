import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: vi.fn(),
	}),
}));

import { useItemAddition } from "../src/posapp/composables/pos/items/useItemAddition";
import { useItemMerging } from "../src/posapp/composables/pos/items/addition/useItemMerging";
import { useBatchSerial } from "../src/posapp/composables/pos/shared/useBatchSerial";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";

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
			call: vi.fn(async () => ({ message: [] })),
			datetime: {
				nowdate: () => "2026-03-05",
			},
		};
		setActivePinia(createPinia());
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

	it("refreshes line amount when a repeated click merges quantity", async () => {
		const api = useItemAddition();
		const context = createContext(false);

		const first = createItem();
		await api.prepareItemForCart(first, 1, context);
		await api.addItem(first, context);

		const second = createItem();
		await api.prepareItemForCart(second, 1, context);
		await api.addItem(second, context);

		expect(context.items[0].qty).toBe(2);
		expect(context.items[0].rate).toBe(10);
		expect(context.items[0].amount).toBe(20);
		expect(context.items[0].base_amount).toBe(20);
	});

	it("does not merge a normal sale addition into an existing negative return line", async () => {
		const api = useItemAddition();
		const context = createContext(false);
		context.items.push({
			...createItem(),
			posa_row_id: "return-row",
			qty: -2,
			amount: -20,
		});

		const item = createItem();
		await api.prepareItemForCart(item, 1, context);
		await api.addItem(item, context);

		expect(context.items).toHaveLength(2);
		expect(context.items[0].qty).toBe(1);
		expect(context.items[1].qty).toBe(-2);
	});

	it("refreshes line amount when invoice store merge batches repeated clicks", async () => {
		const api = useItemAddition();
		const invoiceStore = useInvoiceStore();
		const makeContext = () => ({
			...createContext(false),
			invoiceStore,
			items: invoiceStore.items,
			currency_precision: 2,
			flt: (value: any) => Number(value),
		});

		const first = createItem();
		await api.prepareItemForCart(first, 1, makeContext());
		await api.addItem(first, makeContext());

		const second = createItem();
		await api.prepareItemForCart(second, 1, makeContext());
		await api.addItem(second, makeContext());
		await Promise.resolve();

		expect(invoiceStore.items).toHaveLength(1);
		expect(invoiceStore.items[0].qty).toBe(2);
		expect(invoiceStore.items[0].amount).toBe(20);
		expect(invoiceStore.grossTotal).toBe(20);
	});

	it("resolves batched merge when invoice store lacks updateItemWithTotals", async () => {
		const api = useItemAddition();
		const context = createContext(false) as any;
		const existing = {
			...createItem(),
			posa_row_id: "batch-row",
			has_batch_no: 1,
			batch_no: "B-FEFO",
			qty: "1",
		};
		context.items.push(existing);
		const invoiceStore = {
			addItems: vi.fn((items: any[], index = -1) => {
				if (index === 0) {
					context.items.unshift(...items);
				} else {
					context.items.push(...items);
				}
				return items;
			}),
			recalculateTotals: vi.fn(),
			touch: vi.fn(),
		};
		context.invoiceStore = invoiceStore;
		context.currency_precision = 2;
		context.flt = (value: any) => Number(value);
		context.setBatchQty = vi.fn((line: any, value: string | null) => {
			line.batch_no = value;
		});

		const selectedBatchItem = {
			...createItem(),
			has_batch_no: 1,
			to_set_batch_no: "B-FEFO",
			qty: "1",
		};
		await api.prepareItemForCart(selectedBatchItem, 1, context);
		const merged = await api.addItem(selectedBatchItem, context);
		await Promise.resolve();

		expect(merged).toBe(context.items[0]);
		expect(context.items).toHaveLength(1);
		expect(context.items[0].qty).toBe(2);
		expect(typeof context.items[0].qty).toBe("number");
		expect(context.items[0].amount).toBe(20);
		expect(invoiceStore.recalculateTotals).toHaveBeenCalled();
	});

	it("keeps grouped merge quantities numeric when incoming qty is a string", () => {
		const { groupAndAddItem } = useItemMerging() as any;
		const items = [{ item_code: "ITEM-001", uom: "Nos", rate: 10, qty: "1", amount: 10 }];

		groupAndAddItem(items, { item_code: "ITEM-001", uom: "Nos", rate: 10, qty: "2" }, {});

		expect(items[0].qty).toBe(3);
		expect(typeof items[0].qty).toBe("number");
		expect(items[0].amount).toBe(30);
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

	it("auto-selects the FEFO batch and applies its batch price on add", async () => {
		const api = useItemAddition();
		const context = createContext(false) as any;
		const batchSerial = useBatchSerial();
		context.pos_profile.posa_auto_set_batch = 1;
		context.price_list_currency = "USD";
		context.selected_currency = "USD";
		context.exchange_rate = 1;
		context.currency_precision = 2;
		context.flt = (value: any) => Number(value);
		context.forceUpdate = vi.fn();
		context.setBatchQty = (line: any, value: any, update?: boolean) =>
			batchSerial.setBatchQty(line, value, update, context);

		const item = {
			...createItem(),
			has_batch_no: 1,
			batch_no_data: [
				{
					batch_no: "B-FEFO",
					batch_qty: 5,
					batch_price: 7,
					expiry_date: "2026-04-01",
					is_expired: false,
				},
				{
					batch_no: "B-LATER",
					batch_qty: 5,
					batch_price: 9,
					expiry_date: "2026-05-01",
					is_expired: false,
				},
			],
		};

		await api.prepareItemForCart(item, 1, context);
		await api.addItem(item, context);

		expect(context.items).toHaveLength(1);
		expect(context.items[0].batch_no).toBe("B-FEFO");
		expect(context.items[0].rate).toBe(7);
		expect(context.items[0].price_list_rate).toBe(7);
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
