import { describe, expect, it } from "vitest";

import { createPosCheckoutStore } from "../src/posapp/domain/checkout/posCheckoutStore";
import { startCheckout } from "../src/posapp/domain/checkout/startCheckout";

describe("checkout offline fallback", () => {
	it("keeps checkout ready when customer and pricing stages resolve from cache", async () => {
		const checkout = createPosCheckoutStore();

		const result = await startCheckout({
			checkout,
			loadCheckoutCustomerData: async () => ({ source: "cache" as const }),
			loadCheckoutPricing: async () => ({ source: "cache" as const }),
			loadCheckoutOffers: async () => ({ source: "server" as const }),
			loadCheckoutPayments: async () => ({ source: "server" as const }),
		});

		expect(result.stage).toBe("ready");
		expect(result.sources.customer).toBe("cache");
		expect(result.sources.pricing).toBe("cache");
		expect(result.sources.offers).toBe("server");
		expect(result.sources.payments).toBe("server");
	});
});
