import { describe, expect, it, vi } from "vitest";

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
        items: [],
        packed_items: [],
        posOffers: [],
        posa_offers: [],
        ApplyOnPrice: vi.fn(),
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

        it("reapplies item price offers after item detail refresh", () => {
                const context = createContext();

                const item = {
                        item_code: "ITEM-OFFER",
                        posa_row_id: "ROW-1",
                        qty: 1,
                        conversion_factor: 1,
                        price_list_rate: 120,
                        base_price_list_rate: 120,
                        rate: 120,
                        base_rate: 120,
                        posa_offer_applied: 1,
                        posa_offers: JSON.stringify(["OFFER-1"]),
                        amount: 120,
                        base_amount: 120,
                        has_batch_no: 0,
                        has_serial_no: 0,
                };

                context.items = [item];
                context.posOffers = [
                        {
                                row_id: "OFFER-1",
                                name: "Test Offer",
                                offer: "Item Price",
                                discount_type: "Rate",
                                rate: 80,
                                items: ["ROW-1"],
                        },
                ];
                context.posa_offers = [
                        {
                                row_id: "OFFER-1",
                                offer_name: "Test Offer",
                                offer: "Item Price",
                                items: JSON.stringify(["ROW-1"]),
                        },
                ];

                context.ApplyOnPrice = vi.fn((offer, options) => {
                        if (options?.reapplyExisting) {
                                item.base_rate = 80;
                                item.rate = 80;
                                item.amount = 80;
                                item.base_amount = 80;
                        }
                });

                const data = {
                        price_list_currency: "USD",
                        uom: "Nos",
                        conversion_factor: 1,
                        item_uoms: [],
                        allow_change_warehouse: 1,
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
                        actual_qty: 0,
                        price_list_rate: 120,
                        last_purchase_rate: 0,
                        projected_qty: 0,
                        reserved_qty: 0,
                        stock_qty: 0,
                        stock_uom: "Nos",
                };

                invoiceItemMethods._applyItemDetailPayload.call(context, item, data);

                expect(context.ApplyOnPrice).toHaveBeenCalledWith(
                        expect.objectContaining({ row_id: "OFFER-1" }),
                        { reapplyExisting: true },
                );
                expect(item.rate).toBe(80);
                expect(item.base_rate).toBe(80);
                expect(item.amount).toBe(80);
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
