import { describe, expect, it } from "vitest";

import { createPosCheckoutStore } from "../src/features/checkout/domain/posCheckoutStore";

describe("createPosCheckoutStore", () => {
	it("tracks the customer to payments pipeline and marks checkout ready", () => {
		const checkout = createPosCheckoutStore();

		checkout.markStarting();
		checkout.markStage("loading-customer");
		checkout.markStage("loading-pricing");
		checkout.markStage("loading-offers");
		checkout.markStage("loading-payments");
		checkout.markReady();

		expect(checkout.state.value.stage).toBe("ready");
		expect(checkout.state.value.blocker).toBeNull();
		expect(checkout.state.value.timeline.map((entry) => entry.stage)).toEqual([
			"starting",
			"loading-customer",
			"loading-pricing",
			"loading-offers",
			"loading-payments",
			"ready",
		]);
	});

	it("captures the current blocker and moves checkout into a blocked state", () => {
		const checkout = createPosCheckoutStore();

		checkout.markStarting();
		checkout.markStage("loading-customer");
		checkout.blockCheckout({
			code: "pricing_failed",
			summary: "Checkout pricing data did not load.",
		});

		expect(checkout.state.value.stage).toBe("blocked");
		expect(checkout.state.value.blocker).toEqual({
			code: "pricing_failed",
			summary: "Checkout pricing data did not load.",
		});
		expect(checkout.state.value.timeline.at(-1)?.stage).toBe("blocked");
		expect(checkout.state.value.timeline.at(-1)?.blockerCode).toBe(
			"pricing_failed",
		);
	});
});
