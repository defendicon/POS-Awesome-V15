import { describe, expect, it } from "vitest";

import { mergeDisplayedOffers } from "../src/posapp/components/pos/offers/offerMerging";

describe("offerMerging", () => {
	it("auto-applies coupon-based offers when they become available", () => {
		const merged = mergeDisplayedOffers([], [
			{
				name: "OFFER-10",
				row_id: "OFFER-10",
				offer: "Grand Total",
				apply_on: "Transaction",
				coupon_based: 1,
				coupon: "COUPON-10",
				items: ["ROW-1"],
				auto: 0,
			},
		]);

		expect(merged).toHaveLength(1);
		expect(merged[0].offer_applied).toBe(true);
		expect(merged[0].coupon).toBe("COUPON-10");
	});

	it("syncs existing offer rows with incoming coupon application state", () => {
		const merged = mergeDisplayedOffers(
			[
				{
					name: "OFFER-10",
					row_id: "OFFER-10",
					offer: "Grand Total",
					apply_on: "Transaction",
					coupon_based: 1,
					coupon: null,
					items: [],
					offer_applied: false,
				},
			],
			[
				{
					name: "OFFER-10",
					row_id: "OFFER-10",
					offer: "Grand Total",
					apply_on: "Transaction",
					coupon_based: 1,
					coupon: "COUPON-10",
					items: ["ROW-1"],
					offer_applied: true,
				},
			],
		);

		expect(merged[0].offer_applied).toBe(true);
		expect(merged[0].coupon).toBe("COUPON-10");
		expect(merged[0].items).toEqual(["ROW-1"]);
	});
});
