import type { CheckoutStageLoadResult } from "./loadCheckoutCustomerData";

export async function loadCheckoutPayments() {
	return {
		source: "unknown" as const,
	} satisfies CheckoutStageLoadResult;
}
