import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/utils/stockCoordinator.js", () => ({
	default: {
		updateBaseQuantities: vi.fn(),
		applyAvailabilityToItem: vi.fn(),
	},
}));
vi.mock("../src/lib/pricingEngine.js", () => ({
	applyLocalPricingRules: vi.fn(() => ({ rate: 0, discountPerUnit: 0, applied: [] })),
	computeFreeItems: vi.fn(() => []),
}));

import invoiceItemMethods from "../src/posapp/components/pos/invoiceItemMethods.js";
import { applyLocalPricingRules, computeFreeItems } from "../src/lib/pricingEngine.js";

const createContext = () => ({
	pos_profile: {
		currency: "USD",
		warehouse: "Main",
		posa_apply_customer_discount: false,
		posa_auto_set_batch: false,
	},
	price_list_currency: "USD",
	selected_currency: "USD",
	exchange_rate: 1,
	currency_precision: 2,
	float_precision: 2,
	customer_info: { posa_discount: 0 },
	update_qty_limits: vi.fn(),
	set_batch_qty: vi.fn(),
	calc_stock_qty: vi.fn(),
	eventBus: { emit: vi.fn() },
	flt(value, precision = null) {
		const prec = precision !== null ? precision : this.float_precision;
		const num = Number(value);
		if (!Number.isFinite(num)) {
			return 0;
		}
		return Number(num.toFixed(prec));
	},
});

describe("invoiceItemMethods._applyItemDetailPayload", () => {
	it("applies server discount percentage to item pricing", () => {
		const context = createContext();
		const item = {
			item_code: "ITEM-1",
			qty: 1,
			price_list_rate: 100,
			base_price_list_rate: 100,
			rate: 100,
			base_rate: 100,
			posa_offer_applied: 0,
			posa_is_offer: 0,
			posa_is_replace: "",
			discount_amount: 0,
			base_discount_amount: 0,
			discount_percentage: 0,
			has_batch_no: 0,
			has_serial_no: 0,
		};

		const data = {
			price_list_currency: "USD",
			uom: "Nos",
			conversion_factor: 1,
			item_uoms: [],
			allow_change_warehouse: 1,
			locked_price: 0,
			description: "",
			item_tax_template: "",
			discount_percentage: 10,
			warehouse: "Main",
			has_batch_no: 0,
			has_serial_no: 0,
			serial_no: null,
			batch_no: null,
			is_stock_item: 1,
			is_fixed_asset: 0,
			allow_alternative_item: 0,
			actual_qty: 0,
			price_list_rate: 100,
			last_purchase_rate: 0,
			projected_qty: 0,
			reserved_qty: 0,
			stock_qty: 0,
			stock_uom: "Nos",
		};

		invoiceItemMethods._applyItemDetailPayload.call(context, item, data);

		expect(item.discount_percentage).toBeCloseTo(10);
		expect(item.discount_amount).toBeCloseTo(10);
		expect(item.base_discount_amount).toBeCloseTo(10);
		expect(item.rate).toBeCloseTo(90);
		expect(item.base_rate).toBeCloseTo(90);
		expect(item.amount).toBeCloseTo(90);
	});

	it("does not override existing discount amounts", () => {
		const context = createContext();
		const item = {
			item_code: "ITEM-2",
			qty: 1,
			price_list_rate: 100,
			base_price_list_rate: 100,
			rate: 95,
			base_rate: 95,
			posa_offer_applied: 0,
			posa_is_offer: 0,
			posa_is_replace: "",
			discount_amount: 5,
			base_discount_amount: 5,
			discount_percentage: 5,
			has_batch_no: 0,
			has_serial_no: 0,
		};

		const data = {
			price_list_currency: "USD",
			uom: "Nos",
			conversion_factor: 1,
			item_uoms: [],
			allow_change_warehouse: 1,
			locked_price: 0,
			description: "",
			item_tax_template: "",
			discount_percentage: 10,
			warehouse: "Main",
			has_batch_no: 0,
			has_serial_no: 0,
			serial_no: null,
			batch_no: null,
			is_stock_item: 1,
			is_fixed_asset: 0,
			allow_alternative_item: 0,
			actual_qty: 0,
			price_list_rate: 100,
			last_purchase_rate: 0,
			projected_qty: 0,
			reserved_qty: 0,
			stock_qty: 0,
			stock_uom: "Nos",
		};

		invoiceItemMethods._applyItemDetailPayload.call(context, item, data);

		expect(item.discount_amount).toBeCloseTo(5);
		expect(item.base_discount_amount).toBeCloseTo(5);
		expect(item.rate).toBeCloseTo(95);
		expect(item.base_rate).toBeCloseTo(95);
	});
});

describe("invoiceItemMethods._applyPricingToLine", () => {
	beforeEach(() => {
		applyLocalPricingRules.mockReset();
		computeFreeItems.mockReset();
		computeFreeItems.mockReturnValue([]);
	});

	it("keeps the item rate discounted even if the pricing engine suggests an increased rate", () => {
		const context = {
			...createContext(),
			_fromBaseCurrency: invoiceItemMethods._fromBaseCurrency,
			_resolveBaseRate: invoiceItemMethods._resolveBaseRate,
			_updatePricingBadge: vi.fn(),
		};
		context._resolvePricingQty = invoiceItemMethods._resolvePricingQty;

		const item = {
			item_code: "ITEM-NEG",
			qty: 1,
			price_list_rate: 100,
			base_price_list_rate: 100,
			rate: 100,
			base_rate: 100,
			locked_price: 0,
			posa_offer_applied: 0,
			_manual_rate_set: false,
		};

		applyLocalPricingRules.mockReturnValue({
			rate: 110,
			discountPerUnit: -10,
			applied: [],
		});

		invoiceItemMethods._applyPricingToLine.call(context, item, {}, {}, new Map());

		expect(item.base_rate).toBeCloseTo(90);
		expect(item.rate).toBeCloseTo(90);
		expect(item.discount_percentage).toBeCloseTo(10);
		expect(item.discount_amount).toBeCloseTo(10);
		expect(item.base_discount_amount).toBeCloseTo(10);
		expect(item.amount).toBeCloseTo(90);
		expect(item.base_amount).toBeCloseTo(90);
	});
});

describe("invoiceItemMethods._syncAutoFreeLines", () => {
	it("applies pricing data when generating free lines", () => {
		const context = {
			...createContext(),
			items: [
				{
					item_code: "ITEM-BASE",
					qty: 2,
					posa_row_id: "ROW-PARENT",
					uom: "Nos",
					conversion_factor: 1,
				},
			],
			packed_items: [],
			calc_stock_qty: vi.fn(),
		};
		context._getItemsStore = () => ({ getItemByCode: vi.fn(() => null) });
		context._fromBaseCurrency = (value) => value;

		let counter = 0;
		context.get_new_item = (template) => ({
			posa_row_id: `FREE-${++counter}`,
			...template,
		});

		const freebiesMap = new Map();
		freebiesMap.set("RULE-1::FREE-ITEM::ROW-PARENT", {
			rule: "RULE-1",
			item_code: "FREE-ITEM",
			qty: 1,
			parentRowId: "ROW-PARENT",
			rate: 25,
			base_rate: 25,
			price_list_rate: 40,
			base_price_list_rate: 40,
			discount_amount: 15,
			base_discount_amount: 15,
			discount_percentage: 37.5,
		});

		invoiceItemMethods._syncAutoFreeLines.call(context, freebiesMap);

		const freeLine = context.items.find((line) => line && line.auto_free_source);
		expect(freeLine).toBeTruthy();
		expect(freeLine.rate).toBeCloseTo(25);
		expect(freeLine.base_rate).toBeCloseTo(25);
		expect(freeLine.price_list_rate).toBeCloseTo(40);
		expect(freeLine.base_price_list_rate).toBeCloseTo(40);
		expect(freeLine.discount_amount).toBeCloseTo(15);
		expect(freeLine.base_discount_amount).toBeCloseTo(15);
		expect(freeLine.discount_percentage).toBeCloseTo(37.5);
		expect(freeLine.amount).toBeCloseTo(25);
		expect(freeLine.base_amount).toBeCloseTo(25);
		expect(freeLine.is_free_item).toBe(1);
	});
});

describe("invoiceItemMethods._applyServerPricingRules", () => {
	it("does not override manual rate overrides from server responses", async () => {
		const manualItem = {
			posa_row_id: "ROW-1",
			item_code: "ITEM-1",
			qty: 2,
			rate: 120,
			base_rate: 120,
			price_list_rate: 150,
			base_price_list_rate: 150,
			discount_amount: 60,
			base_discount_amount: 60,
			discount_percentage: 40,
			_manual_rate_set: true,
			locked_price: 0,
		};

		const context = {
			...createContext(),
			items: [manualItem],
			_syncAutoFreeLines: vi.fn(),
			_updatePricingBadge: vi.fn(),
			$forceUpdate: vi.fn(),
		};
		context._fromBaseCurrency = invoiceItemMethods._fromBaseCurrency;
		context._toBaseCurrency = invoiceItemMethods._toBaseCurrency;
		context._resolvePricingQty = invoiceItemMethods._resolvePricingQty;

		global.frappe = {
			call: vi.fn(async () => ({
				message: {
					updates: [
						{
							row_id: manualItem.posa_row_id,
							rate: 80,
							price_list_rate: 110,
							discount_amount: 30,
							discount_percentage: 27,
						},
					],
					free_lines: [],
				},
			})),
		};

		await invoiceItemMethods._applyServerPricingRules.call(context, {
			company: "Test Co",
			price_list: "Standard",
			currency: "USD",
		});

		expect(global.frappe.call).toHaveBeenCalledTimes(1);
		expect(manualItem.rate).toBeCloseTo(120);
		expect(manualItem.base_rate).toBeCloseTo(120);
		expect(manualItem.price_list_rate).toBeCloseTo(150);
		expect(manualItem.base_price_list_rate).toBeCloseTo(150);
		expect(manualItem.discount_amount).toBeCloseTo(60);
		expect(manualItem.base_discount_amount).toBeCloseTo(60);
		expect(manualItem.discount_percentage).toBeCloseTo(40);

		delete global.frappe;
	});

	it("preserves offer-adjusted item rates when reconciling with server", async () => {
		const offeredItem = {
			posa_row_id: "ROW-2",
			item_code: "ITEM-OFFER",
			qty: 3,
			rate: 75,
			base_rate: 75,
			price_list_rate: 90,
			base_price_list_rate: 90,
			discount_amount: 15,
			base_discount_amount: 15,
			discount_percentage: 16.6667,
			posa_offer_applied: 1,
			locked_price: 0,
		};

		const context = {
			...createContext(),
			items: [offeredItem],
			_syncAutoFreeLines: vi.fn(),
			_updatePricingBadge: vi.fn(),
			$forceUpdate: vi.fn(),
		};
		context._fromBaseCurrency = invoiceItemMethods._fromBaseCurrency;
		context._toBaseCurrency = invoiceItemMethods._toBaseCurrency;
		context._resolvePricingQty = invoiceItemMethods._resolvePricingQty;

		global.frappe = {
			call: vi.fn(async () => ({
				message: {
					updates: [
						{
							row_id: offeredItem.posa_row_id,
							rate: 120,
							price_list_rate: 120,
							discount_amount: 0,
							discount_percentage: 0,
						},
					],
					free_lines: [],
				},
			})),
		};

		await invoiceItemMethods._applyServerPricingRules.call(context, {
			company: "Test Co",
			price_list: "Standard",
			currency: "USD",
		});

		expect(global.frappe.call).toHaveBeenCalledTimes(1);
		expect(offeredItem.rate).toBeCloseTo(75);
		expect(offeredItem.base_rate).toBeCloseTo(75);
		expect(offeredItem.price_list_rate).toBeCloseTo(90);
		expect(offeredItem.base_price_list_rate).toBeCloseTo(90);
		expect(offeredItem.discount_amount).toBeCloseTo(15);
		expect(offeredItem.base_discount_amount).toBeCloseTo(15);
		expect(offeredItem.discount_percentage).toBeCloseTo(16.6667);

		delete global.frappe;
	});

	it("preserves paid item pricing when same-item freebies zero out the server rate", async () => {
		const paidItem = {
			posa_row_id: "ROW-3",
			item_code: "ITEM-SAME",
			qty: 3,
			rate: 50,
			base_rate: 50,
			price_list_rate: 50,
			base_price_list_rate: 50,
			discount_amount: 0,
			base_discount_amount: 0,
			discount_percentage: 0,
			locked_price: 0,
		};

		const context = {
			...createContext(),
			items: [paidItem],
			_syncAutoFreeLines: vi.fn(),
			_updatePricingBadge: vi.fn(),
			$forceUpdate: vi.fn(),
		};
		context._fromBaseCurrency = invoiceItemMethods._fromBaseCurrency;
		context._toBaseCurrency = invoiceItemMethods._toBaseCurrency;
		context._resolvePricingQty = invoiceItemMethods._resolvePricingQty;

		global.frappe = {
			call: vi.fn(async () => ({
				message: {
					updates: [
						{
							row_id: paidItem.posa_row_id,
							rate: 0,
							price_list_rate: 50,
							discount_amount: 50,
							discount_percentage: 100,
							pricing_rules: ["RULE-SAME"],
						},
					],
					free_lines: [
						{
							item_code: paidItem.item_code,
							qty: 1,
							pricing_rules: "RULE-SAME",
							parent_row_id: paidItem.posa_row_id,
							same_item: 1,
							rate: 0,
						},
					],
				},
			})),
		};

		await invoiceItemMethods._applyServerPricingRules.call(context, {
			company: "Test Co",
			price_list: "Standard",
			currency: "USD",
		});

		expect(global.frappe.call).toHaveBeenCalledTimes(1);
		expect(paidItem.rate).toBeCloseTo(50);
		expect(paidItem.base_rate).toBeCloseTo(50);
		expect(paidItem.price_list_rate).toBeCloseTo(50);
		expect(paidItem.base_price_list_rate).toBeCloseTo(50);
		expect(paidItem.discount_amount).toBeCloseTo(0);
		expect(paidItem.base_discount_amount).toBeCloseTo(0);

		expect(context._syncAutoFreeLines).toHaveBeenCalledTimes(1);
		const freebiesArg = context._syncAutoFreeLines.mock.calls[0][0];
		const serverEntries = Array.from(freebiesArg.values());
		expect(serverEntries[0].same_item).toBe(1);

		delete global.frappe;
	});

	it("retains paid item pricing when freebies lack parent linkage and server clears price list data", async () => {
		const paidItem = {
			posa_row_id: "ROW-4",
			item_code: "ITEM-SAME-NP",
			qty: 2,
			rate: 60,
			base_rate: 60,
			price_list_rate: 80,
			base_price_list_rate: 80,
			discount_amount: 20,
			base_discount_amount: 20,
			discount_percentage: 25,
			locked_price: 0,
		};

		const context = {
			...createContext(),
			items: [paidItem],
			_syncAutoFreeLines: vi.fn(),
			_updatePricingBadge: vi.fn(),
			$forceUpdate: vi.fn(),
		};
		context._fromBaseCurrency = invoiceItemMethods._fromBaseCurrency;
		context._toBaseCurrency = invoiceItemMethods._toBaseCurrency;
		context._resolvePricingQty = invoiceItemMethods._resolvePricingQty;

		global.frappe = {
			call: vi.fn(async () => ({
				message: {
					updates: [
						{
							row_id: paidItem.posa_row_id,
							rate: 0,
							price_list_rate: 0,
							discount_amount: 0,
							discount_percentage: 0,
							pricing_rules: ["RULE-SAME-NP"],
						},
					],
					free_lines: [
						{
							item_code: paidItem.item_code,
							qty: 1,
							pricing_rules: "RULE-SAME-NP",
							same_item: 1,
							rate: 0,
						},
					],
				},
			})),
		};

		await invoiceItemMethods._applyServerPricingRules.call(context, {
			company: "Test Co",
			price_list: "Standard",
			currency: "USD",
		});

		expect(global.frappe.call).toHaveBeenCalledTimes(1);
		expect(paidItem.rate).toBeCloseTo(60);
		expect(paidItem.base_rate).toBeCloseTo(60);
		expect(paidItem.price_list_rate).toBeCloseTo(80);
		expect(paidItem.base_price_list_rate).toBeCloseTo(80);
		expect(paidItem.discount_amount).toBeCloseTo(20);
		expect(paidItem.base_discount_amount).toBeCloseTo(20);
		expect(paidItem.discount_percentage).toBeCloseTo(25);

		expect(context._syncAutoFreeLines).toHaveBeenCalledTimes(1);
		const freebiesArg = context._syncAutoFreeLines.mock.calls[0][0];
		const serverEntries = Array.from(freebiesArg.values());
		expect(serverEntries[0].same_item).toBe(1);

		delete global.frappe;
	});
});

describe("invoiceItemMethods._applyManualRateOverridesToDoc", () => {
	it("does not apply free-line overrides to paid parent items sharing an item code", () => {
		const doc = {
			items: [
				{
					name: "ITEM-PAID-ROW",
					item_code: "CLEANER",
					idx: 1,
					rate: 1900,
					base_rate: 1900,
					price_list_rate: 1900,
					base_price_list_rate: 1900,
					discount_amount: 0,
					base_discount_amount: 0,
					is_free_item: 0,
				},
				{
					name: "ITEM-FREE-ROW",
					item_code: "CLEANER",
					idx: 2,
					rate: 0,
					base_rate: 0,
					price_list_rate: 100,
					base_price_list_rate: 100,
					discount_amount: 100,
					base_discount_amount: 100,
					is_free_item: 1,
					auto_free_source: "RULE-001::CLEANER::PARENT-ROW",
					parent_row_id: "PARENT-ROW",
					source_rule: "RULE-001",
				},
			],
		};

		const overrides = [
			{
				keys: {
					item_code: "CLEANER",
					is_free_item: 1,
					auto_free_source: "RULE-001::CLEANER::PARENT-ROW",
					parent_row_id: "PARENT-ROW",
					source_rule: "RULE-001",
				},
				values: {
					rate: 100,
					base_rate: 100,
					price_list_rate: 100,
					base_price_list_rate: 100,
					discount_amount: 0,
					base_discount_amount: 0,
					discount_percentage: 0,
					amount: 100,
					base_amount: 100,
				},
			},
		];

		const context = {
			...createContext(),
			_doesManualOverrideMatchItem: invoiceItemMethods._doesManualOverrideMatchItem,
			_assignManualOverrideValues: invoiceItemMethods._assignManualOverrideValues,
			_isFreeLine: invoiceItemMethods._isFreeLine,
		};

		invoiceItemMethods._applyManualRateOverridesToDoc.call(context, doc, overrides);

		const [paidLine, freeLine] = doc.items;
		expect(paidLine.rate).toBe(1900);
		expect(paidLine.price_list_rate).toBe(1900);
		expect(paidLine.discount_amount).toBe(0);

		expect(freeLine.rate).toBe(100);
		expect(freeLine.price_list_rate).toBe(100);
		expect(freeLine.discount_amount).toBe(0);
	});
});
