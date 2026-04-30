import { describe, expect, it, vi } from "vitest";

import {
	_applyItemDetailPayload,
	update_items_details,
} from "../src/posapp/components/pos/invoice_utils/item_updates";

describe("_applyItemDetailPayload serial preservation", () => {
	it("keeps selected serial info when server payload does not include serial_no", () => {
		const context: any = {
			pos_profile: { warehouse: "Main", posa_auto_set_batch: false },
			price_list_currency: "USD",
			selected_currency: "USD",
			currency_precision: 2,
			flt: (value: any) => Number(value),
			update_qty_limits: vi.fn(),
			_getPlcConversionRate: () => 1,
			_applyPriceListRate: vi.fn(),
		};

		const item: any = {
			item_code: "ITEM-1",
			warehouse: "Main",
			qty: 1,
			serial_no_selected: ["SER-KEEP-01"],
			serial_no_selected_count: 1,
			serial_no: "SER-KEEP-01",
			item_uoms: [],
		};

		const data: any = {
			stock_uom: "Nos",
			uom: "Nos",
			conversion_factor: 1,
			item_uoms: [{ uom: "Nos", conversion_factor: 1 }],
			allow_change_warehouse: 0,
			locked_price: 0,
			description: "",
			item_tax_template: "",
			discount_percentage: 0,
			warehouse: "Main",
			has_batch_no: 0,
			has_serial_no: 1,
			serial_no: null,
			batch_no: null,
			is_stock_item: 1,
			is_fixed_asset: 0,
			allow_alternative_item: 0,
			actual_qty: 10,
			price_list_rate: 100,
			currency: "USD",
			serial_no_data: [],
		};

		_applyItemDetailPayload(context, item, data, {});

		expect(item.serial_no_selected).toEqual(["SER-KEEP-01"]);
		expect(item.serial_no).toBe("SER-KEEP-01");
		expect(item.serial_no_selected_count).toBe(1);
	});

	it("preserves original return-against pricing even when item details return current rates", () => {
		const context: any = {
			pos_profile: { warehouse: "Main", posa_auto_set_batch: false },
			invoice_doc: { is_return: 1, return_against: "SINV-0001" },
			price_list_currency: "USD",
			selected_currency: "USD",
			currency_precision: 2,
			flt: (value: any) => Number(value),
			update_qty_limits: vi.fn(),
			_getPlcConversionRate: () => 1,
			_applyPriceListRate: vi.fn(),
		};

		const item: any = {
			item_code: "PROMO-ITEM",
			warehouse: "Main",
			qty: -1,
			locked_price: true,
			rate: 600,
			base_rate: 600,
			price_list_rate: 600,
			base_price_list_rate: 600,
			discount_percentage: 40,
			item_uoms: [],
		};

		const data: any = {
			stock_uom: "Nos",
			uom: "Nos",
			conversion_factor: 1,
			item_uoms: [{ uom: "Nos", conversion_factor: 1 }],
			allow_change_warehouse: 0,
			locked_price: 0,
			description: "",
			item_tax_template: "",
			discount_percentage: 0,
			warehouse: "Main",
			has_batch_no: 0,
			has_serial_no: 0,
			serial_no: null,
			batch_no: null,
			is_stock_item: 1,
			is_fixed_asset: 0,
			allow_alternative_item: 0,
			actual_qty: 10,
			price_list_rate: 1000,
			currency: "USD",
		};

		_applyItemDetailPayload(context, item, data, {});

		expect(item.locked_price).toBe(true);
		expect(item.rate).toBe(600);
		expect(item.base_rate).toBe(600);
		expect(item.price_list_rate).toBe(600);
		expect(item.base_price_list_rate).toBe(600);
		expect(item.discount_percentage).toBe(40);
		expect(context._applyPriceListRate).not.toHaveBeenCalled();
	});

	it("does not force zero customer price list rates when updating cart items with disabled force flag", async () => {
		(globalThis as any).__ = (text: string) => text;
		(globalThis as any).frappe = {
			call: vi.fn(async () => ({
				message: [
					{
						item_code: "ITEM-1",
						actual_qty: 5,
						item_uoms: [],
						has_batch_no: 0,
						has_serial_no: 0,
						allow_negative_stock: 0,
						batch_no_data: [],
						serial_no_data: [],
						rate: 0,
						price_list_rate: 0,
						currency: "USD",
					},
				],
			})),
		};

		const context: any = {
			pos_profile: {
				name: "POS-1",
				warehouse: "Main",
				posa_force_price_from_customer_price_list: "0",
			},
			selected_currency: "USD",
			get_price_list: () => "Customer Retail",
			_applyPriceListRate: vi.fn(),
			_computePriceConversion: vi.fn(),
			toastStore: { show: vi.fn() },
		};
		const item: any = {
			item_code: "ITEM-1",
			rate: 25,
			price_list_rate: 25,
		};

		await update_items_details(context, [item]);

		expect(context._applyPriceListRate).not.toHaveBeenCalled();
		expect(item.rate).toBe(25);
		expect(item.price_list_rate).toBe(25);
		expect(item.actual_qty).toBe(5);
	});

	it("does not apply zero detail payload rates when force customer price list is disabled", () => {
		const context: any = {
			pos_profile: {
				warehouse: "Main",
				posa_auto_set_batch: false,
				posa_force_price_from_customer_price_list: "0",
			},
			price_list_currency: "USD",
			selected_currency: "USD",
			currency_precision: 2,
			flt: (value: any) => Number(value),
			update_qty_limits: vi.fn(),
			_getPlcConversionRate: () => 1,
			_applyPriceListRate: vi.fn(),
		};
		const item: any = {
			item_code: "ITEM-1",
			warehouse: "Main",
			qty: 1,
			rate: 25,
			price_list_rate: 25,
			item_uoms: [],
		};
		const data: any = {
			stock_uom: "Nos",
			uom: "Nos",
			conversion_factor: 1,
			item_uoms: [{ uom: "Nos", conversion_factor: 1 }],
			allow_change_warehouse: 0,
			locked_price: 0,
			description: "",
			item_tax_template: "",
			discount_percentage: 0,
			warehouse: "Main",
			has_batch_no: 0,
			has_serial_no: 0,
			serial_no: null,
			batch_no: null,
			is_stock_item: 1,
			is_fixed_asset: 0,
			allow_alternative_item: 0,
			actual_qty: 10,
			price_list_rate: 0,
			currency: "USD",
		};

		_applyItemDetailPayload(context, item, data, {});

		expect(context._applyPriceListRate).not.toHaveBeenCalled();
		expect(item.rate).toBe(25);
		expect(item.price_list_rate).toBe(25);
	});
});

