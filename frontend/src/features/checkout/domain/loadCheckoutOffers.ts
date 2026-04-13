import type { CheckoutStageLoadResult } from "./loadCheckoutCustomerData";

export async function loadCheckoutOffers() {
	return {
		source: "unknown" as const,
	} satisfies CheckoutStageLoadResult;
}
