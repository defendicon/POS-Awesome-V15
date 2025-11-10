import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import invoiceOfferMethods from "../src/posapp/components/pos/invoiceOfferMethods.js";

const fltMock = (value, precision = 2) => {
        const num = Number(value);
        if (!Number.isFinite(num)) {
                return 0;
        }
        return Number(num.toFixed(precision));
};

describe("invoiceOfferMethods.ApplyOnPrice", () => {
        beforeEach(() => {
                global.flt = fltMock;
        });

        afterEach(() => {
                delete global.flt;
        });

        const createContext = () => ({
                ...invoiceOfferMethods,
                items: [],
                packed_items: [],
                posOffers: [],
                posa_offers: [],
                pos_profile: { currency: "PKR" },
                price_list_currency: "PKR",
                selected_currency: "PKR",
                exchange_rate: 1,
                currency_precision: 2,
                $forceUpdate: vi.fn(),
                flt: fltMock,
        });

        it("stores original base rates even when base values are missing", () => {
                const ctx = createContext();
                const item = {
                        posa_row_id: "ROW-1",
                        qty: 1,
                        conversion_factor: 1,
                        rate: 100,
                        price_list_rate: 120,
                        posa_offer_applied: 0,
                        posa_offers: JSON.stringify([]),
                };

                ctx.items = [item];

                const offer = {
                        row_id: "OFFER-1",
                        discount_type: "Rate",
                        rate: 90,
                        items: ["ROW-1"],
                };

                ctx.ApplyOnPrice.call(ctx, offer);

                expect(item.rate).toBeCloseTo(90);
                expect(item.price_list_rate).toBeCloseTo(120);
                expect(item.discount_amount).toBeCloseTo(30);
                expect(item.original_base_rate).toBeCloseTo(100);
                expect(item.original_base_price_list_rate).toBeCloseTo(120);
                expect(item.original_rate).toBeCloseTo(100);
                expect(item.original_price_list_rate).toBeCloseTo(120);
        });
});

