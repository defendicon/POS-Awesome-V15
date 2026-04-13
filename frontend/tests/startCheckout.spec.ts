import { describe, expect, it, vi } from "vitest";

import { createPosCheckoutStore } from "../src/features/checkout/domain/posCheckoutStore";
import { startCheckout } from "../src/features/checkout/domain/startCheckout";

describe("startCheckout", () => {
	it("runs customer, pricing, offers, and payments in order before marking checkout ready", async () => {
		const checkout = createPosCheckoutStore();
		const steps: string[] = [];

		const result = await startCheckout({
			checkout,
			loadCheckoutCustomerData: async () => {
				steps.push("customer");
				return { source: "server" as const };
			},
			loadCheckoutPricing: async () => {
				steps.push("pricing");
				return { source: "server" as const };
			},
			loadCheckoutOffers: async () => {
				steps.push("offers");
				return { source: "server" as const };
			},
			loadCheckoutPayments: async () => {
				steps.push("payments");
				return { source: "server" as const };
			},
		});

		expect(steps).toEqual(["customer", "pricing", "offers", "payments"]);
		expect(result.stage).toBe("ready");
		expect(result.sources).toEqual({
			customer: "server",
			pricing: "server",
			offers: "server",
			payments: "server",
		});
		expect(result.timeline.map((entry) => entry.stage)).toEqual([
			"starting",
			"loading-customer",
			"loading-pricing",
			"loading-offers",
			"loading-payments",
			"ready",
		]);
	});

	it("blocks checkout when pricing fails after customer data loads", async () => {
		const checkout = createPosCheckoutStore();

		const result = await startCheckout({
			checkout,
			loadCheckoutCustomerData: async () => ({ source: "server" as const }),
			loadCheckoutPricing: async () => {
				throw new Error("pricing failed");
			},
			loadCheckoutOffers: vi.fn(),
			loadCheckoutPayments: vi.fn(),
		});

		expect(result.stage).toBe("blocked");
		expect(result.blocker).toEqual({
			code: "pricing_failed",
			summary: "pricing failed",
		});
		expect(result.timeline.map((entry) => entry.stage)).toEqual([
			"starting",
			"loading-customer",
			"loading-pricing",
			"blocked",
		]);
	});
});
