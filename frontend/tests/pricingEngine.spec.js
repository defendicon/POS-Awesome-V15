import { describe, expect, it } from "vitest";

import { applyLocalPricingRules, computeFreeItems } from "../src/lib/pricingEngine.js";

const buildIndexes = (config = {}) => {
        return {
                byItem: new Map(Object.entries(config.items || {})),
                byGroup: new Map(Object.entries(config.groups || {})),
                byBrand: new Map(Object.entries(config.brands || {})),
                general: config.general || [],
        };
};

describe("pricingEngine - applyLocalPricingRules", () => {
        it("applies percentage discounts", () => {
                const rule = {
                        name: "DISC-10",
                        price_or_discount: "Discount",
                        discount_type: "Rate",
                        rate_or_discount: 10,
                        specificity: 3,
                        priority: 10,
                };
                const indexes = buildIndexes({ items: { "ITEM-1": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-1" },
                        qty: 1,
                        baseRate: 100,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(90);
                expect(result.discountPerUnit).toBeCloseTo(10);
        });

        it("applies amount discounts", () => {
                const rule = {
                        name: "DISC-AMT",
                        price_or_discount: "Discount",
                        discount_type: "Amount",
                        rate_or_discount: 5,
                        specificity: 3,
                        priority: 5,
                };
                const indexes = buildIndexes({ items: { "ITEM-2": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-2" },
                        qty: 1,
                        baseRate: 50,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(45);
                expect(result.discountPerUnit).toBeCloseTo(5);
        });

        it("applies fixed price overrides", () => {
                const rule = {
                        name: "FIX-PRICE",
                        price_or_discount: "Price",
                        discount_type: "Rate",
                        rate_or_discount: 25,
                        specificity: 3,
                        priority: 5,
                };
                const indexes = buildIndexes({ items: { "ITEM-3": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-3" },
                        qty: 2,
                        baseRate: 40,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(25);
                expect(result.discountPerUnit).toBeCloseTo(15);
        });

        it("applies margin rules", () => {
                const rule = {
                        name: "MARGIN",
                        price_or_discount: "Discount",
                        discount_type: "Margin",
                        margin_type: "Amount",
                        margin_rate_or_amount: 10,
                        specificity: 3,
                        priority: 1,
                };
                const indexes = buildIndexes({ items: { "ITEM-4": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-4" },
                        qty: 1,
                        baseRate: 50,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(60);
                expect(result.discountPerUnit).toBeCloseTo(-10);
        });

        it("respects specificity and priority", () => {
                const itemRule = {
                        name: "ITEM-RULE",
                        price_or_discount: "Discount",
                        discount_type: "Amount",
                        rate_or_discount: 5,
                        specificity: 3,
                        priority: 5,
                };
                const groupRule = {
                        name: "GROUP-RULE",
                        price_or_discount: "Discount",
                        discount_type: "Rate",
                        rate_or_discount: 10,
                        specificity: 2,
                        priority: 20,
                };
                const indexes = buildIndexes({
                        items: { "ITEM-5": [groupRule, itemRule] },
                        groups: { Accessories: [groupRule] },
                });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-5", item_group: "Accessories" },
                        qty: 1,
                        baseRate: 100,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(95);
                expect(result.applied[0].name).toBe("ITEM-RULE");
        });

        it("selects slab based on quantity", () => {
                const rule = {
                        name: "SLAB-RULE",
                        price_or_discount: "Discount",
                        discount_type: "Rate",
                        specificity: 3,
                        priority: 5,
                        slabs: [
                                { min_qty: 5, rate_or_discount: 5 },
                                { min_qty: 10, rate_or_discount: 10 },
                        ],
                };
                const indexes = buildIndexes({ items: { "ITEM-6": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-6" },
                        qty: 12,
                        baseRate: 100,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(90);
        });

        it("uses stock quantity when min qty is defined per stock uom", () => {
                const rule = {
                        name: "STOCK-THRESH",
                        price_or_discount: "Discount",
                        discount_type: "Rate",
                        rate_or_discount: 10,
                        min_qty: 10,
                        min_qty_as_per_stock_uom: 1,
                        specificity: 3,
                        priority: 5,
                };
                const indexes = buildIndexes({ items: { "ITEM-STOCK": [rule] } });
                const discounted = applyLocalPricingRules({
                        item: { item_code: "ITEM-STOCK", conversion_factor: 12 },
                        qty: 1,
                        stockQty: 12,
                        baseRate: 100,
                        ctx: {},
                        indexes,
                });
                expect(discounted.rate).toBeCloseTo(90);

                const notDiscounted = applyLocalPricingRules({
                        item: { item_code: "ITEM-STOCK", conversion_factor: 12 },
                        qty: 1,
                        stockQty: 6,
                        baseRate: 100,
                        ctx: {},
                        indexes,
                });
                expect(notDiscounted.rate).toBeCloseTo(100);
        });

        it("filters by customer and price list", () => {
                const rule = {
                        name: "CUSTOM-RULE",
                        price_or_discount: "Discount",
                        discount_type: "Amount",
                        rate_or_discount: 5,
                        specificity: 3,
                        priority: 5,
                        customer: "CUST-1",
                        price_list: "Retail",
                        currency: "USD",
                };
                const indexes = buildIndexes({ items: { "ITEM-7": [rule] } });
                const ctx = { customer: "CUST-1", price_list: "Retail", currency: "USD" };
                const applicable = applyLocalPricingRules({
                        item: { item_code: "ITEM-7" },
                        qty: 1,
                        baseRate: 50,
                        ctx,
                        indexes,
                });
                expect(applicable.rate).toBeCloseTo(45);

                const notApplicable = applyLocalPricingRules({
                        item: { item_code: "ITEM-7" },
                        qty: 1,
                        baseRate: 50,
                        ctx: { customer: "CUST-2", price_list: "Retail", currency: "USD" },
                        indexes,
                });
                expect(notApplicable.rate).toBeCloseTo(50);
        });

        it("checks date validity", () => {
                const today = "2024-01-15";
                const rule = {
                        name: "DATE-RULE",
                        price_or_discount: "Discount",
                        discount_type: "Amount",
                        rate_or_discount: 5,
                        specificity: 3,
                        priority: 5,
                        valid_from: "2024-01-01",
                        valid_upto: "2024-01-31",
                };
                const indexes = buildIndexes({ items: { "ITEM-8": [rule] } });
                const valid = applyLocalPricingRules({
                        item: { item_code: "ITEM-8" },
                        qty: 1,
                        baseRate: 30,
                        ctx: { date: today },
                        indexes,
                });
                expect(valid.rate).toBeCloseTo(25);

                const invalid = applyLocalPricingRules({
                        item: { item_code: "ITEM-8" },
                        qty: 1,
                        baseRate: 30,
                        ctx: { date: "2024-03-01" },
                        indexes,
                });
                expect(invalid.rate).toBeCloseTo(30);
        });

        it("treats discount percentage price rules as percentage adjustments", () => {
                const rule = {
                        name: "PRICE-PERCENT",
                        price_or_discount: "Price",
                        rate_or_discount_type: "Discount Percentage",
                        discount_type: "Rate",
                        rate_or_discount: 10,
                        specificity: 3,
                        priority: 8,
                };
                const indexes = buildIndexes({ items: { "ITEM-9": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-9" },
                        qty: 6,
                        baseRate: 60,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(54);
                expect(result.discountPerUnit).toBeCloseTo(6);
        });

        it("continues to honour explicit price overrides", () => {
                const rule = {
                        name: "PRICE-OVERRIDE",
                        price_or_discount: "Price",
                        rate_or_discount_type: "Rate",
                        discount_type: "Rate",
                        rate_or_discount: 42,
                        specificity: 3,
                        priority: 6,
                };
                const indexes = buildIndexes({ items: { "ITEM-10": [rule] } });
                const result = applyLocalPricingRules({
                        item: { item_code: "ITEM-10" },
                        qty: 3,
                        baseRate: 60,
                        ctx: {},
                        indexes,
                });
                expect(result.rate).toBeCloseTo(42);
                expect(result.discountPerUnit).toBeCloseTo(18);
        });
});

describe("pricingEngine - computeFreeItems", () => {
        it("returns freebies based on threshold", () => {
                const rule = {
                        name: "FREE-1",
                        is_free_item_rule: 1,
                        min_qty: 3,
                        free_qty: 1,
                        apply_per_threshold: 1,
                        specificity: 3,
                        priority: 5,
                        same_item: 1,
                };
                const indexes = buildIndexes({ items: { "ITEM-9": [rule] } });
                const freebies = computeFreeItems({
                        item: { item_code: "ITEM-9" },
                        qty: 7,
                        ctx: {},
                        indexes,
                });
                expect(freebies).toHaveLength(1);
                expect(freebies[0].qty).toBe(2);
        });

        it("honours max free quantity", () => {
                const rule = {
                        name: "FREE-CAP",
                        is_free_item_rule: 1,
                        min_qty: 2,
                        free_qty: 2,
                        apply_per_threshold: 1,
                        max_free_qty: 3,
                        specificity: 3,
                        priority: 5,
                        free_item: "BONUS",
                };
                const indexes = buildIndexes({ items: { "ITEM-10": [rule] } });
                const freebies = computeFreeItems({
                        item: { item_code: "ITEM-10" },
                        qty: 10,
                        ctx: {},
                        indexes,
                });
                expect(freebies).toHaveLength(1);
                expect(freebies[0].qty).toBe(3);
                expect(freebies[0].item_code).toBe("BONUS");
        });

        it("skips freebies outside date range", () => {
                const rule = {
                        name: "FREE-DATE",
                        is_free_item_rule: 1,
                        min_qty: 2,
                        free_qty: 1,
                        specificity: 3,
                        priority: 5,
                        valid_from: "2024-05-01",
                        valid_upto: "2024-05-31",
                };
                const indexes = buildIndexes({ items: { "ITEM-11": [rule] } });
                const freebies = computeFreeItems({
                        item: { item_code: "ITEM-11" },
                        qty: 4,
                        ctx: { date: "2024-06-01" },
                        indexes,
                });
                expect(freebies).toHaveLength(0);
        });

        it("qualifies freebies using stock quantity when requested", () => {
                const rule = {
                        name: "FREE-STOCK",
                        is_free_item_rule: 1,
                        min_qty: 10,
                        min_qty_as_per_stock_uom: 1,
                        free_qty: 1,
                        specificity: 3,
                        priority: 5,
                        same_item: 1,
                };
                const indexes = buildIndexes({ items: { "ITEM-STOCK": [rule] } });
                const freebies = computeFreeItems({
                        item: { item_code: "ITEM-STOCK", conversion_factor: 12 },
                        qty: 1,
                        stockQty: 12,
                        ctx: {},
                        indexes,
                });
                expect(freebies).toHaveLength(1);
                expect(freebies[0].qty).toBe(1);

                const none = computeFreeItems({
                        item: { item_code: "ITEM-STOCK", conversion_factor: 12 },
                        qty: 1,
                        stockQty: 6,
                        ctx: {},
                        indexes,
                });
                expect(none).toHaveLength(0);
        });
});

