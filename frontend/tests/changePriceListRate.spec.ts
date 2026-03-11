import { beforeEach, describe, expect, it, vi } from "vitest";

import { change_price_list_rate } from "../src/posapp/components/pos/invoice_utils/dialogs";

declare global {
	// eslint-disable-next-line no-var
	var __: (_text: string, _args?: any[]) => string;
	// eslint-disable-next-line no-var
	var frappe: any;
}

describe("change_price_list_rate", () => {
	beforeEach(() => {
		globalThis.__ = (text: string) => text;
		globalThis.frappe = {
			call: vi.fn(async () => ({ message: "ok" })),
		};
		vi.restoreAllMocks();
	});

	it("applies the entered price list rate from in-app rate dialog", async () => {
		const context: any = {
			selected_currency: "PKR",
			price_list_currency: "PKR",
			selected_price_list: "Standard Selling",
			pos_profile: { currency: "PKR" },
			currency_precision: 2,
			flt: (value: any) => Number(value),
			_toBaseCurrency: (value: any) => Number(value),
			_applyPriceListRate: vi.fn(),
			schedulePricingRuleApplication: vi.fn(),
			forceUpdate: vi.fn(),
			toastStore: { show: vi.fn() },
			promptPriceListRate: vi.fn(async () => "150"),
		};
		const item: any = {
			item_code: "ITEM-001",
			uom: "Nos",
			qty: 2,
			rate: 100,
			price_list_rate: 100,
		};

		await change_price_list_rate(context, item);

		expect(context._applyPriceListRate).toHaveBeenCalledWith(
			item,
			150,
			"PKR",
		);
		expect(context.promptPriceListRate).toHaveBeenCalledWith("100", item);
		expect(item.rate).toBe(150);
		expect(item.base_rate).toBe(150);
		expect(item.amount).toBe(300);
		expect(item.discount_amount).toBe(0);
		expect(item.discount_percentage).toBe(0);
		expect(item._manual_rate_set).toBe(true);
		expect(item._price_list_rate_persisted).toBe(true);
		expect(context.schedulePricingRuleApplication).toHaveBeenCalledWith(true);
		expect(context.forceUpdate).toHaveBeenCalled();
		expect(globalThis.frappe.call).toHaveBeenCalledWith({
			method: "posawesome.posawesome.api.items.update_price_list_rate",
			args: {
				item_code: "ITEM-001",
				price_list: "Standard Selling",
				rate: 150,
				uom: "Nos",
			},
		});
	});

	it("shows validation error for invalid input", async () => {
		const context: any = {
			selected_currency: "PKR",
			pos_profile: { currency: "PKR" },
			currency_precision: 2,
			flt: (value: any) => Number(value),
			_toBaseCurrency: (value: any) => Number(value),
			_applyPriceListRate: vi.fn(),
			toastStore: { show: vi.fn() },
			promptPriceListRate: vi.fn(async () => "-1"),
		};
		const item: any = { qty: 1, rate: 100, price_list_rate: 100 };

		await change_price_list_rate(context, item);

		expect(context._applyPriceListRate).not.toHaveBeenCalled();
		expect(context.toastStore.show).toHaveBeenCalled();
	});
});
