import type { CheckoutStageLoadResult } from "./loadCheckoutCustomerData";

export async function loadCheckoutPricing() {
	return {
		source: "unknown" as const,
	} satisfies CheckoutStageLoadResult;
}
