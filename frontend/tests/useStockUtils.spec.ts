import { describe, expect, it, vi } from "vitest";

const offlineMocks = vi.hoisted(() => ({
	isOffline: vi.fn(() => false),
	getCachedItemPriceForUom: vi.fn(async () => null),
}));

vi.mock("../src/offline/index", () => ({
	isOffline: offlineMocks.isOffline,
	getCachedItemPriceForUom: offlineMocks.getCachedItemPriceForUom,
}));

vi.mock("../src/posapp/stores/toastStore.js", () => ({
	useToastStore: () => ({
		show: vi.fn(),
	}),
}));

import { useStockUtils } from "../src/posapp/composables/pos/shared/useStockUtils";

describe("useStockUtils calcUom", () => {
	it("uses the exact synced Item Price when the UOM changes offline", async () => {
		offlineMocks.isOffline.mockReturnValueOnce(true);
		offlineMocks.getCachedItemPriceForUom.mockResolvedValueOnce({
			name: "IP-DOZEN",
			price_list: "Retail Selling",
			item_code: "002",
			uom: "Dozen",
			currency: "PKR",
			price_list_rate: 960,
		});
		const schedulePricingRuleApplication = vi.fn();
		const item = {
			item_code: "002",
			stock_uom: "Unit",
			uom: "Unit",
			item_uoms: [
				{ uom: "Unit", conversion_factor: 1 },
				{ uom: "Dozen", conversion_factor: 12 },
			],
			qty: 1,
			rate: 120,
			price_list_rate: 120,
			base_rate: 120,
			base_price_list_rate: 120,
			conversion_factor: 1,
		};

		(globalThis as any).frappe = { call: vi.fn() };
		(globalThis as any).__ = (text: string) => text;

		const { calcUom } = useStockUtils();
		await calcUom(item, "Dozen", {
			pos_profile: { currency: "PKR" },
			company: { default_currency: "PKR" },
			selected_currency: "PKR",
			price_list_currency: "PKR",
			posting_date: "2026-09-04",
			customer: "CUST-001",
			currency_precision: 2,
			flt: (value: unknown) => Number(value),
			get_price_list: () => "Retail Selling",
			invoiceStore: { triggerUpdateTotals: vi.fn() },
			calc_stock_qty: (target: any, qty: number) => {
				target.stock_qty = target.conversion_factor * qty;
			},
			schedulePricingRuleApplication,
		});

		expect(offlineMocks.getCachedItemPriceForUom).toHaveBeenCalledWith({
			priceList: "Retail Selling",
			itemCode: "002",
			uom: "Dozen",
			customer: "CUST-001",
			currency: "PKR",
			date: "2026-09-04",
		});
		expect((globalThis as any).frappe.call).not.toHaveBeenCalled();
		expect(item.rate).toBe(960);
		expect(item.price_list_rate).toBe(960);
		expect(item.conversion_factor).toBe(12);
		expect(item.stock_qty).toBe(12);
		expect(schedulePricingRuleApplication).toHaveBeenCalledOnce();
	});

	it("reapplies a percentage offer to the exact offline UOM price", async () => {
		offlineMocks.isOffline.mockReturnValueOnce(true);
		offlineMocks.getCachedItemPriceForUom.mockResolvedValueOnce({
			name: "IP-DOZEN",
			price_list: "Retail Selling",
			item_code: "002",
			uom: "Dozen",
			currency: "PKR",
			price_list_rate: 960,
		});
		const item = {
			item_code: "002",
			posa_row_id: "ROW-002",
			posa_offer_applied: 1,
			stock_uom: "Unit",
			uom: "Unit",
			item_uoms: [
				{ uom: "Unit", conversion_factor: 1 },
				{ uom: "Dozen", conversion_factor: 12 },
			],
			qty: 1,
			rate: 108,
			price_list_rate: 120,
			base_rate: 108,
			base_price_list_rate: 120,
			conversion_factor: 1,
		};

		(globalThis as any).__ = (text: string) => text;
		const { calcUom } = useStockUtils();
		await calcUom(item, "Dozen", {
			pos_profile: { currency: "PKR" },
			company: { default_currency: "PKR" },
			selected_currency: "PKR",
			price_list_currency: "PKR",
			currency_precision: 2,
			flt: (value: unknown) => Number(value),
			get_price_list: () => "Retail Selling",
			posOffers: [
				{
					items: JSON.stringify(["ROW-002"]),
					discount_type: "Discount Percentage",
					discount_percentage: 10,
				},
			],
			invoiceStore: { triggerUpdateTotals: vi.fn() },
		});

		expect(item.price_list_rate).toBe(960);
		expect(item.rate).toBe(864);
		expect(item.discount_amount).toBe(96);
	});

	it("does not let a fixed-rate offer raise an exact UOM Item Price", async () => {
		offlineMocks.isOffline.mockReturnValueOnce(true);
		offlineMocks.getCachedItemPriceForUom.mockResolvedValueOnce({
			name: "IP-DOZEN",
			price_list: "Retail Selling",
			item_code: "002",
			uom: "Dozen",
			currency: "PKR",
			price_list_rate: 960,
		});
		const item = {
			item_code: "002",
			posa_row_id: "ROW-002",
			posa_offer_applied: 1,
			stock_uom: "Unit",
			uom: "Unit",
			item_uoms: [
				{ uom: "Unit", conversion_factor: 1 },
				{ uom: "Dozen", conversion_factor: 12 },
			],
			qty: 1,
			rate: 100,
			price_list_rate: 120,
			base_rate: 100,
			base_price_list_rate: 120,
			conversion_factor: 1,
		};

		(globalThis as any).__ = (text: string) => text;
		const { calcUom } = useStockUtils();
		await calcUom(item, "Dozen", {
			pos_profile: { currency: "PKR" },
			company: { default_currency: "PKR" },
			selected_currency: "PKR",
			price_list_currency: "PKR",
			currency_precision: 2,
			flt: (value: unknown) => Number(value),
			get_price_list: () => "Retail Selling",
			posOffers: [
				{
					items: JSON.stringify(["ROW-002"]),
					discount_type: "Rate",
					rate: 100,
				},
			],
			invoiceStore: { triggerUpdateTotals: vi.fn() },
		});

		expect(item.price_list_rate).toBe(960);
		expect(item.rate).toBe(960);
		expect(item.discount_amount).toBe(0);
	});

	it("refreshes invoice totals after applying a UOM-specific price", async () => {
		const item = {
			item_code: "ITEM-UOM",
			item_name: "UOM Item",
			stock_uom: "Nos",
			uom: "Nos",
			item_uoms: [
				{ uom: "Nos", conversion_factor: 1 },
				{ uom: "Box", conversion_factor: 12 },
			],
			qty: 2,
			rate: 10,
			amount: 20,
			base_amount: 20,
			price_list_rate: 10,
			base_rate: 10,
			base_price_list_rate: 10,
			conversion_factor: 1,
			discount_amount: 0,
			discount_percentage: 0,
		};
		const triggerUpdateTotals = vi.fn();

		(globalThis as any).frappe = {
			call: vi.fn(async () => ({ message: 120 })),
		};
		(globalThis as any).__ = (text: string) => text;

		const { calcUom } = useStockUtils();
		await calcUom(item, "Box", {
			pos_profile: { currency: "PKR" },
			company: { default_currency: "PKR" },
			selected_currency: "PKR",
			price_list_currency: "PKR",
			currency_precision: 2,
			flt: (value: unknown, precision = 2) => {
				const numeric = Number(value);
				return Number.isFinite(numeric) ? Number(numeric.toFixed(precision)) : 0;
			},
			get_price_list: () => "Standard Selling",
			invoiceStore: {
				triggerUpdateTotals,
			},
			calc_stock_qty: (target: any, qty: number) => {
				target.stock_qty = target.conversion_factor * qty;
			},
			forceUpdate: vi.fn(),
		});

		expect(item.uom).toBe("Box");
		expect(item.conversion_factor).toBe(12);
		expect(item.rate).toBe(120);
		expect(item.amount).toBe(240);
		expect(item.base_amount).toBe(240);
		expect(item.stock_qty).toBe(24);
		expect(triggerUpdateTotals).toHaveBeenCalledTimes(1);
	});

	it("refreshes stale line amount after conversion-factor UOM changes", async () => {
		const item = {
			item_code: "ITEM-UOM-CONVERSION",
			item_name: "Conversion UOM Item",
			stock_uom: "Unit",
			uom: "Unit",
			item_uoms: [
				{ uom: "Doz", conversion_factor: 12 },
				{ uom: "Unit", conversion_factor: 1 },
			],
			qty: 1,
			rate: 120,
			amount: 120,
			base_amount: 120,
			price_list_rate: 120,
			base_rate: 120,
			base_price_list_rate: 120,
			original_base_rate: 120,
			original_base_price_list_rate: 120,
			conversion_factor: 1,
			discount_amount: 0,
			discount_percentage: 0,
		};
		const triggerUpdateTotals = vi.fn();

		(globalThis as any).frappe = {
			call: vi.fn(async () => ({ message: null })),
		};
		(globalThis as any).__ = (text: string) => text;

		const { calcUom } = useStockUtils();
		await calcUom(item, "Doz", {
			pos_profile: { currency: "PKR" },
			company: { default_currency: "PKR" },
			selected_currency: "PKR",
			price_list_currency: "PKR",
			currency_precision: 2,
			flt: (value: unknown, precision = 2) => {
				const numeric = Number(value);
				return Number.isFinite(numeric) ? Number(numeric.toFixed(precision)) : 0;
			},
			get_price_list: () => "Retail Selling",
			invoiceStore: {
				touch: vi.fn(),
				triggerUpdateTotals,
			},
			calc_stock_qty: (target: any, qty: number) => {
				target.stock_qty = target.conversion_factor * qty;
			},
			forceUpdate: vi.fn(),
		});

		expect(item.uom).toBe("Doz");
		expect(item.conversion_factor).toBe(12);
		expect(item.rate).toBe(1440);
		expect(item.amount).toBe(1440);
		expect(item.base_amount).toBe(1440);
		expect(item.stock_qty).toBe(12);
		expect(triggerUpdateTotals).toHaveBeenCalledTimes(1);
	});
});
