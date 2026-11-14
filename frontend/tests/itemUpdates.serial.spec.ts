import { describe, expect, it, vi } from "vitest";

import {
	_applyItemDetailPayload,
	prepareCartPriceListChange,
} from "../src/posapp/components/pos/invoice_utils/item_updates";

describe("cart price list switch", () => {
	it("reprices regular UOM rows and keeps discounted and manually priced rows", async () => {
		const regular = {
			item_code: "BOX", uom: "Box", stock_uom: "Nos", conversion_factor: 4,
			qty: 2, rate: 40, _manual_rate_set: true, _manual_rate_set_from_uom: true,
		};
		const discounted = { item_code: "DISC", rate: 75, discount_percentage: 25 };
		const manual = { item_code: "MANUAL", rate: 22, _manual_rate_set: true };
		const call = vi.fn().mockResolvedValue({
			message: [{ posa_row_id: "0", _prices_by_uom: { Nos: { price_list_rate: 8 } } }],
		});
		vi.stubGlobal("frappe", { call });
		const context = {
			items: [regular, discounted, manual],
			pos_profile: { name: "Counter", company: "Shop", currency: "USD" },
			selected_currency: "USD",
			posting_date: "2026-10-01",
			currency_precision: 2,
			flt: Number,
			invoiceStore: { recalculateTotals: vi.fn() },
		};
		try {
			const change = await prepareCartPriceListChange(context, "Wholesale", "USD");
			expect(change.isCurrent()).toBe(true);
			expect(regular.rate).toBe(40);
			change.apply();
			expect(regular).toMatchObject({ rate: 32, amount: 64, original_base_rate: 8 });
			expect(discounted).toMatchObject({ rate: 75, discount_percentage: 25 });
			expect(manual.rate).toBe(22);
			expect(context.invoiceStore.recalculateTotals).toHaveBeenCalledOnce();

			call.mockResolvedValueOnce({ message: [] });
			await expect(
				prepareCartPriceListChange(context, "Incomplete", "USD"),
			).rejects.toThrow("Missing Incomplete price for BOX");
			expect(regular.rate).toBe(32);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

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
});

