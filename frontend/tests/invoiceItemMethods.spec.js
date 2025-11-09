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

                const item = {
                        item_code: "ITEM-NEG",
                        qty: 1,
                        price_list_rate: 100,
                        base_price_list_rate: 100,
                        rate: 100,
                        base_rate: 100,
                        stock_qty: 12,
                        conversion_factor: 12,
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

                const pricingArgs = applyLocalPricingRules.mock.calls[0][0];
                expect(pricingArgs.qty).toBeCloseTo(1);
                expect(pricingArgs.stockQty).toBeCloseTo(12);

                const freebiesArgs = computeFreeItems.mock.calls[0][0];
                expect(freebiesArgs.qty).toBeCloseTo(1);
                expect(freebiesArgs.stockQty).toBeCloseTo(12);

                expect(item.base_rate).toBeCloseTo(90);
                expect(item.rate).toBeCloseTo(90);
                expect(item.discount_percentage).toBeCloseTo(10);
                expect(item.discount_amount).toBeCloseTo(10);
                expect(item.base_discount_amount).toBeCloseTo(10);
                expect(item.amount).toBeCloseTo(90);
                expect(item.base_amount).toBeCloseTo(90);
        });
});
